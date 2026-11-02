// Minimal iCalendar (.ics) reader for importing a team schedule, school calendar, etc.
// Turns each VEVENT into the shape Google's events.import endpoint takes.
const crypto = require('crypto');
const settings = require('./settings');

function validZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// "NAME;P1=a;P2="b:c":value" -> { name, params, value }. Colons inside quoted params are not the separator.
function splitLine(line) {
  let quoted = false;
  let i = 0;
  for (; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) break;
  }
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...rawParams] = head.split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value, head };
}

const unescapeText = (s) => s.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));

// DTSTART/DTEND -> Google's { date } or { dateTime, timeZone }.
function toWhen(prop, fallbackZone) {
  const v = prop.value.trim();
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (d || prop.params.VALUE === 'DATE') {
    const m = d || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    return m ? { date: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!t) return null;
  const wall = `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}`;
  if (t[7]) return { dateTime: `${wall}Z` };
  // Outlook writes Windows zone names ("Mountain Standard Time"); those and floating times use the family's zone.
  const tz = prop.params.TZID && validZone(prop.params.TZID) ? prop.params.TZID : fallbackZone;
  return { dateTime: wall, timeZone: tz };
}

// Add an ISO 8601 duration (P1D, PT1H30M, P1W) to a start.
function addDuration(start, dur) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(dur || '').trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const secs = sign * ((+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0));
  if (start.date) {
    const d = new Date(`${start.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.max(1, Math.round(secs / 86400)));
    return { date: d.toISOString().slice(0, 10) };
  }
  // Wall-clock arithmetic in UTC math keeps "1:00 PM + 1h" at "2:00 PM" in the event's own zone.
  const z = start.dateTime.endsWith('Z');
  const d = new Date(z ? start.dateTime : `${start.dateTime}Z`);
  d.setTime(d.getTime() + secs * 1000);
  const iso = d.toISOString().slice(0, 19);
  return z ? { dateTime: `${iso}Z` } : { dateTime: iso, timeZone: start.timeZone };
}

function defaultEnd(start) {
  return addDuration(start, start.date ? 'P1D' : 'PT1H');
}

// Human label for the preview, in the family's zone ("Sat, Nov 7 · 1:00 PM").
function label(start, zone) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (start.date) return new Date(`${start.date}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  if (start.dateTime.endsWith('Z')) {
    return new Date(start.dateTime).toLocaleString('en-US', { ...opts, hour: 'numeric', minute: '2-digit', timeZone: zone });
  }
  return new Date(`${start.dateTime}Z`).toLocaleString('en-US', { ...opts, hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

function parse(text) {
  const zone = settings.get('timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lines = String(text || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  if (!lines.some((l) => /^BEGIN:VCALENDAR/i.test(l.trim()))) return null;
  const events = [];
  let cur = null;
  let depth = 0; // VALARM etc. nested inside a VEVENT
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = { props: {}, recurrence: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth += 1; continue; }
    if (/^END:VEVENT$/i.test(line)) { events.push(cur); cur = null; continue; }
    if (/^END:/i.test(line)) { depth -= 1; continue; }
    if (depth > 0) continue;
    const p = splitLine(line);
    if (['RRULE', 'EXDATE', 'RDATE', 'EXRULE'].includes(p.name)) cur.recurrence.push(`${p.head}:${p.value}`);
    else if (!cur.props[p.name]) cur.props[p.name] = p;
  }

  const out = [];
  for (const e of events) {
    const P = e.props;
    // Changed single occurrences of a repeating event would clash with the series' UID; skip them.
    if (P['RECURRENCE-ID'] || (P.STATUS && /CANCELLED/i.test(P.STATUS.value)) || !P.DTSTART) continue;
    const start = toWhen(P.DTSTART, zone);
    if (!start) continue;
    let end = P.DTEND ? toWhen(P.DTEND, zone) : P.DURATION ? addDuration(start, P.DURATION.value) : null;
    if (!end || Boolean(end.date) !== Boolean(start.date)) end = defaultEnd(start);
    const title = P.SUMMARY ? unescapeText(P.SUMMARY.value).trim() : '';
    const uid = P.UID && P.UID.value.trim()
      ? P.UID.value.trim()
      : `${crypto.createHash('sha1').update(`${title}|${JSON.stringify(start)}`).digest('hex').slice(0, 20)}@family-calendar`;
    out.push({
      uid,
      title: title || '(No title)',
      location: P.LOCATION ? unescapeText(P.LOCATION.value).trim() : '',
      description: P.DESCRIPTION ? unescapeText(P.DESCRIPTION.value).trim() : '',
      start,
      end,
      recurrence: e.recurrence,
      label: label(start, zone),
    });
  }
  const key = (e) => e.start.date || e.start.dateTime;
  return out.sort((a, b) => key(a).localeCompare(key(b)));
}

module.exports = { parse };
