#!/usr/bin/env node
// Bulk-import chores from a JSON file, e.g. transcribed from paper chore charts.
// Run on the Pi from the repo root (works while the app is running):
//   node scripts/import-chores.js data/chores.json
//
// File format (member names must match the app, case-insensitive):
// {
//   "Ava": [
//     { "title": "Make my bed", "period": "morning", "days": "0111110" },   // Sun..Sat flags
//     { "title": "Reading time", "period": "afternoon", "daily": true },
//     { "title": "Wash the car", "paid": true, "amount": 5 }                 // Earn Money, one-time
//   ],
//   "Anyone": [ { "title": "Pull weeds", "paid": true, "amount": 10 } ]
// }
// A chore that already exists (same member, same title, still active) is skipped, so it is
// safe to run again after editing the file.
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-chores.js <chores.json>');
  process.exit(1);
}

const db = require(path.join(__dirname, '..', 'server', 'db'));
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const members = db.prepare('SELECT id, name FROM members WHERE active = 1').all();
const findMember = (name) => members.find((m) => m.name.trim().toLowerCase() === String(name).trim().toLowerCase());
const exists = db.prepare('SELECT 1 FROM chores WHERE active = 1 AND title = ? AND member_id IS ? LIMIT 1');
const insert = db.prepare(`
  INSERT INTO chores(title, member_id, schedule, days, due_date, paid, amount_cents, period, coins, notes, sort_order)
  VALUES(@title, @member_id, @schedule, @days, @due_date, @paid, @amount_cents, @period, @coins, @notes, @sort_order)
`);

let added = 0;
let skipped = 0;
db.transaction(() => {
  for (const [who, chores] of Object.entries(data)) {
    const anyone = who.trim().toLowerCase() === 'anyone';
    const member = anyone ? null : findMember(who);
    if (!anyone && !member) {
      console.error(`Unknown family member "${who}" - add them in the parent app first (known: ${members.map((m) => m.name).join(', ')})`);
      process.exit(1);
    }
    chores.forEach((c, i) => {
      const title = String(c.title || '').trim();
      if (!title) return;
      const paid = Boolean(c.paid);
      if (anyone && !paid) throw new Error(`"${title}": only Earn Money chores can be assigned to Anyone`);
      const memberId = member ? member.id : null;
      if (exists.get(title, memberId)) { skipped += 1; return; }
      let schedule = 'daily';
      let days = '1111111';
      if (c.days && /^[01]{7}$/.test(c.days)) { schedule = 'weekly'; days = c.days; }
      else if (c.once || (paid && !c.daily && !c.days)) schedule = 'once';
      insert.run({
        title,
        member_id: memberId,
        schedule,
        days,
        due_date: c.due_date || null,
        paid: paid ? 1 : 0,
        amount_cents: paid ? Math.round(Number(c.amount || 0) * 100) : 0,
        period: ['morning', 'afternoon', 'evening'].includes(c.period) ? c.period : 'any',
        coins: c.coins === undefined || c.coins === null ? null : Math.max(0, parseInt(c.coins, 10) || 0),
        notes: c.notes || null,
        sort_order: i,
      });
      added += 1;
    });
  }
})();

console.log(`Imported ${added} chore(s), skipped ${skipped} already present.`);
