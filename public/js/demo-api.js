/* Example mode: an in-browser fake backend so the display and parent app can run as a static
   site (e.g. on Vercel) with sample data. Active on *.vercel.app, with ?demo=1, or when
   localStorage.fc_demo is set. Nothing here runs on a real install. */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) { try { localStorage.setItem('fc_demo', q.get('demo') === '0' ? '' : '1'); } catch { /* ignore */ } }
  let on = false;
  try { on = /\.vercel\.app$/.test(location.hostname) || localStorage.getItem('fc_demo') === '1'; } catch { on = /\.vercel\.app$/.test(location.hostname); }
  if (!on) return;
  window.FC_DEMO = true;

  // ---- sample data -----------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = (n, h = 0, m = 0) => { const d = new Date(today); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  const members = [
    { id: 1, name: 'Ava', role: 'kid', color: '#f59e0b', emoji: '🦄', sort_order: 0, active: 1, aliases: '' },
    { id: 2, name: 'Ben', role: 'kid', color: '#16a34a', emoji: '🦖', sort_order: 1, active: 1, aliases: '' },
    { id: 3, name: 'Cara', role: 'kid', color: '#8b5cf6', emoji: '🎨', sort_order: 2, active: 1, aliases: '' },
    { id: 4, name: 'Dan', role: 'kid', color: '#0ea5e9', emoji: '⚽', sort_order: 3, active: 1, aliases: '' },
    { id: 5, name: 'Eve', role: 'kid', color: '#ec4899', emoji: '🌈', sort_order: 4, active: 1, aliases: '' },
  ];
  const settings = {
    family_name: 'The Example Family', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, week_start: 0,
    screensaver_minutes: 0, photo_seconds: 15, month_themes: 1, temp_unit: 'fahrenheit', weather_lat: 40.76, weather_lon: -111.89,
    weather_label: 'Demo City', interest_apr: 5, interest_day: 1, coin_name: 'Mom Coins', coins_per_chore: 2, game_coins_per_minute: 0.5,
    games_weekday_until: '07:45', games_weekday_from: '16:00', games_weekends: 1, sync_minutes: 5, ntfy_topic: '', ntfy_server: 'https://ntfy.sh',
    app_url: '', google_client_id: 'demo', google_client_secret: true, pin_hash: true, pin_length: 4, session_secret: true,
    last_sync_at: new Date().toISOString(), google_redirect_uri: 'http://localhost:3100/api/google/callback', google_configured: true, google_env_override: false,
  };
  let nextId = 100;
  const chores = [
    { id: 1, title: 'Make my bed', member_id: 1, schedule: 'weekly', days: '0111110', paid: 0, amount_cents: 0, period: 'morning', coins: null, notes: null },
    { id: 2, title: 'Feed the dog', member_id: 1, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'morning', coins: null, notes: 'Before school' },
    { id: 3, title: 'Reading time', member_id: 1, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'afternoon', coins: 3, notes: null },
    { id: 4, title: 'Take out trash', member_id: 2, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'morning', coins: null, notes: null },
    { id: 5, title: 'Do math / reading', member_id: 2, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'afternoon', coins: null, notes: null },
    { id: 6, title: 'Practice piano', member_id: 3, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'afternoon', coins: null, notes: null },
    { id: 7, title: 'Water the plants', member_id: 4, schedule: 'weekly', days: '0101010', paid: 0, amount_cents: 0, period: 'morning', coins: null, notes: null },
    { id: 8, title: 'Tidy playroom', member_id: 5, schedule: 'daily', days: '1111111', paid: 0, amount_cents: 0, period: 'afternoon', coins: null, notes: null },
    { id: 9, title: 'Wash the car', member_id: 1, schedule: 'once', days: '1111111', paid: 1, amount_cents: 500, period: 'any', coins: null, notes: null },
    { id: 10, title: 'Pull weeds in the garden', member_id: null, schedule: 'once', days: '1111111', paid: 1, amount_cents: 1000, period: 'any', coins: null, notes: 'Front beds only' },
    { id: 11, title: 'Wash windows', member_id: null, schedule: 'once', days: '1111111', paid: 1, amount_cents: 300, period: 'any', coins: null, notes: null },
  ].map((c) => ({ ...c, active: 1, due_date: null, sort_order: 0, created_at: nowIso() }));
  const completions = []; // {id, chore_id, member_id, date, status, completed_at}
  completions.push({ id: nextId++, chore_id: 1, member_id: 1, date: ymd(today), status: 'approved', completed_at: nowIso() });
  completions.push({ id: nextId++, chore_id: 4, member_id: 2, date: ymd(today), status: 'pending', completed_at: nowIso() });
  const tx = [
    { id: nextId++, member_id: 1, type: 'deposit', account: 'invested', amount_cents: 12000, note: 'Birthday money', created_at: '2026-07-01 12:00:00' },
    { id: nextId++, member_id: 1, type: 'chore', account: 'cash', amount_cents: 500, note: 'Earned: Mow the lawn', created_at: '2026-07-20 18:10:00' },
    { id: nextId++, member_id: 1, type: 'interest', account: 'invested', amount_cents: 50, note: 'Interest for 2026-08 (5% APR)', created_at: '2026-08-01 06:00:00' },
    { id: nextId++, member_id: 2, type: 'deposit', account: 'cash', amount_cents: 4200, note: 'Tooth fairy', created_at: '2026-08-12 09:00:00' },
    { id: nextId++, member_id: 5, type: 'deposit', account: 'invested', amount_cents: 2025, note: 'Grandma', created_at: '2026-08-15 09:00:00' },
  ];
  const coins = [
    { id: nextId++, member_id: 1, amount: 64, note: 'Chores', created_at: '2026-08-30 08:00:00' },
    { id: nextId++, member_id: 2, amount: 6, note: 'Chores', created_at: '2026-08-30 08:00:00' },
    { id: nextId++, member_id: 3, amount: 9, note: 'Chores', created_at: '2026-08-30 08:00:00' },
    { id: nextId++, member_id: 4, amount: 2, note: 'Chores', created_at: '2026-08-30 08:00:00' },
    { id: nextId++, member_id: 5, amount: 11, note: 'Chores', created_at: '2026-08-30 08:00:00' },
  ];
  const meals = [{ date: ymd(day(0)), title: 'Tacos', notes: 'Ben picks toppings' }, { date: ymd(day(1)), title: 'Spaghetti', notes: null }, { date: ymd(day(3)), title: 'Pizza night', notes: null }, { date: ymd(day(5)), title: 'Grill out', notes: null }];
  let shopping = [{ id: 1, text: 'Milk', qty: 2, checked: 0 }, { id: 2, text: 'Eggs', qty: null, checked: 0 }, { id: 3, text: 'Dog food', qty: null, checked: 1 }];
  const localEvents = [
    { id: 1, kind: 'birthday', title: 'Ava', date: '2017-09-14', end_date: null, time: null, end_time: null, yearly: 1, show_age: 1, member_id: null, notes: null },
    { id: 2, kind: 'birthday', title: 'Grandma', date: '1952-10-03', end_date: null, time: null, end_time: null, yearly: 1, show_age: 0, member_id: null, notes: null },
    { id: 3, kind: 'event', title: 'School play', date: ymd(day(9)), end_date: null, time: '18:30', end_time: null, yearly: 0, show_age: 1, member_id: 3, notes: 'Bring camera' },
  ].map((e) => ({ ...e, member_name: e.member_id ? members.find((m) => m.id === e.member_id).name : null }));

  const rewards = [
    { id: 1, title: 'Date with Mom', coins: 50, emoji: '🍦', notes: 'Ice cream or a movie', active: 1, sort_order: 0 },
    { id: 2, title: 'Date with Dad', coins: 55, emoji: '🎣', notes: null, active: 1, sort_order: 0 },
    { id: 3, title: 'Pick dinner', coins: 20, emoji: '🍕', notes: null, active: 1, sort_order: 0 },
    { id: 4, title: 'Stay up 30 min later', coins: 15, emoji: '🌙', notes: 'School nights excluded', active: 1, sort_order: 0 },
  ];
  const redemptions = [];
  const evId = { n: 1 };
  const ev = (title, start, hours, memberId, isFamily, allDay = false, location = null, description = null) => {
    const end = allDay ? day(0) : null;
    const s = start; const e = allDay ? new Date(s.getTime() + 86_400_000) : new Date(s.getTime() + hours * 3_600_000);
    void end;
    return { id: evId.n++, title, start: allDay ? ymd(s) : s.toISOString(), end: allDay ? ymd(e) : e.toISOString(), start_ts: s.getTime(), end_ts: e.getTime(), all_day: allDay ? 1 : 0,
      location, description, calendar_id: 1, calendar_name: isFamily ? 'Family' : members.find((m) => m.id === memberId).name, calendar_color: '#9ca3af', member_id: memberId, is_family: isFamily ? 1 : 0 };
  };
  const events = [
    ev('Soccer practice', day(0, 16, 30), 1.5, 4, false, false, 'Community Center'),
    ev('Piano lesson', day(0, 15), 1, 1, false),
    ev('Dentist', day(1, 9), 1, 2, false),
    ev('Art club', day(1, 15, 30), 1, 3, false),
    ev('Family movie night', day(2, 19), 2, null, true),
    ev('School picture day', day(3), 0, null, true, true),
    ev('Sleepover at Mia’s', day(4), 0, 5, false, true),
    ev('Grandma visits', day(5), 0, null, true, true),
    ev('Swim meet', day(-1, 8), 4, 4, false, false, 'Aquatic Center', 'Bring towels and goggles'),
    ev('Late game', day(0, 22), 3, 2, false),
    ev('Camping trip', day(12), 0, null, true, true),
    ev('Ben & Cara dentist', day(8, 10), 1, null, true),
  ];

  // ---- helpers ---------------------------------------------------------------
  const active = () => members.filter((m) => m.active);
  const findMember = (id) => members.find((m) => m.id === Number(id));
  const balance = (memberId, account) => tx.filter((t) => t.member_id === memberId && t.account === account).reduce((s, t) => s + t.amount_cents, 0);
  const coinBalance = (memberId) => coins.filter((c) => c.member_id === memberId).reduce((s, c) => s + c.amount, 0);
  const pendingCents = (memberId) => completions.filter((c) => c.member_id === memberId && c.status === 'pending').map((c) => chores.find((x) => x.id === c.chore_id)).filter((x) => x && x.paid).reduce((s, x) => s + x.amount_cents, 0);
  const coinsFor = (c) => (c.coins != null ? Number(c.coins) : Number(settings.coins_per_chore) || 0);
  const isDue = (c, date) => c.schedule === 'daily' || (c.schedule === 'weekly' ? c.days.charAt(new Date(`${date}T12:00:00`).getDay()) === '1' : true);
  function choresForDay(date, memberId) {
    const out = [];
    for (const c of chores.filter((x) => x.active)) {
      if (!isDue(c, date)) continue;
      if (memberId != null && c.member_id != null && c.member_id !== memberId) continue;
      if (c.member_id == null && !c.paid) continue;
      let comp;
      if (c.schedule === 'once') { comp = completions.find((k) => k.chore_id === c.id && k.status !== 'rejected'); if (comp && comp.date !== date) continue; if (comp && memberId != null && c.member_id == null && comp.member_id !== memberId) continue; }
      else comp = completions.find((k) => k.chore_id === c.id && k.date === date && (memberId == null || k.member_id === memberId));
      const who = comp ? findMember(comp.member_id) : null;
      out.push({ id: c.id, title: c.title, notes: c.notes, member_id: c.member_id, member_name: c.member_id ? findMember(c.member_id).name : null, schedule: c.schedule, period: c.period, coins: c.paid ? 0 : coinsFor(c), paid: Boolean(c.paid), amount_cents: c.amount_cents, status: comp ? comp.status : null, completion_id: comp ? comp.id : null, completed_by: comp ? comp.member_id : null, completed_by_name: who ? who.name : null });
    }
    return out;
  }
  function approve(id) {
    const comp = completions.find((c) => c.id === id); if (!comp || comp.status === 'approved') return;
    const c = chores.find((x) => x.id === comp.chore_id);
    comp.status = 'approved';
    if (c.paid) tx.push({ id: nextId++, member_id: comp.member_id, type: 'chore', account: 'cash', amount_cents: c.amount_cents, note: `Earned: ${c.title}`, completion_id: comp.id, created_at: nowIso() });
    else if (coinsFor(c) > 0) coins.push({ id: nextId++, member_id: comp.member_id, amount: coinsFor(c), note: c.title, completion_id: comp.id, created_at: nowIso() });
  }
  const pendingList = () => completions.filter((c) => c.status === 'pending').map((c) => { const ch = chores.find((x) => x.id === c.chore_id); const m = findMember(c.member_id); return { ...c, title: ch.title, amount_cents: ch.amount_cents, schedule: ch.schedule, paid: ch.paid, coins: ch.paid ? 0 : coinsFor(ch), member_name: m.name, color: m.color, emoji: m.emoji }; });
  const gamesWindow = () => ({ open: true });
  function choreGate(memberId) {
    const period = new Date().getHours() < 12 ? 'morning' : 'afternoon';
    const missing = choresForDay(ymd(today), memberId).filter((c) => !c.paid && c.period === period && (!c.status || c.status === 'rejected')).map((c) => c.title);
    return { member_id: memberId, ok: missing.length === 0, period, missing };
  }
  const weather = () => ({ label: settings.weather_label, unit: '°F', current: { temp: 76, label: 'Partly cloudy', emoji: '⛅' },
    daily: Array.from({ length: 7 }, (_, i) => ({ date: ymd(day(i)), hi: 78 + i, lo: 58 + i, precip: 10 * i, label: 'Clear', emoji: ['☀️', '⛅', '🌤️', '☀️', '🌦️', '☀️', '⛅'][i] })) });
  const publicSettings = () => ({ family_name: settings.family_name, timezone: settings.timezone, week_start: settings.week_start, screensaver_minutes: settings.screensaver_minutes, photo_seconds: settings.photo_seconds, month_themes: settings.month_themes, temp_unit: settings.temp_unit, weather_label: settings.weather_label, interest_apr: settings.interest_apr, interest_day: settings.interest_day, coin_name: settings.coin_name, coins_per_chore: settings.coins_per_chore, game_coins_per_minute: settings.game_coins_per_minute, games_weekday_until: settings.games_weekday_until, games_weekday_from: settings.games_weekday_from, games_weekends: settings.games_weekends, last_sync_at: settings.last_sync_at });
  const localOccurrences = (fromTs, toTs) => {
    const out = [];
    for (const e of localEvents) {
      const years = e.yearly ? [today.getFullYear(), today.getFullYear() + 1] : [null];
      for (const y of years) {
        const dateStr = y == null ? e.date : `${y}-${e.date.slice(5)}`;
        const s = e.time ? new Date(`${dateStr}T${e.time}:00`) : new Date(`${dateStr}T00:00:00`);
        const en = e.time ? new Date(s.getTime() + 3_600_000) : new Date(s.getTime() + 86_400_000);
        if (en.getTime() <= fromTs || s.getTime() >= toTs) continue;
        const age = e.kind === 'birthday' && e.show_age && y ? y - Number(e.date.slice(0, 4)) : 0;
        out.push({ id: -(e.id * 10000 + (y || 0) % 10000), title: e.kind === 'birthday' ? (age > 0 ? `🎂 ${e.title} turns ${age}` : `🎂 ${e.title}'s birthday`) : e.title, start: e.time ? s.toISOString() : dateStr, end: en.toISOString(), start_ts: s.getTime(), end_ts: en.getTime(), all_day: e.time ? 0 : 1, location: null, description: e.notes, calendar_id: 0, calendar_name: e.kind === 'birthday' ? 'Birthdays' : 'Family events', calendar_color: e.kind === 'birthday' ? '#f59e0b' : '#7c6f9b', member_id: e.member_id, is_family: e.member_id == null ? 1 : 0 });
      }
    }
    return out;
  };
  const nameMatch = (title) => active().filter((m) => new RegExp(`(?<![\\p{L}\\p{N}])${m.name}(?![\\p{L}\\p{N}])`, 'iu').test(title)).map((m) => m.id);

  // ---- router ----------------------------------------------------------------
  const sessions = new Map();
  function route(method, path, query, body) {
    const p = path.replace(/^\/api/, '');
    const seg = p.split('/').filter(Boolean);
    const num = (s) => Number(s);
    if (p === '/state') return { build: 'demo', settings: publicSettings(), members: active().map(({ aliases, active: a, ...m }) => m), today: ymd(today), needs_setup: false, google: { configured: true, calendars_enabled: 3, accounts: [{ email: 'parent@example.com', error: null, last_sync_at: new Date().toISOString() }] } };
    if (p === '/members' && method === 'GET') return active();
    if (p === '/members/all') return members;
    if (p === '/members' && method === 'POST') { const m = { id: nextId++, name: body.name, role: body.role || 'kid', color: body.color || '#4f86f7', emoji: body.emoji || '🙂', aliases: body.aliases || '', sort_order: members.length, active: 1 }; members.push(m); return m; }
    if (seg[0] === 'members' && seg[2] === 'avatar') { const m = findMember(seg[1]); if (body.emoji) m.emoji = body.emoji; if (body.color) m.color = body.color; return m; }
    if (seg[0] === 'members' && method === 'PATCH') { const m = findMember(seg[1]); Object.assign(m, { name: body.name ?? m.name, role: body.role ?? m.role, color: body.color ?? m.color, emoji: body.emoji ?? m.emoji, aliases: body.aliases ?? m.aliases, active: body.active === undefined ? m.active : (body.active ? 1 : 0) }); return m; }
    if (seg[0] === 'members' && method === 'DELETE') { const m = findMember(seg[1]); if (m) m.active = 0; return { ok: true }; }
    if (p === '/events') {
      const from = new Date(`${query.get('from') || ymd(today)}T00:00:00`).getTime(); const to = new Date(`${query.get('to') || query.get('from') || ymd(today)}T00:00:00`).getTime() + 86_400_000;
      return [...events.filter((e) => e.end_ts > from && e.start_ts < to), ...localOccurrences(from, to)].map((e) => ({ ...e, member_ids: nameMatch(e.title) })).sort((a, b) => (b.all_day - a.all_day) || (a.start_ts - b.start_ts));
    }
    if (p === '/chores/day') { const d = query.get('date') || ymd(today); const m = query.get('member') ? num(query.get('member')) : null; return { date: d, chores: choresForDay(d, m) }; }
    if (seg[0] === 'chores' && seg[2] === 'complete' && method === 'POST') {
      const c = chores.find((x) => x.id === num(seg[1])); const memberId = num(body.member_id); const date = body.date || ymd(today);
      let comp = completions.find((k) => k.chore_id === c.id && k.member_id === memberId && k.date === date);
      if (comp && comp.status === 'approved') return comp;
      if (comp) { comp.status = 'pending'; comp.completed_at = nowIso(); } else { comp = { id: nextId++, chore_id: c.id, member_id: memberId, date, status: 'pending', completed_at: nowIso() }; completions.push(comp); }
      return comp;
    }
    if (seg[0] === 'chores' && seg[1] === 'completions' && method === 'DELETE') { const i = completions.findIndex((k) => k.id === num(seg[2])); if (i >= 0 && completions[i].status !== 'approved') completions.splice(i, 1); return { ok: true }; }
    if (seg[0] === 'chores' && seg[1] === 'completions' && seg[3] === 'approve') { approve(num(seg[2])); return { ok: true }; }
    if (seg[0] === 'chores' && seg[1] === 'completions' && seg[3] === 'reject') { const k = completions.find((x) => x.id === num(seg[2])); if (k) k.status = 'rejected'; return { ok: true }; }
    if (p === '/chores/pending') return pendingList();
    if (p === '/chores/approve-all') { const rows = pendingList().filter((x) => !body.member_id || x.member_id === num(body.member_id)); rows.forEach((r) => approve(r.id)); return { approved: rows.length }; }
    if (p === '/chores/reject-all') { const rows = pendingList().filter((x) => !body.member_id || x.member_id === num(body.member_id)); rows.forEach((r) => { completions.find((k) => k.id === r.id).status = 'rejected'; }); return { rejected: rows.length }; }
    if (p === '/chores/reset-day') { const memberId = num(body.member_id); let n = 0; for (let i = completions.length - 1; i >= 0; i--) { const k = completions[i]; const c = chores.find((x) => x.id === k.chore_id); if (k.member_id === memberId && k.date === ymd(today) && !c.paid) { for (let j = coins.length - 1; j >= 0; j--) if (coins[j].completion_id === k.id) coins.splice(j, 1); completions.splice(i, 1); n++; } } return { reset: n }; }
    if (p === '/chores/removed') return chores.filter((c) => !c.active).map((c) => ({ ...c, member_name: c.member_id ? findMember(c.member_id).name : null }));
    if (seg[0] === 'chores' && seg[2] === 'restore') { const c = chores.find((x) => x.id === num(seg[1])); if (c) c.active = 1; return c; }
    if (p === '/chores' && method === 'GET') return chores.filter((c) => c.active).map((c) => ({ ...c, member_name: c.member_id ? findMember(c.member_id).name : null }));
    if (p === '/chores' && method === 'POST') { const c = { id: nextId++, title: body.title, member_id: body.member_id ?? null, schedule: body.schedule || 'daily', days: body.days || '1111111', due_date: body.due_date || null, paid: body.paid ? 1 : 0, amount_cents: body.amount_cents || 0, period: body.period || 'any', coins: body.coins ?? null, notes: body.notes || null, sort_order: 0, active: 1, created_at: nowIso() }; chores.push(c); return c; }
    if (seg[0] === 'chores' && method === 'PATCH') { const c = chores.find((x) => x.id === num(seg[1])); Object.assign(c, { title: body.title ?? c.title, member_id: body.member_id === undefined ? c.member_id : body.member_id, schedule: body.schedule ?? c.schedule, days: body.days ?? c.days, due_date: body.due_date === undefined ? c.due_date : body.due_date, paid: body.paid === undefined ? c.paid : (body.paid ? 1 : 0), amount_cents: body.amount_cents ?? c.amount_cents, period: body.period ?? c.period, coins: body.coins === undefined ? c.coins : body.coins, notes: body.notes === undefined ? c.notes : (body.notes || null) }); return c; }
    if (seg[0] === 'chores' && method === 'DELETE') { const c = chores.find((x) => x.id === num(seg[1])); if (c) c.active = 0; return { ok: true }; }
    if (p === '/finance/summary') return active().filter((m) => m.role === 'kid').map((m) => ({ member_id: m.id, cash_cents: balance(m.id, 'cash'), invested_cents: balance(m.id, 'invested'), balance_cents: balance(m.id, 'cash') + balance(m.id, 'invested'), pending_cents: pendingCents(m.id), coins: coinBalance(m.id) }));
    if (seg[0] === 'finance' && seg[2] === 'transactions' && method === 'POST') {
      const memberId = num(seg[1]); const account = body.account === 'cash' ? 'cash' : 'invested'; const other = account === 'cash' ? 'invested' : 'cash';
      if (body.type === 'set_balance') { const diff = num(body.balance_cents) - balance(memberId, account); if (diff) tx.push({ id: nextId++, member_id: memberId, type: 'adjustment', account, amount_cents: diff, note: 'Balance set', created_at: nowIso() }); }
      else if (body.type === 'transfer') { const c = Math.abs(num(body.amount_cents)); tx.push({ id: nextId++, member_id: memberId, type: 'transfer', account, amount_cents: -c, note: body.note || `Moved to ${other}`, created_at: nowIso() }); tx.push({ id: nextId++, member_id: memberId, type: 'transfer', account: other, amount_cents: c, note: body.note || `Moved from ${account}`, created_at: nowIso() }); }
      else { let c = num(body.amount_cents); if (body.type === 'deposit') c = Math.abs(c); if (body.type === 'withdrawal') c = -Math.abs(c); tx.push({ id: nextId++, member_id: memberId, type: body.type, account, amount_cents: c, note: body.note || null, created_at: nowIso() }); }
      return { ok: true };
    }
    if (seg[0] === 'finance' && seg[1] === 'transactions' && method === 'DELETE') { const i = tx.findIndex((t) => t.id === num(seg[2])); if (i >= 0) { const t = tx[i]; const k = completions.find((x) => x.id === t.completion_id); if (k) k.status = 'rejected'; tx.splice(i, 1); } return { ok: true }; }
    if (p === '/finance/apply-interest') return { credited: 0 };
    if (seg[0] === 'finance' && seg.length === 2) { const id = num(seg[1]); return { member_id: id, cash_cents: balance(id, 'cash'), invested_cents: balance(id, 'invested'), balance_cents: balance(id, 'cash') + balance(id, 'invested'), pending_cents: pendingCents(id), interest_apr: settings.interest_apr, interest_day: settings.interest_day, coins: coinBalance(id), coin_name: settings.coin_name, transactions: tx.filter((t) => t.member_id === id).slice().reverse(), coin_transactions: coins.filter((c) => c.member_id === id).slice().reverse() }; }
    if (seg[0] === 'coins' && seg[1] === 'transactions' && method === 'DELETE') { const i = coins.findIndex((c) => c.id === num(seg[2])); if (i >= 0) { const k = completions.find((x) => x.id === coins[i].completion_id); if (k) k.status = 'rejected'; coins.splice(i, 1); } return { ok: true }; }
    if (seg[0] === 'coins' && method === 'POST') { coins.push({ id: nextId++, member_id: num(seg[1]), amount: num(body.amount), note: body.note || null, created_at: nowIso() }); return { coins: coinBalance(num(seg[1])) }; }
    if (p === '/meals' && method === 'GET') { const from = query.get('from') || ymd(today); const to = query.get('to') || from; return meals.filter((m) => m.date >= from && m.date <= to); }
    if (seg[0] === 'meals' && method === 'PUT') { const i = meals.findIndex((m) => m.date === seg[1]); if (!body.title) { if (i >= 0) meals.splice(i, 1); return { date: seg[1], title: '' }; } const m = { date: seg[1], title: body.title, notes: body.notes || null }; if (i >= 0) meals[i] = m; else meals.push(m); return m; }
    if (p === '/shopping/common') return ['Milk', 'Eggs', 'Bread', 'Butter', 'Cheese', 'Yogurt', 'Bananas', 'Apples', 'Chicken', 'Cereal', 'Rice', 'Pasta', 'Tortillas', 'Juice', 'Toilet paper', 'Paper towels'];
    if (p === '/shopping' && method === 'GET') return shopping.slice().sort((a, b) => a.checked - b.checked || a.id - b.id);
    if (p === '/shopping' && method === 'POST') { const text = String(body.text || '').trim(); const qty = body.qty ? Math.min(99, num(body.qty)) : null; const ex = shopping.find((s) => s.text.toLowerCase() === text.toLowerCase()); if (ex) { ex.checked = 0; if (qty) ex.qty = qty; return { ...ex, merged: true }; } const it = { id: nextId++, text, qty, checked: 0 }; shopping.push(it); return it; }
    if (p === '/shopping/all' && method === 'DELETE') { shopping = []; return { removed: 0 }; }
    if (p === '/shopping/checked' && method === 'DELETE') { shopping = shopping.filter((s) => !s.checked); return { removed: 0 }; }
    if (seg[0] === 'shopping' && method === 'PATCH') { const s = shopping.find((x) => x.id === num(seg[1])); if (s) { if (body.checked !== undefined) s.checked = body.checked ? 1 : 0; if (body.qty !== undefined) s.qty = body.qty; if (body.text !== undefined) s.text = body.text; } return s; }
    if (seg[0] === 'shopping' && method === 'DELETE') { shopping = shopping.filter((x) => x.id !== num(seg[1])); return { ok: true }; }
    if (p === '/weather') return weather();
    if (p === '/weather/geocode') return [{ label: 'Demo City, UT, US', lat: 40.76, lon: -111.89 }];
    if (p === '/photos') return [];
    if (p === '/theme-art') return {};
    if (p === '/auth/me') return { parent: true, needs_setup: false, pin_length: 4 };
    if (p === '/auth/login') return { ok: true };
    if (p === '/auth/logout') return { ok: true };
    if (p === '/setup/status') return { needs_setup: false };
    if (p === '/settings' && method === 'GET') return settings;
    if (p === '/settings' && method === 'PATCH') { Object.assign(settings, body); return settings; }
    if (p === '/settings/pin') return { ok: true };
    if (p === '/google/accounts') return [{ id: 1, email: 'parent@example.com', last_error: null, last_sync_at: new Date().toISOString(), calendars: [{ id: 1, account_id: 1, google_id: 'a', name: 'Family', member_id: null, is_family: 1, enabled: 1, color: '#7c6f9b' }, { id: 2, account_id: 1, google_id: 'b', name: 'Ava', member_id: 1, is_family: 0, enabled: 1, color: '#f59e0b' }, { id: 3, account_id: 1, google_id: 'c', name: 'Holidays in United States', member_id: null, is_family: 0, enabled: 0, color: '#ccc' }] }];
    if (p === '/google/sync') return { accounts: 1, calendars: 2, events: events.length, errors: [] };
    if (p === '/google/auth-url') return { url: 'https://accounts.google.com/', redirect_uri: settings.google_redirect_uri };
    if (p === '/local-events' && method === 'GET') return localEvents;
    if (p === '/local-events' && method === 'POST') { const e = { id: nextId++, ...body, yearly: body.kind === 'birthday' ? 1 : (body.yearly ? 1 : 0), show_age: body.show_age === false ? 0 : 1, member_name: body.member_id ? findMember(body.member_id).name : null }; localEvents.push(e); return e; }
    if (seg[0] === 'local-events' && method === 'PATCH') { const e = localEvents.find((x) => x.id === num(seg[1])); Object.assign(e, body, { yearly: body.kind === 'birthday' ? 1 : (body.yearly ? 1 : 0), show_age: body.show_age === false ? 0 : 1 }); return e; }
    if (seg[0] === 'local-events' && method === 'DELETE') { const i = localEvents.findIndex((x) => x.id === num(seg[1])); if (i >= 0) localEvents.splice(i, 1); return { ok: true }; }
    if (p === '/rewards' && method === 'GET') return rewards.filter((r) => r.active);
    if (p === '/rewards/all') return rewards.filter((r) => r.active);
    if (p === '/rewards' && method === 'POST') { const r = { id: nextId++, title: body.title, coins: num(body.coins), emoji: body.emoji || '🎁', notes: body.notes || null, active: 1, sort_order: 0 }; rewards.push(r); return r; }
    if (seg[0] === 'rewards' && seg[2] === 'redeem') { const r = rewards.find((x) => x.id === num(seg[1])); const memberId = num(body.member_id); const have = coinBalance(memberId); if (have < r.coins) return { status: 402, body: { error: `Needs ${r.coins - have} more coins for that` } }; const t = { id: nextId++, member_id: memberId, amount: -r.coins, note: `🎁 ${r.title}`, created_at: nowIso() }; coins.push(t); const m = findMember(memberId); const red = { id: nextId++, reward_id: r.id, member_id: memberId, title: r.title, coins: r.coins, status: 'pending', coin_tx_id: t.id, created_at: nowIso(), member_name: m.name, member_emoji: m.emoji, color: m.color }; redemptions.unshift(red); return { redemption: red, coins: coinBalance(memberId) }; }
    if (seg[0] === 'rewards' && method === 'PATCH') { const r = rewards.find((x) => x.id === num(seg[1])); Object.assign(r, { title: body.title ?? r.title, coins: body.coins ?? r.coins, emoji: body.emoji || r.emoji, notes: body.notes === undefined ? r.notes : (body.notes || null) }); return r; }
    if (seg[0] === 'rewards' && method === 'DELETE') { const r = rewards.find((x) => x.id === num(seg[1])); if (r) r.active = 0; return { ok: true }; }
    if (p === '/redemptions') return redemptions;
    if (seg[0] === 'redemptions' && seg[2] === 'done') { const r = redemptions.find((x) => x.id === num(seg[1])); if (r) r.status = 'done'; return { ok: true }; }
    if (seg[0] === 'redemptions' && seg[2] === 'cancel') { const r = redemptions.find((x) => x.id === num(seg[1])); if (r) { r.status = 'cancelled'; const i = coins.findIndex((c) => c.id === r.coin_tx_id); if (i >= 0) coins.splice(i, 1); } return { ok: true }; }
    if (p === '/games/window') return gamesWindow();
    if (p === '/games/ready') return { window: gamesWindow(), kids: active().filter((m) => m.role === 'kid').map((m) => choreGate(m.id)) };
    if (p === '/games/session') { const memberId = num(body.member_id); const gate = choreGate(memberId); if (!gate.ok) return { status: 403, body: { error: `Finish your ${gate.period} chores first: ${gate.missing.join(', ')}` } }; const bal = coinBalance(memberId); if (bal <= 0) return { status: 402, body: { error: `Out of ${settings.coin_name}` } }; const id = nextId++; const row = { id, member_id: memberId, amount: 0, note: `🎮 ${body.game} · 0 min`, created_at: nowIso() }; coins.push(row); sessions.set(id, row); return { id, rate: settings.game_coins_per_minute, coins: bal }; }
    if (seg[0] === 'games' && seg[1] === 'session' && seg[3] === 'tick') { const row = sessions.get(num(seg[2])); if (row) { row.amount = -Math.round((settings.game_coins_per_minute * num(body.seconds) / 60) * 100) / 100; row.note = `🎮 game · ${Math.round(num(body.seconds) / 6) / 10} min`; } const c = row ? coinBalance(row.member_id) : 0; return { coins: c, out: c <= 0, reason: c <= 0 ? 'out_of_coins' : null }; }
    if (p === '/notify/test') return { ok: true, app_url: location.origin };
    return { ok: true };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const u = new URL(url, location.origin);
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = {}; } }
    await new Promise((r) => setTimeout(r, 40)); // a touch of latency so spinners behave
    const out = route(method, u.pathname, u.searchParams, body);
    const status = out && out.status && out.body !== undefined ? out.status : 200;
    const payload = status === 200 ? out : out.body;
    return new Response(JSON.stringify(payload ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  };

  // ---- badge -----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = 'EXAMPLE MODE · sample data, nothing is saved';
    b.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:200;background:#111827;color:#ffd23f;font:700 12px system-ui,sans-serif;padding:6px 12px;border-radius:999px;letter-spacing:.06em;opacity:.85;pointer-events:none';
    document.body.appendChild(b);
  });
})();
