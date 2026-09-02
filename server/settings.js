const crypto = require('crypto');
const db = require('./db');

const DEFAULTS = {
  family_name: 'Our Family',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  week_start: 0,             // 0 = Sunday, 1 = Monday
  screensaver_minutes: 10,   // 0 disables the photo screensaver
  photo_seconds: 15,
  month_themes: 1,           // seasonal kid-friendly styling per month on the display
  temp_unit: 'fahrenheit',
  weather_lat: null,
  weather_lon: null,
  weather_label: '',
  interest_apr: 0,           // percent per year, credited monthly
  interest_day: 1,           // day of month interest is credited
  coin_name: 'Mom Coins',    // reward points for approved chores
  coins_per_chore: 2,
  game_coins_per_minute: 0.5, // what playing a game on the display costs (0 = free)
  sync_minutes: 5,
  ntfy_topic: '',            // parents subscribe to this topic in the ntfy app
  ntfy_server: 'https://ntfy.sh',
  app_url: '',               // how phones reach this server, e.g. http://192.168.1.20:3100 (auto-detected if blank)
  google_client_id: '',
  google_client_secret: '',
  pin_hash: '',
  pin_length: 4,             // lets the parent app submit automatically after the last digit
  session_secret: '',
  last_sync_at: null,
};

// Settings safe to expose to the (unauthenticated) kiosk.
const PUBLIC_KEYS = [
  'family_name', 'timezone', 'week_start', 'screensaver_minutes', 'photo_seconds', 'month_themes',
  'temp_unit', 'weather_label', 'interest_apr', 'interest_day', 'coin_name', 'coins_per_chore', 'game_coins_per_minute', 'last_sync_at',
];
// Settings a parent may change through PATCH /api/settings.
const EDITABLE_KEYS = [
  'family_name', 'timezone', 'week_start', 'screensaver_minutes', 'photo_seconds', 'month_themes',
  'temp_unit', 'weather_lat', 'weather_lon', 'weather_label', 'interest_apr',
  'interest_day', 'coin_name', 'coins_per_chore', 'game_coins_per_minute', 'sync_minutes', 'ntfy_topic', 'ntfy_server', 'app_url',
  'google_client_id', 'google_client_secret',
];
const SECRET_KEYS = ['pin_hash', 'session_secret', 'google_client_secret'];

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function get(key) {
  const row = getStmt.get(key);
  if (!row) return DEFAULTS[key] ?? null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function set(key, value) {
  setStmt.run(key, JSON.stringify(value));
}

// All settings for the parent app. Secrets are reported as booleans ("is set").
function all() {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = SECRET_KEYS.includes(key) ? Boolean(get(key)) : get(key);
  }
  return out;
}

function publicSettings() {
  const out = {};
  for (const key of PUBLIC_KEYS) out[key] = get(key);
  return out;
}

function sessionSecret() {
  let s = get('session_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    set('session_secret', s);
  }
  return s;
}

module.exports = { get, set, all, publicSettings, sessionSecret, EDITABLE_KEYS, DEFAULTS };
