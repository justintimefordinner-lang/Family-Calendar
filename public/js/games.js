/* Arcade games for the family display: Snake, Frogger, Asteroids (Pac-Man lives in pacman.js).
   Every game exposes { start(canvas, {width,height}), stop(), press(key), release(key), togglePause(), restart() }
   where key is 'up' | 'down' | 'left' | 'right' | 'fire'. */
(() => {
  'use strict';
  const Games = (window.Games = window.Games || {});
  const FONT = '"Segoe UI", system-ui, sans-serif';

  function makeGame(def) {
    let canvas; let ctx; let raf = 0; let running = false; let last = 0; let W = 0; let H = 0;
    const held = new Set();
    const g = { status: 'play', high: Number(localStorage.getItem(`fc_${def.key}_high`) || 0), score: 0 };
    g.gameOver = () => {
      g.status = 'over'; g.overAt = performance.now(); // results stay up for a few seconds before any button restarts
      if (g.score > g.high) { g.high = g.score; localStorage.setItem(`fc_${def.key}_high`, String(g.high)); }
    };
    function overlay() {
      if (g.status === 'play') return;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g.status === 'over' ? '#ff5252' : '#ffe600';
      ctx.font = `bold ${Math.round(W / 14)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.status === 'over' ? 'GAME OVER' : 'PAUSED', W / 2, H / 2 - W / 30);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(W / 28)}px ${FONT}`;
      const canRestart = g.status !== 'over' || performance.now() - (g.overAt || 0) >= 3000;
      if (g.status === 'over' && Array.isArray(g.summary)) g.summary.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + W / 24 + i * (W / 22)));
      const tail = g.status === 'over' ? (g.summary ? (H / 2 + W / 24 + g.summary.length * (W / 22)) : (H / 2 + W / 24)) : H / 2 + W / 24;
      ctx.fillText(g.status === 'over' ? (g.summary ? '' : `Score ${g.score} · High ${g.high}`) + (canRestart ? (g.summary ? 'Press any button to play again' : ' · press any button to play again') : '') : 'tap ⏸ to continue', W / 2, tail);
    }
    function loop(ts) {
      if (!running) return;
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      if (g.status === 'play') def.update(g, dt, held);
      def.draw(g, ctx, W, H);
      overlay();
      raf = requestAnimationFrame(loop);
    }
    return {
      start(cv, opts = {}) {
        canvas = cv; ctx = cv.getContext('2d');
        W = opts.width || 800; H = opts.height || 900;
        const ar = def.aspect || 1;
        if (W / H > ar) W = Math.floor(H * ar); else H = Math.floor(W / ar);
        canvas.width = W; canvas.height = H;
        g.status = 'play'; g.summary = null; held.clear();
        def.init(g, W, H);
        running = true; last = performance.now();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
      },
      stop() { running = false; cancelAnimationFrame(raf); held.clear(); },
      press(k) {
        if (g.status === 'over') { if (performance.now() - (g.overAt || 0) < 3000) return; g.summary = null; def.init(g, W, H); g.status = 'play'; return; }
        if (g.status === 'paused') g.status = 'play';
        held.add(k);
        if (def.press) def.press(g, k);
      },
      release(k) { held.delete(k); },
      togglePause() { if (g.status === 'play') g.status = 'paused'; else if (g.status === 'paused') g.status = 'play'; },
      restart() { if (g.status === 'over' && performance.now() - (g.overAt || 0) < 3000) return; g.summary = null; def.init(g, W, H); g.status = 'play'; },
    };
  }

  const hud = (ctx, W, H, left, right) => {
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(W / 30)}px ${FONT}`; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(left, 12, 10);
    ctx.textAlign = 'right'; ctx.fillText(right, W - 12, 10);
  };

  // ---------------------------------------------------------------- Snake (1 or 2 players)
  const SN = { cols: 30, rows: 22, players: 1 };
  const SN_DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const SN_SKINS = [['#9dff6b', '#5cd65c', '#48c048'], ['#ffd166', '#ff9f43', '#f39c12']];
  function snakeStart(i) {
    if (SN.players === 1) return { body: [{ x: 15, y: 11 }, { x: 14, y: 11 }, { x: 13, y: 11 }], dir: SN_DIRS.right };
    return i === 0
      ? { body: [{ x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }], dir: SN_DIRS.right }
      : { body: [{ x: 22, y: 11 }, { x: 23, y: 11 }, { x: 24, y: 11 }], dir: SN_DIRS.left };
  }
  Games.snake = makeGame({
    key: 'snake', aspect: SN.cols / SN.rows,
    init(g) {
      g.score = 0; g.acc = 0; g.interval = 0.16; g.flash = 0; g.food = null; g.winner = null;
      g.snakes = Array.from({ length: SN.players }, (_, i) => { const s = snakeStart(i); return { i, body: s.body, dir: s.dir, next: s.dir, grow: 0, score: 0, alive: true }; });
      placeFood(g);
    },
    press(g, k) {
      const p = k.startsWith('p2:') ? 1 : 0; const key = k.replace('p2:', '');
      const s = g.snakes[p]; const d = SN_DIRS[key];
      if (s && s.alive && d && !(d.x === -s.dir.x && d.y === -s.dir.y)) s.next = d;
    },
    update(g, dt) {
      g.acc += dt; g.flash += dt;
      if (g.acc < g.interval) return;
      g.acc -= g.interval;
      const moving = g.snakes.filter((s) => s.alive).map((s) => { s.dir = s.next; return { s, h: { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y } }; });
      const taken = (x, y) => g.snakes.some((s) => s.alive && s.body.some((b) => b.x === x && b.y === y));
      for (const { s, h } of moving) {
        const wall = h.x < 0 || h.y < 0 || h.x >= SN.cols || h.y >= SN.rows;
        const headOn = moving.some((o) => o.s !== s && o.h.x === h.x && o.h.y === h.y);
        if (wall || taken(h.x, h.y) || headOn) s.alive = false;
      }
      for (const { s, h } of moving) {
        if (!s.alive) continue;
        s.body.unshift(h);
        if (g.food && h.x === g.food.x && h.y === g.food.y) { s.score += 10; s.grow += 2; g.interval = Math.max(0.06, g.interval * 0.96); placeFood(g); }
        if (s.grow > 0) s.grow -= 1; else s.body.pop();
      }
      g.score = g.snakes.length === 1 ? g.snakes[0].score : Math.max(...g.snakes.map((s) => s.score));
      if (g.snakes.length === 1) { if (!g.snakes[0].alive) g.gameOver(); return; }
      const left = g.snakes.filter((s) => s.alive);
      if (left.length <= 1) {
        g.winner = left.length ? left[0].i + 1 : null;
        g.summary = [g.winner ? `Player ${g.winner} wins!` : 'Both crashed — draw!', ...g.snakes.map((s) => `P${s.i + 1}: ${s.score} points · length ${s.body.length}`)];
        g.gameOver();
      }
    },
    draw(g, ctx, W, H) {
      const c = W / SN.cols; const top = H - SN.rows * c;
      ctx.fillStyle = '#0e2a12'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#123a18'; for (let y = 0; y < SN.rows; y++) for (let x = (y % 2); x < SN.cols; x += 2) ctx.fillRect(x * c, top + y * c, c, c);
      if (g.food) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(g.food.x * c + c / 2, top + g.food.y * c + c / 2, c * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5cbf5c'; ctx.fillRect(g.food.x * c + c * 0.45, top + g.food.y * c + c * 0.05, c * 0.12, c * 0.25); }
      for (const s of g.snakes) {
        const skin = SN_SKINS[s.i] || SN_SKINS[0];
        ctx.globalAlpha = s.alive ? 1 : 0.35;
        s.body.forEach((b, i) => {
          ctx.fillStyle = i === 0 ? skin[0] : (i % 2 ? skin[1] : skin[2]);
          const r = c * 0.25; const x = b.x * c + 1; const y = top + b.y * c + 1; const w = c - 2;
          ctx.beginPath(); ctx.roundRect(x, y, w, w, r); ctx.fill();
          if (i === 0) { ctx.fillStyle = '#123a18'; const ex = x + w / 2 + s.dir.x * w * 0.2; const ey = y + w / 2 + s.dir.y * w * 0.2; ctx.beginPath(); ctx.arc(ex - s.dir.y * w * 0.2, ey + s.dir.x * w * 0.2, w * 0.09, 0, 7); ctx.arc(ex + s.dir.y * w * 0.2, ey - s.dir.x * w * 0.2, w * 0.09, 0, 7); ctx.fill(); }
        });
        ctx.globalAlpha = 1;
      }
      if (g.snakes.length === 1) hud(ctx, W, H, `SCORE ${g.score}`, `HIGH ${Math.max(g.high, g.score)}`);
      else hud(ctx, W, H, `P1 ${g.snakes[0].score}`, `${g.snakes[1].score} P2`);
    },
  });
  Games.snake.setPlayers = (p) => { SN.players = p === 2 ? 2 : 1; };
  function placeFood(g) {
    let p;
    do { p = { x: Math.floor(Math.random() * SN.cols), y: Math.floor(Math.random() * SN.rows) }; } while (g.snakes.some((s) => s.body.some((b) => b.x === p.x && b.y === p.y)));
    g.food = p;
  }

  // -------------------------------------------------------------- Frogger
  const FRG = { players: 1 };
  const FR = { cols: 13, rows: 13 }; // 0 home, 1-5 river, 6 median, 7-11 road, 12 start
  const LANES = [
    { row: 1, kind: 'log', speed: 1.6, len: 4, gap: 4, color: '#8b5a2b' },
    { row: 2, kind: 'log', speed: -2.2, len: 2, gap: 3, color: '#2e8b57' },
    { row: 3, kind: 'log', speed: 2.8, len: 5, gap: 5, color: '#8b5a2b' },
    { row: 4, kind: 'log', speed: -1.4, len: 3, gap: 3, color: '#2e8b57' },
    { row: 5, kind: 'log', speed: 2.0, len: 3, gap: 4, color: '#8b5a2b' },
    { row: 7, kind: 'car', speed: -2.4, len: 2, gap: 5, color: '#ffd23f' },
    { row: 8, kind: 'car', speed: 1.8, len: 1, gap: 4, color: '#ff595e' },
    { row: 9, kind: 'car', speed: -3.4, len: 1, gap: 6, color: '#7cc7ff' },
    { row: 10, kind: 'car', speed: 2.2, len: 3, gap: 5, color: '#c9b6ff' },
    { row: 11, kind: 'car', speed: -1.6, len: 1, gap: 3, color: '#ffffff' },
  ];
  const HOMES = [0, 3, 6, 9, 12];
  Games.frogger = makeGame({
    key: 'frogger', aspect: FR.cols / (FR.rows + 1),
    init(g) {
      g.score = 0; g.lives = 3; g.level = 1; g.homes = [false, false, false, false, false]; g.time = 0;
      g.lanes = LANES.map((l) => ({ ...l, items: [], frozen: 0 }));
      g.cross = FRG.players === 2 ? { x: 6, y: 9, shots: 3, reload: 0 } : null; // player 2: a crosshair that can freeze a lane
      for (const l of g.lanes) for (let x = -l.len; x < FR.cols + l.len; x += l.len + l.gap) l.items.push(x + Math.random() * 2);
      resetFrog(g);
    },
    press(g, k) {
      if (k.startsWith('p2:')) {
        const x = g.cross; if (!x || k !== 'p2:fire') return;
        if (x.shots <= 0 || x.reload > 0) return;
        const lane = g.lanes.find((l) => l.row === Math.round(x.y));
        if (!lane) return;
        lane.frozen = 4; x.shots -= 1; x.reload = 5;
        return;
      }
      if (g.dead > 0) return;
      const f = g.frog;
      if (k === 'up') f.y -= 1; if (k === 'down') f.y = Math.min(12, f.y + 1);
      if (k === 'left') f.x = Math.max(0, f.x - 1); if (k === 'right') f.x = Math.min(FR.cols - 1, f.x + 1);
      if (k === 'up') g.score += 10;
    },
    update(g, dt, held) {
      g.time += dt;
      const mult = 1 + (g.level - 1) * 0.25;
      if (g.cross) {
        const x = g.cross; const sp = 6 * dt;
        if (held.has('p2:left')) x.x -= sp; if (held.has('p2:right')) x.x += sp; if (held.has('p2:up')) x.y -= sp; if (held.has('p2:down')) x.y += sp;
        x.x = Math.max(0, Math.min(FR.cols - 1, x.x)); x.y = Math.max(1, Math.min(11, x.y));
        if (x.reload > 0) x.reload -= dt;
      }
      for (const l of g.lanes) {
        if (l.frozen > 0) { l.frozen -= dt; continue; }
        const span = FR.cols + 2 * l.len;
        l.items = l.items.map((x) => { let nx = x + l.speed * mult * dt; if (nx > FR.cols + l.len) nx -= span; if (nx < -l.len) nx += span; return nx; });
      }
      if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) { if (g.lives <= 0) g.gameOver(); else resetFrog(g); } return; }
      const f = g.frog; const row = Math.round(f.y);
      const lane = g.lanes.find((l) => l.row === row);
      if (lane) {
        const on = lane.items.some((x) => f.x + 0.5 > x && f.x + 0.5 < x + lane.len);
        if (lane.kind === 'log') { if (on) f.x += (lane.frozen > 0 ? 0 : lane.speed * mult) * dt; else return die(g); if (f.x < -0.5 || f.x > FR.cols - 0.5) return die(g); }
        else if (on) return die(g);
      }
      if (row === 0) {
        const slot = HOMES.findIndex((hx) => Math.abs(f.x - hx) < 0.6);
        if (slot < 0 || g.homes[slot]) return die(g);
        g.homes[slot] = true; g.score += 50;
        if (g.homes.every(Boolean)) { g.level += 1; g.score += 200; g.homes = [false, false, false, false, false]; if (g.cross) g.cross.shots = 3; }
        resetFrog(g);
      }
    },
    draw(g, ctx, W, H) {
      const c = W / FR.cols; const top = H - FR.rows * c;
      ctx.fillStyle = '#0b1d3a'; ctx.fillRect(0, 0, W, H);
      const band = (r, color) => { ctx.fillStyle = color; ctx.fillRect(0, top + r * c, W, c); };
      band(0, '#1f6b2f'); for (let r = 1; r <= 5; r++) band(r, '#1d4ed8'); band(6, '#3f8f3f'); for (let r = 7; r <= 11; r++) band(r, '#333'); band(12, '#3f8f3f');
      ctx.strokeStyle = '#ffd23f'; ctx.setLineDash([c * 0.4, c * 0.3]); ctx.lineWidth = 2;
      for (let r = 8; r <= 11; r++) { ctx.beginPath(); ctx.moveTo(0, top + r * c); ctx.lineTo(W, top + r * c); ctx.stroke(); }
      ctx.setLineDash([]);
      // homes
      for (const l of g.lanes) if (l.frozen > 0) { ctx.fillStyle = 'rgba(147, 197, 253, 0.45)'; ctx.fillRect(0, top + l.row * c, W, c); }
      HOMES.forEach((hx, i) => { ctx.fillStyle = '#0b1d3a'; ctx.fillRect(hx * c + c * 0.1, top + c * 0.1, c * 0.8, c * 0.8); if (g.homes[i]) frog(ctx, hx * c + c / 2, top + c / 2, c, '#5cd65c'); });
      for (const l of g.lanes) for (const x of l.items) {
        const y = top + l.row * c;
        if (l.kind === 'log') { ctx.fillStyle = l.color; ctx.beginPath(); ctx.roundRect(x * c, y + c * 0.15, l.len * c, c * 0.7, c * 0.3); ctx.fill(); }
        else { ctx.fillStyle = l.color; ctx.beginPath(); ctx.roundRect(x * c + 2, y + c * 0.15, l.len * c - 4, c * 0.7, c * 0.2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x * c + c * 0.15, y + c * 0.05, c * 0.25, c * 0.12); ctx.fillRect(x * c + l.len * c - c * 0.4, y + c * 0.05, c * 0.25, c * 0.12); ctx.fillRect(x * c + c * 0.15, y + c * 0.83, c * 0.25, c * 0.12); ctx.fillRect(x * c + l.len * c - c * 0.4, y + c * 0.83, c * 0.25, c * 0.12); }
      }
      if (g.dead > 0) { ctx.fillStyle = '#ff5252'; ctx.font = `bold ${c}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✖', g.frog.x * c + c / 2, top + g.frog.y * c + c / 2); }
      else frog(ctx, g.frog.x * c + c / 2, top + g.frog.y * c + c / 2, c, '#7dff5c');
      if (g.cross) {
        const x = g.cross; const cx = x.x * c + c / 2; const cy = top + x.y * c + c / 2;
        ctx.strokeStyle = x.reload > 0 || x.shots <= 0 ? '#9ca3af' : '#ff3b3b'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, c * 0.45, 0, Math.PI * 2); ctx.moveTo(cx - c * 0.7, cy); ctx.lineTo(cx + c * 0.7, cy); ctx.moveTo(cx, cy - c * 0.7); ctx.lineTo(cx, cy + c * 0.7); ctx.stroke();
        hud(ctx, W, H, `SCORE ${g.score}   ${'🐸'.repeat(Math.max(0, g.lives))}`, `🎯 ${x.shots}${x.reload > 0 ? ` (${Math.ceil(x.reload)}s)` : ''}   LEVEL ${g.level}`);
      } else       hud(ctx, W, H, `SCORE ${g.score}   ${'🐸'.repeat(Math.max(0, g.lives))}`, `LEVEL ${g.level}  HIGH ${Math.max(g.high, g.score)}`);
    },
  });
  Games.frogger.setPlayers = (p) => { FRG.players = p === 2 ? 2 : 1; };
  function resetFrog(g) { g.frog = { x: 6, y: 12 }; g.dead = 0; }
  function die(g) { g.lives -= 1; g.dead = 1; }
  function frog(ctx, x, y, c, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, c * 0.34, c * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - c * 0.3, y - c * 0.22, c * 0.1, 0, 7); ctx.arc(x + c * 0.3, y - c * 0.22, c * 0.1, 0, 7); ctx.arc(x - c * 0.3, y + c * 0.22, c * 0.1, 0, 7); ctx.arc(x + c * 0.3, y + c * 0.22, c * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - c * 0.12, y - c * 0.12, c * 0.06, 0, 7); ctx.arc(x + c * 0.12, y - c * 0.12, c * 0.06, 0, 7); ctx.fill();
  }

  // ------------------------------------------------------------ Asteroids (1 or 2 ships)
  const AS = { players: 1 };
  const AS_COLORS = ['#fff', '#f87171'];
  Games.asteroids = makeGame({
    key: 'asteroids', aspect: 4 / 3,
    init(g, W, H) {
      g.score = 0; g.level = 1; g.W = W; g.H = H; g.bullets = []; g.rocks = [];
      g.ships = Array.from({ length: AS.players }, (_, i) => spawnShip(g, i));
      spawnRocks(g, 4);
    },
    press(g, k) {
      const p = k.startsWith('p2:') ? 1 : 0; const key = k.replace('p2:', '');
      const s = g.ships[p]; if (s && key === 'fire') fire(g, s);
    },
    update(g, dt, held) {
      g.ships.forEach((s, i) => {
        const has = (k) => held.has(i === 1 ? `p2:${k}` : k);
        if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0 && s.lives > 0) Object.assign(s, spawnShip(g, i, s)); return; }
        if (has('left')) s.a -= 3.6 * dt;
        if (has('right')) s.a += 3.6 * dt;
        if (has('up')) { s.vx += Math.cos(s.a) * 260 * dt; s.vy += Math.sin(s.a) * 260 * dt; s.thrust = true; } else s.thrust = false;
        if (has('down')) { s.vx *= 1 - 3 * dt; s.vy *= 1 - 3 * dt; } // brake
        if (has('fire')) { s.cool -= dt; if (s.cool <= 0) fire(g, s); } else s.cool = 0;
        s.vx *= 1 - 0.6 * dt; s.vy *= 1 - 0.6 * dt;
        s.x = wrap(s.x + s.vx * dt, g.W); s.y = wrap(s.y + s.vy * dt, g.H);
        if (s.inv > 0) s.inv -= dt;
      });
      if (g.ships.every((s) => s.lives <= 0 && s.dead <= 0)) { g.gameOver(); return; }
      for (const b of g.bullets) { b.x = wrap(b.x + b.vx * dt, g.W); b.y = wrap(b.y + b.vy * dt, g.H); b.t -= dt; }
      g.bullets = g.bullets.filter((b) => b.t > 0);
      for (const r of g.rocks) { r.x = wrap(r.x + r.vx * dt, g.W); r.y = wrap(r.y + r.vy * dt, g.H); r.a += r.spin * dt; }
      // bullets vs rocks
      const scale = g.W / 800;
      for (const b of g.bullets) {
        const hit = g.rocks.find((r) => (r.x - b.x) ** 2 + (r.y - b.y) ** 2 < (r.r * scale) ** 2);
        if (!hit) continue;
        b.t = 0;
        const pts = hit.r >= 40 ? 20 : hit.r >= 22 ? 50 : 100;
        g.score += pts; if (g.ships[b.owner]) g.ships[b.owner].score += pts;
        g.rocks = g.rocks.filter((r) => r !== hit);
        if (hit.r >= 22) for (let i = 0; i < 2; i++) g.rocks.push(makeRock(g, hit.x, hit.y, hit.r / 2));
      }
      g.bullets = g.bullets.filter((b) => b.t > 0);
      if (!g.rocks.length) { g.level += 1; spawnRocks(g, 3 + g.level); }
      // ships vs rocks
      for (const s of g.ships) {
        if (s.dead > 0 || s.inv > 0 || s.lives <= 0) continue;
        const hit = g.rocks.some((r) => (r.x - s.x) ** 2 + (r.y - s.y) ** 2 < ((r.r + 10) * scale) ** 2);
        if (hit) { s.lives -= 1; s.dead = 1.5; }
      }
    },
    draw(g, ctx, W, H) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); // edge of space: things wrap around here
      const scale = W / 800;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (const r of g.rocks) {
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.beginPath();
        r.verts.forEach((v, i) => { const x = Math.cos(v.a) * v.d * r.r * scale; const y = Math.sin(v.a) * v.d * r.r * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      for (const b of g.bullets) { ctx.fillStyle = AS_COLORS[b.owner] || '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.5 * scale, 0, 7); ctx.fill(); }
      g.ships.forEach((s, i) => {
        if (s.lives <= 0 || s.dead > 0 || (s.inv > 0 && Math.floor(s.inv * 10) % 2 === 1)) return;
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); const L = 16 * scale; ctx.strokeStyle = AS_COLORS[i];
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.8, L * 0.7); ctx.lineTo(-L * 0.4, 0); ctx.lineTo(-L * 0.8, -L * 0.7); ctx.closePath(); ctx.stroke();
        if (s.thrust) { ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-L * 0.5, L * 0.3); ctx.lineTo(-L * (1.1 + Math.random() * 0.4), 0); ctx.lineTo(-L * 0.5, -L * 0.3); ctx.stroke(); }
        ctx.restore();
      });
      if (g.ships.length === 1) {
        const s = g.ships[0];
        hud(ctx, W, H, `SCORE ${g.score}   ${'▲'.repeat(Math.max(0, s.lives))}`, `LEVEL ${g.level}  HIGH ${Math.max(g.high, g.score)}`);
      } else {
        const [a, b] = g.ships;
        hud(ctx, W, H, `P1 ${a.score}  ${'▲'.repeat(Math.max(0, a.lives))}`, `${'▲'.repeat(Math.max(0, b.lives))}  ${b.score} P2   LEVEL ${g.level}`);
      }
    },
  });
  Games.asteroids.setPlayers = (p) => { AS.players = p === 2 ? 2 : 1; };

  // ---- Tetris (1 or 2 players; player 2 uses the second controller or WASD) ------------------
  const TT = { cols: 10, rows: 20, players: 1 };
  const TT_SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[0, 1], [1, 1], [2, 1], [1, 0]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  };
  const TT_COLORS = { I: '#22d3ee', O: '#fde047', T: '#c084fc', S: '#4ade80', Z: '#f87171', J: '#60a5fa', L: '#fb923c', G: '#6b7280' };
  const ttRotate = (cells) => { const size = cells.some(([x, y]) => x === 3 || y === 3) ? 4 : 3; return cells.map(([x, y]) => [size - 1 - y, x]); };
  function ttPiece() { const keys = Object.keys(TT_SHAPES); const t = keys[Math.floor(Math.random() * keys.length)]; return { t, cells: TT_SHAPES[t].map((c) => c.slice()), x: 3, y: -1 }; }
  function ttFits(b, cells, x, y) {
    return cells.every(([cx, cy]) => { const gx = x + cx; const gy = y + cy; return gx >= 0 && gx < TT.cols && gy < TT.rows && (gy < 0 || !b.grid[gy][gx]); });
  }
  function ttBoard(n) {
    return { n, grid: Array.from({ length: TT.rows }, () => Array(TT.cols).fill(null)), cur: ttPiece(), next: ttPiece(), score: 0, lines: 0, level: 1, timer: 0, over: false, flash: 0 };
  }
  function ttLock(g, b) {
    for (const [cx, cy] of b.cur.cells) { const gy = b.cur.y + cy; if (gy < 0) { b.over = true; return; } b.grid[gy][b.cur.x + cx] = b.cur.t; }
    let cleared = 0;
    for (let y = TT.rows - 1; y >= 0; y -= 1) {
      if (b.grid[y].every(Boolean)) { b.grid.splice(y, 1); b.grid.unshift(Array(TT.cols).fill(null)); cleared += 1; y += 1; }
    }
    if (cleared) {
      b.lines += cleared; b.score += [0, 100, 300, 500, 800][cleared] * b.level; b.level = 1 + Math.floor(b.lines / 10); b.flash = 0.25;
      // Two players: clearing 2+ lines drops garbage on the other board.
      const other = g.boards.find((x) => x !== b);
      if (other && cleared >= 2) for (let i = 0; i < cleared - 1; i += 1) { other.grid.shift(); const row = Array(TT.cols).fill('G'); row[Math.floor(Math.random() * TT.cols)] = null; other.grid.push(row); }
    }
    b.cur = b.next; b.next = ttPiece();
    if (!ttFits(b, b.cur.cells, b.cur.x, b.cur.y)) b.over = true;
  }
  function ttStep(g, b) { if (ttFits(b, b.cur.cells, b.cur.x, b.cur.y + 1)) b.cur.y += 1; else ttLock(g, b); }
  Games.tetris = makeGame({
    key: 'tetris',
    get aspect() { return TT.players === 2 ? 1.5 : 0.75; },
    init(g) { g.boards = Array.from({ length: TT.players }, (_, i) => ttBoard(i + 1)); g.score = 0; g.winner = null; },
    press(g, k) {
      const p = k.startsWith('p2:') ? 1 : 0; const key = k.replace('p2:', '');
      const b = g.boards[p]; if (!b || b.over) return;
      const c = b.cur;
      if (key === 'left' && ttFits(b, c.cells, c.x - 1, c.y)) c.x -= 1;
      else if (key === 'right' && ttFits(b, c.cells, c.x + 1, c.y)) c.x += 1;
      else if (key === 'up' || key === 'flip') { // 'flip' (the B button) turns the other way
        let r = ttRotate(c.cells); if (key === 'flip') r = ttRotate(ttRotate(r));
        for (const dx of [0, -1, 1, -2, 2]) if (ttFits(b, r, c.x + dx, c.y)) { c.cells = r; c.x += dx; break; }
      }
      else if (key === 'fire') { while (ttFits(b, c.cells, c.x, c.y + 1)) { c.y += 1; b.score += 2; } ttLock(g, b); }
    },
    update(g, dt, held) {
      for (const b of g.boards) {
        if (b.over) continue;
        const soft = held.has(b.n === 2 ? 'p2:down' : 'down');
        const dirKey = held.has(b.n === 2 ? 'p2:left' : 'left') ? -1 : held.has(b.n === 2 ? 'p2:right' : 'right') ? 1 : 0; // holding left/right zooms the piece sideways
        if (dirKey) { b.hT = (b.hT || 0) + dt; while (b.hT >= 0.09) { b.hT -= 0.09; if (ttFits(b, b.cur.cells, b.cur.x + dirKey, b.cur.y)) b.cur.x += dirKey; } } else b.hT = -0.12;
        const gravity = Math.max(0.12, 0.8 - (b.level - 1) * 0.07);
        const interval = soft ? Math.min(0.11, gravity / 2) : gravity; // holding down: faster fall, never a slam
        b.timer += dt; b.flash = Math.max(0, b.flash - dt);
        while (b.timer >= interval) { b.timer -= interval; ttStep(g, b); if (soft) b.score += 1; if (b.over) break; }
      }
      if (g.boards.length === 1) { g.score = g.boards[0].score; if (g.boards[0].over) g.gameOver(); }
      else if (g.boards.some((b) => b.over)) {
        const alive = g.boards.find((b) => !b.over); g.winner = alive ? alive.n : null; g.score = Math.max(...g.boards.map((b) => b.score));
        g.summary = [g.winner ? `Player ${g.winner} wins!` : 'Draw!', ...g.boards.map((b) => `P${b.n}: ${b.score} points · ${b.lines} lines · level ${b.level}`)];
        g.gameOver();
      }
    },
    draw(g, ctx, W, H) {
      ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, W, H);
      const n = g.boards.length; const slotW = W / n;
      g.boards.forEach((b, i) => {
        const cell = Math.floor(Math.min((slotW - 90) / TT.cols, (H - 50) / TT.rows));
        const bw = cell * TT.cols; const bh = cell * TT.rows; const ox = Math.floor(i * slotW + (slotW - bw - 70) / 2); const oy = Math.floor((H - bh) / 2) + 10;
        ctx.fillStyle = b.flash > 0 ? '#1f2937' : '#111827'; ctx.fillRect(ox, oy, bw, bh);
        ctx.strokeStyle = '#374151'; ctx.lineWidth = 2; ctx.strokeRect(ox - 1, oy - 1, bw + 2, bh + 2);
        const block = (gx, gy, t, alpha = 1) => { if (gy < 0) return; ctx.globalAlpha = alpha; ctx.fillStyle = TT_COLORS[t]; ctx.fillRect(ox + gx * cell + 1, oy + gy * cell + 1, cell - 2, cell - 2); ctx.globalAlpha = 1; };
        b.grid.forEach((row, y) => row.forEach((t, x) => { if (t) block(x, y, t); }));
        // Ghost piece, then the falling piece
        let gy = b.cur.y; while (ttFits(b, b.cur.cells, b.cur.x, gy + 1)) gy += 1;
        for (const [cx, cy] of b.cur.cells) block(b.cur.x + cx, gy + cy, b.cur.t, 0.25);
        for (const [cx, cy] of b.cur.cells) block(b.cur.x + cx, b.cur.y + cy, b.cur.t);
        // Side panel: score, lines, level, next piece
        const px = ox + bw + 12; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = `bold ${Math.max(12, Math.round(cell * 0.7))}px ${FONT}`;
        const lines = n === 2 ? [`P${b.n}`, `${b.score}`, `${b.lines} lines`, `Lv ${b.level}`] : [`${b.score}`, `${b.lines} lines`, `Lv ${b.level}`, `High ${g.high}`];
        lines.forEach((s, j) => ctx.fillText(s, px, oy + j * cell * 1.1));
        const nx = px; const ny = oy + cell * 5; const mini = Math.max(6, Math.floor(cell * 0.55));
        ctx.fillStyle = '#9ca3af'; ctx.font = `${Math.max(10, Math.round(cell * 0.5))}px ${FONT}`; ctx.fillText('next', nx, ny - cell * 0.7);
        for (const [cx, cy] of b.next.cells) { ctx.fillStyle = TT_COLORS[b.next.t]; ctx.fillRect(nx + cx * mini, ny + cy * mini, mini - 1, mini - 1); }
        if (b.over && n === 2) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ox, oy, bw, bh); }
      });
      if (g.status === 'over' && n === 2) {
        ctx.fillStyle = '#ffe600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${Math.round(W / 16)}px ${FONT}`;
        ctx.fillText(g.winner ? `Player ${g.winner} wins!` : 'Draw!', W / 2, H * 0.82);
      }
    },
  });
  Games.tetris.setPlayers = (p) => { TT.players = p === 2 ? 2 : 1; };

  // ---- Shared bits for the two-player games -----------------------------------------
  const P_COLORS = ['#3b82f6', '#ef4444'];
  const pkey = (k, p) => (p === 1 ? `p2:${k}` : k);            // key name for player index p (0 or 1)
  const splitKey = (k) => (k.startsWith('p2:') ? [1, k.slice(3)] : [0, k]);

  // ---- Bump Battle: knock the other player off the platform (best of 3) ----------------
  const BB = { players: 1 };
  function bbFighter(i, W, H) {
    return { i, x: W * (i === 0 ? 0.35 : 0.65), y: H * 0.7, vx: 0, vy: 0, r: Math.max(18, W / 32), face: i === 0 ? 1 : -1, dash: 0, cool: 0, hit: 0, ai: i === 1 && BB.players === 1, aiTimer: 0, wins: 0, onGround: false };
  }
  function bbReset(g, W, H) {
    const wins = g.f ? g.f.map((f) => f.wins) : [0, 0];
    g.f = [bbFighter(0, W, H), bbFighter(1, W, H)];
    g.f[0].wins = wins[0]; g.f[1].wins = wins[1];
    g.platform = { x1: W * 0.15, x2: W * 0.85, y: H * 0.7 + g.f[0].r };
    g.roundOver = 0; g.banner = ''; g.W = W; g.H = H;
  }
  Games.bump = makeGame({
    key: 'bump', aspect: 16 / 9,
    init(g, W, H) { g.f = null; bbReset(g, W, H); g.score = 0; g.winner = null; g.round = 1; },
    press(g, k) {
      const [p, key] = splitKey(k);
      const f = g.f[p]; if (!f || f.ai || g.roundOver) return;
      if (key === 'up' && f.onGround) f.vy = -g.H * 1.15;
      if (key === 'fire' && f.cool <= 0) { f.dash = 0.18; f.cool = 0.6; }
    },
    update(g, dt, held) {
      const { W, H } = g; const grav = H * 2.6;
      if (g.roundOver) {
        g.roundOver -= dt;
        if (g.roundOver <= 0) {
          if (g.f.some((f) => f.wins >= 2)) { g.winner = g.f.findIndex((f) => f.wins >= 2) + 1; g.score = g.f[0].wins * 100; g.gameOver(); }
          else { g.round += 1; bbReset(g, W, H); }
        }
        return;
      }
      g.f.forEach((f, i) => {
        const o = g.f[1 - i];
        let left = held.has(pkey('left', i)); let right = held.has(pkey('right', i));
        if (f.ai) {
          f.aiTimer -= dt;
          const dx = o.x - f.x; left = dx < -f.r * 0.5; right = dx > f.r * 0.5;
          if (f.aiTimer <= 0) {
            f.aiTimer = 0.5 + Math.random() * 0.8;
            if (Math.abs(dx) < f.r * 4 && f.cool <= 0) { f.dash = 0.18; f.cool = 0.9; }
            if (f.onGround && Math.random() < 0.3) f.vy = -H * 1.1;
          }
          // Near an edge, step back from it.
          if (f.x < g.platform.x1 + f.r * 1.5) { right = true; left = false; }
          if (f.x > g.platform.x2 - f.r * 1.5) { left = true; right = false; }
        }
        const speed = W * 0.45;
        if (f.dash > 0) { f.dash -= dt; f.vx = f.face * W * 1.4; }
        else { f.vx = (right ? speed : 0) - (left ? speed : 0); if (left) f.face = -1; if (right) f.face = 1; }
        f.cool -= dt; f.hit = Math.max(0, f.hit - dt);
        f.vy += grav * dt; f.x += f.vx * dt; f.y += f.vy * dt;
        f.onGround = false;
        if (f.x > g.platform.x1 - f.r * 0.3 && f.x < g.platform.x2 + f.r * 0.3 && f.y + f.r >= g.platform.y && f.vy >= 0 && f.y + f.r < g.platform.y + f.r) {
          f.y = g.platform.y - f.r; f.vy = 0; f.onGround = true;
        }
      });
      // Bumping: a dash that connects sends the other player flying; plain contact just shoves.
      const [a, b] = g.f; const dx = b.x - a.x; const dy = b.y - a.y; const dist = Math.hypot(dx, dy) || 1;
      if (dist < a.r + b.r) {
        const nx = dx / dist;
        const fling = (from, to, dir) => { to.vx += nx * dir * W * 2.6; /* a landed bump really sends them flying */ to.vy = Math.min(to.vy, -H * 0.45); to.hit = 0.25; from.dash = 0; };
        if (a.dash > 0) fling(a, b, 1);
        else if (b.dash > 0) fling(b, a, -1);
        else { const overlap = a.r + b.r - dist; a.x -= (nx * overlap) / 2; b.x += (nx * overlap) / 2; a.vx -= nx * W * 0.4; b.vx += nx * W * 0.4; }
      }
      g.f.forEach((f, i) => {
        if (f.y - f.r > H) { const w = g.f[1 - i]; w.wins += 1; g.banner = `${w.ai ? 'Computer' : `Player ${w.i + 1}`} wins round ${g.round}!`; g.roundOver = 1.6; }
      });
    },
    draw(g, ctx, W, H) {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1e1b4b'); sky.addColorStop(1, '#312e81');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#334155'; ctx.fillRect(g.platform.x1, g.platform.y, g.platform.x2 - g.platform.x1, H * 0.06);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(g.platform.x1, g.platform.y, g.platform.x2 - g.platform.x1, H * 0.015);
      g.f.forEach((f, i) => {
        ctx.save(); ctx.translate(f.x, f.y);
        ctx.fillStyle = f.hit > 0 ? '#fff' : P_COLORS[i]; ctx.beginPath(); ctx.arc(0, 0, f.r, 0, Math.PI * 2); ctx.fill();
        if (f.dash > 0) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, f.r + 6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.face * f.r * 0.35, -f.r * 0.2, f.r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(f.face * f.r * 0.45, -f.r * 0.2, f.r * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.font = `bold ${Math.round(W / 30)}px ${FONT}`;
      ctx.textAlign = 'left'; ctx.fillText(`P1 ${'★'.repeat(g.f[0].wins)}${'☆'.repeat(2 - g.f[0].wins)}`, 16, 12);
      ctx.textAlign = 'right'; ctx.fillText(`${'★'.repeat(g.f[1].wins)}${'☆'.repeat(2 - g.f[1].wins)} ${g.f[1].ai ? 'CPU' : 'P2'}`, W - 16, 12);
      ctx.textAlign = 'center'; ctx.font = `${Math.round(W / 40)}px ${FONT}`; ctx.fillStyle = '#c7d2fe';
      ctx.fillText(`Round ${g.round} · ◀ ▶ move · ▲ jump · ● bump`, W / 2, 14);
      if (g.banner && g.roundOver > 0) { ctx.fillStyle = '#fde047'; ctx.font = `bold ${Math.round(W / 16)}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(g.banner, W / 2, H * 0.4); }
      if (g.status === 'over') { ctx.fillStyle = '#fde047'; ctx.font = `bold ${Math.round(W / 16)}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(g.winner === 2 && g.f[1].ai ? 'Computer wins!' : `Player ${g.winner} wins!`, W / 2, H * 0.82); }
    },
  });
  Games.bump.setPlayers = (p) => { BB.players = p === 2 ? 2 : 1; };

  // ---- Monster Brawl: 1-2 players walk the street and punch silly monsters (co-op) --------
  const MB = { players: 1 };
  const MB_MONSTERS = ['👾', '🧟', '🐙', '🤖', '👹'];
  Games.brawl = makeGame({
    key: 'brawl', aspect: 16 / 9,
    init(g, W, H) {
      g.W = W; g.H = H; g.score = 0; g.wave = 0; g.mobs = []; g.spawnT = 0; g.punches = []; g.t = 0;
      g.p = Array.from({ length: MB.players }, (_, i) => ({ i, x: W * (0.2 + i * 0.1), y: H * 0.7, face: 1, hp: 5, punch: 0, swing: 1, cool: 0, hurt: 0, down: false, size: Math.max(26, W / 24), hits: 0, charge: 0, superT: 0, kbx: 0 }));
      g.bursts = [];
    },
    press(g, k) {
      const [p, key] = splitKey(k); const f = g.p[p]; if (!f || f.down) return;
      const hit = (m, dir, power) => { m.hp -= 1; m.hurt = 0.25; m.kbx = dir * f.size * power; f.hits += 1; if (f.hits % 10 === 0) f.charge = Math.min(3, f.charge + 1); if (m.hp <= 0) g.score += 10 * m.tier; };
      // A swings to the right, B to the left; ● on the touch pad and Space swing the way the hero faces.
      const dir = key === 'swingR' ? 1 : key === 'swingL' ? -1 : key === 'fire' ? f.face : 0;
      if (dir && f.cool <= 0) {
        f.punch = 0.18; f.cool = 0.3; f.swing = dir; // the hero keeps facing the way they run; the sword goes where the button says
        const reach = f.size * 4.8; // a sword: three times the old punch
        let landed = false;
        for (const m of g.mobs) {
          if (Math.abs(m.y - f.y) < f.size * 1.1 && (m.x - f.x) * dir > 0 && Math.abs(m.x - f.x) < reach + m.size) { hit(m, dir, 2.2); landed = true; }
        }
        if (landed) f.kbx = -dir * f.size * 0.5; // the hero recoils a little too
        g.punches.push({ x: f.x + dir * f.size * 2.4, y: f.y - f.size * 0.3, t: 0.18, dir });
      }
      if (key === 'super' && f.charge > 0 && f.superT <= 0) {
        f.charge -= 1; f.superT = 0.5;
        const radius = f.size * 4 * 1.6 + f.size; // four sword-swings wide
        for (const m of g.mobs) if (Math.hypot(m.x - f.x, m.y - f.y) < radius + m.size) { const d = Math.sign(m.x - f.x) || 1; hit(m, d, 4); m.hp = 0; g.score += 10 * m.tier; }
        g.bursts.push({ x: f.x, y: f.y, r: radius, t: 0.5 });
      }
    },
    update(g, dt, held) {
      const { W, H } = g; g.t += dt;
      const top = H * 0.48; const bottom = H * 0.9;
      g.p.forEach((f, i) => {
        if (f.down) return;
        const sp = W * 0.35;
        const vx = (held.has(pkey('right', i)) ? sp : 0) - (held.has(pkey('left', i)) ? sp : 0);
        const vy = (held.has(pkey('down', i)) ? sp * 0.7 : 0) - (held.has(pkey('up', i)) ? sp * 0.7 : 0);
        if (vx) f.face = vx > 0 ? 1 : -1;
        f.x = Math.max(f.size, Math.min(W - f.size, f.x + vx * dt)); f.y = Math.max(top, Math.min(bottom, f.y + vy * dt));
        f.punch = Math.max(0, f.punch - dt); f.cool -= dt; f.hurt = Math.max(0, f.hurt - dt); f.superT = Math.max(0, f.superT - dt);
        if (f.kbx) { f.x = Math.max(f.size, Math.min(W - f.size, f.x + f.kbx * 12 * dt)); f.kbx *= Math.max(0, 1 - 10 * dt); if (Math.abs(f.kbx) < 1) f.kbx = 0; }
      });
      g.bursts = (g.bursts || []).map((b) => ({ ...b, t: b.t - dt })).filter((b) => b.t > 0);
      // Waves: more and tougher monsters as the score climbs.
      g.spawnT -= dt;
      const alive = g.mobs.length;
      if (alive === 0 || (g.spawnT <= 0 && alive < 3 + Math.floor(g.wave / 2))) {
        if (alive === 0) g.wave += 1;
        g.spawnT = Math.max(1.2, 4 - g.wave * 0.3);
        const tier = 1 + Math.floor(Math.random() * Math.min(3, 1 + g.wave / 3));
        const fromLeft = Math.random() < 0.3;
        g.mobs.push({ x: fromLeft ? -40 : W + 40, y: top + Math.random() * (bottom - top), hp: 1 + tier, tier, size: 22 + tier * 8, face: fromLeft ? 1 : -1, emoji: MB_MONSTERS[(tier + g.wave) % MB_MONSTERS.length], hurt: 0, atk: 0, speed: W * (0.09 + tier * 0.02 + Math.min(0.1, g.wave * 0.01)) });
      }
      g.mobs = g.mobs.filter((m) => m.hp > 0);
      for (const m of g.mobs) {
        m.hurt = Math.max(0, m.hurt - dt); m.atk -= dt;
        if (m.kbx) { m.x += m.kbx * 12 * dt; m.kbx *= Math.max(0, 1 - 8 * dt); if (Math.abs(m.kbx) < 1) m.kbx = 0; continue; } // knocked back: no chasing this frame
        const targets = g.p.filter((f) => !f.down); if (!targets.length) continue;
        const t = targets.reduce((a, b) => (Math.hypot(b.x - m.x, b.y - m.y) < Math.hypot(a.x - m.x, a.y - m.y) ? b : a));
        const dx = t.x - m.x; const dy = t.y - m.y; const d = Math.hypot(dx, dy) || 1;
        if (d > m.size + t.size * 0.6) { m.x += (dx / d) * m.speed * dt; m.y += (dy / d) * m.speed * dt * 0.7; m.face = dx > 0 ? 1 : -1; }
        else if (m.atk <= 0 && m.hurt <= 0) { m.atk = 1.1; t.hp -= 1; t.hurt = 0.4; t.kbx = m.face * t.size * 1.2; if (t.hp <= 0) t.down = true; }
      }
      g.punches = g.punches.map((p) => ({ ...p, t: p.t - dt })).filter((p) => p.t > 0);
      if (g.p.every((f) => f.down)) g.gameOver();
    },
    draw(g, ctx, W, H) {
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0f172a'); sky.addColorStop(0.45, '#7c3aed'); sky.addColorStop(0.46, '#4c1d95'); sky.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i += 1) { ctx.fillStyle = i % 2 ? '#3730a3' : '#312e81'; ctx.fillRect((i * W) / 12 - ((g.t * W * 0.05) % (W / 6)), H * 0.46, W / 12, H * 0.54); }
      const drawAll = [...g.mobs.map((m) => ({ ...m, kind: 'mob' })), ...g.p.map((f) => ({ ...f, kind: 'p' }))].sort((a, b) => a.y - b.y);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const o of drawAll) {
        ctx.save(); ctx.translate(o.x, o.y); if (o.face < 0) ctx.scale(-1, 1);
        ctx.globalAlpha = o.hurt > 0 ? 0.5 : (o.down ? 0.3 : 1);
        ctx.font = `${Math.round(o.size * 1.8)}px ${FONT}`;
        ctx.fillText(o.kind === 'mob' ? o.emoji : (o.i === 0 ? '🦸' : '🦸‍♀️'), 0, 0);
        if (o.kind === 'p' && o.punch > 0) { ctx.font = `${Math.round(o.size * 1.6)}px ${FONT}`; ctx.save(); ctx.scale((o.swing || 1) * o.face, 1); ctx.rotate(-0.6 + (0.18 - o.punch) * 6); ctx.fillText('🗡️', o.size * 2.2, -o.size * 0.3); ctx.restore(); }
        ctx.restore();
      }
      for (const p of g.punches) { ctx.fillStyle = `rgba(253,224,71,${Math.max(0, p.t / 0.18)})`; ctx.font = `bold ${Math.round(W / 40)}px ${FONT}`; ctx.fillText('SLASH', p.x, p.y - 30); }
      for (const b of (g.bursts || [])) { ctx.strokeStyle = `rgba(253,224,71,${b.t / 0.5})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1 - b.t / 0.5) + 10, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.font = `bold ${Math.round(W / 30)}px ${FONT}`;
      g.p.forEach((f, i) => { ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.fillText(`${i === 0 ? 'P1 ' : ''}${'❤️'.repeat(Math.max(0, f.hp))}${'🖤'.repeat(Math.max(0, 5 - f.hp))}${i === 1 ? ' P2' : ''}`, i === 0 ? 16 : W - 16, 12); });
      ctx.textAlign = 'center'; ctx.fillText(`Wave ${g.wave} · Score ${g.score}`, W / 2, 12);
      ctx.font = `${Math.round(W / 44)}px ${FONT}`; ctx.fillStyle = '#c4b5fd'; ctx.fillText('◀ ▶ ▲ ▼ move · A swing right · B swing left · X super', W / 2, 12 + W / 26);
      g.p.forEach((f, i) => { const s = `SUPER ${'★'.repeat(f.charge)}${'☆'.repeat(3 - f.charge)} ${f.hits % 10}/10`; ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.fillStyle = f.charge ? '#fde047' : '#c4b5fd'; ctx.fillText(s, i === 0 ? 16 : W - 16, 12 + W / 26); });
    },
  });
  Games.brawl.setPlayers = (p) => { MB.players = p === 2 ? 2 : 1; };

  // ---- Pong: first to 7 (1 player vs the computer, or 2 players) --------------------------
  const PG = { players: 1 };
  function pgServe(g, dir) {
    const { W, H } = g; const ang = (Math.random() * 0.6 - 0.3) * Math.PI;
    g.ball = { x: W / 2, y: H / 2, vx: Math.cos(ang) * W * 0.45 * dir, vy: Math.sin(ang) * W * 0.45, r: Math.max(6, W / 90) };
    g.serveT = 0.8;
  }
  Games.pong = makeGame({
    key: 'pong', aspect: 16 / 9,
    init(g, W, H) {
      g.W = W; g.H = H; g.score = 0; g.pts = [0, 0]; g.winner = null;
      const ph = H * 0.18; const pw = Math.max(8, W / 70);
      g.pads = [{ x: W * 0.04, y: H / 2 - ph / 2, w: pw, h: ph, ai: false }, { x: W * 0.96 - pw, y: H / 2 - ph / 2, w: pw, h: ph, ai: PG.players === 1 }];
      g.rally = 0; pgServe(g, Math.random() < 0.5 ? -1 : 1);
    },
    update(g, dt, held) {
      const { W, H } = g; const b = g.ball;
      g.pads.forEach((p, i) => {
        const sp = H * 0.9;
        if (p.ai) { const target = b.y - p.h / 2 + (b.vx > 0 ? 0 : (H / 2 - p.y - p.h / 2) * 0.1); const diff = target - p.y; p.y += Math.max(-sp * 0.75 * dt, Math.min(sp * 0.75 * dt, diff)); }
        else { const up = held.has(pkey('up', i)); const down = held.has(pkey('down', i)); p.y += ((down ? sp : 0) - (up ? sp : 0)) * dt; }
        p.y = Math.max(0, Math.min(H - p.h, p.y));
      });
      if (g.serveT > 0) { g.serveT -= dt; return; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
      g.pads.forEach((p, i) => {
        const towards = i === 0 ? b.vx < 0 : b.vx > 0;
        if (!towards) return;
        const withinY = b.y + b.r > p.y && b.y - b.r < p.y + p.h;
        const hitX = i === 0 ? b.x - b.r <= p.x + p.w && b.x > p.x : b.x + b.r >= p.x && b.x < p.x + p.w;
        if (withinY && hitX) {
          const rel = ((b.y - (p.y + p.h / 2)) / (p.h / 2)); // -1 top .. 1 bottom
          const speed = Math.min(W * 1.1, Math.hypot(b.vx, b.vy) * 1.05 + W * 0.02);
          const ang = rel * 0.9;
          b.vx = Math.cos(ang) * speed * (i === 0 ? 1 : -1); b.vy = Math.sin(ang) * speed;
          b.x = i === 0 ? p.x + p.w + b.r : p.x - b.r; g.rally += 1;
        }
      });
      if (b.x < -b.r * 2 || b.x > W + b.r * 2) {
        const scorer = b.x < 0 ? 1 : 0; g.pts[scorer] += 1; g.rally = 0;
        if (g.pts[scorer] >= 7) { g.winner = scorer + 1; g.score = g.pts[0] * 10; g.gameOver(); return; }
        pgServe(g, scorer === 0 ? -1 : 1);
      }
    },
    draw(g, ctx, W, H) {
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#334155'; ctx.setLineDash([H / 40, H / 40]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      g.pads.forEach((p, i) => { ctx.fillStyle = P_COLORS[i]; ctx.fillRect(p.x, p.y, p.w, p.h); });
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, g.ball.r, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `bold ${Math.round(W / 14)}px ${FONT}`;
      ctx.fillStyle = P_COLORS[0]; ctx.fillText(String(g.pts[0]), W * 0.4, 12);
      ctx.fillStyle = P_COLORS[1]; ctx.fillText(String(g.pts[1]), W * 0.6, 12);
      ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.round(W / 44)}px ${FONT}`;
      ctx.fillText(`First to 7 · ▲ ▼ move${g.pads[1].ai ? ' · you are blue' : ' · P1 blue, P2 red'}`, W / 2, H - W / 30);
      if (g.status === 'over') { ctx.fillStyle = '#fde047'; ctx.font = `bold ${Math.round(W / 16)}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(g.winner === 2 && g.pads[1].ai ? 'Computer wins!' : `Player ${g.winner} wins!`, W / 2, H * 0.82); }
    },
  });
  Games.pong.setPlayers = (p) => { PG.players = p === 2 ? 2 : 1; };

  // ---- Jump Quest: an original side-scrolling platformer (1 or 2 players, co-op) -----------------
  // Level legend: # ground/bricks, = floating platform, o coin, e critter, ^ spikes, F flag, P start.
  const JQ = { players: 1, rows: 13 };
  const JQ_LEVELS = [
    [
      '.........................................................................................................',
      '.........................................................................................................',
      '...................................o.o.o.................................................................',
      '.............................o....=====.........o.o.o...........................o.o......................',
      '..........o.o.............=====.................=====.........o.o.o.........o.=====.o....................',
      '.........=====.....................................................=====....=====...=====.................',
      '...................o.o.o..............................o.o.......................................o.o.o....F',
      '..................=======.....e.........o.o.o......=======..........e.e.............o.o.o.....=======...#',
      '.............................====.....=======.....................=======..........=======...............#',
      '.....................................................................................................e...#',
      '..P........e..........e..........e.....................e.......e...........e.e...........e...........e...#',
      '########################....###########....######^^######.....########^^^########....####################',
      '########################....###########....##############.....####################....####################',
    ],
    [
      '.........................................................................................................',
      '..........................o.o.o..........................................................................',
      '.........................=======.........o.o.o...................o.o.o.o.................................',
      '...............o.o.o..........................=====.............=========.........o.o.o..................',
      '..............=======..............o.o......................................e....=======.................',
      '...........................o.o....=====...............o.o.o.o..........======......................o.o.o.',
      '........o.o..............=====.......................=========.................o.o.o...........e..=======',
      '.......=====.....e.................e.............e.............e..............=======...................F',
      '.................====.....====.....=====...^^^..=====......................................e.............#',
      '..........................................^^^^^..........................e.e.........................e..#',
      '..P.....e..........e..........e...........^^^^^...........e.e...........................e...............#',
      '#############....#########....########....^^^^^....###########^^^^^#####....########^^^^#################',
      '#############....#########....########....#####....#################.....########################',
    ],
    [
      '.........................................................................................................',
      '......o.o.o..............................................................o.o.o.o.o.......................',
      '.....=======.........o.o.o......o.o.o..........o.o.o...................===========.......................',
      '....................=======....=======........=======...........o.o..........................o.o.o.......',
      '...............................................................=====.........................=======......',
      '..........o.o.o..........e.......e...................e.e..............o.o.o.....e....e...................',
      '.........=======.......======..=====..............=========..........=======...======.....o.o.o.o.o......',
      '..............................................................................................=========..F',
      '...........e.........e.......e..........e.e.........e.......e..........e..........e.e..........e.........#',
      '.........^^^.......^^^^^...........^^^^^^^^^.................^^^^............^^^^^^^........^^^^^^.......#',
      '..P.....^^^^^.....^^^^^^^.........^^^^^^^^^^^...............^^^^^^..........^^^^^^^^^......^^^^^^^^......#',
      '#####################################################################################################',
      '#####################################################################################################',
    ],
  ];
  const jqTile = (g, c, r) => (r < 0 || r >= JQ.rows || c < 0 || c >= g.cols ? (r >= JQ.rows ? '.' : '.') : (g.map[r][c] || '.'));
  const jqSolid = (t) => t === '#' || t === '=';
  function jqLoad(g, n) {
    const src = JQ_LEVELS[n % JQ_LEVELS.length];
    g.levelIndex = n; g.map = src.map((row) => row.split('')); g.cols = Math.max(...g.map.map((r) => r.length));
    g.critters = []; g.coinsLeft = 0; g.flag = null; g.start = { c: 2, r: 10 };
    g.map.forEach((row, r) => row.forEach((t, c) => {
      if (t === 'P') { g.start = { c, r }; row[c] = '.'; }
      if (t === 'e') { g.critters.push({ x: c + 0.5, y: r + 1, vx: (n % 2 ? -1 : 1) * (2.2 + Math.floor(n / JQ_LEVELS.length) * 0.6), alive: true, squish: 0 }); row[c] = '.'; }
      if (t === 'o') g.coinsLeft += 1;
      if (t === 'F') g.flag = { c, r };
    }));
    g.p.forEach((p, i) => Object.assign(p, { x: g.start.c + 0.5 + i * 0.8, y: g.start.r + 1, vx: 0, vy: 0, ground: false, face: 1, inv: 2, dead: 0 }));
    g.camX = 0; g.banner = `LEVEL ${n + 1}`; g.bannerT = 1.5;
  }
  Games.jump = makeGame({
    key: 'jump', aspect: 16 / 9,
    init(g) {
      g.score = 0; g.coins = 0; g.t = 0; g.won = false; g.viewCols = (16 / 9) * JQ.rows; g.camX = 0;
      g.p = Array.from({ length: JQ.players }, (_, i) => ({ i, lives: 3, out: false }));
      jqLoad(g, 0);
    },
    press(g, k) {
      const p = k.startsWith('p2:') ? 1 : 0; const key = k.replace('p2:', '');
      const f = g.p[p]; if (!f || f.out || f.dead > 0) return;
      if ((key === 'up' || key === 'fire') && f.ground) { f.vy = -14.5; f.ground = false; f.jumpHold = 0.22; }
    },
    update(g, dt, held) {
      g.t += dt; if (g.bannerT > 0) g.bannerT -= dt;
      const has = (f, k) => held.has(f.i === 1 ? `p2:${k}` : k);
      const alivePlayers = g.p.filter((f) => !f.out);
      for (const f of alivePlayers) {
        if (f.dead > 0) { f.dead -= dt; f.y += 6 * dt; if (f.dead <= 0) { if (f.lives <= 0) f.out = true; else Object.assign(f, { x: g.start.c + 0.5, y: g.start.r + 1, vx: 0, vy: 0, inv: 2.5 }); } continue; }
        const acc = 34; const max = 6.5;
        if (has(f, 'left')) { f.vx -= acc * dt; f.face = -1; } else if (has(f, 'right')) { f.vx += acc * dt; f.face = 1; } else f.vx *= Math.max(0, 1 - 12 * dt);
        f.vx = Math.max(-max, Math.min(max, f.vx));
        if (f.jumpHold > 0 && (has(f, 'up') || has(f, 'fire'))) { f.jumpHold -= dt; f.vy -= 22 * dt; } else f.jumpHold = 0; // hold to jump higher
        f.vy = Math.min(22, f.vy + 34 * dt);
        // horizontal move + walls
        f.x += f.vx * dt;
        const w = 0.35; const hTop = 0.85;
        for (const r of [Math.floor(f.y - hTop), Math.floor(f.y - 0.05)]) {
          if (f.vx > 0 && jqSolid(jqTile(g, Math.floor(f.x + w), r))) { f.x = Math.floor(f.x + w) - w - 0.001; f.vx = 0; }
          if (f.vx < 0 && jqSolid(jqTile(g, Math.floor(f.x - w), r))) { f.x = Math.floor(f.x - w) + 1 + w + 0.001; f.vx = 0; }
        }
        // vertical move + floor/ceiling (platforms '=' only block from above)
        f.y += f.vy * dt; f.ground = false;
        const feetR = Math.floor(f.y); const under = [jqTile(g, Math.floor(f.x - w * 0.8), feetR), jqTile(g, Math.floor(f.x + w * 0.8), feetR)];
        if (f.vy >= 0 && under.some((t) => t === '#' || (t === '=' && f.y - f.vy * dt <= feetR + 0.01))) { f.y = feetR; f.vy = 0; f.ground = true; }
        const headR = Math.floor(f.y - hTop);
        if (f.vy < 0 && [jqTile(g, Math.floor(f.x - w * 0.8), headR), jqTile(g, Math.floor(f.x + w * 0.8), headR)].some((t) => t === '#')) { f.y = headR + 1 + hTop; f.vy = 0; }
        f.x = Math.max(w, Math.min(g.cols - w, f.x));
        if (f.inv > 0) f.inv -= dt;
        // coins, spikes, flag
        const cc = Math.floor(f.x); const cr = Math.floor(f.y - 0.4);
        if (jqTile(g, cc, cr) === 'o') { g.map[cr][cc] = '.'; g.coins += 1; g.score += 10; g.coinsLeft -= 1; if (g.coins % 20 === 0) f.lives += 1; }
        if (jqTile(g, cc, Math.floor(f.y - 0.1)) === '^' && f.inv <= 0) { f.lives -= 1; f.dead = 1; f.vy = -6; }
        if (f.y > JQ.rows + 1 && f.dead <= 0) { f.lives -= 1; f.dead = 0.4; }
        if (g.flag && Math.abs(f.x - (g.flag.c + 0.5)) < 0.6 && !g.won) { g.won = true; g.score += 200 + g.coinsLeft * 0; g.banner = 'LEVEL CLEAR!'; g.bannerT = 1.5; setTimeout(() => { if (g.status === 'play') { g.won = false; jqLoad(g, g.levelIndex + 1); } }, 1400); }
      }
      // critters
      for (const m of g.critters) {
        if (!m.alive) { m.squish -= dt; continue; }
        m.x += m.vx * dt;
        const ahead = Math.floor(m.x + Math.sign(m.vx) * 0.45); const below = jqTile(g, ahead, Math.floor(m.y));
        if (jqSolid(jqTile(g, ahead, Math.floor(m.y - 0.5))) || !jqSolid(below)) { m.vx = -m.vx; m.x += m.vx * dt * 2; }
        for (const f of alivePlayers) {
          if (f.dead > 0 || f.inv > 0) continue;
          if (Math.abs(f.x - m.x) < 0.7 && Math.abs((f.y - 0.45) - (m.y - 0.4)) < 0.75) {
            if (f.vy > 2 && f.y - 0.3 < m.y - 0.3) { m.alive = false; m.squish = 0.4; g.score += 50; f.vy = -9; }
            else { f.lives -= 1; f.dead = 1; f.vy = -6; }
          }
        }
      }
      g.critters = g.critters.filter((m) => m.alive || m.squish > 0);
      // camera follows the players
      const xs = alivePlayers.filter((f) => f.dead <= 0).map((f) => f.x);
      if (xs.length) { const target = (Math.min(...xs) + Math.max(...xs)) / 2 - g.viewCols / 2; g.camX += (Math.max(0, Math.min(g.cols - g.viewCols, target)) - g.camX) * Math.min(1, 6 * dt); }
      if (g.p.every((f) => f.out)) { g.summary = [`Score ${g.score} · ${g.coins} coins · level ${g.levelIndex + 1}`]; g.gameOver(); }
    },
    draw(g, ctx, W, H) {
      const T = H / JQ.rows; g.viewCols = W / T;
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(1, '#e0f2fe');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // distant hills
      ctx.fillStyle = '#86efac';
      for (let i = 0; i < 12; i += 1) { const hx = ((i * 9 - g.camX * 0.3) % (g.viewCols + 12) + g.viewCols + 12) % (g.viewCols + 12) - 6; ctx.beginPath(); ctx.arc(hx * T, H * 0.86, T * (2.5 + (i % 3)), Math.PI, 0); ctx.fill(); }
      const c0 = Math.floor(g.camX); const c1 = Math.ceil(g.camX + g.viewCols) + 1; const ox = -g.camX * T;
      for (let r = 0; r < JQ.rows; r += 1) for (let c = c0; c <= c1; c += 1) {
        const t = jqTile(g, c, r); if (t === '.') continue;
        const x = ox + c * T; const y = r * T;
        if (t === '#') { ctx.fillStyle = r > 0 && jqTile(g, c, r - 1) !== '#' ? '#65a30d' : '#92400e'; ctx.fillRect(x, y, T + 0.5, T + 0.5); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 2, y + T * 0.55, T - 4, 2); }
        else if (t === '=') { ctx.fillStyle = '#b45309'; ctx.fillRect(x, y + T * 0.15, T + 0.5, T * 0.55); ctx.fillStyle = '#f59e0b'; ctx.fillRect(x, y + T * 0.15, T + 0.5, T * 0.12); }
        else if (t === 'o') { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(x + T / 2, y + T / 2, T * 0.28 * (0.6 + 0.4 * Math.abs(Math.sin(g.t * 4 + c))), T * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.stroke(); }
        else if (t === '^') { ctx.fillStyle = '#9ca3af'; ctx.beginPath(); for (let k = 0; k < 3; k += 1) { ctx.moveTo(x + (k * T) / 3, y + T); ctx.lineTo(x + (k * T) / 3 + T / 6, y + T * 0.2); ctx.lineTo(x + ((k + 1) * T) / 3, y + T); } ctx.fill(); }
        else if (t === 'F') { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + T * 0.45, y - T * 6, T * 0.1, T * 7); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(x + T * 0.55, y - T * 6); ctx.lineTo(x + T * 1.6, y - T * 5.5); ctx.lineTo(x + T * 0.55, y - T * 5); ctx.fill(); }
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const m of g.critters) {
        ctx.save(); ctx.translate(ox + m.x * T, m.y * T - T * 0.45); if (m.vx > 0) ctx.scale(-1, 1); if (!m.alive) ctx.scale(1, 0.4);
        ctx.font = `${Math.round(T * 0.9)}px ${FONT}`; ctx.fillText('🐢', 0, 0); ctx.restore();
      }
      g.p.forEach((f, i) => {
        if (f.out || (f.inv > 0 && Math.floor(f.inv * 12) % 2 === 1)) return;
        const x = ox + f.x * T; const y = f.y * T;
        ctx.save(); ctx.translate(x, y); if (f.face < 0) ctx.scale(-1, 1); if (f.dead > 0) ctx.rotate(Math.PI);
        const body = i === 0 ? '#2563eb' : '#dc2626'; const cap = i === 0 ? '#1d4ed8' : '#b91c1c';
        ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(-T * 0.3, -T * 0.8, T * 0.6, T * 0.7, T * 0.15); ctx.fill();
        ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(0, -T * 0.95, T * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(0, -T * 1.02, T * 0.28, Math.PI, 0); ctx.fill(); ctx.fillRect(-T * 0.05, -T * 1.05, T * 0.45, T * 0.09);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(T * 0.1, -T * 0.95, T * 0.04, 0, 7); ctx.fill();
        ctx.fillStyle = '#7c2d12'; const step = f.ground && Math.abs(f.vx) > 0.5 ? Math.sin(g.t * 18) * T * 0.12 : 0; ctx.fillRect(-T * 0.28, -T * 0.12, T * 0.22, T * 0.12 + step); ctx.fillRect(T * 0.06, -T * 0.12, T * 0.22, T * 0.12 - step);
        ctx.restore();
      });
      ctx.fillStyle = '#0f172a'; ctx.textBaseline = 'top'; ctx.font = `bold ${Math.round(W / 34)}px ${FONT}`;
      ctx.textAlign = 'left'; ctx.fillText(`SCORE ${g.score}   🪙 ${g.coins}`, 14, 10);
      ctx.textAlign = 'right'; ctx.fillText(`${g.p.map((f, i) => `${g.p.length > 1 ? `P${i + 1} ` : ''}${'❤️'.repeat(Math.max(0, f.lives))}`).join('   ')}   LEVEL ${g.levelIndex + 1}`, W - 14, 10);
      if (g.bannerT > 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 6; ctx.font = `bold ${Math.round(W / 12)}px ${FONT}`; ctx.strokeText(g.banner, W / 2, H * 0.4); ctx.fillText(g.banner, W / 2, H * 0.4); }
    },
  });
  Games.jump.setPlayers = (p) => { JQ.players = p === 2 ? 2 : 1; };
  const wrap = (v, max) => ((v % max) + max) % max;
  // A fresh ship for player i (0 or 1); `prev` keeps lives and score across respawns.
  function spawnShip(g, i = 0, prev = null) {
    const n = AS.players; const x = n === 1 ? g.W / 2 : g.W * (i === 0 ? 0.35 : 0.65);
    return { i, x, y: g.H / 2, a: -Math.PI / 2, vx: 0, vy: 0, dead: 0, inv: 2.5, thrust: false, cool: 0, lives: prev ? prev.lives : 3, score: prev ? prev.score : 0 };
  }
  function makeRock(g, x, y, r) {
    const sp = (40 + Math.random() * 60) * (g.W / 800) * (1 + g.level * 0.1); const a = Math.random() * Math.PI * 2;
    return { x, y, r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 0, spin: (Math.random() - 0.5) * 2,
      verts: Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, d: 0.7 + Math.random() * 0.35 })) };
  }
  function spawnRocks(g, n) {
    for (let i = 0; i < n; i++) {
      let x; let y;
      do { x = Math.random() * g.W; y = Math.random() * g.H; } while ((x - g.W / 2) ** 2 + (y - g.H / 2) ** 2 < (g.W * 0.25) ** 2);
      g.rocks.push(makeRock(g, x, y, 44));
    }
  }
  function fire(g, s) {
    if (!s || s.dead > 0 || s.lives <= 0 || g.bullets.filter((b) => b.owner === s.i).length >= 6) return;
    const sp = 520 * (g.W / 800);
    g.bullets.push({ x: s.x + Math.cos(s.a) * 16, y: s.y + Math.sin(s.a) * 16, vx: Math.cos(s.a) * sp + s.vx, vy: Math.sin(s.a) * sp + s.vy, t: 0.9, owner: s.i });
    s.cool = 0.18;
  }
})();
