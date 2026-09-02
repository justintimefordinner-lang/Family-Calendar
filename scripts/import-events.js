#!/usr/bin/env node
// Bulk-import birthdays and events from a JSON file. Run on the Pi from the repo root:
//   node scripts/import-events.js data/events.json
//
// File format (an array):
// [
//   { "kind": "birthday", "title": "Owen", "date": "2016-02-13" },             // repeats yearly, shows age
//   { "kind": "birthday", "title": "Grandma", "date": "1950-05-04", "show_age": false },
//   { "kind": "event", "title": "Mom & Dad's anniversary", "date": "2010-01-21", "yearly": true },
//   { "kind": "event", "title": "School play", "date": "2026-09-15", "time": "18:30", "member": "Piper" }
// ]
// Entries with the same title and date as an existing one are skipped, so re-running is safe.
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-events.js <events.json>');
  process.exit(1);
}

const db = require(path.join(__dirname, '..', 'server', 'db'));
const localEvents = require(path.join(__dirname, '..', 'server', 'localEvents'));
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(items)) {
  console.error('The file must contain a JSON array');
  process.exit(1);
}
const members = db.prepare('SELECT id, name FROM members WHERE active = 1').all();
const exists = db.prepare('SELECT 1 FROM local_events WHERE title = ? AND date = ? LIMIT 1');

let added = 0;
let skipped = 0;
for (const e of items) {
  const title = String(e.title || '').trim();
  if (!title || !e.date) { console.error(`Skipping entry without title/date: ${JSON.stringify(e)}`); continue; }
  if (exists.get(title, e.date)) { skipped += 1; continue; }
  let memberId = null;
  if (e.member) {
    const m = members.find((x) => x.name.trim().toLowerCase() === String(e.member).trim().toLowerCase());
    if (!m) { console.error(`Unknown member "${e.member}" for "${title}" (known: ${members.map((x) => x.name).join(', ')})`); process.exit(1); }
    memberId = m.id;
  }
  localEvents.create({
    kind: e.kind === 'birthday' ? 'birthday' : 'event',
    title,
    date: e.date,
    end_date: e.end_date || null,
    time: e.time || null,
    end_time: e.end_time || null,
    yearly: Boolean(e.yearly),
    show_age: e.show_age === undefined ? true : Boolean(e.show_age),
    member_id: memberId,
    notes: e.notes || '',
  });
  added += 1;
}
console.log(`Imported ${added} item(s), skipped ${skipped} already present.`);
