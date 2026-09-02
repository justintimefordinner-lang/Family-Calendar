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
    const month = state.anchor.getMonth();
    const t = enabled ? THEMES[month] : null;
    const s = document.body.style;
    const banner = $('#themeBanner');
    if (!t) {
      ['--bg', '--accent', '--page-ink', '--page-muted', '--deco'].forEach((v) => s.removeProperty(v));
      s.removeProperty('background-image');
      banner.textContent = '';
      return;
    }
    s.setProperty('--bg', t.bg);
    s.setProperty('--accent', t.accent);
    if (t.ink) s.setProperty('--page-ink', t.ink); else s.removeProperty('--page-ink');
    if (t.muted) s.setProperty('--page-muted', t.muted); else s.removeProperty('--page-muted');
    s.setProperty('--deco', JSON.stringify(t.deco));
    const art = window.THEME_ART;
    const custom = state.themeArt[month];
    if (custom) banner.innerHTML = `<img src="${esc(custom)}" alt="">`;
    else if (art && art.scenes[month]) banner.innerHTML = art.scenes[month];
    else banner.textContent = t.strip;
    if (art && art.tiles[month]) {
      s.setProperty('background-image', `url("data:image/svg+xml;utf8,${encodeURIComponent(art.tiles[month])}")`);
    }
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
    themeArt: {},          // month -> uploaded artwork url
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
    if (state.selected == null || state.selected === 'earn') return state.events;
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
    const earn = `<button class="member-btn earn ${state.selected === 'earn' ? 'active' : ''}" data-member="earn" style="--c:#16a34a">
        <span class="avatar">💵</span><span>Earn Money</span></button>`;
    $('#members').innerHTML = all + rest + earn;
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
    const cls = ['chore', c.status === 'done' || c.status === 'approved' ? 'done' : '', c.status === 'pending' ? 'pending' : '', c.status === 'rejected' ? 'rejected' : ''].join(' ');
    const mark = c.status === 'pending' ? '⏳' : (c.status === 'done' || c.status === 'approved' ? '✓' : '');
    let sub = '';
    if (c.paid) {
      let badge;
      if (c.status === 'pending') badge = '<span class="badge pending">Waiting for a parent to approve</span>';
      else if (c.status === 'approved') badge = '<span class="badge approved">Paid!</span>';
      else if (c.status === 'rejected') badge = '<span class="badge rejected">Rejected</span>';
      else if (c.member_id == null) badge = '<span class="badge">Anyone can claim this</span>';
      else badge = '<span class="badge">Tap when finished</span>';
      sub = `<span class="sub">${badge}</span>`;
    } else {
      const coinName = state.settings.coin_name || 'Mom Coins';
      const coins = c.coins != null ? Number(c.coins) : (Number(state.settings.coins_per_chore) || 0);
      if (c.status === 'pending') sub = `<span class="sub"><span class="badge pending">Waiting for approval${coins ? ` · 🪙 +${coins}` : ''}</span></span>`;
      else if (c.status === 'approved') sub = `<span class="sub"><span class="badge approved">Approved!${coins ? ` · 🪙 +${coins} ${esc(coinName)}` : ''}</span></span>`;
      else if (c.status === 'rejected') sub = '<span class="sub"><span class="badge rejected">Rejected</span></span>';
      else if (showWho && c.member_name) sub = `<span class="sub">${esc(c.member_name)}</span>`;
    }
    if (c.notes) sub += `<span class="sub">${esc(c.notes)}</span>`;
    const amt = c.paid ? `<span class="amt">${money(c.amount_cents)}</span>` : '';
    return `<div class="${cls}" data-chore="${c.id}" data-completion="${c.completion_id || ''}" data-status="${c.status || ''}" data-owner="${c.member_id ?? ''}">
      <div class="check">${mark}</div><div class="text">${esc(c.title)}${sub}</div>${amt}</div>`;
  }

  function renderSideMember(m) {
    const regular = state.chores.filter((c) => !c.paid);
    const paid = state.chores.filter((c) => c.paid);
    const done = regular.filter((c) => c.status && c.status !== 'rejected').length;
    const fin = state.finance.find((f) => f.member_id === m.id);
    const apr = Number(state.settings.interest_apr) || 0;
    // Group by time of day like a paper chore chart; headers only when periods are in use.
    const PERIODS = [['morning', '☀️ Morning'], ['afternoon', '🌤️ Afternoon'], ['evening', '🌙 Evening'], ['any', '📋 Anytime']];
    const usesPeriods = regular.some((c) => c.period && c.period !== 'any');
    const list = usesPeriods
      ? PERIODS.map(([key, label]) => {
        const items = regular.filter((c) => (c.period || 'any') === key);
        return items.length ? `<div class="period-head">${label}</div>${items.map((c) => choreRow(c, false)).join('')}` : '';
      }).join('')
      : regular.map((c) => choreRow(c, false)).join('');
    let html = `<div class="card accent" style="--c:${esc(m.color)}">
      <h3>${esc(m.emoji)} ${esc(m.name)}'s Chores <span class="meta">${done}/${regular.length} done</span></h3>
      ${regular.length ? list : '<p class="muted center">No chores today 🎉</p>'}
    </div>`;
    const mine = paid.filter((c) => c.member_id === m.id || c.completed_by === m.id);
    const pendingMine = mine.filter((c) => c.status === 'pending').length;
    if (mine.length) {
      html += `<div class="card earn-hint" data-member-row="earn"><h3>💵 Earn Money <span class="meta">tap to open</span></h3>
        <p class="muted">${mine.length} extra chore${mine.length > 1 ? 's' : ''} for you${pendingMine ? ` · ${pendingMine} waiting for approval` : ''}</p></div>`;
    }
    if (m.role === 'kid') {
      const cash = fin ? (fin.cash_cents || 0) : 0;
      const invested = fin ? (fin.invested_cents || 0) : 0;
      html += `<div class="card" data-money="${m.id}">
        <h3>💰 My Money <span class="meta">tap for history</span></h3>
        <div class="money2">
          <div><div class="lbl">💵 Cash</div><div class="balance">${money(cash)}</div></div>
          <div><div class="lbl">📈 Invested with Dad</div><div class="balance">${money(invested)}</div>${apr > 0 ? `<div class="lbl">earning ${apr}% a year</div>` : ''}</div>
          <div class="coins"><div class="lbl">🪙 ${esc(state.settings.coin_name || 'Mom Coins')}</div><div class="balance">${fin ? (fin.coins || 0) : 0}</div></div>
        </div>
        ${fin && fin.pending_cents ? `<div class="hint center"><b>+${money(fin.pending_cents)}</b> waiting for a parent to approve</div>` : ''}
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
      const done = regular.filter((c) => c.status && c.status !== 'rejected').length;
      const fin = state.finance.find((f) => f.member_id === m.id);
      const pct = regular.length ? Math.round((done / regular.length) * 100) : 0;
      const pending = fin && fin.pending_cents ? `<small>${money(fin.pending_cents)} waiting for approval</small>` : '';
      const coins = fin && m.role === 'kid' ? ` · 🪙 ${fin.coins || 0}` : '';
      return `<div class="row" data-member-row="${m.id}" style="--c:${esc(m.color)}">
        <div class="avatar">${esc(m.emoji)}</div>
        <div class="grow">${esc(m.name)}<small>${regular.length ? `${done} of ${regular.length} chores done` : 'no chores today'}${coins}</small>${pending}</div>
        ${regular.length ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
      </div>`;
    }).join('');
    const open = state.chores.filter((c) => c.paid && c.member_id == null && !c.status);
    html += `<div class="card"><h3>✅ Chores Today</h3>${rows || '<p class="muted center">Add family members in the parent app</p>'}
      ${open.length ? `<p class="muted" style="margin:10px 0 0" data-member-row="earn">💵 ${open.length} Earn Money chore${open.length > 1 ? 's' : ''} up for grabs — tap here to see them</p>` : ''}</div>`;

    const items = state.shopping.map((s) => `<div class="shop-item ${s.checked ? 'checked' : ''}" data-shop="${s.id}" data-checked="${s.checked}">
        <div class="box">${s.checked ? '✓' : ''}</div><span>${esc(s.text)}</span></div>`).join('');
    html += `<div class="card"><h3>🛒 Shopping List <span class="meta">${state.shopping.filter((s) => !s.checked).length} to get</span></h3>
      ${items || '<p class="muted center">Nothing on the list</p>'}
      <form class="shop-add" id="shopForm"><input id="shopInput" placeholder="Add an item…" maxlength="200" autocomplete="off"><button class="btn" type="submit">Add</button></form>
    </div>`;
    $('#side').innerHTML = html;
  }

  // Stand-alone Earn Money board: every paid chore, claimable by any kid.
  function earnRow(c) {
    const who = c.completed_by != null ? memberById(c.completed_by) : (c.member_id != null ? memberById(c.member_id) : null);
    const cls = ['chore', 'earn-row', c.status === 'approved' ? 'done' : '', c.status === 'pending' ? 'pending' : '', c.status === 'rejected' ? 'rejected' : ''].join(' ');
    const mark = c.status === 'pending' ? '⏳' : (c.status === 'approved' ? '✓' : '');
    let badge = '';
    if (c.status === 'pending') badge = `<span class="badge pending">${esc(who ? who.name : '')} · waiting for approval</span>`;
    else if (c.status === 'approved') badge = `<span class="badge approved">Paid to ${esc(who ? who.name : '')}</span>`;
    else if (c.status === 'rejected') badge = '<span class="badge rejected">Rejected</span>';
    else if (who) badge = `<span class="badge">For ${esc(who.name)}</span>`;
    else badge = '<span class="badge">Anyone can claim</span>';
    return `<div class="${cls}" data-earn="${c.id}" data-completion="${c.completion_id || ''}" data-status="${c.status || ''}">
      <div class="check" ${who ? `style="border-color:${esc(who.color)}"` : ''}>${mark || (who ? esc(who.emoji) : '💵')}</div>
      <div class="text">${esc(c.title)}<span class="sub">${badge}</span>${c.notes ? `<span class="sub">${esc(c.notes)}</span>` : ''}</div>
      <span class="amt">${money(c.amount_cents)}</span></div>`;
  }

  function renderSideEarn() {
    const paid = state.chores.filter((c) => c.paid);
    const open = paid.filter((c) => c.member_id == null && !c.status);
    const assigned = paid.filter((c) => c.member_id != null && !c.status);
    const inProgress = paid.filter((c) => c.status);
    const total = paid.filter((c) => !c.status).reduce((s, c) => s + c.amount_cents, 0);
    let html = `<div class="card accent" style="--c:#16a34a"><h3>💵 Earn Money <span class="meta">${money(total)} up for grabs</span></h3>
      <p class="muted">Finish a chore, tap it, and pick your name. A parent approves it and the money goes into your account.</p></div>`;
    html += `<div class="card"><h3>🙋 Anyone can do these</h3>${open.map(earnRow).join('') || '<p class="muted center">Nothing open right now</p>'}</div>`;
    if (assigned.length) html += `<div class="card"><h3>👤 Assigned</h3>${assigned.map(earnRow).join('')}</div>`;
    if (inProgress.length) html += `<div class="card"><h3>⏳ Claimed today</h3>${inProgress.map(earnRow).join('')}</div>`;
    $('#side').innerHTML = html;
  }

  function pickKidForChore(c) {
    const kids = state.members.filter((m) => m.role === 'kid' && (c.member_id == null || m.id === c.member_id));
    openModal(`<h2>💵 ${esc(c.title)} <span class="muted">${money(c.amount_cents)}</span></h2>
      ${c.notes ? `<p class="kv">${esc(c.notes)}</p>` : ''}
      <p class="kv"><b>Who finished it?</b></p>
      <div class="kid-pick">${kids.map((m) => `<button class="member-btn" data-claim="${c.id}" data-kid="${m.id}" style="--c:${esc(m.color)}">
        <span class="avatar">${esc(m.emoji)}</span><span>${esc(m.name)}</span></button>`).join('') || '<p class="muted">No kids set up yet</p>'}</div>`);
  }

  function renderSide() {
    if (state.selected === 'earn') return renderSideEarn();
    const m = state.selected != null ? memberById(state.selected) : null;
    if (m) renderSideMember(m); else renderSideEveryone();
  }

  // ---- "Great Job!" celebration ----------------------------------------------
  let celebrateTimer = null;
  function celebrate(name, msg) {
    const el = $('#celebrate');
    const stars = el.querySelector('.stars');
    const glyphs = ['⭐', '🌟', '✨', '💫', '⭐', '🌟'];
    stars.innerHTML = Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 240 + Math.random() * 420;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      return `<span class="star" style="left:50%;top:50%;--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--rot:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.25).toFixed(2)}s;font-size:${(1.8 + Math.random() * 2).toFixed(1)}rem">${glyphs[i % glyphs.length]}</span>`;
    }).join('');
    $('#celebrateName').textContent = name ? `Way to go, ${name}!` : '';
    $('#celebrateMsg').textContent = msg || '';
    el.hidden = false;
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  $('#celebrate').addEventListener('click', () => { clearTimeout(celebrateTimer); $('#celebrate').hidden = true; });

  // Taps within a short window are celebrated together ("3 chores — 6 Mom Coins"), so a kid
  // can tick off several chores in a row without waiting for the animation each time.
  const BATCH_MS = 1500;
  const batch = { memberId: null, name: '', count: 0, coins: 0, cents: 0, timer: null };
  const choreCoins = (chore) => (chore.paid ? 0 : (chore.coins != null ? Number(chore.coins) : (Number(state.settings.coins_per_chore) || 0)));

  function batchMessage() {
    const coinName = state.settings.coin_name || 'Mom Coins';
    const rewards = [];
    if (batch.coins > 0) rewards.push(`${batch.coins} ${coinName}`);
    if (batch.cents > 0) rewards.push(money(batch.cents));
    const what = batch.count === 1 ? 'Chore sent to Mom & Dad' : `${batch.count} chores sent to Mom & Dad`;
    return rewards.length ? `${what} — ${rewards.join(' + ')} once they approve` : `${what} for approval`;
  }

  function queueCelebration(memberId, chore) {
    if (batch.memberId !== memberId) Object.assign(batch, { memberId, count: 0, coins: 0, cents: 0 });
    const m = memberById(memberId);
    batch.name = m ? m.name : '';
    batch.count += 1;
    batch.coins += choreCoins(chore);
    if (chore.paid) batch.cents += chore.amount_cents;
    clearTimeout(batch.timer);
    batch.timer = setTimeout(() => {
      if (batch.count > 0) celebrate(batch.name, batchMessage());
      Object.assign(batch, { memberId: null, count: 0, coins: 0, cents: 0, timer: null });
    }, BATCH_MS);
  }

  // A tap undone inside the window comes back out of the tally.
  function unqueueCelebration(memberId, chore) {
    if (!batch.timer || batch.memberId !== memberId || !chore) return;
    batch.count = Math.max(0, batch.count - 1);
    batch.coins = Math.max(0, batch.coins - choreCoins(chore));
    if (chore.paid) batch.cents = Math.max(0, batch.cents - chore.amount_cents);
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
    const label = { deposit: 'Deposit', withdrawal: 'Withdrawal', chore: 'Chore', interest: 'Interest', adjustment: 'Adjustment', transfer: 'Moved' };
    const acct = (t) => (t.account === 'cash' ? '💵 Cash' : '📈 Invested');
    const rows = f.transactions.map((t) => `<div class="tx">
      <div class="n">${esc(t.note || label[t.type] || t.type)}<small>${new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${label[t.type] || t.type} · ${acct(t)}</small></div>
      <div class="a ${t.amount_cents < 0 ? 'neg' : 'pos'}">${t.amount_cents < 0 ? '−' : '+'}${money(Math.abs(t.amount_cents))}</div></div>`).join('');
    const coinRows = (f.coin_transactions || []).slice(0, 15).map((t) => `<div class="tx">
      <div class="n">${esc(t.note || 'Coins')}<small>${new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></div>
      <div class="a ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${Math.abs(t.amount)} 🪙</div></div>`).join('');
    openModal(`<h2>${esc(m.emoji)} ${esc(m.name)}'s Money</h2>
      <div class="money2">
        <div><div class="lbl">💵 Cash</div><div class="balance">${money(f.cash_cents || 0)}</div></div>
        <div><div class="lbl">📈 Invested with Dad</div><div class="balance">${money(f.invested_cents || 0)}</div>
          <div class="lbl">${f.interest_apr > 0 ? `${f.interest_apr}% a year, paid on day ${f.interest_day} of each month` : 'no interest yet'}</div></div>
        <div class="coins"><div class="lbl">🪙 ${esc(f.coin_name || 'Mom Coins')}</div><div class="balance">${f.coins || 0}</div></div>
      </div>
      <div style="margin-top:16px">${rows || '<p class="muted center">No activity yet</p>'}</div>
      ${coinRows ? `<h3 style="margin-top:18px">🪙 ${esc(f.coin_name || 'Mom Coins')}</h3>${coinRows}` : ''}`);
  }

  // ---- Data loading ---------------------------------------------------------
  let serverBuild = null;
  async function loadState() {
    const s = await api('/api/state');
    // The server restarted (probably an update): reload so new JS/CSS is picked up.
    if (serverBuild && s.build && s.build !== serverBuild) { location.reload(); return; }
    serverBuild = s.build || serverBuild;
    state.settings = s.settings;
    state.members = s.members;
    state.today = s.today;
    state.google = s.google;
    $('#setupNotice').hidden = !s.needs_setup;
    $('.setup-notice .host').textContent = location.host;
    if (typeof state.selected === 'number' && !memberById(state.selected)) state.selected = null;
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
    const member = typeof state.selected === 'number' ? `&member=${state.selected}` : '';
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
    try {
      const art = await api('/api/theme-art');
      const changed = JSON.stringify(art) !== JSON.stringify(state.themeArt);
      state.themeArt = art;
      if (changed) applyTheme();
    } catch { /* keep last */ }
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
      const v = memberBtn.dataset.member;
      state.selected = v === 'earn' ? 'earn' : (v ? Number(v) : null);
      renderMembers();
      renderCalendar();
      await loadSide();
      return;
    }
    const memberRow = t.closest('[data-member-row]');
    if (memberRow) {
      const v = memberRow.dataset.memberRow;
      state.selected = v === 'earn' ? 'earn' : Number(v);
      renderMembers(); renderCalendar(); await loadSide();
      return;
    }
    const claim = t.closest('[data-claim]');
    if (claim) {
      try {
        await api(`/api/chores/${claim.dataset.claim}/complete`, { method: 'POST', body: { member_id: Number(claim.dataset.kid), date: state.today } });
        closeModal();
        const chore = state.chores.find((c) => c.id === Number(claim.dataset.claim));
        if (chore) queueCelebration(Number(claim.dataset.kid), chore);
        await loadSide();
      } catch (err) { alert(err.message); }
      return;
    }
    const undo = t.closest('[data-uncomplete]');
    if (undo) {
      try { await api(`/api/chores/completions/${undo.dataset.uncomplete}`, { method: 'DELETE' }); closeModal(); await loadSide(); } catch (err) { alert(err.message); }
      return;
    }
    const earn = t.closest('[data-earn]');
    if (earn) {
      const c = state.chores.find((x) => x.id === Number(earn.dataset.earn));
      if (!c) return;
      if (c.status === 'approved') return;
      if (c.status === 'pending') {
        const who = memberById(c.completed_by);
        openModal(`<h2>⏳ ${esc(c.title)}</h2><p class="kv">${esc(who ? who.name : 'Someone')} marked this done — a parent still needs to approve it.</p>
          <div class="kid-pick"><button class="btn" data-uncomplete="${c.completion_id}">Undo — not finished yet</button><button class="btn" data-close>Keep it</button></div>`);
        return;
      }
      pickKidForChore(c);
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
    const memberId = typeof state.selected === 'number' ? state.selected : (el.dataset.owner ? Number(el.dataset.owner) : null);
    if (memberId == null) return; // open Earn Money chores are claimed from a kid's own view
    try {
      const chore = state.chores.find((c) => c.id === Number(el.dataset.chore));
      if (el.dataset.status && el.dataset.status !== 'rejected') {
        if (el.dataset.status === 'approved') return;
        await api(`/api/chores/completions/${el.dataset.completion}`, { method: 'DELETE' });
        unqueueCelebration(memberId, chore);
      } else {
        await api(`/api/chores/${el.dataset.chore}/complete`, { method: 'POST', body: { member_id: memberId, date: state.today } });
        if (chore) queueCelebration(memberId, chore);
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

  // ---- On-screen keyboard -----------------------------------------------------
  const osk = { target: null, shift: true, numbers: false };
  const OSK_ROWS = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['z', 'x', 'c', 'v', 'b', 'n', 'm']];
  const OSK_NUM = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['-', '/', ':', ';', '(', ')', '$', '&', '@'], ['.', ',', '?', '!', "'", '"', '%']];

  function oskRender() {
    const rows = osk.numbers ? OSK_NUM : OSK_ROWS;
    const key = (k, cls = '', label = k) => `<button class="osk-key ${cls}" data-key="${esc(k)}">${esc(label)}</button>`;
    const html = rows.map((r, i) => {
      const keys = r.map((k) => key(k, '', osk.shift && !osk.numbers ? k.toUpperCase() : k)).join('');
      if (i === 2) return `<div class="osk-row">${key('shift', `wide ${osk.shift ? 'on' : ''}`, '⇧')}${keys}${key('backspace', 'wide', '⌫')}</div>`;
      return `<div class="osk-row">${keys}</div>`;
    }).join('');
    $('#oskKeys').innerHTML = `${html}<div class="osk-row">${key('numbers', 'wide', osk.numbers ? 'ABC' : '123')}${key(' ', 'space', 'space')}${key('done', 'wide', 'Hide')}${key('enter', 'wide primary', osk.target && osk.target.form ? 'Add' : 'Done')}</div>`;
  }

  function oskShow(input) {
    osk.target = input;
    osk.shift = !input.value;
    osk.numbers = false;
    $('#oskText').textContent = input.value;
    $('#osk').hidden = false;
    oskRender();
  }

  function oskHide() {
    $('#osk').hidden = true;
    if (osk.target) osk.target.blur();
    osk.target = null;
  }

  function oskPress(k) {
    const t = osk.target;
    if (!t) return;
    if (k === 'shift') { osk.shift = !osk.shift; oskRender(); return; }
    if (k === 'numbers') { osk.numbers = !osk.numbers; oskRender(); return; }
    if (k === 'done') { oskHide(); return; }
    if (k === 'enter') {
      if (t.form) t.form.requestSubmit(); else oskHide();
      return;
    }
    if (k === 'backspace') t.value = t.value.slice(0, -1);
    else {
      t.value += osk.shift && !osk.numbers ? k.toUpperCase() : k;
      if (osk.shift && k !== ' ') { osk.shift = false; oskRender(); }
    }
    if (k === ' ' || k === 'backspace') { /* keep shift state */ }
    $('#oskText').textContent = t.value;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const isTextInput = (t) => t && t.matches && t.matches('input[type="text"], input:not([type])');
  document.addEventListener('focusin', (e) => { if (isTextInput(e.target)) oskShow(e.target); });
  document.addEventListener('click', (e) => { if (isTextInput(e.target) && $('#osk').hidden) oskShow(e.target); });
  $('#osk').addEventListener('pointerdown', (e) => e.preventDefault()); // keep the input focused
  $('#osk').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) oskPress(b.dataset.key);
  });
  document.addEventListener('pointerdown', (e) => {
    if ($('#osk').hidden) return;
    if (e.target.closest('#osk') || e.target === osk.target) return;
    oskHide();
  }, true);
  // After a shopping item is added the list re-renders; keep the keyboard open on the fresh input.
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'shopForm' && !$('#osk').hidden) {
      setTimeout(() => { const i = $('#shopInput'); if (i) { i.focus(); oskShow(i); } }, 400);
    }
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
