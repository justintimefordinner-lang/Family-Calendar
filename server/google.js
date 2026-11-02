// Google Calendar integration: OAuth for one or more Google accounts, calendar
// list discovery, a periodic event sync into SQLite, and adding events from .ics files.
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');
const settings = require('./settings');
const { PORT, DATA_DIR } = require('./config');
const { HttpError } = require('./util');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events', // add events (.ics import); accounts connected before this can only read
  'https://www.googleapis.com/auth/userinfo.email',
];
// "Desktop app" OAuth clients accept any loopback redirect without registering it.
const REDIRECT_URI = `http://localhost:${PORT}/api/google/callback`;
const PAST_DAYS = 21;
const FUTURE_DAYS = 90;

// Google's downloaded OAuth client file, if the user dropped it in the data directory.
// Format: { "installed": { "client_id": "...", "client_secret": "..." } }
function clientFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'google-client.json'), 'utf8'));
    const c = raw.installed || raw.web || raw;
    return c.client_id && c.client_secret ? { clientId: c.client_id, clientSecret: c.client_secret } : null;
  } catch {
    return null;
  }
}

// Precedence: environment > parent-app settings > data/google-client.json
function clientConfig() {
  const file = clientFile();
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || settings.get('google_client_id') || (file && file.clientId) || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || settings.get('google_client_secret') || (file && file.clientSecret) || '',
  };
}

function isConfigured() {
  const { clientId, clientSecret } = clientConfig();
  return Boolean(clientId && clientSecret);
}

function newClient(tokens) {
  const { clientId, clientSecret } = clientConfig();
  if (!clientId || !clientSecret) throw new HttpError(400, 'Google client ID and secret are not configured yet');
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: REDIRECT_URI });
  if (tokens) client.setCredentials(tokens);
  return client;
}

function authUrl() {
  return newClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

// Extract the OAuth code from a pasted redirect URL (or accept a raw code).
function codeFromInput(input) {
  const s = String(input || '').trim();
  if (!s) throw new HttpError(400, 'Paste the URL Google redirected you to');
  try {
    const u = new URL(s);
    const code = u.searchParams.get('code');
    if (code) return code;
    const err = u.searchParams.get('error');
    if (err) throw new HttpError(400, `Google returned an error: ${err}`);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // not a URL - treat as a bare code
  }
  return s;
}

async function connectWithCode(code) {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const { data } = await client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
  const email = data.email;
  if (!email) throw new HttpError(400, 'Google did not return an email address for this account');

  const existing = db.prepare('SELECT * FROM google_accounts WHERE email = ?').get(email);
  if (existing && !tokens.refresh_token) {
    tokens.refresh_token = JSON.parse(existing.tokens).refresh_token;
  }
  db.prepare(`
    INSERT INTO google_accounts(email, tokens) VALUES(?, ?)
    ON CONFLICT(email) DO UPDATE SET tokens = excluded.tokens, last_error = NULL
  `).run(email, JSON.stringify(tokens));
  const account = db.prepare('SELECT * FROM google_accounts WHERE email = ?').get(email);
  await refreshCalendarList(account.id);
  return account;
}

function clientFor(account) {
  const client = newClient(JSON.parse(account.tokens));
  client.on('tokens', (t) => {
    const merged = { ...JSON.parse(account.tokens), ...t };
    account.tokens = JSON.stringify(merged);
    db.prepare('UPDATE google_accounts SET tokens = ? WHERE id = ?').run(account.tokens, account.id);
  });
  return client;
}

async function refreshCalendarList(accountId) {
  const account = db.prepare('SELECT * FROM google_accounts WHERE id = ?').get(accountId);
  if (!account) throw new HttpError(404, 'Google account not found');
  const client = clientFor(account);
  const { data } = await client.request({
    url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    params: { maxResults: 250 },
  });
  const upsert = db.prepare(`
    INSERT INTO calendars(account_id, google_id, name, color, access_role) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(account_id, google_id) DO UPDATE SET name = excluded.name, color = excluded.color, access_role = excluded.access_role
  `);
  db.transaction((items) => {
    for (const c of items) upsert.run(accountId, c.id, c.summaryOverride || c.summary || c.id, c.backgroundColor || null, c.accessRole || null);
  })(data.items || []);
  return listAccounts().find((a) => a.id === accountId);
}

// Did this account grant the events scope? Accounts connected before .ics import existed only granted read access.
function canWrite(account) {
  try {
    const scope = String(JSON.parse(account.tokens).scope || '');
    return /auth\/calendar\.events(\s|$)|auth\/calendar(\s|$)/.test(scope);
  } catch {
    return false;
  }
}

function listAccounts() {
  const accounts = db.prepare('SELECT id, email, tokens, last_error, last_sync_at, created_at FROM google_accounts ORDER BY id').all();
  const cals = db.prepare('SELECT * FROM calendars ORDER BY is_family DESC, name').all();
  for (const a of accounts) {
    a.can_write = canWrite(a);
    delete a.tokens;
    a.calendars = cals.filter((c) => c.account_id === a.id);
  }
  return accounts;
}

// Calendars an import can go to: shown on the display, on an account that granted write access,
// and owned or editable by that account (a role of null means the list predates access_role; let Google decide).
function writableCalendars() {
  const accounts = db.prepare('SELECT * FROM google_accounts').all().filter(canWrite);
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);
  return db.prepare(`SELECT c.*, a.email FROM calendars c JOIN google_accounts a ON a.id = c.account_id
    WHERE c.enabled = 1 AND c.account_id IN (${ids.map(() => '?').join(',')}) ORDER BY c.is_family DESC, c.name`).all(...ids)
    .filter((c) => c.access_role == null || c.access_role === 'owner' || c.access_role === 'writer');
}

