// Credits monthly interest ("invested with Dad") to each kid's balance.
//
// The rate is a percentage per month (interest_monthly). On or after interest_day (default: the 1st)
// each kid is paid interest for the PREVIOUS calendar month, pro-rated by the day: every day's
// closing balance earns rate / daysInMonth, so money added on the 20th only earns for the days it
// was actually there. Interest already paid compounds in later months.
const db = require('./db');
const settings = require('./settings');
const { localDate } = require('./util');

const balanceStmt = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM transactions WHERE member_id = ? AND account = ?');
const paidThisMonth = db.prepare(`SELECT 1 FROM transactions WHERE member_id = ? AND type = 'interest' AND substr(created_at, 1, 7) = ? LIMIT 1`);
const insert = db.prepare(`INSERT INTO transactions(member_id, type, account, amount_cents, note) VALUES(?, 'interest', 'invested', ?, ?)`);
const investedTx = db.prepare(`SELECT amount_cents, created_at FROM transactions WHERE member_id = ? AND account = 'invested' ORDER BY created_at, id`);

function balance(memberId, account = 'invested') {
  return balanceStmt.get(memberId, account).bal;
}

// Percent per month. Older installs stored a yearly rate; convert it once.
function monthlyRate() {
  const m = settings.get('interest_monthly');
  if (m !== null && m !== undefined && m !== '') return Number(m) || 0;
  const apr = Number(settings.get('interest_apr')) || 0;
  const monthly = Math.round((apr / 12) * 100) / 100;
  settings.set('interest_monthly', monthly);
  return monthly;
}

// created_at is stored in UTC by SQLite; process.env.TZ is the family's zone, so local getters apply.
const txLocalDate = (createdAt) => localDate(new Date(String(createdAt).replace(' ', 'T') + 'Z'));

// Pro-rated interest (cents) for the calendar month starting at `first` (a local Date on the 1st).
function interestForMonth(memberId, first, ratePct) {
  const y = first.getFullYear(); const mo = first.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const monthKey = localDate(first).slice(0, 7);
  const txs = investedTx.all(memberId).map((t) => ({ amount: t.amount_cents, date: txLocalDate(t.created_at) }));
  let bal = 0; let i = 0;
  while (i < txs.length && txs[i].date.slice(0, 7) < monthKey) { bal += txs[i].amount; i += 1; }
  let daySum = 0; // sum of each day's closing balance (deposits count from the day they are made)
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = `${monthKey}-${String(d).padStart(2, '0')}`;
    while (i < txs.length && txs[i].date <= key) { bal += txs[i].amount; i += 1; }
    if (bal > 0) daySum += bal;
  }
  return { cents: Math.round((daySum / daysInMonth) * (ratePct / 100)), daysInMonth, monthKey };
}

// Pays last month's interest once per calendar month. `force` ignores the pay-day gate (the parent
// app's "Credit now" button) but never pays twice in a month.
function applyIfDue(now = new Date(), { force = false } = {}) {
  const rate = monthlyRate();
  if (rate <= 0) return 0;
  const day = Number(settings.get('interest_day')) || 1;
  if (!force && now.getDate() < day) return 0;
  const thisMonth = localDate(now).slice(0, 7);
  const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const kids = db.prepare(`SELECT id FROM members WHERE active = 1 AND role = 'kid'`).all();
  let credited = 0;
  db.transaction(() => {
    for (const { id } of kids) {
      if (paidThisMonth.get(id, thisMonth)) continue;
      const { cents, monthKey } = interestForMonth(id, prevFirst, rate);
      if (cents <= 0) continue;
      insert.run(id, cents, `Interest for ${monthKey} (${rate}% per month, pro-rated by day)`);
      credited += 1;
    }
  })();
  if (credited) console.log(`[interest] credited ${credited} account(s) for ${localDate(prevFirst).slice(0, 7)}`);
  return credited;
}

function start() {
  applyIfDue();
  setInterval(() => applyIfDue(), 60 * 60 * 1000).unref();
}

module.exports = { start, applyIfDue, balance, monthlyRate, interestForMonth };
