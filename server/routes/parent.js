// Parent-app routes. The router is mounted behind requireParent.
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const settings = require('../settings');
const auth = require('../auth');
const chores = require('../chores');
const google = require('../google');
const weather = require('../weather');
const interest = require('../interest');
const { PHOTO_DIR } = require('../config');
const { HttpError, wrap, isDateStr, toInt, requireFields } = require('../util');
const { validPin } = require('./auth');
const { listPhotos, PHOTO_EXT } = require('./public');

const router = express.Router();

// ---- Members ---------------------------------------------------------------
const memberById = db.prepare('SELECT * FROM members WHERE id = ?');

router.get('/members/all', (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY active DESC, sort_order, id').all());
});

router.post('/members', (req, res) => {
  requireFields(req.body, ['name']);
  const { name, role = 'kid', color = '#4f86f7', emoji = '🙂' } = req.body;
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM members').get().n;
  const info = db.prepare('INSERT INTO members(name, role, color, emoji, sort_order) VALUES(?, ?, ?, ?, ?)')
    .run(String(name).trim(), role === 'parent' ? 'parent' : 'kid', color, emoji, next);
  res.json(memberById.get(info.lastInsertRowid));
});

router.patch('/members/:id', (req, res) => {
  const m = memberById.get(toInt(req.params.id));
  if (!m) throw new HttpError(404, 'Member not found');
  const b = req.body;
  db.prepare('UPDATE members SET name = ?, role = ?, color = ?, emoji = ?, sort_order = ?, active = ? WHERE id = ?').run(
    b.name !== undefined ? String(b.name).trim() : m.name,
    b.role !== undefined ? (b.role === 'parent' ? 'parent' : 'kid') : m.role,
    b.color ?? m.color,
    b.emoji ?? m.emoji,
    b.sort_order !== undefined ? toInt(b.sort_order, m.sort_order) : m.sort_order,
    b.active !== undefined ? (b.active ? 1 : 0) : m.active,
    m.id,
  );
  res.json(memberById.get(m.id));
});

// Soft delete keeps chore history and money ledgers intact.
router.delete('/members/:id', (req, res) => {
  db.prepare('UPDATE members SET active = 0 WHERE id = ?').run(toInt(req.params.id));
  res.json({ ok: true });
});

// ---- Chores ----------------------------------------------------------------
const choreById = db.prepare('SELECT * FROM chores WHERE id = ?');

function choreFields(b, existing = {}) {
  const schedule = ['daily', 'weekly', 'once'].includes(b.schedule) ? b.schedule : (existing.schedule || 'daily');
  let days = b.days !== undefined ? String(b.days) : (existing.days || '1111111');
  if (!/^[01]{7}$/.test(days)) throw new HttpError(400, 'days must be 7 flags Sun..Sat, e.g. 0111110');
  const paid = b.paid !== undefined ? (b.paid ? 1 : 0) : (existing.paid || 0);
  const memberId = b.member_id !== undefined ? toInt(b.member_id, null) : (existing.member_id ?? null);
  if (memberId != null && !memberById.get(memberId)) throw new HttpError(400, 'Unknown member');
  if (memberId == null && !paid) throw new HttpError(400, 'Regular chores need an assignee; only Earn Money chores can be open to anyone');
  const amount = b.amount_cents !== undefined ? Math.max(0, toInt(b.amount_cents, 0)) : (existing.amount_cents || 0);
  const dueDate = b.due_date !== undefined ? (isDateStr(b.due_date) ? b.due_date : null) : (existing.due_date ?? null);
  return {
    title: b.title !== undefined ? String(b.title).trim() : existing.title,
    member_id: memberId,
    schedule, days, due_date: dueDate,
    paid, amount_cents: paid ? amount : 0,
    notes: b.notes !== undefined ? (String(b.notes).trim() || null) : (existing.notes ?? null),
    sort_order: b.sort_order !== undefined ? toInt(b.sort_order, 0) : (existing.sort_order || 0),
  };
}

