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
      g.status = 'over';
      if (g.score > g.high) { g.high = g.score; localStorage.setItem(`fc_${def.key}_high`, String(g.high)); }
    };
    function overlay() {
      if (g.status === 'play') return;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g.status === 'over' ? '#ff5252' : '#ffe600';
      ctx.font = `bold ${Math.round(W / 14)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.status === 'over' ? 'GAME OVER' : 'PAUSED', W / 2, H / 2 - W / 30);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(W / 28)}px ${FONT}`;
      ctx.fillText(g.status === 'over' ? `Score ${g.score} · High ${g.high} · tap ▶ Play again` : 'tap ⏸ to continue', W / 2, H / 2 + W / 24);
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
        g.status = 'play'; held.clear();
        def.init(g, W, H);
        running = true; last = performance.now();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
      },
      stop() { running = false; cancelAnimationFrame(raf); held.clear(); },
      press(k) {
        if (g.status === 'over') { def.init(g, W, H); g.status = 'play'; return; }
        if (g.status === 'paused') g.status = 'play';
        held.add(k);
        if (def.press) def.press(g, k);
      },
      release(k) { held.delete(k); },
      togglePause() { if (g.status === 'play') g.status = 'paused'; else if (g.status === 'paused') g.status = 'play'; },
      restart() { def.init(g, W, H); g.status = 'play'; },
    };
  }

  const hud = (ctx, W, H, left, right) => {
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(W / 30)}px ${FONT}`; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(left, 12, 10);
    ctx.textAlign = 'right'; ctx.fillText(right, W - 12, 10);
  };

  // ---------------------------------------------------------------- Snake
  const SN = { cols: 30, rows: 22 };
  Games.snake = makeGame({
    key: 'snake', aspect: SN.cols / SN.rows,
    init(g) {
      g.score = 0; g.snake = [{ x: 15, y: 11 }, { x: 14, y: 11 }, { x: 13, y: 11 }];
      g.dir = { x: 1, y: 0 }; g.next = g.dir; g.acc = 0; g.interval = 0.16; g.food = null; g.grow = 0; g.flash = 0;
      placeFood(g);
    },
    press(g, k) {
      const d = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[k];
      if (d && !(d.x === -g.dir.x && d.y === -g.dir.y)) g.next = d;
    },
    update(g, dt) {
      g.acc += dt; g.flash += dt;
      if (g.acc < g.interval) return;
      g.acc -= g.interval;
      g.dir = g.next;
      const h = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= SN.cols || h.y >= SN.rows || g.snake.some((s) => s.x === h.x && s.y === h.y)) { g.gameOver(); return; }
      g.snake.unshift(h);
      if (g.food && h.x === g.food.x && h.y === g.food.y) {
        g.score += 10; g.grow += 2; g.interval = Math.max(0.06, g.interval * 0.96); placeFood(g);
      }
      if (g.grow > 0) g.grow -= 1; else g.snake.pop();
    },
    draw(g, ctx, W, H) {
      const c = W / SN.cols; const top = H - SN.rows * c;
      ctx.fillStyle = '#0e2a12'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#123a18'; for (let y = 0; y < SN.rows; y++) for (let x = (y % 2); x < SN.cols; x += 2) ctx.fillRect(x * c, top + y * c, c, c);
      if (g.food) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(g.food.x * c + c / 2, top + g.food.y * c + c / 2, c * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5cbf5c'; ctx.fillRect(g.food.x * c + c / 2 - 1, top + g.food.y * c + c * 0.1, 3, c * 0.2); }
      g.snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#9dff6b' : (i % 2 ? '#5cd65c' : '#48c048');
        const r = c * 0.25; const x = s.x * c + 1; const y = top + s.y * c + 1; const w = c - 2;
        ctx.beginPath(); ctx.roundRect(x, y, w, w, r); ctx.fill();
        if (i === 0) { ctx.fillStyle = '#123a18'; const ex = x + w / 2 + g.dir.x * w * 0.2; const ey = y + w / 2 + g.dir.y * w * 0.2; ctx.beginPath(); ctx.arc(ex - g.dir.y * w * 0.2, ey + g.dir.x * w * 0.2, w * 0.09, 0, 7); ctx.arc(ex + g.dir.y * w * 0.2, ey - g.dir.x * w * 0.2, w * 0.09, 0, 7); ctx.fill(); }
      });
      hud(ctx, W, H, `SCORE ${g.score}`, `HIGH ${Math.max(g.high, g.score)}`);
    },
  });
  function placeFood(g) {
    let p;
    do { p = { x: Math.floor(Math.random() * SN.cols), y: Math.floor(Math.random() * SN.rows) }; } while (g.snake.some((s) => s.x === p.x && s.y === p.y));
    g.food = p;
  }

  // -------------------------------------------------------------- Frogger
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
      g.lanes = LANES.map((l) => ({ ...l, items: [] }));
      for (const l of g.lanes) for (let x = -l.len; x < FR.cols + l.len; x += l.len + l.gap) l.items.push(x + Math.random() * 2);
      resetFrog(g);
    },
    press(g, k) {
      if (g.dead > 0) return;
      const f = g.frog;
      if (k === 'up') f.y -= 1; if (k === 'down') f.y = Math.min(12, f.y + 1);
      if (k === 'left') f.x = Math.max(0, f.x - 1); if (k === 'right') f.x = Math.min(FR.cols - 1, f.x + 1);
      if (k === 'up') g.score += 10;
    },
    update(g, dt) {
      g.time += dt;
      const mult = 1 + (g.level - 1) * 0.25;
      for (const l of g.lanes) {
        const span = FR.cols + 2 * l.len;
        l.items = l.items.map((x) => { let nx = x + l.speed * mult * dt; if (nx > FR.cols + l.len) nx -= span; if (nx < -l.len) nx += span; return nx; });
      }
      if (g.dead > 0) { g.dead -= dt; if (g.dead <= 0) { if (g.lives <= 0) g.gameOver(); else resetFrog(g); } return; }
      const f = g.frog; const row = Math.round(f.y);
      const lane = g.lanes.find((l) => l.row === row);
      if (lane) {
        const on = lane.items.some((x) => f.x + 0.5 > x && f.x + 0.5 < x + lane.len);
        if (lane.kind === 'log') { if (on) f.x += lane.speed * mult * dt; else return die(g); if (f.x < -0.5 || f.x > FR.cols - 0.5) return die(g); }
        else if (on) return die(g);
      }
      if (row === 0) {
        const slot = HOMES.findIndex((hx) => Math.abs(f.x - hx) < 0.6);
        if (slot < 0 || g.homes[slot]) return die(g);
        g.homes[slot] = true; g.score += 50;
        if (g.homes.every(Boolean)) { g.level += 1; g.score += 200; g.homes = [false, false, false, false, false]; }
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
      HOMES.forEach((hx, i) => { ctx.fillStyle = '#0b1d3a'; ctx.fillRect(hx * c + c * 0.1, top + c * 0.1, c * 0.8, c * 0.8); if (g.homes[i]) frog(ctx, hx * c + c / 2, top + c / 2, c, '#5cd65c'); });
      for (const l of g.lanes) for (const x of l.items) {
        const y = top + l.row * c;
        if (l.kind === 'log') { ctx.fillStyle = l.color; ctx.beginPath(); ctx.roundRect(x * c, y + c * 0.15, l.len * c, c * 0.7, c * 0.3); ctx.fill(); }
        else { ctx.fillStyle = l.color; ctx.beginPath(); ctx.roundRect(x * c + 2, y + c * 0.15, l.len * c - 4, c * 0.7, c * 0.2); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x * c + c * 0.15, y + c * 0.05, c * 0.25, c * 0.12); ctx.fillRect(x * c + l.len * c - c * 0.4, y + c * 0.05, c * 0.25, c * 0.12); ctx.fillRect(x * c + c * 0.15, y + c * 0.83, c * 0.25, c * 0.12); ctx.fillRect(x * c + l.len * c - c * 0.4, y + c * 0.83, c * 0.25, c * 0.12); }
      }
      if (g.dead > 0) { ctx.fillStyle = '#ff5252'; ctx.font = `bold ${c}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✖', g.frog.x * c + c / 2, top + g.frog.y * c + c / 2); }
      else frog(ctx, g.frog.x * c + c / 2, top + g.frog.y * c + c / 2, c, '#7dff5c');
      hud(ctx, W, H, `SCORE ${g.score}   ${'🐸'.repeat(Math.max(0, g.lives))}`, `LEVEL ${g.level}  HIGH ${Math.max(g.high, g.score)}`);
    },
  });
  function resetFrog(g) { g.frog = { x: 6, y: 12 }; g.dead = 0; }
  function die(g) { g.lives -= 1; g.dead = 1; }
  function frog(ctx, x, y, c, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, c * 0.34, c * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - c * 0.3, y - c * 0.22, c * 0.1, 0, 7); ctx.arc(x + c * 0.3, y - c * 0.22, c * 0.1, 0, 7); ctx.arc(x - c * 0.3, y + c * 0.22, c * 0.1, 0, 7); ctx.arc(x + c * 0.3, y + c * 0.22, c * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - c * 0.12, y - c * 0.12, c * 0.06, 0, 7); ctx.arc(x + c * 0.12, y - c * 0.12, c * 0.06, 0, 7); ctx.fill();
  }

  // ------------------------------------------------------------ Asteroids
  Games.asteroids = makeGame({
    key: 'asteroids', aspect: 4 / 3,
    init(g, W, H) {
      g.score = 0; g.lives = 3; g.level = 1; g.W = W; g.H = H; g.bullets = []; g.cool = 0; g.rocks = [];
      spawnShip(g); spawnRocks(g, 4);
    },
    press(g, k) { if (k === 'fire') fire(g); },
    update(g, dt, held) {
      const s = g.ship;
      if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) { if (g.lives <= 0) { g.gameOver(); return; } spawnShip(g); } }
      else {
        if (held.has('left')) s.a -= 3.6 * dt;
        if (held.has('right')) s.a += 3.6 * dt;
        if (held.has('up')) { s.vx += Math.cos(s.a) * 260 * dt; s.vy += Math.sin(s.a) * 260 * dt; s.thrust = true; } else s.thrust = false;
        if (held.has('fire')) { g.cool -= dt; if (g.cool <= 0) { fire(g); } } else g.cool = 0;
        s.vx *= 1 - 0.6 * dt; s.vy *= 1 - 0.6 * dt;
        s.x = wrap(s.x + s.vx * dt, g.W); s.y = wrap(s.y + s.vy * dt, g.H);
        if (s.inv > 0) s.inv -= dt;
      }
      for (const b of g.bullets) { b.x = wrap(b.x + b.vx * dt, g.W); b.y = wrap(b.y + b.vy * dt, g.H); b.t -= dt; }
      g.bullets = g.bullets.filter((b) => b.t > 0);
      for (const r of g.rocks) { r.x = wrap(r.x + r.vx * dt, g.W); r.y = wrap(r.y + r.vy * dt, g.H); r.a += r.spin * dt; }
      // bullets vs rocks
      const scale = g.W / 800;
      for (const b of g.bullets) {
        const hit = g.rocks.find((r) => (r.x - b.x) ** 2 + (r.y - b.y) ** 2 < (r.r * scale) ** 2);
        if (!hit) continue;
        b.t = 0;
        g.score += hit.r >= 40 ? 20 : hit.r >= 22 ? 50 : 100;
        g.rocks = g.rocks.filter((r) => r !== hit);
        if (hit.r >= 22) for (let i = 0; i < 2; i++) g.rocks.push(makeRock(g, hit.x, hit.y, hit.r / 2));
      }
      g.bullets = g.bullets.filter((b) => b.t > 0);
      if (!g.rocks.length) { g.level += 1; spawnRocks(g, 3 + g.level); }
      // ship vs rocks
      if (s.dead <= 0 && s.inv <= 0) {
        const hit = g.rocks.some((r) => (r.x - s.x) ** 2 + (r.y - s.y) ** 2 < ((r.r + 10) * scale) ** 2);
        if (hit) { g.lives -= 1; s.dead = 1.5; }
      }
    },
    draw(g, ctx, W, H) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const scale = W / 800;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (const r of g.rocks) {
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.beginPath();
        r.verts.forEach((v, i) => { const x = Math.cos(v.a) * v.d * r.r * scale; const y = Math.sin(v.a) * v.d * r.r * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#fff';
      for (const b of g.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.5 * scale, 0, 7); ctx.fill(); }
      const s = g.ship;
      if (s.dead <= 0 && (s.inv <= 0 || Math.floor(s.inv * 10) % 2 === 0)) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); const L = 16 * scale;
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.8, L * 0.7); ctx.lineTo(-L * 0.4, 0); ctx.lineTo(-L * 0.8, -L * 0.7); ctx.closePath(); ctx.stroke();
        if (s.thrust) { ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-L * 0.5, L * 0.3); ctx.lineTo(-L * (1.1 + Math.random() * 0.4), 0); ctx.lineTo(-L * 0.5, -L * 0.3); ctx.stroke(); ctx.strokeStyle = '#fff'; }
        ctx.restore();
      }
      hud(ctx, W, H, `SCORE ${g.score}   ${'▲'.repeat(Math.max(0, g.lives))}`, `LEVEL ${g.level}  HIGH ${Math.max(g.high, g.score)}`);
    },
  });
  const wrap = (v, max) => ((v % max) + max) % max;
  function spawnShip(g) { g.ship = { x: g.W / 2, y: g.H / 2, a: -Math.PI / 2, vx: 0, vy: 0, dead: 0, inv: 2.5, thrust: false }; }
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
  function fire(g) {
    const s = g.ship; if (s.dead > 0 || g.bullets.length >= 6) return;
    const sp = 520 * (g.W / 800);
    g.bullets.push({ x: s.x + Math.cos(s.a) * 16, y: s.y + Math.sin(s.a) * 16, vx: Math.cos(s.a) * sp + s.vx, vy: Math.sin(s.a) * sp + s.vy, t: 0.9 });
    g.cool = 0.18;
  }
})();