function removeAccount(id) {
  db.prepare('DELETE FROM google_accounts WHERE id = ?').run(id);
}

// ---- Event sync ------------------------------------------------------------
function parseWhen(when) {
  if (when.date) {
    return { raw: when.date, ts: new Date(`${when.date}T00:00:00`).getTime(), allDay: true };
  }
  return { raw: when.dateTime, ts: new Date(when.dateTime).getTime(), allDay: false };
}

const replaceEvents = db.transaction((calendarId, items) => {
  db.prepare('DELETE FROM events WHERE calendar_id = ?').run(calendarId);
  const ins = db.prepare(`
    INSERT OR REPLACE INTO events(calendar_id, google_id, title, start, end, start_ts, end_ts, all_day, location, description)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ev of items) {
    if (ev.status === 'cancelled' || !ev.start) continue;
    const s = parseWhen(ev.start);
    const e = parseWhen(ev.end || ev.start);
    if (Number.isNaN(s.ts) || Number.isNaN(e.ts)) continue;
    ins.run(calendarId, ev.id, ev.summary || '(No title)', s.raw, e.raw, s.ts, e.ts, s.allDay ? 1 : 0,
      ev.location || null, ev.description || null);
  }
});

async function syncCalendar(client, cal) {
  const now = Date.now();
  const timeMin = new Date(now - PAST_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(now + FUTURE_DAYS * 86_400_000).toISOString();
  const items = [];
  let pageToken;
  do {
    const { data } = await client.request({
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.google_id)}/events`,
      params: {
        timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: 2500,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  replaceEvents(cal.id, items);
  return items.length;
}

// ---- .ics import -------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Google's events.import keys on iCalUID, so importing the same file twice updates the events instead of duplicating them.
async function importEvents(calendarId, memberId, events) {
  const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(calendarId);
  if (!cal || !writableCalendars().some((c) => c.id === cal.id)) throw new HttpError(400, 'That calendar cannot take new events. Reconnect its Google account in Settings.');
  const account = db.prepare('SELECT * FROM google_accounts WHERE id = ?').get(cal.account_id);
  const client = clientFor(account);
  // A kid's event going to a shared calendar gets their name in front, so the display still files it under them.
  const member = memberId != null && cal.member_id !== memberId
    ? db.prepare('SELECT name, aliases FROM members WHERE id = ?').get(memberId) : null;
  const nameRe = member && new RegExp(`(?<![\\p{L}\\p{N}])(?:${[member.name, ...String(member.aliases || '').split(',')]
    .map((w) => w.trim()).filter((w) => w.length >= 2).map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
  const when = (w) => (w && w.date ? { date: String(w.date) } : w && w.dateTime
    ? { dateTime: String(w.dateTime), ...(w.timeZone ? { timeZone: String(w.timeZone) } : {}) } : null);

  let added = 0;
  const errors = [];
  for (const e of events) {
    const title = String(e.title || '(No title)').slice(0, 300);
    const start = when(e.start);
    const end = when(e.end);
    if (!e.uid || !start || !end) { errors.push(`${title}: missing date`); continue; }
    try {
      await client.request({
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.google_id)}/events/import`,
        method: 'POST',
        data: {
          iCalUID: String(e.uid),
          summary: member && !nameRe.test(title) ? `${member.name} ${title}` : title,
          location: String(e.location || '').slice(0, 1000) || undefined,
          description: String(e.description || '').slice(0, 8000) || undefined,
          start,
          end,
          ...(Array.isArray(e.recurrence) && e.recurrence.length ? { recurrence: e.recurrence.map(String) } : {}),
        },
      });
      added += 1;
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 401 || status === 403) throw new HttpError(400, `Google refused (${account.email}). Reconnect that account in Settings to allow adding events.`);
      errors.push(`${title}: ${(err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message}`);
    }
  }
  if (added) syncAll().catch(() => {});
  return { added, errors, calendar: cal.name };
}

