/* Family Calendar - kiosk display */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const money = (cents) => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Seasonal styling per month (index = month). `ink`/`muted` only for dark backgrounds.
  const THEMES = [
    { deco: '❄️', strip: '❄️ ⛄ 🧣 ❄️ ☃️ 🧤', bg: '#e6f0fb', accent: '#2563eb' },
    { deco: '💗', strip: '💗 💌 🍫 💘 🌹 💗', bg: '#fde8ef', accent: '#e11d48' },
    { deco: '🍀', strip: '🍀 🌈 🪙 🍀 🎩 🌈', bg: '#e6f6ea', accent: '#15803d' },
    { deco: '🌷', strip: '🌷 🐣 🌧️ 🐰 🌱 🦋', bg: '#f1eefb', accent: '#7c3aed' },
    { deco: '🌸', strip: '🌸 🐝 🌼 🌸 🐞 🌻', bg: '#fff0f6', accent: '#db2777' },
    { deco: '☀️', strip: '☀️ 🏖️ 🍉 🌊 🕶️ 🍦', bg: '#fff8d6', accent: '#d97706' },
    { deco: '🎆', strip: '🎆 🇺🇸 🎇 ⭐ 🍔 🎆', bg: '#eef2ff', accent: '#dc2626' },
    { deco: '✏️', strip: '✏️ 🚌 📚 🍎 🎒 🖍️', bg: '#fff4e0', accent: '#ea580c' },
    { deco: '🍂', strip: '🍂 🍎 🌽 🍁 🐿️ 🍂', bg: '#fbeedd', accent: '#c2410c' },
    { deco: '🎃', strip: '🎃 👻 🦇 🍬 🕸️ 🎃', bg: '#2b1a47', accent: '#ff7a1a', ink: '#ffffff', muted: '#c9bde3' },
    { deco: '🦃', strip: '🦃 🍁 🥧 🌽 🍗 🍁', bg: '#f3e4cf', accent: '#b45309' },
    { deco: '🎄', strip: '🎄 ⛄ 🎁 ❄️ 🦌 🎅', bg: '#e8f4ea', accent: '#c81e1e' },
  ];

  function applyTheme() {
    const enabled = Number(state.settings.month_themes ?? 1) !== 0;
    const t = enabled ? THEMES[state.anchor.getMonth()] : null;
    const s = document.body.style;
    const banner = $('#themeBanner');
    if (!t) {
      ['--bg', '--accent', '--page-ink', '--page-muted', '--deco'].forEach((v) => s.removeProperty(v));
      banner.textContent = '';
      return;
    }
    s.setProperty('--bg', t.bg);
    s.setProperty('--accent', t.accent);
    if (t.ink) s.setProperty('--page-ink', t.ink); else s.removeProperty('--page-ink');
    if (t.muted) s.setProperty('--page-muted', t.muted); else s.removeProperty('--page-muted');
    s.setProperty('--deco', JSON.stringify(t.deco));
    banner.textContent = t.strip;
  }

  const state = {
    settings: {},
    members: [],
    selected: null,        // member id or null for everyone
    view: 'week',
    anchor: new Date(),    // any date inside the visible week/month
    today: ymd(new Date()),
    events: [],
    meals: {},             // date -> meal
    chores: [],
    finance: [],           // summary rows
    shopping: [],
    photos: [],
    weather: null,
    google: { configured: false, accounts: [] },
  };

  const wxFor = (dateKey) => (state.weather && !state.weather.error ? state.weather.daily.find((d) => d.date === dateKey) : null);

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // ---- Date ranges -----------------------------------------------------------
  function weekStart() { return Number(state.settings.week_start) || 0; }
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return addDays(x, -((x.getDay() - weekStart() + 7) % 7));
  }
  function visibleRange() {
    if (state.view === 'week') {
      const s = startOfWeek(state.anchor);
      return { from: s, to: addDays(s, 6) };
    }
    const first = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1);
    const s = startOfWeek(first);
    return { from: s, to: addDays(s, 41) };
  }

  // ---- Member helpers --------------------------------------------------------
  const memberById = (id) => state.members.find((m) => m.id === id);
  // Members an event belongs to: the calendar's owner plus any names found in the title.
  function eventMembers(ev) {
    const ids = [];
    if (ev.member_id != null) ids.push(ev.member_id);
    for (const id of ev.member_ids || []) if (!ids.includes(id)) ids.push(id);
    return ids.map(memberById).filter(Boolean);
  }
  function eventColor(ev) {
    const [m] = eventMembers(ev);
    if (m) return m.color;
    return ev.calendar_color || getComputedStyle(document.documentElement).getPropertyValue('--family').trim();
  }
  function eventWho(ev) {
    const names = eventMembers(ev).map((m) => m.name);
    if (names.length) return names.join(' & ');
    return ev.is_family ? 'Family' : ev.calendar_name;
  }
  function eventsVisible() {
    if (state.selected == null) return state.events;
    // A person's view shows only their events: calendars mapped to them plus events whose
    // title names them. Family-wide events appear on the Everyone view.
    return state.events.filter((e) => eventMembers(e).some((m) => m.id === state.selected));
  }
  function eventsOnDay(list, date) {
    const dayStart = date.getTime();
    const dayEnd = dayStart + 86_400_000;
    return list.filter((e) => e.start_ts < dayEnd && e.end_ts > dayStart);
  }

  // ---- Rendering: header -----------------------------------------------------
  function renderHeader() {
    $('#familyName').textContent = state.settings.family_name || 'Family Calendar';
    const now = new Date();
    $('#todayLabel').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const accts = state.google.accounts || [];
    const err = accts.find((a) => a.error);
    const last = state.settings.last_sync_at ? new Date(state.settings.last_sync_at) : null;
    let text;
    if (!state.google.configured || !accts.length) text = '<span class="dot"></span>Google Calendar not connected';
    else if (err) text = `<span class="dot err"></span>Sync problem: ${esc(err.error)}`;
    else if (state.google.calendars_enabled === 0) text = '<span class="dot err"></span>No calendars turned on — Parent app › Settings › Google Calendar';
    else text = `<span class="dot ok"></span>Synced ${last ? last.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}`;
    $('#syncStatus').innerHTML = text;
  }

  function tickClock() {
    const now = new Date();
    const t = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('#clock').textContent = t;
    $('#ssClock').textContent = t;
    $('#ssDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const today = ymd(now);
    if (today !== state.today) { state.today = today; refreshAll(); }
  }

  function renderWeather(w) {
    const el = $('#weather');
    if (!w || w.error) { el.innerHTML = ''; return; }
    const days = w.daily.slice(0, 5).map((d) => `
      <div class="day"><b>${esc(DOW[parseYmd(d.date).getDay()])}</b><span class="emoji">${d.emoji}</span>${d.hi}°/${d.lo}°</div>`).join('');
    el.innerHTML = `
      <div class="now"><span class="emoji">${w.current.emoji}</span><div>${w.current.temp}${w.unit}<small>${esc(w.current.label)}${w.label ? ' · ' + esc(w.label) : ''}</small></div></div>
      <div class="days">${days}</div>`;
  }

  // ---- Rendering: members ----------------------------------------------------
  function renderMembers() {
    const all = `<button class="member-btn ${state.selected == null ? 'active' : ''}" data-member="" style="--c:#374151">
        <span class="avatar">👨‍👩‍👧‍👦</span><span>Everyone</span></button>`;
    const rest = state.members.map((m) => `
      <button class="member-btn ${state.selected === m.id ? 'active' : ''}" data-member="${m.id}" style="--c:${esc(m.color)}">
        <span class="avatar">${esc(m.emoji)}</span><span>${esc(m.name)}</span></button>`).join('');
    $('#members').innerHTML = all + rest;
  }

  // ---- Rendering: calendar ---------------------------------------------------
  function eventHtml(ev, date) {
    const color = eventColor(ev);
    const cls = ev.all_day ? 'ev all-day' : 'ev';
    let time = '';
    if (!ev.all_day) {
      const dayStart = date.getTime();
      const startsToday = ev.start_ts >= dayStart;
      const endsToday = ev.end_ts <= dayStart + 86_400_000;
      time = startsToday ? fmtTime(ev.start_ts) + (endsToday ? '' : ' →') : '→ ' + (endsToday ? fmtTime(ev.end_ts) : 'all day');
    }
    const who = state.selected == null && state.members.length ? `<span class="who">${esc(eventWho(ev))}</span>` : '';
    return `<div class="${cls}" style="--c:${esc(color)}" data-event="${ev.id}">
      ${time ? `<span class="time">${esc(time)}</span>` : ''}<span class="title">${esc(ev.title)}</span>${who}</div>`;
  }

  function renderWeek() {
    const grid = $('#calGrid');
    grid.className = 'cal-grid week';
    const { from, to } = visibleRange();
    const visible = eventsVisible();
    const todayD = parseYmd(state.today);
    const cols = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const key = ymd(d);
      const evs = eventsOnDay(visible, d);
      const cls = ['day-col', key === state.today ? 'today' : '', d < todayD ? 'past' : ''].join(' ');
      const meal = state.meals[key];
      const wx = wxFor(key);
      cols.push(`<div class="${cls}">
        <div class="day-head"><div><div class="dow">${DOW[d.getDay()]}</div><div class="num">${d.getDate()}</div></div>
          ${wx ? `<div class="day-wx" title="${esc(wx.label)}"><span class="emoji">${wx.emoji}</span>${wx.hi}°<small>/${wx.lo}°</small></div>` : ''}</div>
        <div class="day-body">${evs.length ? evs.map((e) => eventHtml(e, d)).join('') : '<div class="empty-day"></div>'}</div>
        ${meal ? `<div class="day-foot">🍽️ <b>${esc(meal.title)}</b></div>` : ''}
      </div>`);
    }
    grid.innerHTML = cols.join('');
    const sameMonth = from.getMonth() === to.getMonth();
    $('#rangeLabel').textContent = sameMonth
      ? `${MONTHS[from.getMonth()]} ${from.getDate()} – ${to.getDate()}, ${to.getFullYear()}`
      : `${MONTHS[from.getMonth()].slice(0, 3)} ${from.getDate()} – ${MONTHS[to.getMonth()].slice(0, 3)} ${to.getDate()}, ${to.getFullYear()}`;
  }

  function renderMonth() {
    const grid = $('#calGrid');
    grid.className = 'cal-grid month';
    const { from } = visibleRange();
    const month = state.anchor.getMonth();
    const visible = eventsVisible();
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push(`<div class="m-head">${DOW[(weekStart() + i) % 7]}</div>`);
    for (let i = 0; i < 42; i++) {
      const d = addDays(from, i);
      const key = ymd(d);
      const evs = eventsOnDay(visible, d);
      const shown = evs.slice(0, 3).map((e) => `<div class="chip" style="--c:${esc(eventColor(e))}" data-event="${e.id}">${e.all_day ? '' : fmtTime(e.start_ts) + ' '}${esc(e.title)}</div>`).join('');
      const more = evs.length > 3 ? `<div class="more">+${evs.length - 3} more</div>` : '';
      const cls = ['m-cell', d.getMonth() !== month ? 'other' : '', key === state.today ? 'today' : ''].join(' ');
      const wx = wxFor(key);
      cells.push(`<div class="${cls}" data-day="${key}"><div class="num">${d.getDate()}${wx ? `<span class="m-wx">${wx.emoji} ${wx.hi}°</span>` : ''}</div>${shown}${more}</div>`);
    }
    grid.innerHTML = cells.join('');
    $('#rangeLabel').textContent = `${MONTHS[month]} ${state.anchor.getFullYear()}`;
  }

  function renderCalendar() {
    applyTheme();
    if (state.view === 'week') renderWeek(); else renderMonth();
  }

  // ---- Rendering: side panel -------------------------------------------------
  function choreRow(c, showWho) {
    const cls = ['chore', c.status === 'done' || c.status === 'approved' ? 'done' : '', c.status === 'pending' ? 'pending' : ''].join(' ');
    const mark = c.status === 'pending' ? '⏳' : (c.status === 'done' || c.status === 'approved' ? '✓' : '');
    let sub = '';
    if (c.paid) {
      let badge;
      if (c.status === 'pending') badge = '<span class="badge pending">Waiting for a parent to approve</span>';
      else if (c.status === 'approved') badge = '<span class="badge approved">Paid!</span>';
      else if (c.member_id == null) badge = '<span class="badge">Anyone can claim this</span>';
      else badge = '<span class="badge">Tap when finished</span>';
      sub = `<span class="sub">${badge}</span>`;
    } else if (showWho && c.member_name) {
      sub = `<span class="sub">${esc(c.member_name)}</span>`;
    }
    if (c.notes) sub += `<span class="sub">${esc(c.notes)}</span>`;
    const amt = c.paid ? `<span class="amt">${money(c.amount_cents)}</span>` : '';
    return `<div class="${cls}" data-chore="${c.id}" data-completion="${c.completion_id || ''}" data-status="${c.status || ''}" data-owner="${c.member_id ?? ''}">
      <div class="check">${mark}</div><div class="text">${esc(c.title)}${sub}</div>${amt}</div>`;
  }

  function renderSideMember(m) {
    const regular = state.chores.filter((c) => !c.paid);
    const paid = state.chores.filter((c) => c.paid);
    const done = regular.filter((c) => c.status).length;
    const fin = state.finance.find((f) => f.member_id === m.id);
    const apr = Number(state.settings.interest_apr) || 0;
    let html = `<div class="card accent" style="--c:${esc(m.color)}">
      <h3>${esc(m.emoji)} ${esc(m.name)}'s Chores <span class="meta">${done}/${regular.length} done</span></h3>
      ${regular.length ? regular.map((c) => choreRow(c, false)).join('') : '<p class="muted center">No chores today 🎉</p>'}
    </div>`;
    if (paid.length) {
      html += `<div class="card"><h3>💵 Earn Money</h3>${paid.map((c) => choreRow(c, false)).join('')}</div>`;
    }
    if (m.role === 'kid') {
      html += `<div class="card" data-money="${m.id}">
        <h3>💰 Invested with Dad <span class="meta">tap for history</span></h3>
        <div class="money">
          <div class="balance">${money(fin ? fin.balance_cents : 0)}</div>
          <div class="hint">${fin && fin.pending_cents ? `<b>+${money(fin.pending_cents)}</b> waiting for approval · ` : ''}${apr > 0 ? `earning ${apr}% per year` : 'saved so far'}</div>
        </div>
      </div>`;
    }
    $('#side').innerHTML = html;
  }

  function renderSideEveryone() {
    const dinner = state.meals[state.today];
    const tomorrow = state.meals[ymd(addDays(parseYmd(state.today), 1))];
    let html = `<div class="card"><h3>🍽️ Tonight's Dinner</h3>
      <div class="dinner">${dinner ? esc(dinner.title) : '<span class="muted">Not planned yet</span>'}
        ${dinner && dinner.notes ? `<small>${esc(dinner.notes)}</small>` : ''}
        ${tomorrow ? `<small>Tomorrow: ${esc(tomorrow.title)}</small>` : ''}</div></div>`;

    const rows = state.members.map((m) => {
      const mine = state.chores.filter((c) => c.member_id === m.id || (c.member_id == null && c.completed_by === m.id));
      const regular = mine.filter((c) => !c.paid);
      const done = regular.filter((c) => c.status).length;
      const fin = state.finance.find((f) => f.member_id === m.id);
      const pct = regular.length ? Math.round((done / regular.length) * 100) : 0;
      const pending = fin && fin.pending_cents ? `<small>${money(fin.pending_cents)} waiting for approval</small>` : '';
      return `<div class="row" data-member-row="${m.id}" style="--c:${esc(m.color)}">
        <div class="avatar">${esc(m.emoji)}</div>
        <div class="grow">${esc(m.name)}<small>${regular.length ? `${done} of ${regular.length} chores done` : 'no chores today'}</small>${pending}</div>
        ${regular.length ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
      </div>`;
    }).join('');
    const open = state.chores.filter((c) => c.paid && c.member_id == null && !c.status);
    html += `<div class="card"><h3>✅ Chores Today</h3>${rows || '<p class="muted center">Add family members in the parent app</p>'}
      ${open.length ? `<p class="muted" style="margin:10px 0 0">💵 ${open.length} Earn Money chore${open.length > 1 ? 's' : ''} up for grabs — tap your name to claim</p>` : ''}</div>`;

    const items = state.shopping.map((s) => `<div class="shop-item ${s.checked ? 'checked' : ''}" data-shop="${s.id}" data-checked="${s.checked}">
        <div class="box">${s.checked ? '✓' : ''}</div><span>${esc(s.text)}</span></div>`).join('');
    html += `<div class="card"><h3>🛒 Shopping List <span class="meta">${state.shopping.filter((s) => !s.checked).length} to get</span></h3>
      ${items || '<p class="muted center">Nothing on the list</p>'}
      <form class="shop-add" id="shopForm"><input id="shopInput" placeholder="Add an item…" maxlength="200" autocomplete="off"><button class="btn" type="submit">Add</button></form>
    </div>`;
    $('#side').innerHTML = html;
  }

  function renderSide() {
    const m = state.selected != null ? memberById(state.selected) : null;
    if (m) renderSideMember(m); else renderSideEveryone();
  }

  // ---- Modals ---------------------------------------------------------------
  function openModal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function showEvent(id) {
    const ev = state.events.find((e) => e.id === id);
    if (!ev) return;
    let when;
    if (ev.all_day) {
      const s = parseYmd(ev.start);
      const e = addDays(parseYmd(ev.end), -1);
      when = s.getTime() === e.getTime()
        ? s.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
        : `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric' })} (all day)`;
    } else {
      const s = new Date(ev.start_ts);
      const e = new Date(ev.end_ts);
      const sameDay = ymd(s) === ymd(e);
      when = `${s.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}, ${fmtTime(s)} – ${sameDay ? '' : e.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' '}${fmtTime(e)}`;
    }
    openModal(`<h2>${esc(ev.title)}</h2>
      <div class="kv">🕒 <b>${esc(when)}</b></div>
      <div class="kv">👤 <b>${esc(eventWho(ev))}</b> <span class="muted">· ${esc(ev.calendar_name)}</span></div>
      ${ev.location ? `<div class="kv">📍 <b>${esc(ev.location)}</b></div>` : ''}
      ${ev.description ? `<div class="desc">${esc(ev.description)}</div>` : ''}`);
  }

  async function showMoney(memberId) {
    const m = memberById(memberId);
    const f = await api(`/api/finance/${memberId}`);
    const label = { deposit: 'Deposit', withdrawal: 'Withdrawal', chore: 'Chore', interest: 'Interest', adjustment: 'Adjustment' };
    const rows = f.transactions.map((t) => `<div class="tx">
      <div class="n">${esc(t.note || label[t.type] || t.type)}<small>${new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${label[t.type] || t.type}</small></div>
      <div class="a ${t.amount_cents < 0 ? 'neg' : 'pos'}">${t.amount_cents < 0 ? '−' : '+'}${money(Math.abs(t.amount_cents))}</div></div>`).join('');
    openModal(`<h2>${esc(m.emoji)} ${esc(m.name)}'s Money</h2>
      <div class="money"><div class="balance">${money(f.balance_cents)}</div>
      <div class="hint">${f.interest_apr > 0 ? `Earning ${f.interest_apr}% per year, paid on day ${f.interest_day} of each month` : 'Invested with Dad'}</div></div>
      <div style="margin-top:16px">${rows || '<p class="muted center">No activity yet</p>'}</div>`);
  }

  // ---- Data loading ---------------------------------------------------------
  async function loadState() {
    const s = await api('/api/state');
    state.settings = s.settings;
    state.members = s.members;
    state.today = s.today;
    state.google = s.google;
    $('#setupNotice').hidden = !s.needs_setup;
    $('.setup-notice .host').textContent = location.host;
    if (state.selected != null && !memberById(state.selected)) state.selected = null;
    renderHeader();
    renderMembers();
  }

  async function loadEvents() {
    const { from, to } = visibleRange();
    const [events, meals] = await Promise.all([
      api(`/api/events?from=${ymd(from)}&to=${ymd(to)}`),
      api(`/api/meals?from=${ymd(from)}&to=${ymd(addDays(to, 1))}`),
    ]);
    state.events = events;
    state.meals = Object.fromEntries(meals.map((m) => [m.date, m]));
    if (!state.meals[state.today] || !state.meals[ymd(addDays(parseYmd(state.today), 1))]) {
      const extra = await api(`/api/meals?from=${state.today}&to=${ymd(addDays(parseYmd(state.today), 1))}`);
      for (const m of extra) state.meals[m.date] = m;
    }
    renderCalendar();
  }

  async function loadSide() {
    const member = state.selected != null ? `&member=${state.selected}` : '';
    const [chores, finance, shopping] = await Promise.all([
      api(`/api/chores/day?date=${state.today}${member}`),
      api('/api/finance/summary'),
      state.selected == null ? api('/api/shopping') : Promise.resolve(state.shopping),
    ]);
    state.chores = chores.chores;
    state.finance = finance;
    state.shopping = shopping;
    renderSide();
  }

  async function loadWeather() {
    try {
      state.weather = await api('/api/weather');
      renderWeather(state.weather);
      renderCalendar();
    } catch { /* keep last */ }
  }

  async function loadPhotos() {
    try { state.photos = await api('/api/photos'); } catch { state.photos = []; }
  }

  async function refreshAll() {
    try {
      await loadState();
      await Promise.all([loadEvents(), loadSide()]);
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Interactions ---------------------------------------------------------
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const memberBtn = t.closest('[data-member]');
    if (memberBtn) {
      state.selected = memberBtn.dataset.member ? Number(memberBtn.dataset.member) : null;
      renderMembers();
      renderCalendar();
      await loadSide();
      return;
    }
    const memberRow = t.closest('[data-member-row]');
    if (memberRow) {
      state.selected = Number(memberRow.dataset.memberRow);
      renderMembers(); renderCalendar(); await loadSide();
      return;
    }
    const nav = t.closest('[data-nav]');
    if (nav) {
      const n = Number(nav.dataset.nav);
      if (n === 0) state.anchor = new Date();
      else if (state.view === 'week') state.anchor = addDays(state.anchor, 7 * n);
      else state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + n, 1);
      await loadEvents();
      return;
    }
    const view = t.closest('[data-view]');
    if (view) {
      state.view = view.dataset.view;
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === view));
      await loadEvents();
      return;
    }
    const evEl = t.closest('[data-event]');
    if (evEl) { showEvent(Number(evEl.dataset.event)); return; }
    const dayCell = t.closest('[data-day]');
    if (dayCell) {
      state.anchor = parseYmd(dayCell.dataset.day);
      state.view = 'week';
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === 'week'));
      await loadEvents();
      return;
    }
    const chore = t.closest('[data-chore]');
    if (chore) { await toggleChore(chore); return; }
    const moneyCard = t.closest('[data-money]');
    if (moneyCard) { await showMoney(Number(moneyCard.dataset.money)); return; }
    const shop = t.closest('[data-shop]');
    if (shop) {
      const checked = shop.dataset.checked === '1';
      try {
        await api(`/api/shopping/${shop.dataset.shop}`, { method: 'PATCH', body: { checked: !checked } });
        await loadSide();
      } catch (err) { alert(err.message); }
      return;
    }
    if (t.closest('[data-close]') || t === $('#modal')) closeModal();
  });

  async function toggleChore(el) {
    const memberId = state.selected != null ? state.selected : (el.dataset.owner ? Number(el.dataset.owner) : null);
    if (memberId == null) return; // open Earn Money chores are claimed from a kid's own view
    try {
      if (el.dataset.status && el.dataset.status !== 'rejected') {
        if (el.dataset.status === 'approved') return;
        await api(`/api/chores/completions/${el.dataset.completion}`, { method: 'DELETE' });
      } else {
        await api(`/api/chores/${el.dataset.chore}/complete`, { method: 'POST', body: { member_id: memberId, date: state.today } });
      }
      await loadSide();
    } catch (err) {
      alert(err.message);
    }
  }

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'shopForm') return;
    e.preventDefault();
    const input = $('#shopInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api('/api/shopping', { method: 'POST', body: { text } });
      await loadSide();
      $('#shopInput')?.focus();
    } catch (err) { alert(err.message); }
  });

  // ---- Screensaver ----------------------------------------------------------
  let lastActivity = Date.now();
  let ssTimer = null;
  let ssIndex = 0;
  let ssFront = 'A';

  function showNextPhoto() {
    if (!state.photos.length) return;
    ssIndex = (ssIndex + 1) % state.photos.length;
    const next = ssFront === 'A' ? $('#ssImgB') : $('#ssImgA');
    const cur = ssFront === 'A' ? $('#ssImgA') : $('#ssImgB');
    next.src = state.photos[ssIndex].url;
    next.onload = () => { next.classList.add('show'); cur.classList.remove('show'); ssFront = ssFront === 'A' ? 'B' : 'A'; };
  }

  function startScreensaver() {
    if (!state.photos.length || !$('#screensaver').hidden) return;
    ssIndex = Math.floor(Math.random() * state.photos.length) - 1;
    $('#screensaver').hidden = false;
    showNextPhoto();
    clearInterval(ssTimer);
    ssTimer = setInterval(showNextPhoto, Math.max(5, Number(state.settings.photo_seconds) || 15) * 1000);
  }

  function stopScreensaver() {
    if ($('#screensaver').hidden) return;
    $('#screensaver').hidden = true;
    clearInterval(ssTimer);
    $('#ssImgA').classList.remove('show');
    $('#ssImgB').classList.remove('show');
    refreshAll();
  }

  function activity() {
    lastActivity = Date.now();
    stopScreensaver();
  }
  ['pointerdown', 'touchstart', 'keydown', 'mousemove'].forEach((ev) => document.addEventListener(ev, activity, { passive: true }));

  setInterval(() => {
    const mins = Number(state.settings.screensaver_minutes);
    if (mins > 0 && Date.now() - lastActivity > mins * 60_000) startScreensaver();
  }, 5000);

  // ---- Boot -----------------------------------------------------------------
  tickClock();
  setInterval(tickClock, 1000);
  refreshAll().then(() => { loadWeather(); loadPhotos(); });
  setInterval(refreshAll, 60_000);
  setInterval(loadWeather, 15 * 60_000);
  setInterval(loadPhotos, 10 * 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
})();
