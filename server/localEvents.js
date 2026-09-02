// Birthdays and events entered in the parent app (not from Google). Expanded into
// occurrences that look like synced events so the display treats them the same way.
const db = require('./db');
const { HttpError, isDateStr, toInt } = require('./util');

const BIRTHDAY_COLOR = '#f59e0b';
const EVENT_COLOR = '#7c6f9b';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Same month/day in another year; Feb 29 becomes Feb 28 in non-leap years.
function inYear(dateStr, year) {
  const [, m, d] = dateStr.split('-').map(Number);
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

function addHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${pad(Math.min(23, h + 1))}:${pad(m)}`;
}

function occurrences(fromTs, toTs) {
  const rows = db.prepare('SELECT * FROM local_events').all();
  const fromYear = new Date(fromTs).getFullYear();
  const toYear = new Date(toTs).getFullYear();
  const out = [];
  for (const r of rows) {
    const years = r.yearly ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i) : [null];
    for (const y of years) {
      let startDate = r.date;
      let endDate = r.end_date && r.end_date >= r.date ? r.end_date : r.date;
      if (y != null) {
        const span = daysBetween(r.date, endDate);
        startDate = inYear(r.date, y);
        endDate = addDays(startDate, span);
      }
      let start; let end; let allDay;
      if (r.time) {
        start = `${startDate}T${r.time}:00`;
        end = `${endDate}T${r.end_time || addHour(r.time)}:00`;
        allDay = 0;
      } else {
        start = startDate;
        end = addDays(endDate, 1);
        allDay = 1;
      }
      const startTs = new Date(allDay ? `${start}T00:00:00` : start).getTime();
      const endTs = new Date(allDay ? `${end}T00:00:00` : end).getTime();
      if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs <= fromTs || startTs >= toTs) continue;

      let title = r.title;
      if (r.kind === 'birthday') {
        const age = y != null && r.show_age ? y - Number(r.date.slice(0, 4)) : 0;
        title = age > 0 && age < 120 ? `🎂 ${r.title} turns ${age}` : `🎂 ${r.title}'s birthday`;
      }
      out.push({
        id: -(r.id * 10000 + (y == null ? 0 : y % 10000)),
        local_id: r.id,
        kind: r.kind,
        title,
        start, end, start_ts: startTs, end_ts: endTs, all_day: allDay,
        location: null,
        description: r.notes,
        calendar_id: 0,
        calendar_name: r.kind === 'birthday' ? 'Birthdays' : 'Family events',
        calendar_color: r.kind === 'birthday' ? BIRTHDAY_COLOR : EVENT_COLOR,
        member_id: r.member_id,
        is_family: r.member_id == null ? 1 : 0,
      });
    }
  }
  return out;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function fields(b, existing = {}) {
  const kind = ['birthday', 'event'].includes(b.kind) ? b.kind : (existing.kind || 'event');
  const title = b.title !== undefined ? String(b.title).trim().slice(0, 120) : existing.title;
  if (!title) throw new HttpError(400, 'Title required');
  const date = b.date !== undefined ? b.date : existing.date;
  if (!isDateStr(date)) throw new HttpError(400, 'A valid date is required');
  const endDate = b.end_date !== undefined ? (isDateStr(b.end_date) ? b.end_date : null) : (existing.end_date ?? null);
  if (endDate && endDate < date) throw new HttpError(400, 'End date is before the start date');
  const time = b.time !== undefined ? (TIME_RE.test(b.time) ? b.time : null) : (existing.time ?? null);
  const endTime = b.end_time !== undefined ? (TIME_RE.test(b.end_time) ? b.end_time : null) : (existing.end_time ?? null);
  const memberId = b.member_id !== undefined ? toInt(b.member_id, null) : (existing.member_id ?? null);
  return {
    kind, title, date,
    end_date: kind === 'birthday' ? null : endDate,
    time: kind === 'birthday' ? null : time,
    end_time: kind === 'birthday' ? null : (time ? endTime : null),
    yearly: kind === 'birthday' ? 1 : (b.yearly !== undefined ? (b.yearly ? 1 : 0) : (existing.yearly || 0)),
    show_age: b.show_age !== undefined ? (b.show_age ? 1 : 0) : (existing.show_age ?? 1),
    member_id: memberId,
    notes: b.notes !== undefined ? (String(b.notes).trim().slice(0, 300) || null) : (existing.notes ?? null),
  };
}

const listStmt = db.prepare(`
  SELECT e.*, m.name AS member_name FROM local_events e LEFT JOIN members m ON m.id = e.member_id
  ORDER BY e.kind, substr(e.date, 6), e.date
`);
const getStmt = db.prepare('SELECT * FROM local_events WHERE id = ?');

function list() { return listStmt.all(); }

function create(body) {
  const f = fields(body);
  const info = db.prepare(`
    INSERT INTO local_events(kind, title, date, end_date, time, end_time, yearly, show_age, member_id, notes)
    VALUES(@kind, @title, @date, @end_date, @time, @end_time, @yearly, @show_age, @member_id, @notes)
  `).run(f);
  return getStmt.get(info.lastInsertRowid);
}

function update(id, body) {
  const existing = getStmt.get(id);
  if (!existing) throw new HttpError(404, 'Not found');
  const f = fields(body, existing);
  db.prepare(`
    UPDATE local_events SET kind = @kind, title = @title, date = @date, end_date = @end_date, time = @time,
      end_time = @end_time, yearly = @yearly, show_age = @show_age, member_id = @member_id, notes = @notes WHERE id = @id
  `).run({ ...f, id });
  return getStmt.get(id);
}

function remove(id) {
  db.prepare('DELETE FROM local_events WHERE id = ?').run(id);
}

module.exports = { occurrences, list, create, update, remove };