let syncing = false;
async function syncAll() {
  if (syncing || !isConfigured()) return { skipped: true };
  syncing = true;
  const summary = { accounts: 0, calendars: 0, events: 0, errors: [] };
  try {
    const accounts = db.prepare('SELECT * FROM google_accounts').all();
    for (const account of accounts) {
      summary.accounts += 1;
      const client = clientFor(account);
      const cals = db.prepare('SELECT * FROM calendars WHERE account_id = ? AND enabled = 1').all(account.id);
      let error = null;
      for (const cal of cals) {
        try {
          summary.events += await syncCalendar(client, cal);
          summary.calendars += 1;
        } catch (e) {
          error = `${cal.name}: ${e.message}`;
          summary.errors.push(`${account.email} / ${error}`);
          console.error(`[google] sync failed for ${account.email} / ${cal.name}:`, e.message);
        }
      }
      db.prepare('UPDATE google_accounts SET last_error = ?, last_sync_at = ? WHERE id = ?')
        .run(error, error ? account.last_sync_at : new Date().toISOString(), account.id);
    }
    settings.set('last_sync_at', new Date().toISOString());
  } finally {
    syncing = false;
  }
  return summary;
}

let timer = null;
function startSync() {
  const run = () => syncAll().catch((e) => console.error('[google] sync error:', e.message));
  const schedule = () => {
    const minutes = Math.max(1, Number(settings.get('sync_minutes')) || 5);
    clearInterval(timer);
    timer = setInterval(run, minutes * 60_000);
    timer.unref();
  };
  run();
  schedule();
  // Re-read the interval every 10 minutes so a settings change takes effect without a restart.
  setInterval(schedule, 10 * 60_000).unref();
}

module.exports = {
  REDIRECT_URI, isConfigured, authUrl, codeFromInput, connectWithCode,
  refreshCalendarList, listAccounts, removeAccount, syncAll, startSync, writableCalendars, importEvents,
};
