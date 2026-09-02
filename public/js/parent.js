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
  const TX_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', chore: 'Chore', interest: 'Interest', adjustment: 'Adjustment', transfer: 'Moved' };
  const ACCT_LABEL = { cash: '💵 Cash', invested: '📈 Invested' };

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
    const tabs = [['chores', '✅', 'Chores'], ['money', '💰', 'Money'], ['events', '🎂', 'Events'], ['meals', '🍽️', 'Meals'], ['list', '🛒', 'List'], ['settings', '⚙️', 'Settings']];
    return `<nav class="tabbar">${tabs.map(([r, ic, l]) => `<a href="#${r}" class="${S.route === r ? 'active' : ''}"><span class="ic">${ic}</span>${l}</a>`).join('')}</nav>`;
  }

  function shell(title, content, actions = '') {
    const reload = '<button class="btn small icon" data-action="reload" title="Refresh the app" aria-label="Refresh">↻</button>';
    $('#app').innerHTML = `<div class="screen"><div class="topbar"><h1>${title}</h1><div class="actions" style="margin:0">${actions}${reload}</div></div>${content}</div>${tabbar()}`;
  }

  // Hard refresh: drop the cached shell and reload from the Pi.
  async function hardReload() {
    try {
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.update();
    } catch { /* ignore */ }
    location.reload();
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
      const views = { chores: renderChores, money: renderMoney, events: renderEvents, meals: renderMeals, list: renderList, settings: renderSettings };
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
      <button class="btn small" data-action="reload">↻ Refresh app</button>
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

  // Submits on its own once the PIN's length is reached; the Go key covers the rest.
  function pinDigit(d) {
    if (S.pin.length >= 8) return;
    S.pin += d;
    $('#pinDots').textContent = '●'.repeat(S.pin.length);
    if (S.pin.length === (Number(S.me.pin_length) || 4)) submitPin();
  }

  document.addEventListener('keydown', (e) => {
    if (!S.me || S.me.parent || S.me.needs_setup) return;
    if (/^\d$/.test(e.key)) return pinDigit(e.key);
    if (e.key === 'Backspace') S.pin = S.pin.slice(0, -1);
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
    const [pending, today, all, removed] = await Promise.all([
      api('/api/chores/pending'), api('/api/chores/day'), api('/api/chores'), api('/api/chores/removed'),
    ]);
    if (!S.settings) S.settings = await api('/api/settings');
    let html = '';
    if (pending.length) {
      // Grouped by kid, each with its own Approve all.
      const byKid = [];
      for (const p of pending) {
        let g = byKid.find((x) => x.member_id === p.member_id);
        if (!g) { g = { member_id: p.member_id, name: p.member_name, color: p.color, emoji: p.emoji, items: [] }; byKid.push(g); }
        g.items.push(p);
      }
      html += `<div class="card"><h2>⏳ Waiting for approval <span class="meta">${byKid.length > 1 ? `<button class="btn small good" data-action="approve-all">Approve all ${pending.length}</button>` : ''}</span></h2>
        ${byKid.map((g) => `
          <div class="list-item" style="padding-bottom:4px"><div class="avatar" style="--c:${esc(g.color)}">${esc(g.emoji)}</div>
            <div class="grow title">${esc(g.name)} <span class="muted small">· ${g.items.length}</span></div>
            <button class="btn small good" data-action="approve-all" data-member="${g.member_id}">Approve all</button></div>
          ${g.items.map((p) => `<div class="list-item" style="padding-left:50px">
            <div class="grow"><div class="title">${esc(p.title)}</div><div class="sub">${fmtWhen(p.completed_at)}</div></div>
            <div class="amt">${p.paid ? money(p.amount_cents) : (p.coins ? `🪙 +${p.coins}` : '')}</div>
            <button class="btn small good" data-action="approve" data-id="${p.id}">${p.paid ? 'Pay' : 'OK'}</button>
            <button class="btn small icon" data-action="reject" data-id="${p.id}" title="Reject">✕</button>
          </div>`).join('')}`).join('')}</div>`;
    }

    // Today, grouped by member
    const groups = S.members.map((m) => ({
      m, items: today.chores.filter((c) => c.member_id === m.id || (c.member_id == null && c.completed_by === m.id)),
    })).filter((g) => g.items.length);
    const open = today.chores.filter((c) => c.member_id == null && !c.status);
    html += `<div class="card"><h2>Today <span class="meta">${parseYmd(today.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span></h2>
      ${groups.length ? groups.map((g) => `
        <div class="list-item" style="border-top:0;padding-bottom:0"><div class="avatar" style="--c:${esc(g.m.color)}">${esc(g.m.emoji)}</div><div class="grow title">${esc(g.m.name)}</div></div>
        ${g.items.map((c) => {
          const done = c.status === 'done' || c.status === 'approved';
          return `<div class="list-item tappable" data-toggle="${c.id}" data-member="${g.m.id}" data-completion="${c.completion_id || ''}" data-status="${c.status || ''}">
          <div class="check ${c.status === 'pending' ? 'pending' : done ? 'done' : ''}">${c.status === 'pending' ? '⏳' : done ? '✓' : ''}</div>
          <div class="grow ${done ? 'strike' : ''}">${esc(c.title)}${c.status === 'rejected' ? ' <span class="badge rejected">rejected</span>' : ''}</div>
          ${c.paid ? `<span class="badge ${c.status === 'approved' ? 'approved' : c.status === 'pending' ? 'pending' : 'paid'}">${money(c.amount_cents)}</span>` : ''}
        </div>`; }).join('')}`).join('') : '<p class="muted">No chores due today.</p>'}
      ${open.length ? `<p class="muted small mt">💵 ${open.length} open Earn Money chore${open.length > 1 ? 's' : ''} nobody has claimed yet.</p>` : ''}
    </div>`;

    // Filter chips: All / each member. Chores open to "Anyone" always show.
    const filt = S.choreFilter ?? null;
    const chips = `<div class="chips">
      <button class="chip ${filt == null ? 'active' : ''}" data-chore-filter="">All</button>
      ${S.members.map((m) => `<button class="chip ${filt === m.id ? 'active' : ''}" data-chore-filter="${m.id}" style="--c:${esc(m.color)}">${esc(m.emoji)} ${esc(m.name)}</button>`).join('')}
    </div>`;
    const visible = (c) => filt == null || c.member_id === filt || c.member_id == null;
    const regular = all.filter((c) => !c.paid && visible(c));
    const paid = all.filter((c) => c.paid && visible(c));
    html += chips;
    const choreItem = (c) => `<div class="list-item tappable" data-edit-chore="${c.id}">
      <div class="avatar" style="--c:${esc(c.member_id ? memberById(c.member_id)?.color : '#9ca3af')}">${c.member_id ? esc(memberById(c.member_id)?.emoji || '?') : '👥'}</div>
      <div class="grow"><div class="title">${esc(c.title)}</div><div class="sub">${esc(c.member_name || 'Anyone')} · ${scheduleLabel(c)}${c.period && c.period !== 'any' ? ' · ' + c.period : ''}</div></div>
      ${c.paid ? `<div class="amt">${money(c.amount_cents)}</div>` : `<div class="muted small">🪙 ${c.coins != null ? c.coins : Number(S.settings?.coins_per_chore ?? 2)}</div>`}</div>`;
    html += `<div class="card"><h2>Regular chores <span class="meta">${regular.length}</span></h2>${regular.map(choreItem).join('') || '<p class="muted">Tap + to add a chore.</p>'}</div>`;
    html += `<div class="card"><h2>💵 Earn Money <span class="meta">${paid.length}</span></h2>${paid.map(choreItem).join('') || '<p class="muted">Extra chores kids can do to earn money. Add one with +.</p>'}</div>`;
    if (Array.isArray(removed) && removed.length) {
      html += `<details class="section"><summary>🗑️ Recently removed (${removed.length})</summary><div class="body">
        ${removed.map((c) => `<div class="list-item"><div class="grow"><div class="title">${esc(c.title)}</div><div class="sub">${esc(c.member_name || 'Anyone')} · ${scheduleLabel(c)}${c.paid ? ' · ' + money(c.amount_cents) : ''}</div></div>
          <button class="btn small" data-action="restore-chore" data-id="${c.id}">Restore</button></div>`).join('')}
        <p class="muted small mt">Removed chores keep their history. Restoring puts them straight back on the display.</p></div></details>`;
    }
    html += `<button class="fab" data-action="new-chore" aria-label="Add chore">+</button>`;
    shell('Chores', html);
    S.allChores = all;
    S.pending = pending;
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
      <div data-unpaid-only ${paid ? 'hidden' : ''}><label class="field"><span>🪙 Coins when approved (blank = default ${Number(S.settings?.coins_per_chore ?? 2)})</span><input type="number" name="coins" step="1" min="0" inputmode="numeric" value="${c.coins != null ? c.coins : ''}" placeholder="${Number(S.settings?.coins_per_chore ?? 2)}"></label></div>
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
      <label class="field"><span>Time of day</span><select name="period">
        ${[['any', 'Anytime'], ['morning', '☀️ Morning'], ['afternoon', '🌤️ Afternoon'], ['evening', '🌙 Evening']].map(([v, l]) => `<option value="${v}" ${(c.period || 'any') === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
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
      const f = summary.find((s) => s.member_id === m.id) || { cash_cents: 0, invested_cents: 0, pending_cents: 0 };
      return `<div class="card balance-card tappable" data-href="#money/${m.id}">
        <div class="avatar" style="--c:${esc(m.color)}">${esc(m.emoji)}</div>
        <div><div class="title" style="font-weight:600">${esc(m.name)}</div>${f.pending_cents ? `<div class="sub muted small">+${money(f.pending_cents)} awaiting approval</div>` : ''}</div>
        <div class="bal" style="text-align:right;font-size:1.05rem;line-height:1.35">💵 ${money(f.cash_cents || 0)}<br>📈 ${money(f.invested_cents || 0)}<br>🪙 ${f.coins || 0}</div></div>`;
    }).join('');
    shell('Money', `<p class="muted small">Each kid has <b>Cash</b> (pocket money you keep track of; chore earnings land here) and <b>Invested with Dad</b>${apr > 0 ? `, which earns ${apr}% per year credited on day ${settings.interest_day} of each month.` : ' (no interest set — see Settings › Interest).'}</p>
      ${cards || '<div class="card"><p class="muted">Add kids in Settings › Family to start tracking money.</p></div>'}`);
  }

  async function renderMoneyDetail(id) {
    const m = memberById(id);
    if (!m) { location.hash = '#money'; return; }
    const f = await api(`/api/finance/${id}`);
    const rows = f.transactions.map((t) => `<div class="list-item tx">
      <div class="grow"><div class="title">${esc(t.note || TX_LABEL[t.type] || t.type)}</div><div class="sub">${fmtWhen(t.created_at)} · ${TX_LABEL[t.type] || t.type} · ${ACCT_LABEL[t.account] || t.account}</div></div>
      <div class="a ${t.amount_cents < 0 ? 'neg' : 'pos'}">${t.amount_cents < 0 ? '−' : '+'}${money(Math.abs(t.amount_cents))}</div>
      <button class="btn small icon" data-action="delete-tx" data-id="${t.id}" title="Remove">✕</button></div>`).join('');
    shell(`${esc(m.emoji)} ${esc(m.name)}`, `
      <div class="card"><div class="row2">
          <div class="center"><div class="muted small">💵 Cash</div><div class="big-balance" style="font-size:1.9rem">${money(f.cash_cents || 0)}</div></div>
          <div class="center"><div class="muted small">📈 Invested with Dad</div><div class="big-balance" style="font-size:1.9rem">${money(f.invested_cents || 0)}</div></div>
        </div>
        <p class="muted small center">${f.pending_cents ? `+${money(f.pending_cents)} awaiting approval · ` : ''}${f.interest_apr > 0 ? `invested money earns ${f.interest_apr}% per year` : 'no interest set'}</p></div>
      <div class="card"><h2>Add a transaction</h2>
        <form data-form="tx" data-member="${m.id}">
          <div class="field"><div class="seg" data-seg="account">
            <button type="button" data-val="cash" class="active">💵 Cash</button>
            <button type="button" data-val="invested">📈 Invested</button></div><input type="hidden" name="account" value="cash"></div>
          <div class="field"><div class="seg" data-seg="type">
            <button type="button" data-val="deposit" class="active">Deposit</button>
            <button type="button" data-val="withdrawal">Withdraw</button>
            <button type="button" data-val="adjustment">Adjust ±</button>
            <button type="button" data-val="transfer">Move ⇄</button></div><input type="hidden" name="type" value="deposit"></div>
          <p class="muted small" data-when="transfer" data-for="type" hidden>Moves the amount from the selected account into the other one.</p>
          <div class="row2">
            <label class="field"><span>Amount ($)</span><input type="number" name="amount" step="0.01" inputmode="decimal" required placeholder="20.00"></label>
            <label class="field"><span>Note</span><input type="text" name="note" maxlength="200" placeholder="Birthday money"></label>
          </div>
          <button class="btn primary block" type="submit">Save</button>
        </form></div>
      <div class="card"><h2>🪙 ${esc(f.coin_name || 'Mom Coins')} <span class="meta">${f.coins || 0}</span></h2>
        <form data-form="coins" data-member="${m.id}">
          <div class="row2">
            <label class="field"><span>Coins (negative to spend)</span><input type="number" name="amount" step="1" inputmode="numeric" required placeholder="-10"></label>
            <label class="field"><span>Note</span><input type="text" name="note" maxlength="200" placeholder="Movie pick"></label>
          </div>
          <button class="btn primary block" type="submit">Save</button></form>
        ${(f.coin_transactions || []).slice(0, 40).map((t) => `<div class="list-item tx">
          <div class="grow"><div class="title">${esc(t.note || 'Coins')}</div><div class="sub">${fmtWhen(t.created_at)}</div></div>
          <div class="a ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${Math.abs(t.amount)}</div>
          <button class="btn small icon" data-action="delete-coins" data-id="${t.id}" title="Remove">✕</button></div>`).join('')}
      </div>
      <div class="card"><h2>Set cash balance</h2>
        <form data-form="setbal" data-member="${m.id}" class="actions" style="margin:0">
          <input type="number" name="balance" step="0.01" inputmode="decimal" class="input grow" required placeholder="Count the cash… e.g. 12.50">
          <button class="btn" type="submit">Set</button></form>
        <p class="muted small mt">Records an adjustment for the difference, so the history stays honest.</p></div>
      <div class="card"><h2>History</h2>${rows || '<p class="muted">Nothing yet.</p>'}</div>`,
    `<a class="btn small" href="#money">‹ All kids</a>`);
  }

  // ---- Birthdays & events ----------------------------------------------------
  function nextOccurrence(e, today) {
    if (!e.yearly) return e.date;
    const y = Number(today.slice(0, 4));
    const md = e.date.slice(5);
    return `${y}-${md}` >= today ? `${y}-${md}` : `${y + 1}-${md}`;
  }
  const fmtTime12 = (t) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  async function renderEvents() {
    const items = await api('/api/local-events');
    const today = ymd(new Date());
    const withNext = items.map((e) => ({ ...e, next: nextOccurrence(e, today) })).sort((a, b) => a.next.localeCompare(b.next));
    const bdays = withNext.filter((e) => e.kind === 'birthday');
    const events = withNext.filter((e) => e.kind === 'event' && (e.yearly || (e.end_date || e.date) >= today));
    const past = withNext.filter((e) => e.kind === 'event' && !e.yearly && (e.end_date || e.date) < today).reverse();
    const fmt = (s) => parseYmd(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const until = (s) => {
      const n = Math.round((parseYmd(s) - parseYmd(today)) / 86_400_000);
      return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 0 ? `in ${n} days` : `${-n} days ago`;
    };
    const row = (e) => {
      const m = e.member_id ? memberById(e.member_id) : null;
      const isB = e.kind === 'birthday';
      const age = isB && e.show_age ? Number(e.next.slice(0, 4)) - Number(e.date.slice(0, 4)) : 0;
      return `<div class="list-item tappable" data-edit-levent="${e.id}">
        <div class="avatar" style="--c:${isB ? '#f59e0b' : esc(m ? m.color : '#7c6f9b')}">${isB ? '🎂' : (m ? esc(m.emoji) : '📌')}</div>
        <div class="grow"><div class="title">${esc(e.title)}${age > 0 && age < 120 ? ` <span class="muted">turns ${age}</span>` : ''}</div>
          <div class="sub">${fmt(e.next)}${e.time ? ' · ' + fmtTime12(e.time) : ''}${e.yearly && !isB ? ' · every year' : ''}${m ? ' · ' + esc(m.name) : ''}</div></div>
        <div class="muted small">${until(e.next)}</div></div>`;
    };
    shell('Birthdays & Events', `
      <div class="card"><h2>🎂 Birthdays <span class="meta">${bdays.length}</span></h2>${bdays.map(row).join('') || '<p class="muted">Add family and friends’ birthdays with +. They repeat every year and show the age.</p>'}</div>
      <div class="card"><h2>📌 Upcoming events <span class="meta">${events.length}</span></h2>${events.map(row).join('') || '<p class="muted">School plays, trips, visits… anything not on Google Calendar.</p>'}</div>
      ${past.length ? `<details class="section"><summary>Past events (${past.length})</summary><div class="body">${past.map(row).join('')}</div></details>` : ''}
      <button class="fab" data-action="new-levent" aria-label="Add">+</button>`);
    S.levents = items;
  }

  function leventForm(e = {}) {
    const kind = e.kind || 'birthday';
    const isB = kind === 'birthday';
    return `<form data-form="levent" data-id="${e.id || ''}"><h2>${e.id ? 'Edit' : 'New'}</h2>
      <div class="field"><div class="seg" data-seg="kind">
        <button type="button" data-val="birthday" class="${isB ? 'active' : ''}">🎂 Birthday</button>
        <button type="button" data-val="event" class="${isB ? '' : 'active'}">📌 Event</button></div><input type="hidden" name="kind" value="${kind}"></div>
      <label class="field"><span>Who / what</span><input type="text" name="title" required maxlength="120" value="${esc(e.title || '')}" placeholder="Grandma, or School play"></label>
      <div class="row2">
        <label class="field"><span>Date (birthdays: date of birth)</span><input type="date" name="date" required value="${e.date || ''}"></label>
        <label class="field" data-when="event" ${isB ? 'hidden' : ''}><span>End date (optional)</span><input type="date" name="end_date" value="${e.end_date || ''}"></label>
      </div>
      <div data-when="birthday" ${isB ? '' : 'hidden'}>
        <label class="field inline"><span>Show the age (“turns 9”) — untick if the birth year is unknown</span><input type="checkbox" name="show_age" ${e.show_age === 0 ? '' : 'checked'}></label>
      </div>
      <div data-when="event" ${isB ? 'hidden' : ''}>
        <div class="row2">
          <label class="field"><span>Time (blank = all day)</span><input type="time" name="time" value="${e.time || ''}"></label>
          <label class="field"><span>End time</span><input type="time" name="end_time" value="${e.end_time || ''}"></label>
        </div>
        <label class="field inline"><span>Repeats every year (anniversary etc.)</span><input type="checkbox" name="yearly" ${e.yearly ? 'checked' : ''}></label>
      </div>
      <label class="field"><span>Shows for</span><select name="member_id"><option value="">Everyone (family)</option>${S.members.map((m) => `<option value="${m.id}" ${e.member_id === m.id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}</select></label>
      <p class="muted small">Tip: a kid’s name in the title also puts it on their own calendar view.</p>
      <label class="field"><span>Notes (optional)</span><input type="text" name="notes" maxlength="300" value="${esc(e.notes || '')}"></label>
      <div class="actions"><button class="btn primary grow" type="submit">Save</button>
        ${e.id ? `<button type="button" class="btn danger" data-action="delete-levent" data-id="${e.id}">Delete</button>` : ''}</div>
    </form>`;
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
    const opts = [['off', 'Hidden'], ['family', '👨‍👩‍👧‍👦 Family'], ...S.members.map((m) => [`m:${m.id}`, `${m.emoji} ${m.name}`])];
    return opts.map(([v, l]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  async function renderSettings() {
    const [settings, accounts, allMembers, photos, themeArt] = await Promise.all([
      api('/api/settings'), api('/api/google/accounts'), api('/api/members/all'), api('/api/photos'), api('/api/theme-art'),
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
        <div class="list-item" style="display:block"><div class="title">${esc(a.email)}</div>
          <div class="sub ${a.last_error ? 'err' : ''}">${a.last_error ? esc(a.last_error) : a.last_sync_at ? 'Synced ' + new Date(a.last_sync_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not synced yet'}</div>
          <div class="actions" style="margin-top:8px"><button class="btn small" data-action="refresh-cals" data-id="${a.id}">Refresh calendars</button>
          <button class="btn small danger" data-action="remove-account" data-id="${a.id}">Remove</button></div></div>
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
      <button class="btn primary" type="submit">Save</button></form>
      <h2 class="mt">Month artwork</h2>
      <p class="muted small">Each month has a built-in drawing on the display. Replace any of them with a photo of the kids' own drawing — a wide picture (about 6:1, landscape) fits the header best.</p>
      ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, i) => `
        <div class="list-item"><div class="grow"><div class="title">${name}</div><div class="sub">${themeArt[i] ? 'Custom drawing' : 'Built-in drawing'}</div></div>
          ${themeArt[i] ? `<img src="${esc(themeArt[i])}" alt="" style="height:40px;width:80px;object-fit:cover;border-radius:8px">` : ''}
          <label class="btn small">${themeArt[i] ? 'Replace' : 'Upload'}<input type="file" accept="image/*" data-upload-art="${i}" hidden></label>
          ${themeArt[i] ? `<button class="btn small icon" data-action="delete-art" data-id="${i}" title="Use built-in">✕</button>` : ''}
        </div>`).join('')}`;

    const rewards = `<form data-form="settings">
      <div class="row2">
        <label class="field"><span>Name of the reward points</span><input type="text" name="coin_name" maxlength="30" value="${esc(settings.coin_name)}" placeholder="Mom Coins"></label>
        <label class="field"><span>Coins per approved chore</span><input type="number" name="coins_per_chore" min="0" max="100" value="${settings.coins_per_chore}"></label>
      </div>
      <p class="muted small">Every chore a kid taps shows a "Great Job!" and waits for a parent's OK. Regular chores then award coins; Earn Money chores pay cash instead. Spend coins from the Money tab.</p>
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

    const notifications = `<p class="muted small">Get a phone notification when a kid finishes an Earn Money chore, with <b>Pay</b> / <b>Reject</b> buttons right in the notification. Uses the free <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a> app.</p>
      <ol class="muted small" style="padding-left:18px;margin:6px 0 10px">
        <li>Install <b>ntfy</b> from the App Store / Play Store on each parent's phone.</li>
        <li>Save a secret topic name below (tap Generate), then in the ntfy app tap <b>+</b> and subscribe to that exact topic.</li>
        <li>Tap <b>Send test</b>.</li></ol>
      <form data-form="settings">
        <label class="field"><span>Topic (keep it private — anyone who knows it can see the notifications)</span>
          <div class="actions" style="margin:0"><input type="text" name="ntfy_topic" class="input grow" value="${esc(settings.ntfy_topic)}" autocomplete="off" placeholder="family-a8f3k2q9"><button type="button" class="btn" data-action="gen-topic">Generate</button></div></label>
        <label class="field"><span>Server</span><input type="text" name="ntfy_server" value="${esc(settings.ntfy_server)}"></label>
        <label class="field"><span>Address phones use for this app (blank = auto-detect)</span><input type="text" name="app_url" value="${esc(settings.app_url)}" placeholder="http://${location.host}"></label>
        <div class="actions"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-action="notify-test" ${settings.ntfy_topic ? '' : 'disabled'}>Send test</button></div>
      </form>`;

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
      section('🪙 Rewards', rewards),
      section('📈 Interest', interest),
      section(`🔔 Notifications${settings.ntfy_topic ? '' : ' (off)'}`, notifications),
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
      <label class="field"><span>Nicknames / abbreviations for calendar matching (comma-separated)</span><input type="text" name="aliases" maxlength="200" value="${esc(m.aliases || '')}" placeholder="e.g. Pip, Pipes"></label>
      <p class="muted small">Events show for this member when the title contains their name or a nickname, or starts with their initial (“${esc((m.name || 'P').charAt(0).toUpperCase())} soccer”, “${esc((m.name || 'P').charAt(0).toUpperCase())} - dentist”).</p>
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
      else return pinDigit(k);
      $('#pinDots').textContent = '●'.repeat(S.pin.length);
      return;
    }
    const seg = t.closest('[data-seg] button');
    if (seg) {
      const wrap = seg.closest('[data-seg]');
      wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === seg));
      const form = wrap.closest('form');
      form.querySelector(`input[name=${wrap.dataset.seg}]`).value = seg.dataset.val;
      form.querySelectorAll('[data-when]').forEach((el) => {
        if (el.dataset.for && el.dataset.for !== wrap.dataset.seg) return; // belongs to another segmented control
        el.hidden = el.dataset.when !== seg.dataset.val;
      });
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
    const chip = t.closest('[data-chore-filter]');
    if (chip) { S.choreFilter = chip.dataset.choreFilter ? Number(chip.dataset.choreFilter) : null; render(); return; }
    const href = t.closest('[data-href]');
    if (href) { location.hash = href.dataset.href; return; }
    const editChore = t.closest('[data-edit-chore]');
    if (editChore) { openSheet(choreForm(S.allChores.find((c) => c.id === Number(editChore.dataset.editChore)))); return; }
    const editLevent = t.closest('[data-edit-levent]');
    if (editLevent) { openSheet(leventForm((S.levents || []).find((x) => x.id === Number(editLevent.dataset.editLevent)))); return; }
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
        if (toggle.dataset.status && toggle.dataset.status !== 'rejected') {
          await api(`/api/chores/completions/${toggle.dataset.completion}`, { method: 'DELETE' });
        } else {
          // A parent ticking a chore counts as approving it in one go.
          const c = await api(`/api/chores/${toggle.dataset.toggle}/complete`, { method: 'POST', body: { member_id: Number(toggle.dataset.member) } });
          if (c && c.id) await api(`/api/chores/completions/${c.id}/approve`, { method: 'POST' });
        }
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
        case 'restore-chore': await api(`/api/chores/${id}/restore`, { method: 'POST' }); toast('Restored'); render(); break;
        case 'new-levent': openSheet(leventForm()); break;
        case 'delete-levent':
          if (!confirm('Delete this?')) return;
          await api(`/api/local-events/${id}`, { method: 'DELETE' }); closeSheet(); toast('Deleted'); render(); break;
        case 'delete-chore':
          await api(`/api/chores/${id}`, { method: 'DELETE' }); closeSheet(); toast('Chore deleted'); render(); break;
        case 'approve-all': {
          const body = act.dataset.member ? { member_id: Number(act.dataset.member) } : {};
          const r = await api('/api/chores/approve-all', { method: 'POST', body });
          toast(`Approved ${r.approved}`); render(); break;
        }
        case 'approve': {
          const p = (S.pending || []).find((x) => x.id === Number(id));
          await api(`/api/chores/completions/${id}/approve`, { method: 'POST' });
          toast(p && p.paid ? 'Paid!' : 'Approved'); render(); break;
        }
        case 'reject': await api(`/api/chores/completions/${id}/reject`, { method: 'POST' }); toast('Rejected'); render(); break;
        case 'delete-coins':
          await api(`/api/coins/transactions/${id}`, { method: 'DELETE' }); toast('Removed'); render(); break;
        case 'delete-tx':
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
        case 'gen-topic': {
          const input = act.closest('form').querySelector('[name=ntfy_topic]');
          const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
          input.value = `family-${rand}`;
          break;
        }
        case 'notify-test': {
          const r = await api('/api/notify/test', { method: 'POST' });
          toast(`Sent. Buttons in notifications will open ${r.app_url}`); break;
        }
        case 'apply-interest': {
          const r = await api('/api/finance/apply-interest', { method: 'POST' });
          toast(r.credited ? `Credited ${r.credited} account(s)` : 'Nothing to credit (rate is 0, day not reached, or already paid this month)'); break;
        }
        case 'delete-art':
          await api(`/api/theme-art/${id}`, { method: 'DELETE' }); toast('Back to the built-in drawing'); render(); break;
        case 'delete-photo':
          if (!confirm('Delete this photo?')) return;
          await api(`/api/photos/${encodeURIComponent(act.dataset.name)}`, { method: 'DELETE' }); render(); break;
        case 'logout': await api('/api/auth/logout', { method: 'POST' }); S.me.parent = false; render(); break;
        case 'reload': toast('Refreshing…'); await hardReload(); break;
        default: break;
      }
    } catch (err) { fail(err); }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('input[name=paid]')) {
      const form = t.closest('form');
      form.querySelectorAll('[data-paid-only]').forEach((el) => { el.hidden = !t.checked; });
      form.querySelectorAll('[data-unpaid-only]').forEach((el) => { el.hidden = t.checked; });
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
    if (t.matches('[data-upload-art]')) {
      if (!t.files.length) return;
      const fd = new FormData();
      fd.append('image', t.files[0]);
      try {
        toast('Uploading…');
        await api(`/api/theme-art/${t.dataset.uploadArt}`, { method: 'POST', body: fd });
        toast('Artwork saved'); render();
      } catch (err) { fail(err); }
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
            period: fd.get('period') || 'any',
            coins: fd.get('coins') === '' || fd.get('coins') === null ? null : parseInt(fd.get('coins'), 10),
          };
          if (form.dataset.id) await api(`/api/chores/${form.dataset.id}`, { method: 'PATCH', body });
          else await api('/api/chores', { method: 'POST', body });
          closeSheet(); toast('Saved'); render(); break;
        }
        case 'tx': {
          const cents = toCents(fd.get('amount'));
          if (!cents) return toast('Enter an amount', true);
          await api(`/api/finance/${form.dataset.member}/transactions`, { method: 'POST', body: { type: fd.get('type'), account: fd.get('account'), amount_cents: cents, note: fd.get('note') } });
          toast('Saved'); render(); break;
        }
        case 'coins': {
          const amount = parseInt(fd.get('amount'), 10);
          if (!amount) return toast('Enter a number of coins', true);
          await api(`/api/coins/${form.dataset.member}`, { method: 'POST', body: { amount, note: fd.get('note') } });
          toast('Saved'); render(); break;
        }
        case 'setbal': {
          await api(`/api/finance/${form.dataset.member}/transactions`, { method: 'POST', body: { type: 'set_balance', account: 'cash', balance_cents: toCents(fd.get('balance')) } });
          toast('Cash balance updated'); render(); break;
        }
        case 'shop': await api('/api/shopping', { method: 'POST', body: { text: fd.get('text') } }); render(); break;
        case 'levent': {
          const body = {
            kind: fd.get('kind'), title: fd.get('title'), date: fd.get('date'),
            end_date: fd.get('end_date') || null, time: fd.get('time') || null, end_time: fd.get('end_time') || null,
            yearly: form.yearly.checked, show_age: form.show_age.checked,
            member_id: fd.get('member_id') ? Number(fd.get('member_id')) : null, notes: fd.get('notes'),
          };
          if (form.dataset.id) await api(`/api/local-events/${form.dataset.id}`, { method: 'PATCH', body });
          else await api('/api/local-events', { method: 'POST', body });
          closeSheet(); toast('Saved'); render(); break;
        }
        case 'member': {
          const body = { name: fd.get('name'), emoji: fd.get('emoji'), color: fd.get('color'), role: fd.get('role'), aliases: fd.get('aliases') || '' };
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

  // Reload when the server has been updated since this page loaded (home-screen apps
  // on phones otherwise keep running old JS for days).
  let build = null;
  async function checkBuild() {
    try {
      const s = await fetch('/api/state', { cache: 'no-store' }).then((r) => r.json());
      if (build && s.build && s.build !== build) { location.reload(); return; }
      build = s.build || build;
    } catch { /* offline */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBuild(); });
  setInterval(checkBuild, 5 * 60_000);

  // ---- Boot ------------------------------------------------------------------
  (async () => {
    const q = new URLSearchParams(location.search);
    if (q.get('google') === 'connected') setTimeout(() => toast(`Connected ${q.get('email')}`), 300);
    if (q.get('google') === 'error') setTimeout(() => toast(`Google: ${q.get('msg')}`, true), 300);
    if (q.has('google')) history.replaceState(null, '', location.pathname + location.hash);
    try {
      S.me = await api('/api/auth/me');
      await render();
      checkBuild();
    } catch (e) {
      $('#app').innerHTML = `<div class="loading err">Cannot reach the server: ${esc(e.message)}</div>`;
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/parent/sw.js').catch(() => {});
  })();
})();
