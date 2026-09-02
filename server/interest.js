// Credits monthly interest ("invested with Dad") to each kid's balance.
const db = require('./db');
const settings = require('./settings');
const { localDate } = require('./util');

const balanceStmt = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM transactions WHERE member_id = ?');
const paidThisMonth = db.prepare(`SELECT 1 FROM transactions WHERE member_id = ? AND type = 'interest' AND substr(created_at, 1, 7) = ? LIMIT 1`);
const insert = db.prepare(`INSERT INTO transactions(member_id, type, amount_cents, note) VALUES(?, 'interest', ?, ?)`);

function balance(memberId) {
  return balanceStmt.get(memberId).bal;
}

function applyIfDue(now = new Date()) {
  const apr = Number(settings.get('interest_apr')) || 0;
  if (apr <= 0) return 0;
  const day = Number(settings.get('interest_day')) || 1;
  if (now.getDate() < day) return 0;
  const month = localDate(now).slice(0, 7);
  const kids = db.prepare(`SELECT id FROM members WHERE active = 1 AND role = 'kid'`).all();
  let credited = 0;
  db.transaction(() => {
    for (const { id } of kids) {
      if (paidThisMonth.get(id, month)) continue;
      const bal = balance(id);
      if (bal <= 0) continue;
      const amount = Math.round(bal * (apr / 100) / 12);
      if (amount <= 0) continue;
      insert.run(id, amount, `Interest for ${month} (${apr}% APR)`);
      credited += 1;
    }
  })();
  if (credited) console.log(`[interest] credited ${credited} account(s) for ${month}`);
  return credited;
}

function start() {
  applyIfDue();
  setInterval(() => applyIfDue(), 60 * 60 * 1000).unref();
}

module.exports = { start, applyIfDue, balance };