router.get('/chores', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, m.name AS member_name FROM chores c LEFT JOIN members m ON m.id = c.member_id
    WHERE c.active = 1 ORDER BY c.paid, c.sort_order, c.id
  `).all());
});

router.post('/chores', (req, res) => {
  requireFields(req.body, ['title']);
  const f = choreFields(req.body);
  const info = db.prepare(`
    INSERT INTO chores(title, member_id, schedule, days, due_date, paid, amount_cents, notes, sort_order)
    VALUES(@title, @member_id, @schedule, @days, @due_date, @paid, @amount_cents, @notes, @sort_order)
  `).run(f);
  res.json(choreById.get(info.lastInsertRowid));
});

router.patch('/chores/:id', (req, res) => {
  const existing = choreById.get(toInt(req.params.id));
  if (!existing) throw new HttpError(404, 'Chore not found');
  const f = choreFields(req.body, existing);
  if (!f.title) throw new HttpError(400, 'Title required');
  db.prepare(`
    UPDATE chores SET title = @title, member_id = @member_id, schedule = @schedule, days = @days, due_date = @due_date,
      paid = @paid, amount_cents = @amount_cents, notes = @notes, sort_order = @sort_order WHERE id = @id
  `).run({ ...f, id: existing.id });
  res.json(choreById.get(existing.id));
});

router.delete('/chores/:id', (req, res) => {
  db.prepare('UPDATE chores SET active = 0 WHERE id = ?').run(toInt(req.params.id));
  res.json({ ok: true });
});

router.get('/chores/pending', (req, res) => res.json(chores.pending()));
router.post('/chores/completions/:id/approve', (req, res) => res.json(chores.approve(toInt(req.params.id))));
router.post('/chores/completions/:id/reject', (req, res) => { chores.reject(toInt(req.params.id)); res.json({ ok: true }); });

// ---- Money -----------------------------------------------------------------
router.post('/finance/:memberId/transactions', (req, res) => {
  const memberId = toInt(req.params.memberId);
  if (!memberById.get(memberId)) throw new HttpError(404, 'Member not found');
  const { type, note = '' } = req.body;
  let cents = toInt(req.body.amount_cents);
  if (!cents) throw new HttpError(400, 'amount_cents required');
  if (type === 'deposit') cents = Math.abs(cents);
  else if (type === 'withdrawal') cents = -Math.abs(cents);
  else if (type !== 'adjustment') throw new HttpError(400, 'type must be deposit, withdrawal or adjustment');
  const info = db.prepare('INSERT INTO transactions(member_id, type, amount_cents, note) VALUES(?, ?, ?, ?)')
    .run(memberId, type, cents, String(note).trim().slice(0, 200) || null);
  res.json({
    transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid),
    balance_cents: interest.balance(memberId),
  });
});

router.delete('/finance/transactions/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM transactions WHERE id = ?').get(toInt(req.params.id));
  if (!t) throw new HttpError(404, 'Not found');
  db.transaction(() => {
    if (t.completion_id) {
      db.prepare(`UPDATE chore_completions SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?`).run(t.completion_id);
    }
    db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
  })();
  res.json({ ok: true, balance_cents: interest.balance(t.member_id) });
});

router.post('/finance/apply-interest', (req, res) => {
  res.json({ credited: interest.applyIfDue() });
});

// ---- Meals -----------------------------------------------------------------
router.put('/meals/:date', (req, res) => {
  const { date } = req.params;
  if (!isDateStr(date)) throw new HttpError(400, 'Bad date');
  const title = String(req.body.title || '').trim();
  if (!title) {
    db.prepare('DELETE FROM meals WHERE date = ?').run(date);
    return res.json({ date, title: '', notes: null });
  }
  db.prepare('INSERT INTO meals(date, title, notes) VALUES(?, ?, ?) ON CONFLICT(date) DO UPDATE SET title = excluded.title, notes = excluded.notes')
    .run(date, title.slice(0, 120), String(req.body.notes || '').trim().slice(0, 300) || null);
  res.json(db.prepare('SELECT * FROM meals WHERE date = ?').get(date));
});

router.delete('/meals/:date', (req, res) => {
  db.prepare('DELETE FROM meals WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// ---- Settings --------------------------------------------------------------
router.get('/settings', (req, res) => {
  res.json({
    ...settings.all(),
    google_redirect_uri: google.REDIRECT_URI,
    google_configured: google.isConfigured(),
    google_env_override: Boolean(process.env.GOOGLE_CLIENT_ID),
  });
});

router.patch('/settings', (req, res) => {
  const b = req.body || {};
  for (const key of Object.keys(b)) {
    if (!settings.EDITABLE_KEYS.includes(key)) throw new HttpError(400, `Unknown setting: ${key}`);
  }
  if (b.week_start !== undefined && ![0, 1].includes(Number(b.week_start))) throw new HttpError(400, 'week_start must be 0 or 1');
  if (b.interest_day !== undefined && (toInt(b.interest_day) < 1 || toInt(b.interest_day) > 28)) throw new HttpError(400, 'interest_day must be 1-28');
  if (b.interest_apr !== undefined && (Number(b.interest_apr) < 0 || Number(b.interest_apr) > 100)) throw new HttpError(400, 'interest_apr must be 0-100');
  if (b.temp_unit !== undefined && !['fahrenheit', 'celsius'].includes(b.temp_unit)) throw new HttpError(400, 'temp_unit must be fahrenheit or celsius');
  db.transaction(() => {
    for (const [key, value] of Object.entries(b)) {
      if (['week_start', 'screensaver_minutes', 'photo_seconds', 'month_themes', 'interest_day', 'sync_minutes'].includes(key)) settings.set(key, toInt(value, 0));
      else if (['interest_apr', 'weather_lat', 'weather_lon'].includes(key)) settings.set(key, value === null || value === '' ? null : Number(value));
      else settings.set(key, typeof value === 'string' ? value.trim() : value);
    }
  })();
  res.json(settings.all());
});

router.post('/settings/pin', (req, res) => {
  const { current, pin } = req.body;
  if (!auth.verifyPin(current, settings.get('pin_hash'))) throw new HttpError(401, 'Current PIN is wrong');
  if (!validPin(pin)) throw new HttpError(400, 'PIN must be 4-8 digits');
  settings.set('pin_hash', auth.hashPin(pin));
  res.json({ ok: true });
});

router.get('/weather/geocode', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  res.json(await weather.geocode(q));
}));

// ---- Google accounts & calendars ------------------------------------------
router.get('/google/accounts', (req, res) => res.json(google.listAccounts()));

router.get('/google/auth-url', (req, res) => {
  res.json({ url: google.authUrl(), redirect_uri: google.REDIRECT_URI });
});

router.post('/google/paste', wrap(async (req, res) => {
  const account = await google.connectWithCode(google.codeFromInput(req.body.url));
  google.syncAll().catch(() => {});
  res.json({ ok: true, email: account.email });
}));

router.post('/google/accounts/:id/calendars/refresh', wrap(async (req, res) => {
  res.json(await google.refreshCalendarList(toInt(req.params.id)));
}));

router.delete('/google/accounts/:id', (req, res) => {
  google.removeAccount(toInt(req.params.id));
  res.json({ ok: true });
});

router.patch('/google/calendars/:id', (req, res) => {
  const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(toInt(req.params.id));
  if (!cal) throw new HttpError(404, 'Calendar not found');
  const b = req.body;
  const memberId = b.member_id !== undefined ? toInt(b.member_id, null) : cal.member_id;
  const isFamily = b.is_family !== undefined ? (b.is_family ? 1 : 0) : cal.is_family;
  const enabled = b.enabled !== undefined ? (b.enabled ? 1 : 0) : cal.enabled;
  db.prepare('UPDATE calendars SET member_id = ?, is_family = ?, enabled = ? WHERE id = ?').run(memberId, isFamily, enabled, cal.id);
  if (!enabled) db.prepare('DELETE FROM events WHERE calendar_id = ?').run(cal.id);
  else if (!cal.enabled) google.syncAll().catch(() => {});
  res.json(db.prepare('SELECT * FROM calendars WHERE id = ?').get(cal.id));
});

router.post('/google/sync', wrap(async (req, res) => {
  res.json(await google.syncAll());
}));

// ---- Photos ----------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: PHOTO_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'photo';
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    cb(null, PHOTO_EXT.has(path.extname(file.originalname).toLowerCase()));
  },
});

router.post('/photos', upload.array('photos', 30), (req, res) => {
  res.json({ added: (req.files || []).length, photos: listPhotos() });
});

router.delete('/photos/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(PHOTO_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Photo not found');
  fs.unlinkSync(file);
  res.json({ ok: true, photos: listPhotos() });
});

module.exports = router;
