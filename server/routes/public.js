// Kiosk-facing routes. No login: the display hangs on the wall and kids tap it.
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const settings = require('../settings');
const chores = require('../chores');
const interest = require('../interest');
const weather = require('../weather');
const google = require('../google');
const notify = require('../notify');
const localEvents = require('../localEvents');
const { PHOTO_DIR } = require('../config');
const { HttpError, wrap, localDate, isDateStr, toInt } = require('../util');

const router = express.Router();

const activeMembers = db.prepare('SELECT id, name, role, color, emoji, sort_order FROM members WHERE active = 1 ORDER BY sort_order, id');

// Changes whenever the server (re)starts, so the wall display reloads itself after an update.
const SERVER_BUILD = `${require('../../package.json').version}-${Date.now()}`;

router.get('/state', (req, res) => {
  const accounts = db.prepare('SELECT email, last_error, last_sync_at FROM google_accounts').all();
  res.json({
    build: SERVER_BUILD,
    settings: settings.publicSettings(),
    members: activeMembers.all(),
    today: localDate(),
    needs_setup: !settings.get('pin_hash'),
    google: {
      configured: google.isConfigured(),
      calendars_enabled: db.prepare('SELECT COUNT(*) AS n FROM calendars WHERE enabled = 1').get().n,
      accounts: accounts.map((a) => ({ email: a.email, error: a.last_error, last_sync_at: a.last_sync_at })),
    },
  });
});

router.get('/members', (req, res) => {
  res.json(activeMembers.all());
});

// ---- Calendar events -------------------------------------------------------
const eventsInRange = db.prepare(`
  SELECT e.id, e.title, e.start, e.end, e.start_ts, e.end_ts, e.all_day, e.location, e.description,
         c.id AS calendar_id, c.name AS calendar_name, c.color AS calendar_color, c.member_id, c.is_family
  FROM events e JOIN calendars c ON c.id = e.calendar_id
  WHERE c.enabled = 1 AND e.end_ts > ? AND e.start_ts < ?
  ORDER BY e.all_day DESC, e.start_ts
`);

// Match family members in event titles so a single shared calendar can be sorted per kid:
//  - full name or any alias as a whole word anywhere ("Owen soccer", "Piper's dentist", "Pip swim")
//  - a leading initial/abbreviation followed by a separator ("O soccer", "P - dentist", "O/P carpool")
// Case-insensitive. A lone leading "A" or "I" needs punctuation after it so ordinary
// sentences ("A day at the zoo") are not misfiled.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const membersForMatching = db.prepare('SELECT id, name, aliases FROM members WHERE active = 1');
const LEADING = /^\s*([\p{L}]{1,4}(?:\s*[&/+,]\s*[\p{L}]{1,4})*)(\s*[-:.–—|]\s*|\s+)/u;

function nameMatchers() {
  return membersForMatching.all().map((m) => {
    const name = m.name.trim();
    const words = [name, ...String(m.aliases || '').split(',').map((s) => s.trim())].filter((w) => w.length >= 2);
    const shorts = new Set([name.charAt(0), ...words].map((w) => w.toLowerCase()).filter(Boolean));
    return {
      id: m.id,
      wordRe: words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null,
      shorts,
    };
  });
}

function membersForTitle(title, matchers) {
  const ids = new Set();
  for (const m of matchers) if (m.wordRe && m.wordRe.test(title)) ids.add(m.id);
  const lead = LEADING.exec(title);
  if (lead) {
    const punctuated = /[-:.–—|]/.test(lead[2]);
    const tokens = lead[1].split(/[\s&/+,]+/).filter(Boolean).map((t) => t.toLowerCase());
    const found = tokens.map((t) => {
      if (t.length === 1 && (t === 'a' || t === 'i') && !punctuated) return null;
      return matchers.find((m) => m.shorts.has(t)) || null;
    });
    if (tokens.length && found.every(Boolean)) found.forEach((m) => ids.add(m.id));
  }
  return [...ids];
}

router.get('/events', (req, res) => {
  const from = isDateStr(req.query.from) ? req.query.from : localDate();
  const to = isDateStr(req.query.to) ? req.query.to : from;
  const fromTs = new Date(`${from}T00:00:00`).getTime();
  const toTs = new Date(`${to}T00:00:00`).getTime() + 86_400_000;
  const matchers = nameMatchers();
  const all = [...eventsInRange.all(fromTs, toTs), ...localEvents.occurrences(fromTs, toTs)]
    .sort((a, b) => (b.all_day - a.all_day) || (a.start_ts - b.start_ts));
  res.json(all.map((e) => ({ ...e, member_ids: membersForTitle(e.title, matchers) })));
});

// ---- Chores ----------------------------------------------------------------
router.get('/chores/day', (req, res) => {
  const date = isDateStr(req.query.date) ? req.query.date : localDate();
  const memberId = toInt(req.query.member, null);
  res.json({ date, chores: chores.choresForDay(date, memberId) });
});

