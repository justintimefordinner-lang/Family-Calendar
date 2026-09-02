const express = require('express');
const db = require('../db');
const settings = require('../settings');
const auth = require('../auth');
const { HttpError, wrap, requireFields } = require('../util');

const router = express.Router();

function needsSetup() {
  return !settings.get('pin_hash');
}

function validPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ''));
}

router.get('/setup/status', (req, res) => {
  res.json({ needs_setup: needsSetup() });
});

// First-run wizard: family name, parent PIN and the kids. Only works until a PIN exists.
router.post('/setup', wrap(async (req, res) => {
  if (!needsSetup()) throw new HttpError(400, 'Setup has already been completed');
  const { family_name, pin, members = [] } = req.body;
  requireFields(req.body, ['family_name', 'pin']);
  if (!validPin(pin)) throw new HttpError(400, 'PIN must be 4-8 digits');

  db.transaction(() => {
    settings.set('family_name', String(family_name).trim());
    settings.set('pin_hash', auth.hashPin(pin));
    settings.set('pin_length', String(pin).length);
    const ins = db.prepare('INSERT INTO members(name, role, color, emoji, sort_order) VALUES(?, ?, ?, ?, ?)');
    members.forEach((m, i) => {
      if (!m.name || !String(m.name).trim()) return;
      ins.run(String(m.name).trim(), m.role === 'parent' ? 'parent' : 'kid', m.color || '#4f86f7', m.emoji || '🙂', i);
    });
    require('../prizes').seedDefaults(); // starter coin prizes
  })();
  auth.issueSession(res);
  res.json({ ok: true });
}));

router.post('/auth/login', (req, res) => {
  const ip = req.ip;
  auth.checkThrottle(ip);
  if (needsSetup()) throw new HttpError(400, 'Run setup first');
  if (!auth.verifyPin(req.body.pin, settings.get('pin_hash'))) {
    auth.recordFailure(ip);
    throw new HttpError(401, 'Wrong PIN');
  }
  auth.clearFailures(ip);
  auth.issueSession(res);
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ parent: auth.isParent(req), needs_setup: needsSetup(), pin_length: Number(settings.get('pin_length')) || 4 });
});

module.exports = router;
module.exports.validPin = validPin;
