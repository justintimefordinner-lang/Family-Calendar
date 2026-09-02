// Chore scheduling logic shared by the kiosk and parent routes.
const db = require('./db');
const settings = require('./settings');
const { HttpError, localDate } = require('./util');

const listActive = db.prepare(`
  SELECT c.*, m.name AS member_name FROM chores c
  LEFT JOIN members m ON m.id = c.member_id
  WHERE c.active = 1
  ORDER BY c.paid, CASE c.period WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END, c.sort_order, c.id
`);
const completionsForDate = db.prepare(`
  SELECT cc.*, m.name AS member_name FROM chore_completions cc
  JOIN members m ON m.id = cc.member_id WHERE cc.date = ?
`);
// For one-off chores the completion can be on any date.
const completionsForOnce = db.prepare(`
  SELECT cc.*, m.name AS member_name FROM chore_completions cc
  JOIN members m ON m.id = cc.member_id
  JOIN chores c ON c.id = cc.chore_id
  WHERE c.schedule = 'once' AND cc.status != 'rejected'
`);

function isDue(chore, date) {
  if (chore.schedule === 'daily') return true;
  if (chore.schedule === 'weekly') {
    const dow = new Date(`${date}T12:00:00`).getDay();
    return chore.days.charAt(dow) === '1';
  }
  if (chore.schedule === 'once') {
    return !chore.due_date || chore.due_date <= date;
  }
  return false;
}

// Build the chore list for a given day. memberId = null means "everyone".
// Each entry carries the completion (if any) relevant to that member/day.
function choresForDay(date = localDate(), memberId = null) {
  const chores = listActive.all();
  const dayCompletions = completionsForDate.all(date);
  const onceCompletions = completionsForOnce.all();
  const out = [];

  for (const chore of chores) {
    if (!isDue(chore, date)) continue;
    if (memberId != null && chore.member_id != null && chore.member_id !== memberId) continue;
    // Unpaid chores must have an owner; skip "anyone" chores that are not Earn Money.
    if (chore.member_id == null && !chore.paid) continue;

    let completion = null;
    if (chore.schedule === 'once') {
      completion = onceCompletions.find((c) => c.chore_id === chore.id) || null;
      // Once a one-off chore is done, it only shows on the day it was completed.
      if (completion && completion.date !== date) continue;
      if (completion && memberId != null && chore.member_id == null && completion.member_id !== memberId) continue;
    } else {
      completion = dayCompletions.find((c) => c.chore_id === chore.id
        && (memberId == null || c.member_id === memberId)) || null;
    }

    out.push({
      id: chore.id,
      title: chore.title,
      notes: chore.notes,
      member_id: chore.member_id,
      member_name: chore.member_name,
      schedule: chore.schedule,
      period: chore.period || 'any',
      paid: Boolean(chore.paid),
      amount_cents: chore.amount_cents,
      status: completion ? completion.status : null,
      completion_id: completion ? completion.id : null,
      completed_by: completion ? completion.member_id : null,
      completed_by_name: completion ? completion.member_name : null,
    });
  }
  return out;
}

const getChore = db.prepare('SELECT * FROM chores WHERE id = ? AND active = 1');
const getMember = db.prepare('SELECT * FROM members WHERE id = ? AND active = 1');

// Kid taps a chore on the kiosk.
function complete(choreId, memberId, date = localDate()) {
  const chore = getChore.get(choreId);
  if (!chore) throw new HttpError(404, 'Chore not found');
  const member = getMember.get(memberId);
  if (!member) throw new HttpError(404, 'Family member not found');
  if (chore.member_id != null && chore.member_id !== memberId) throw new HttpError(400, 'That chore belongs to someone else');
  if (!isDue(chore, date)) throw new HttpError(400, 'That chore is not due today');

  if (chore.schedule === 'once') {
    const existing = completionsForOnce.all().find((c) => c.chore_id === chore.id);
    if (existing && existing.member_id !== memberId) throw new HttpError(400, `${existing.member_name} already claimed that one`);
    if (existing) return existing;
  }

  // Every chore waits for a parent's approval: Earn Money chores pay cash, the rest earn coins.
  const status = 'pending';
  db.prepare(`
    INSERT INTO chore_completions(chore_id, member_id, date, status) VALUES(?, ?, ?, ?)
    ON CONFLICT(chore_id, member_id, date) DO UPDATE SET
      status = CASE WHEN chore_completions.status = 'approved' THEN 'approved' ELSE excluded.status END,
      completed_at = datetime('now')
  `).run(choreId, memberId, date, status);
  return db.prepare('SELECT * FROM chore_completions WHERE chore_id = ? AND member_id = ? AND date = ?').get(choreId, memberId, date);
}

// Kid un-taps a chore. Approved (paid out) completions cannot be undone here.
function uncomplete(completionId) {
  const c = db.prepare('SELECT * FROM chore_completions WHERE id = ?').get(completionId);
  if (!c) throw new HttpError(404, 'Not found');
  if (c.status === 'approved') throw new HttpError(400, 'Already approved and paid - ask a parent to change it');
  db.prepare('DELETE FROM chore_completions WHERE id = ?').run(completionId);
}

const pendingList = db.prepare(`
  SELECT cc.*, c.title, c.amount_cents, c.schedule, c.paid, m.name AS member_name, m.color, m.emoji
  FROM chore_completions cc
  JOIN chores c ON c.id = cc.chore_id
  JOIN members m ON m.id = cc.member_id
  WHERE cc.status = 'pending' ORDER BY cc.completed_at
`);

function pending() {
  return pendingList.all();
}

// Parent approves a completion: Earn Money chores credit cash, regular chores award coins.
const approve = db.transaction((completionId) => {
  const c = db.prepare(`
    SELECT cc.*, c.title, c.amount_cents, c.paid FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id WHERE cc.id = ?
  `).get(completionId);
  if (!c) throw new HttpError(404, 'Not found');
  if (c.status === 'approved') return c;
  db.prepare(`UPDATE chore_completions SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?`).run(completionId);
  if (c.paid) {
    // Earnings land in the kid's cash; a parent can move them to "invested" later.
    db.prepare(`INSERT INTO transactions(member_id, type, account, amount_cents, note, completion_id) VALUES(?, 'chore', 'cash', ?, ?, ?)`)
      .run(c.member_id, c.amount_cents, `Earned: ${c.title}`, completionId);
  } else {
    const coins = Math.max(0, Number(settings.get('coins_per_chore')) || 0);
    if (coins > 0) {
      db.prepare('INSERT INTO coin_transactions(member_id, amount, note, completion_id) VALUES(?, ?, ?, ?)')
        .run(c.member_id, coins, c.title, completionId);
    }
  }
  return { ...c, status: 'approved' };
});

// Approve everything waiting, optionally for one member.
const approveAll = db.transaction((memberId = null) => {
  const rows = pendingList.all().filter((p) => memberId == null || p.member_id === memberId);
  for (const p of rows) approve(p.id);
  return rows.length;
});

const coinBalanceStmt = db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM coin_transactions WHERE member_id = ?');
const coinBalance = (memberId) => coinBalanceStmt.get(memberId).n;

function reject(completionId) {
  const c = db.prepare('SELECT * FROM chore_completions WHERE id = ?').get(completionId);
  if (!c) throw new HttpError(404, 'Not found');
  if (c.status === 'approved') throw new HttpError(400, 'Already approved; remove the transaction instead');
  db.prepare(`UPDATE chore_completions SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ?`).run(completionId);
}

module.exports = { choresForDay, complete, uncomplete, pending, approve, approveAll, reject, isDue, coinBalance };