router.post('/chores/:id/complete', (req, res) => {
  const memberId = toInt(req.body.member_id);
  if (!memberId) throw new HttpError(400, 'member_id required');
  const date = isDateStr(req.body.date) ? req.body.date : localDate();
  const completion = chores.complete(toInt(req.params.id), memberId, date);
  if (completion.status === 'pending' && notify.isConfigured()) {
    const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(completion.chore_id);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(completion.member_id);
    notify.choreCompleted(completion, chore, member).catch((e) => console.error('[notify]', e.message));
  }
  res.json(completion);
});

// Pay / Reject buttons inside an ntfy notification hit this with a signed token.
router.post('/chores/completions/:id/action', (req, res) => {
  const id = toInt(req.params.id);
  const action = String(req.query.do || '');
  if (!['approve', 'reject'].includes(action) || !notify.verifyActionToken(id, action, String(req.query.t || ''))) {
    throw new HttpError(403, 'Invalid or expired action link');
  }
  if (action === 'approve') chores.approve(id); else chores.reject(id);
  res.type('text/plain').send(action === 'approve' ? 'Paid!' : 'Rejected');
});

router.delete('/chores/completions/:id', (req, res) => {
  chores.uncomplete(toInt(req.params.id));
  res.json({ ok: true });
});

// ---- Money -----------------------------------------------------------------
const pendingCents = db.prepare(`
  SELECT COALESCE(SUM(c.amount_cents), 0) AS cents FROM chore_completions cc
  JOIN chores c ON c.id = cc.chore_id WHERE cc.member_id = ? AND cc.status = 'pending'
`);

router.get('/finance/summary', (req, res) => {
  const kids = activeMembers.all().filter((m) => m.role === 'kid');
  res.json(kids.map((m) => ({
    member_id: m.id,
    balance_cents: interest.balance(m.id),
    pending_cents: pendingCents.get(m.id).cents,
  })));
});

router.get('/finance/:memberId', (req, res) => {
  const id = toInt(req.params.memberId);
  const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(id);
  if (!member) throw new HttpError(404, 'Member not found');
  const limit = Math.min(500, toInt(req.query.limit, 100));
  res.json({
    member_id: id,
    balance_cents: interest.balance(id),
    pending_cents: pendingCents.get(id).cents,
    interest_apr: Number(settings.get('interest_apr')) || 0,
    interest_day: Number(settings.get('interest_day')) || 1,
    transactions: db.prepare('SELECT * FROM transactions WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(id, limit),
  });
});

// ---- Meals -----------------------------------------------------------------
router.get('/meals', (req, res) => {
  const from = isDateStr(req.query.from) ? req.query.from : localDate();
  const to = isDateStr(req.query.to) ? req.query.to : from;
  res.json(db.prepare('SELECT * FROM meals WHERE date >= ? AND date <= ? ORDER BY date').all(from, to));
});

// ---- Shopping list (editable from the kiosk too) ---------------------------
const listShopping = db.prepare('SELECT * FROM shopping_items ORDER BY checked, id');

router.get('/shopping', (req, res) => res.json(listShopping.all()));

router.post('/shopping', (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new HttpError(400, 'Item text required');
  const info = db.prepare('INSERT INTO shopping_items(text) VALUES(?)').run(text.slice(0, 200));
  res.json(db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/shopping/:id', (req, res) => {
  const id = toInt(req.params.id);
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, 'Not found');
  const checked = req.body.checked === undefined ? item.checked : (req.body.checked ? 1 : 0);
  const text = req.body.text === undefined ? item.text : String(req.body.text).trim().slice(0, 200);
  db.prepare('UPDATE shopping_items SET checked = ?, text = ? WHERE id = ?').run(checked, text, id);
  res.json({ ...item, checked, text });
});

router.delete('/shopping/checked', (req, res) => {
  const info = db.prepare('DELETE FROM shopping_items WHERE checked = 1').run();
  res.json({ removed: info.changes });
});

router.delete('/shopping/:id', (req, res) => {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(toInt(req.params.id));
  res.json({ ok: true });
});

// ---- Google OAuth loopback -------------------------------------------------
// Google redirects here when the consent flow runs in a browser on the Pi itself.
// From a phone the redirect fails to load; the parent app has a paste box for that case.
router.get('/google/callback', wrap(async (req, res) => {
  if (req.query.error) return res.redirect(`/parent/?google=error&msg=${encodeURIComponent(req.query.error)}#settings`);
  try {
    const account = await google.connectWithCode(String(req.query.code || ''));
    google.syncAll().catch(() => {});
    res.redirect(`/parent/?google=connected&email=${encodeURIComponent(account.email)}#settings`);
  } catch (e) {
    res.redirect(`/parent/?google=error&msg=${encodeURIComponent(e.message)}#settings`);
  }
}));

// ---- Weather ---------------------------------------------------------------
router.get('/weather', wrap(async (req, res) => {
  try {
    res.json(await weather.forecast());
  } catch (e) {
    res.json({ error: e.message });
  }
}));

// ---- Photos (screensaver) --------------------------------------------------
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function listPhotos() {
  return fs.readdirSync(PHOTO_DIR)
    .filter((f) => PHOTO_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => ({ name: f, url: `/photos/${encodeURIComponent(f)}` }));
}

router.get('/photos', (req, res) => res.json(listPhotos()));

module.exports = router;
module.exports.listPhotos = listPhotos;
module.exports.PHOTO_EXT = PHOTO_EXT;
