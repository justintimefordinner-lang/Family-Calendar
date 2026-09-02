/* Family Calendar - parent app (PWA) */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const money = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);
  const toCents = (v) => Math.round((parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0) * 100);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PALETTE = ['#2f6fed', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0ea5e9', '#14b8a6'];
  const EMOJIS = ['🙂', '😎', '🦄', '🐯', '🦊', '🐼', '🚀', '⚽', '🎨', '🎸', '🦖', '🐶', '🐱', '⭐', '🌈', '🍕', '👩', '👨'];
  const TX_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', chore: 'Chore', interest: 'Interest', adjustment: 'Adjustment' };

  const S = { me: null, members: [], settings: null, route: 'chores', arg: null, mealWeek: 0, pin: '' };

  async function api(path, opts = {}) {
    const init = { ...opts, headers: { ...(opts.headers || {}) } };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && S.me) { S.me.parent = false; render(); }
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 4000 : 2200);
  }
  const fail = (e) => toast(e.message || String(e), true);

  function fmtWhen(sqlite) {
    return new Date(sqlite.replace(' ', 'T') + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // ---- Sheets ----------------------------------------------------------------
  function openSheet(html) {
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet">${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    const first = bg.querySelector('input[type=text]');
    if (first) setTimeout(() => first.focus(), 50);
    return bg;
  }
  function closeSheet() { document.querySelectorAll('.sheet-bg').forEach((e) => e.remove()); }

  // ---- Routing ---------------------------------------------------------------
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, arg] = h.split('/');
    return { route: route || 'chores', arg };
  }

  function tabbar() {
    const tabs = [['chores', '✅', 'Chores'], ['money', '💰', 'Money'], ['meals', '🍽️', 'Meals'], ['list', '🛒', 'List'], ['settings', '⚙️', 'Settings']];
    return `<nav class="tabbar">${tabs.map(([r, ic, l]) => `<a href="#${r}" class="${S.route === r ? 'active' : ''}"><span class="ic">${ic}</span>${l}</a>`).join('')}</nav>`;
  }

  function shell(title, content, actions = '') {
    $('#app').innerHTML = `<div class="screen"><div class="topbar"><h1>${title}</h1><div>${actions}</div></div>${content}</div>${tabbar()}`;
  }

  const memberById = (id) => S.members.find((m) => m.id === id);
  const kids = () => S.members.filter((m) => m.role === 'kid');

  async function loadMembers() { S.members = await api('/api/members'); }

  async function render() {
    const { route, arg } = parseHash();
    S.route = route; S.arg = arg;
    try {
      if (S.me.needs_setup) return renderSetup();
      if (!S.me.parent) return renderLogin();
      await loadMembers();
      if (route === 'money' && arg) return await renderMoneyDetail(Number(arg));
      const views = { chores: renderChores, money: renderMoney, meals: renderMeals, list: renderList, settings: renderSettings };
      await (views[route] || renderChores)();
    } catch (e) {
      fail(e);
    }
  }

  // ---- Setup wizard ----------------------------------------------------------
  function memberRow(i, m = {}) {
    const color = m.color || PALETTE[i % PALETTE.length];
    const emoji = m.emoji || EMOJIS[i % EMOJIS.length];
    return `<div class="list-item" data-member-row>
      <select name="emoji" class="input" style="width:70px;padding:8px">${EMOJIS.map((e) => `<option ${e === emoji ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <input type="text" name="name" class="input" placeholder="Name" value="${esc(m.name || '')}" required>
      <input type="color" name="color" class="color-input" value="${color}">
      <select name="role" class="input" style="width:92px;padding:8px"><option value="kid" ${m.role !== 'parent' ? 'selected' : ''}>Kid</option><option value="parent" ${m.role === 'parent' ? 'selected' : ''}>Parent</option></select>
    </div>`;
  }

  function renderSetup() {
    $('#app').innerHTML = `<div class="screen">
      <h1>Welcome 👋</h1>
      <p class="muted">Let's set up your family. Everything here can be changed later in Settings.</p>
      <form data-form="setup">
        <div class="card">
          <label class="field"><span>Family name (shown on the display)</span><input type="text" name="family_name" required placeholder="The Smiths"></label>
          <div class="row2">
            <label class="field"><span>Parent PIN (4-8 digits)</span><input type="password" name="pin" inputmode="numeric" pattern="\\d{4,8}" required></label>
            <label class="field"><span>Confirm PIN</span><input type="password" name="pin2" inputmode="numeric" pattern="\\d{4,8}" required></label>
          </div>
        </div>
        <div class="card"><h2>Family members</h2>
          <div id="setupMembers">${[0, 1, 2].map((i) => memberRow(i)).join('')}</div>
          <div class="actions"><button type="button" class="btn" data-action="add-member-row">+ Add another</button></div>
        </div>
        <button class="btn primary block" type="submit">Finish setup</button>
      </form></div>`;
  }

  // ---- Login -----------------------------------------------------------------
  function renderLogin() {
    S.pin = '';
    $('#app').innerHTML = `<div class="screen pinpad">
      <h1>Parent PIN</h1>
      <div class="dots" id="pinDots"></div>
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join('')}
        <button data-key="back">⌫</button><button data-key="0">0</button><button data-key="go" class="btn primary">Go</button>
      </div>
      <p class="muted small mt">This is the parent app for the family display. Kids use the touchscreen.</p>
    </div>`;
  }

  async function submitPin() {
    if (S.pin.length < 4) return;
    try {
      await api('/api/auth/login', { method: 'POST', body: { pin: S.pin } });
      S.me.parent = true;
      render();
    } catch (e) { S.pin = ''; $('#pinDots').textContent = ''; fail(e); }
  }

  document.addEventListener('keydown', (e) => {
    if (!S.me || S.me.parent || S.me.needs_setup) return;
    if (/^\d$/.test(e.key) && S.pin.length < 8) S.pin += e.key;
    else if (e.key === 'Backspace') S.pin = S.pin.slice(0, -1);
    else if (e.key === 'Enter') return submitPin();
    $('#pinDots').textContent = '●'.repeat(S.pin.length);
  });

  // ---- Chores ----------------------------------------------------------------
  function scheduleLabel(c) {
    if (c.schedule === 'daily') return 'Every day';
    if (c.schedule === 'weekly') {
      const on = DOW.filter((d, i) => c.days[i] === '1');
      return on.length === 7 ? 'Every day' : on.length ? on.join(' ') : 'No days selected';
    }
    return c.due_date ? `Once · ${parseYmd(c.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'One time';
  }

  async function renderChores() {
    const [pending, today, all] = await Promise.all([
      api('/api/chores/pending'), api('/api/chores/day'), api('/api/chores'),
    ]);
    let html = '';
    if (pending.length) {
      html += `<div class="card"><h2>⏳ Waiting for approval <span class="meta">${pending.length}</span></h2>
        ${pending.map((p) => `<div class="list-item">
          <div class="avatar" style="--c:${esc(p.color)}">${esc(p.emoji)}</div>
          <div class="grow"><div class="title">${esc(p.title)}</div><div class="sub">${esc(p.member_name)} · ${fmtWhen(p.completed_at)}</div></div>
          <div class="amt">${money(p.amount_cents)}</div>
          <button class="btn small good" data-action="approve" data-id="${p.id}">Pay</button>
          <button class="btn small icon" data-action="reject" data-id="${p.id}" title="Reject">✕</button>
        </div>`).join('')}</div>`;
    }

    // Today, grouped by member
    const groups = S.members.map((m) => ({
      m, items: today.chores.filter((c) => c.member_id === m.id || (c.member_id == null && c.completed_by === m.id)),
    })).filter((g) => g.items.length);
    const open = today.chores.filter((c) => c.member_id == null && !c.status);
    html += `<div class="card"><h2>Today <span class="meta">${parseYmd(today.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span></h2>
      ${groups.length ? groups.map((g) => `
        <div class="list-item" style="border-top:0;padding-bottom:0"><div class="avatar" style="--c:${esc(g.m.color)}">${esc(g.m.emoji)}</div><div class="grow title">${esc(g.m.name)}</div></div>
        ${g.items.map((c) => `<div class="list-item tappable" data-toggle="${c.id}" data-member="${g.m.id}" data-completion="${c.completion_id || ''}" data-status="${c.status || ''}">
          <div class="check ${c.status === 'pending' ? 'pending' : c.status ? 'done' : ''}">${c.status === 'pending' ? '⏳' : c.status ? '✓' : ''}</div>
          <div class="grow ${c.status && c.status !== 'pending' ? 'strike' : ''}">${esc(c.title)}</div>
          ${c.paid ? `<span class="badge ${c.status === 'approved' ? 'approved' : c.status === 'pending' ? 'pending' : 'paid'}">${money(c.amount_cents)}</span>` : ''}
        </div>`).join('')}`).join('') : '<p class="muted">No chores due today.</p>'}
      ${open.length ? `<p class="muted small mt">💵 ${open.length} open Earn Money chore${open.length > 1 ? 's' : ''} nobody has claimed yet.</p>` : ''}
    </div>`;

    const regular = all.filter((c) => !c.paid);
    const paid = all.filter((c) => c.paid);
    const choreItem = (c) => `<div class="list-item tappable" data-edit-chore="${c.id}">
      <div class="avatar" style="--c:${esc(c.member_id ? memberById(c.member_id)?.color : '#9ca3af')}">${c.member_id ? esc(memberById(c.member_id)?.emoji || '?') : '👥'}</div>
      <div class="grow"><div class="title">${esc(c.title)}</div><div class="sub">${esc(c.member_name || 'Anyone')} · ${scheduleLabel(c)}</div></div>
      ${c.paid ? `<div class="amt">${money(c.amount_cents)}</div>` : ''}</div>`;
    html += `<div class="card"><h2>Regular chores <span class="meta">${regular.length}</span></h2>${regular.map(choreItem).join('') || '<p class="muted">Tap + to add a chore.</p>'}</div>`;
    html += `<div class="card"><h2>💵 Earn Money <span class="meta">${paid.length}</span></h2>${paid.map(choreItem).join('') || '<p class="muted">Extra chores kids can do to earn money. Add one with +.</p>'}</div>`;
    html += `<button class="fab" data-action="new-chore" aria-label="Add chore">+</button>`;
    shell('Chores', html);
    S.allChores = all;
  }

  function choreForm(c = {}) {
    const paid = Boolean(c.paid);
    const sched = c.schedule || 'daily';
    const days = c.days || '1111111';
    return `<form data-form="chore" data-id="${c.id || ''}">
      <h2>${c.id ? 'Edit chore' : 'New chore'}</h2>
      <label class="field"><span>What</span><input type="text" name="title" required maxlength="80" value="${esc(c.title || '')}" placeholder="Make bed"></label>
      <label class="field inline"><span>💵 Earn Money chore (pays when a parent approves)</span><input type="checkbox" name="paid" ${paid ? 'checked' : ''}></label>
      <div data-paid-only ${paid ? '' : 'hidden'}><label class="field"><span>Pays ($)</span><input type="number" name="amount" step="0.25" min="0" inputmode="decimal" value="${c.amount_cents ? (c.amount_cents / 100).toFixed(2) : ''}" placeholder="5.00"></label></div>
      <label class="field"><span>Who</span><select name="member_id">
        <option value="" ${c.id && c.member_id == null ? 'selected' : ''} ${paid ? '' : 'disabled'}>Anyone — first kid to claim it</option>
        ${S.members.map((m) => `<option value="${m.id}" ${c.member_id === m.id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}
      </select></label>
      <div class="field"><span>When</span>
        <div class="seg" data-seg="schedule">
          <button type="button" data-val="daily" class="${sched === 'daily' ? 'active' : ''}">Every day</button>
          <button type="button" data-val="weekly" class="${sched === 'weekly' ? 'active' : ''}">Certain days</button>
          <button type="button" data-val="once" class="${sched === 'once' ? 'active' : ''}">One time</button>
        </div><input type="hidden" name="schedule" value="${sched}"></div>
      <div data-when="weekly" ${sched === 'weekly' ? '' : 'hidden'} class="field">
        <div class="days" data-days>${DOW.map((d, i) => `<button type="button" data-day="${i}" class="${days[i] === '1' ? 'on' : ''}">${d[0]}</button>`).join('')}</div>
        <input type="hidden" name="days" value="${days}"></div>
      <div data-when="once" ${sched === 'once' ? '' : 'hidden'}><label class="field"><span>Available from (optional)</span><input type="date" name="due_date" value="${c.due_date || ''}"></label></div>
      <label class="field"><span>Notes (optional)</span><input type="text" name="notes" maxlength="200" value="${esc(c.notes || '')}"></label>
      <div class="actions"><button class="btn primary grow" type="submit">Save</button>
        ${c.id ? `<button type="button" class="btn danger" data-action="delete-chore" data-id="${c.id}">Delete</button>` : ''}</div>
    </form>`;
  }

  // ---- Money -----------------------------------------------------------------
  async function renderMoney() {
    const [summary, settings] = await Promise.all([api('/api/finance/summary'), api('/api/settings')]);
    const apr = Number(settings.interest_apr) || 0;
    const cards = kids().map((m) => {
      const f = summary.find((s) => s.member_id === m.id) || { balance_cents: 0, pending_cents: 0 };
      return `<div class="card balance-card tappable" data-href="#money/${m.id}">
        <div class="avatar" style="--c:${esc(m.color)}">${esc(m.emoji)}</div>
        <div><div class="title" style="font-weight:600">${esc(m.name)}</div>${f.pending_cents ? `<div class="sub muted small">+${money(f.pending_cents)} awaiting approval</div>` : ''}</div>
        <div class="bal">${money(f.balance_cents)}</div></div>`;
    }).join('');
    shell('Money', `<p class="muted small">${apr > 0 ? `Balances earn ${apr}% per year, credited on day ${settings.interest_day} of each month.` : 'No interest is being paid. Set a rate in Settings › Interest.'}</p>
      ${cards || '<div class="card"><p class="muted">Add kids in Settings › Family to start tracking money.</p></div>'}`);
  }

  async function renderMoneyDetail(id) {
    const m = memberById(id);
    if (!m) { location.hash = '#money'; return; }
    const f = await api(`/api/finance/${id}`);
    const rows = f.transactions.map((t) => `<div class="list-item tx">
      <div class="grow"><div class="title">${esc(t.note || TX_LABEL[t.type] || t.type)}</div><div class="sub">${fmtWhen(t.created_at)} · ${TX_LABEL[t.type] || t.type}</div></div>
      <div class="a ${t.amount_cents < 0 ? 'neg' : 'pos'}">${t.amount_cents < 0 ? '−' : '+'}${money(Math.abs(t.amount_cents))}</div>
      <button class="btn small icon" data-action="delete-tx" data-id="${t.id}" title="Remove">✕</button></div>`).join('');
    shell(`${esc(m.emoji)} ${esc(m.name)}`, `
      <div class="card"><div class="big-balance">${money(f.balance_cents)}</div>
        <p class="muted small center">${f.pending_cents ? `+${money(f.pending_cents)} awaiting approval · ` : ''}${f.interest_apr > 0 ? `${f.interest_apr}% per year` : 'no interest set'}</p></div>
      <div class="card"><h2>Add a transaction</h2>
        <form data-form="tx" data-member="${m.id}">
          <div class="field"><div class="seg" data-seg="type">
            <button type="button" data-val="deposit" class="active">Deposit</button>
            <button type="button" data-val="withdrawal">Withdraw</button>
            <button type="button" data-val="adjustment">Adjust ±</button></div><input type="hidden" name="type" value="deposit"></div>
          <div class="row2">
            <label class="field"><span>Amount ($)</span><input type="number" name="amount" step="0.01" inputmode="decimal" required placeholder="20.00"></label>
            <label class="field"><span>Note</span><input type="text" name="note" maxlength="200" placeholder="Birthday money"></label>
          </div>
          <button class="btn primary block" type="submit">Save</button>
        </form></div>
      <div class="card"><h2>History</h2>${rows || '<p class="muted">Nothing yet.</p>'}</div>`,
    `<a class="btn small" href="#money">‹ All kids</a>`);
  }

  // ---- Meals -----------------------------------------------------------------
  async function renderMeals() {
    const settings = S.settings || (S.settings = await api('/api/settings'));
    const ws = Number(settings.week_start) || 0;
    const today = new Date();
    const start = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -((today.getDay() - ws + 7) % 7) + S.mealWeek * 7);
    const end = addDays(start, 6);
    const meals = await api(`/api/meals?from=${ymd(start)}&to=${ymd(end)}`);
    const byDate = Object.fromEntries(meals.map((x) => [x.date, x]));
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const key = ymd(d);
      rows.push(`<div class="meal-row ${key === ymd(today) ? 'today' : ''}">
        <div class="d">${DOW[d.getDay()]}<small>${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></div>
        <input type="text" class="input" data-meal="${key}" maxlength="120" placeholder="Dinner…" value="${esc(byDate[key]?.title || '')}"></div>`);
    }
    shell('Meals', `<div class="card">
      <div class="topbar"><button class="btn small" data-action="meal-week" data-n="-1">‹</button>
        <strong>${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong>
        <button class="btn small" data-action="meal-week" data-n="1">›</button></div>
      ${rows.join('')}
      <p class="muted small mt">Type a dinner and tap away to save. Tonight's dinner shows on the display.</p></div>`,
    S.mealWeek ? '<button class="btn small" data-action="meal-week" data-n="0">This week</button>' : '');
  }

  // ---- Shopping list ---------------------------------------------------------
  async function renderList() {
    const items = await api('/api/shopping');
    const checked = items.filter((i) => i.checked).length;
    shell('Shopping List', `<div class="card">
      <form data-form="shop" class="actions" style="margin:0 0 8px"><input type="text" name="text" class="input grow" placeholder="Add an item…" maxlength="200" autocomplete="off" required><button class="btn primary" type="submit">Add</button></form>
      ${items.map((i) => `<div class="list-item">
        <div class="check box ${i.checked ? 'done' : ''}" data-shop-toggle="${i.id}" data-checked="${i.checked}">${i.checked ? '✓' : ''}</div>
        <div class="grow ${i.checked ? 'strike' : ''}">${esc(i.text)}</div>
        <button class="btn small icon" data-action="shop-delete" data-id="${i.id}">✕</button></div>`).join('') || '<p class="muted">The list is empty.</p>'}
      ${checked ? `<div class="actions"><button class="btn" data-action="shop-clear">Clear ${checked} checked</button></div>` : ''}
    </div>`);
  }

  // ---- Settings --------------------------------------------------------------
  function calendarOptions(cal) {
    const current = !cal.enabled ? 'off' : cal.is_family ? 'family' : cal.member_id != null ? `m:${cal.member_id}` : 'family';
    const opts = [['off', 'Hidden'], ['family', '👨‍👩‍👧‍👦 Family (everyone)'], ...S.members.map((m) => [`m:${m.id}`, `${m.emoji} ${m.name}`])];
    return opts.map(([v, l]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  async function renderSettings() {
    const [settings, accounts, allMembers, photos] = await Promise.all([
      api('/api/settings'), api('/api/google/accounts'), api('/api/members/all'), api('/api/photos'),
    ]);
    S.settings = settings;
    const section = (title, body, open = false) => `<details class="section" ${open ? 'open' : ''}><summary>${title}</summary><div class="body">${body}</div></details>`;

    const family = `<form data-form="settings"><label class="field"><span>Family name</span><input type="text" name="family_name" value="${esc(settings.family_name)}" maxlength="60"></label>
        <button class="btn primary" type="submit">Save</button></form>
      <h2 class="mt">Members</h2>
      ${allMembers.map((m) => `<div class="list-item tappable" data-edit-member="${m.id}">
        <div class="avatar" style="--c:${esc(m.color)}">${esc(m.emoji)}</div>
        <div class="grow"><div class="title ${m.active ? '' : 'strike'}">${esc(m.name)}</div><div class="sub">${m.role === 'parent' ? 'Parent' : 'Kid'}${m.active ? '' : ' · hidden'}</div></div></div>`).join('')}
      <div class="actions"><button class="btn" data-action="new-member">+ Add member</button></div>`;

    const accountsHtml = accounts.map((a) => `<div class="card" style="box-shadow:none;border:1px solid var(--line)">
        <div class="list-item"><div class="grow"><div class="title">${esc(a.email)}</div>
          <div class="sub ${a.last_error ? 'err' : ''}">${a.last_error ? esc(a.last_error) : a.last_sync_at ? 'Synced ' + new Date(a.last_sync_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not synced yet'}</div></div>
          <button class="btn small" data-action="refresh-cals" data-id="${a.id}">Refresh</button>
          <button class="btn small danger" data-action="remove-account" data-id="${a.id}">Remove</button></div>
        ${a.calendars.length ? a.calendars.map((c) => `<div class="cal-row"><span class="swatch" style="background:${esc(c.color || '#999')}"></span><span class="name">${esc(c.name)}</span>
          <select data-cal="${c.id}">${calendarOptions(c)}</select></div>`).join('') : '<p class="muted small">No calendars found. Tap Refresh.</p>'}
      </div>`).join('');
    const google = `<p class="muted small">Step 1 — create a free Google Cloud OAuth client (type <b>Desktop app</b>) and enable the Google Calendar API. See the README for the exact clicks.</p>
      ${settings.google_env_override ? '<p class="small ok">Client ID/secret are set from the server environment.</p>' : `<form data-form="settings">
        <label class="field"><span>Client ID</span><input type="text" name="google_client_id" value="${esc(settings.google_client_id)}" autocomplete="off"></label>
        <label class="field"><span>Client secret ${settings.google_client_secret ? '<span class="ok">(saved — leave blank to keep)</span>' : ''}</span><input type="password" name="google_client_secret" autocomplete="off" data-keep-empty></label>
        <button class="btn primary" type="submit">Save</button></form>`}
      <p class="muted small mt">Step 2 — connect a Google account. Sign in with the account that owns (or has been shared) the family and kids' calendars. You can connect more than one.</p>
      <div class="actions"><button class="btn primary" data-action="google-connect" ${settings.google_configured ? '' : 'disabled'}>Connect a Google account</button></div>
      <form data-form="google-paste" class="mt"><label class="field"><span>If the page after signing in fails to load (normal on a phone), copy its address and paste it here</span>
        <input type="text" name="url" placeholder="http://localhost:${''}…/api/google/callback?code=…" autocomplete="off"></label>
        <button class="btn" type="submit">Finish connecting</button></form>
      <h2 class="mt">Connected accounts</h2>
      ${accountsHtml || '<p class="muted small">None yet.</p>'}
      <p class="muted small">Step 3 — for each calendar choose who it belongs to. Family calendars show for everyone; a kid's calendar shows when their name is selected on the display.</p>
      <div class="actions"><button class="btn" data-action="sync-now">Sync now</button><span class="muted small" style="align-self:center">Auto-sync every ${settings.sync_minutes} min</span></div>`;

    const weather = `<p class="small">${settings.weather_label ? `Current: <b>${esc(settings.weather_label)}</b>` : '<span class="muted">No location set.</span>'}</p>
      <form data-form="geo" class="actions" style="margin-top:0"><input type="text" name="q" class="input grow" placeholder="City or town"><button class="btn" type="submit">Search</button></form>
      <div id="geoResults"></div>
      <form data-form="settings" class="mt"><label class="field"><span>Units</span><select name="temp_unit"><option value="fahrenheit" ${settings.temp_unit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit</option><option value="celsius" ${settings.temp_unit === 'celsius' ? 'selected' : ''}>Celsius</option></select></label>
        <button class="btn primary" type="submit">Save</button></form>`;

    const display = `<form data-form="settings">
      <label class="field"><span>Week starts on</span><select name="week_start"><option value="0" ${Number(settings.week_start) === 0 ? 'selected' : ''}>Sunday</option><option value="1" ${Number(settings.week_start) === 1 ? 'selected' : ''}>Monday</option></select></label>
      <div class="row2">
        <label class="field"><span>Photo screensaver after (minutes, 0 = off)</span><input type="number" name="screensaver_minutes" min="0" max="240" value="${settings.screensaver_minutes}"></label>
        <label class="field"><span>Seconds per photo</span><input type="number" name="photo_seconds" min="5" max="600" value="${settings.photo_seconds}"></label>
      </div>
      <label class="field"><span>Seasonal month themes on the display (Halloween in October, etc.)</span><select name="month_themes"><option value="1" ${Number(settings.month_themes) !== 0 ? 'selected' : ''}>On</option><option value="0" ${Number(settings.month_themes) === 0 ? 'selected' : ''}>Off</option></select></label>
      <label class="field"><span>Timezone (restart required)</span><input type="text" name="timezone" value="${esc(settings.timezone)}" placeholder="America/Chicago"></label>
      <button class="btn primary" type="submit">Save</button></form>`;

    const interest = `<form data-form="settings">
      <div class="row2">
        <label class="field"><span>Interest rate (% per year)</span><input type="number" name="interest_apr" min="0" max="100" step="0.1" value="${settings.interest_apr}"></label>
        <label class="field"><span>Credited on day of month</span><input type="number" name="interest_day" min="1" max="28" value="${settings.interest_day}"></label>
      </div>
      <p class="muted small">Each month, every kid with a positive balance earns balance × rate ÷ 12.</p>
      <div class="actions"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-action="apply-interest">Credit this month now</button></div></form>`;

    const photosHtml = `<p class="muted small">Photos rotate on the display after it sits idle.</p>
      <label class="btn block" style="text-align:center">Upload photos<input type="file" accept="image/*" multiple data-upload hidden></label>
      <div class="photo-grid mt">${photos.map((p) => `<div class="ph"><img src="${p.url}" loading="lazy" alt=""><button data-action="delete-photo" data-name="${esc(p.name)}">✕</button></div>`).join('')}</div>`;

    const pin = `<form data-form="pin">
      <label class="field"><span>Current PIN</span><input type="password" name="current" inputmode="numeric" required></label>
      <div class="row2"><label class="field"><span>New PIN</span><input type="password" name="pin" inputmode="numeric" pattern="\\d{4,8}" required></label>
      <label class="field"><span>Confirm</span><input type="password" name="pin2" inputmode="numeric" pattern="\\d{4,8}" required></label></div>
      <button class="btn primary" type="submit">Change PIN</button></form>`;

    shell('Settings', [
      section('👨‍👩‍👧‍👦 Family', family, true),
      section('📅 Google Calendar', google, accounts.length === 0),
      section('🌤️ Weather', weather),
      section('🖥️ Display', display),
      section('📈 Interest', interest),
      section(`🖼️ Screensaver photos (${photos.length})`, photosHtml),
      section('🔒 Parent PIN', pin),
      `<div class="actions"><button class="btn block" data-action="logout">Log out</button></div>
       <p class="muted small center mt">Display: <a href="/" target="_blank">${location.host}</a> · Family Calendar</p>`,
    ].join(''));
  }

  function memberForm(m = {}) {
    const i = S.members.length;
    return `<form data-form="member" data-id="${m.id || ''}"><h2>${m.id ? 'Edit member' : 'New member'}</h2>
      <label class="field"><span>Name</span><input type="text" name="name" required maxlength="40" value="${esc(m.name || '')}"></label>
      <div class="row2">
        <label class="field"><span>Emoji</span><select name="emoji">${EMOJIS.map((e) => `<option ${e === (m.emoji || EMOJIS[i % EMOJIS.length]) ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
        <label class="field"><span>Color</span><input type="color" name="color" class="color-input" value="${m.color || PALETTE[i % PALETTE.length]}"></label>
      </div>
      <label class="field"><span>Role</span><select name="role"><option value="kid" ${m.role !== 'parent' ? 'selected' : ''}>Kid (has chores and money)</option><option value="parent" ${m.role === 'parent' ? 'selected' : ''}>Parent</option></select></label>
      ${m.id ? `<label class="field inline"><span>Show on the display</span><input type="checkbox" name="active" ${m.active ? 'checked' : ''}></label>` : ''}
      <div class="actions"><button class="btn primary grow" type="submit">Save</button></div></form>`;
  }

  // ---- Event handling --------------------------------------------------------
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const key = t.closest('[data-key]');
    if (key) {
      const k = key.dataset.key;
      if (k === 'back') S.pin = S.pin.slice(0, -1);
      else if (k === 'go') return submitPin();
      else if (S.pin.length < 8) S.pin += k;
      $('#pinDots').textContent = '●'.repeat(S.pin.length);
      return;
    }
    const seg = t.closest('[data-seg] button');
    if (seg) {
      const wrap = seg.closest('[data-seg]');
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === seg));
      const form = wrap.closest('form');
      form.querySelector(`input[name=${wrap.dataset.seg}]`).value = seg.dataset.val;
      form.querySelectorAll('[data-when]').forEach((el) => { el.hidden = el.dataset.when !== seg.dataset.val; });
      return;
    }
    const day = t.closest('[data-days] button');
    if (day) {
      day.classList.toggle('on');
      const wrap = day.closest('[data-days]');
      const flags = [...wrap.querySelectorAll('button')].map((b) => (b.classList.contains('on') ? '1' : '0')).join('');
      wrap.parentElement.querySelector('input[name=days]').value = flags;
      return;
    }
    const href = t.closest('[data-href]');
    if (href) { location.hash = href.dataset.href; return; }
    const editChore = t.closest('[data-edit-chore]');
    if (editChore) { openSheet(choreForm(S.allChores.find((c) => c.id === Number(editChore.dataset.editChore)))); return; }
    const editMember = t.closest('[data-edit-member]');
    if (editMember) {
      const all = await api('/api/members/all');
      openSheet(memberForm(all.find((m) => m.id === Number(editMember.dataset.editMember))));
      return;
    }
    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      try {
        if (toggle.dataset.status === 'approved') return toast('Already paid — remove the transaction under Money to undo.');
        if (toggle.dataset.status && toggle.dataset.status !== 'rejected') await api(`/api/chores/completions/${toggle.dataset.completion}`, { method: 'DELETE' });
        else await api(`/api/chores/${toggle.dataset.toggle}/complete`, { method: 'POST', body: { member_id: Number(toggle.dataset.member) } });
        render();
      } catch (err) { fail(err); }
      return;
    }
    const shopToggle = t.closest('[data-shop-toggle]');
    if (shopToggle) {
      try { await api(`/api/shopping/${shopToggle.dataset.shopToggle}`, { method: 'PATCH', body: { checked: shopToggle.dataset.checked !== '1' } }); render(); } catch (err) { fail(err); }
      return;
    }
    const act = t.closest('[data-action]');
    if (!act) return;
    const a = act.dataset.action;
    const id = act.dataset.id;
    try {
      switch (a) {
        case 'add-member-row': $('#setupMembers').insertAdjacentHTML('beforeend', memberRow($('#setupMembers').children.length)); break;
        case 'new-chore': openSheet(choreForm()); break;
        case 'delete-chore':
          if (!confirm('Delete this chore? History is kept.')) return;
          await api(`/api/chores/${id}`, { method: 'DELETE' }); closeSheet(); toast('Chore deleted'); render(); break;
        case 'approve': await api(`/api/chores/completions/${id}/approve`, { method: 'POST' }); toast('Paid!'); render(); break;
        case 'reject': await api(`/api/chores/completions/${id}/reject`, { method: 'POST' }); toast('Rejected'); render(); break;
        case 'delete-tx':
          if (!confirm('Remove this transaction?')) return;
          await api(`/api/finance/transactions/${id}`, { method: 'DELETE' }); toast('Removed'); render(); break;
        case 'meal-week': S.mealWeek = act.dataset.n === '0' ? 0 : S.mealWeek + Number(act.dataset.n); render(); break;
        case 'shop-delete': await api(`/api/shopping/${id}`, { method: 'DELETE' }); render(); break;
        case 'shop-clear': await api('/api/shopping/checked', { method: 'DELETE' }); render(); break;
        case 'new-member': openSheet(memberForm()); break;
        case 'google-connect': {
          const { url } = await api('/api/google/auth-url');
          window.open(url, '_blank');
          toast('Sign in with Google in the new tab, then paste the final address below if it fails to load.');
          break;
        }
        case 'refresh-cals': await api(`/api/google/accounts/${id}/calendars/refresh`, { method: 'POST' }); toast('Calendars refreshed'); render(); break;
        case 'remove-account':
          if (!confirm('Remove this Google account and its calendars from the display?')) return;
          await api(`/api/google/accounts/${id}`, { method: 'DELETE' }); toast('Removed'); render(); break;
        case 'sync-now': {
          act.disabled = true;
          const r = await api('/api/google/sync', { method: 'POST' });
          toast(r.skipped ? 'Google is not configured yet' : r.errors?.length ? r.errors[0] : `Synced ${r.events} events from ${r.calendars} calendar(s)`, Boolean(r.errors?.length));
          render(); break;
        }
        case 'geo-pick':
          await api('/api/settings', { method: 'PATCH', body: { weather_lat: Number(act.dataset.lat), weather_lon: Number(act.dataset.lon), weather_label: act.dataset.label } });
          toast('Weather location saved'); render(); break;
        case 'apply-interest': {
          const r = await api('/api/finance/apply-interest', { method: 'POST' });
          toast(r.credited ? `Credited ${r.credited} account(s)` : 'Nothing to credit (rate is 0, day not reached, or already paid this month)'); break;
        }
        case 'delete-photo':
          if (!confirm('Delete this photo?')) return;
          await api(`/api/photos/${encodeURIComponent(act.dataset.name)}`, { method: 'DELETE' }); render(); break;
        case 'logout': await api('/api/auth/logout', { method: 'POST' }); S.me.parent = false; render(); break;
        default: break;
      }
    } catch (err) { fail(err); }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('input[name=paid]')) {
      const form = t.closest('form');
      form.querySelectorAll('[data-paid-only]').forEach((el) => { el.hidden = !t.checked; });
      const anyone = form.querySelector('select[name=member_id] option[value=""]');
      anyone.disabled = !t.checked;
      if (!t.checked && !form.member_id.value) form.member_id.selectedIndex = 1;
      return;
    }
    if (t.matches('[data-meal]')) {
      try { await api(`/api/meals/${t.dataset.meal}`, { method: 'PUT', body: { title: t.value } }); toast(t.value.trim() ? 'Saved' : 'Cleared'); } catch (err) { fail(err); }
      return;
    }
    if (t.matches('[data-cal]')) {
      const v = t.value;
      const body = v === 'off' ? { enabled: false } : v === 'family' ? { enabled: true, is_family: true, member_id: null }
        : { enabled: true, is_family: false, member_id: Number(v.slice(2)) };
      try { await api(`/api/google/calendars/${t.dataset.cal}`, { method: 'PATCH', body }); toast('Calendar updated'); } catch (err) { fail(err); }
      return;
    }
    if (t.matches('[data-upload]')) {
      if (!t.files.length) return;
      const fd = new FormData();
      for (const f of t.files) fd.append('photos', f);
      try {
        toast(`Uploading ${t.files.length} photo(s)…`);
        const r = await api('/api/photos', { method: 'POST', body: fd });
        toast(`Added ${r.added} photo(s)`); render();
      } catch (err) { fail(err); }
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!form.dataset.form) return;
    e.preventDefault();
    const fd = new FormData(form);
    try {
      switch (form.dataset.form) {
        case 'setup': {
          if (fd.get('pin') !== fd.get('pin2')) return toast('PINs do not match', true);
          const members = [...form.querySelectorAll('[data-member-row]')].map((row) => ({
            name: row.querySelector('[name=name]').value, emoji: row.querySelector('[name=emoji]').value,
            color: row.querySelector('[name=color]').value, role: row.querySelector('[name=role]').value,
          })).filter((m) => m.name.trim());
          await api('/api/setup', { method: 'POST', body: { family_name: fd.get('family_name'), pin: fd.get('pin'), members } });
          S.me = { parent: true, needs_setup: false };
          toast('All set! 🎉'); location.hash = '#settings'; render(); break;
        }
        case 'chore': {
          const body = {
            title: fd.get('title'), paid: form.paid.checked, amount_cents: toCents(fd.get('amount')),
            member_id: fd.get('member_id') ? Number(fd.get('member_id')) : null,
            schedule: fd.get('schedule'), days: fd.get('days'), due_date: fd.get('due_date') || null, notes: fd.get('notes'),
          };
          if (form.dataset.id) await api(`/api/chores/${form.dataset.id}`, { method: 'PATCH', body });
          else await api('/api/chores', { method: 'POST', body });
          closeSheet(); toast('Saved'); render(); break;
        }
        case 'tx': {
          const cents = toCents(fd.get('amount'));
          if (!cents) return toast('Enter an amount', true);
          await api(`/api/finance/${form.dataset.member}/transactions`, { method: 'POST', body: { type: fd.get('type'), amount_cents: cents, note: fd.get('note') } });
          toast('Saved'); render(); break;
        }
        case 'shop': await api('/api/shopping', { method: 'POST', body: { text: fd.get('text') } }); render(); break;
        case 'member': {
          const body = { name: fd.get('name'), emoji: fd.get('emoji'), color: fd.get('color'), role: fd.get('role') };
          if (form.dataset.id) { body.active = form.active.checked; await api(`/api/members/${form.dataset.id}`, { method: 'PATCH', body }); }
          else await api('/api/members', { method: 'POST', body });
          closeSheet(); toast('Saved'); render(); break;
        }
        case 'settings': {
          const body = {};
          for (const [k, v] of fd.entries()) {
            const input = form.querySelector(`[name="${k}"]`);
            if (input.hasAttribute('data-keep-empty') && !v) continue;
            body[k] = v;
          }
          await api('/api/settings', { method: 'PATCH', body });
          S.settings = null; toast('Saved'); render(); break;
        }
        case 'google-paste':
          await api('/api/google/paste', { method: 'POST', body: { url: fd.get('url') } });
          toast('Google account connected'); render(); break;
        case 'geo': {
          const results = await api(`/api/weather/geocode?q=${encodeURIComponent(fd.get('q'))}`);
          $('#geoResults').innerHTML = results.length ? results.map((r) => `<div class="list-item tappable" data-action="geo-pick" data-lat="${r.lat}" data-lon="${r.lon}" data-label="${esc(r.label)}">📍 ${esc(r.label)}</div>`).join('') : '<p class="muted small">No matches.</p>';
          break;
        }
        case 'pin':
          if (fd.get('pin') !== fd.get('pin2')) return toast('PINs do not match', true);
          await api('/api/settings/pin', { method: 'POST', body: { current: fd.get('current'), pin: fd.get('pin') } });
          form.reset(); toast('PIN changed'); break;
        default: break;
      }
    } catch (err) { fail(err); }
  });

  window.addEventListener('hashchange', render);

  // ---- Boot ------------------------------------------------------------------
  (async () => {
    const q = new URLSearchParams(location.search);
    if (q.get('google') === 'connected') setTimeout(() => toast(`Connected ${q.get('email')}`), 300);
    if (q.get('google') === 'error') setTimeout(() => toast(`Google: ${q.get('msg')}`, true), 300);
    if (q.has('google')) history.replaceState(null, '', location.pathname + location.hash);
    try {
      S.me = await api('/api/auth/me');
      await render();
    } catch (e) {
      $('#app').innerHTML = `<div class="loading err">Cannot reach the server: ${esc(e.message)}</div>`;
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/parent/sw.js').catch(() => {});
  })();
})();
