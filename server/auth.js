const crypto = require('crypto');
const settings = require('./settings');
const { HttpError } = require('./util');

const COOKIE = 'fc_parent';
const SESSION_DAYS = 90;

// ---- PIN hashing -----------------------------------------------------------
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---- Brute-force throttle --------------------------------------------------
const attempts = new Map(); // ip -> { count, until }

function checkThrottle(ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    const secs = Math.ceil((a.until - Date.now()) / 1000);
    throw new HttpError(429, `Too many attempts. Try again in ${secs}s`);
  }
}

function recordFailure(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= 5) a.until = Date.now() + 60_000 * Math.min(15, a.count - 4);
  attempts.set(ip, a);
}

function clearFailures(ip) {
  attempts.delete(ip);
}

// ---- Signed session cookie -------------------------------------------------
function sign(payload) {
  return crypto.createHmac('sha256', settings.sessionSecret()).update(payload).digest('hex');
}

function issueSession(res) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `parent.${exp}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86_400_000,
    path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isParent(req) {
  const value = parseCookies(req.headers.cookie)[COOKIE];
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  if (who !== 'parent' || Number(exp) < Date.now()) return false;
  const expected = sign(`${who}.${exp}`);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function requireParent(req, res, next) {
  if (isParent(req)) return next();
  next(new HttpError(401, 'Parent login required'));
}

module.exports = {
  hashPin, verifyPin, checkThrottle, recordFailure, clearFailures,
  issueSession, clearSession, isParent, requireParent,
};
