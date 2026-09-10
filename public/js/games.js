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
        if (held.has('down')) { s.vx *= 1 - 3 * dt; s.vy *= 1 - 3 * dt; } // brake
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
      else if (key === 'up') { const r = ttRotate(c.cells); for (const dx of [0, -1, 1, -2, 2]) if (ttFits(b, r, c.x + dx, c.y)) { c.cells = r; c.x += dx; break; } }
      else if (key === 'fire') { while (ttFits(b, c.cells, c.x, c.y + 1)) { c.y += 1; b.score += 2; } ttLock(g, b); }
    },
    update(g, dt, held) {
      for (const b of g.boards) {
        if (b.over) continue;
        const soft = held.has(b.n === 2 ? 'p2:down' : 'down');
        const interval = soft ? 0.05 : Math.max(0.12, 0.8 - (b.level - 1) * 0.07);
        b.timer += dt; b.flash = Math.max(0, b.flash - dt);
        while (b.timer >= interval) { b.timer -= interval; ttStep(g, b); if (soft) b.score += 1; if (b.over) break; }
      }
      if (g.boards.length === 1) { g.score = g.boards[0].score; if (g.boards[0].over) g.gameOver(); }
      else if (g.boards.some((b) => b.over)) { const alive = g.boards.find((b) => !b.over); g.winner = alive ? alive.n : null; g.score = Math.max(...g.boards.map((b) => b.score)); g.gameOver(); }
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
        const fling = (from, to, dir) => { to.vx += nx * dir * W * 1.3; to.vy = Math.min(to.vy, -H * 0.45); to.hit = 0.25; from.dash = 0; };
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
      g.p = Array.from({ length: MB.players }, (_, i) => ({ i, x: W * (0.2 + i * 0.1), y: H * 0.7, face: 1, hp: 5, punch: 0, cool: 0, hurt: 0, down: false, size: Math.max(26, W / 24) }));
    },
    press(g, k) {
      const [p, key] = splitKey(k); const f = g.p[p]; if (!f || f.down) return;
      if (key === 'fire' && f.cool <= 0) {
        f.punch = 0.15; f.cool = 0.35;
        const reach = f.size * 1.6;
        for (const m of g.mobs) {
          if (Math.abs(m.y - f.y) < f.size * 0.9 && (m.x - f.x) * f.face > 0 && Math.abs(m.x - f.x) < reach + m.size) {
            m.hp -= 1; m.hurt = 0.2; m.x += f.face * f.size * 0.8; if (m.hp <= 0) g.score += 10 * m.tier;
          }
        }
        g.punches.push({ x: f.x + f.face * f.size * 1.1, y: f.y - f.size * 0.2, t: 0.15 });
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
        f.punch = Math.max(0, f.punch - dt); f.cool -= dt; f.hurt = Math.max(0, f.hurt - dt);
      });
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
        const targets = g.p.filter((f) => !f.down); if (!targets.length) continue;
        const t = targets.reduce((a, b) => (Math.hypot(b.x - m.x, b.y - m.y) < Math.hypot(a.x - m.x, a.y - m.y) ? b : a));
        const dx = t.x - m.x; const dy = t.y - m.y; const d = Math.hypot(dx, dy) || 1;
        if (d > m.size + t.size * 0.6) { m.x += (dx / d) * m.speed * dt; m.y += (dy / d) * m.speed * dt * 0.7; m.face = dx > 0 ? 1 : -1; }
        else if (m.atk <= 0 && m.hurt <= 0) { m.atk = 1.1; t.hp -= 1; t.hurt = 0.4; t.x += m.face * t.size * 0.6; if (t.hp <= 0) t.down = true; }
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
        if (o.kind === 'p' && o.punch > 0) { ctx.font = `${Math.round(o.size * 1.2)}px ${FONT}`; ctx.fillText('👊', o.size * 1.1, -o.size * 0.2); }
        ctx.restore();
      }
      for (const p of g.punches) { ctx.fillStyle = `rgba(253,224,71,${p.t / 0.15})`; ctx.font = `bold ${Math.round(W / 40)}px ${FONT}`; ctx.fillText('POW', p.x, p.y - 30); }
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.font = `bold ${Math.round(W / 30)}px ${FONT}`;
      g.p.forEach((f, i) => { ctx.textAlign = i === 0 ? 'left' : 'right'; ctx.fillText(`${i === 0 ? 'P1 ' : ''}${'❤️'.repeat(Math.max(0, f.hp))}${'🖤'.repeat(Math.max(0, 5 - f.hp))}${i === 1 ? ' P2' : ''}`, i === 0 ? 16 : W - 16, 12); });
      ctx.textAlign = 'center'; ctx.fillText(`Wave ${g.wave} · Score ${g.score}`, W / 2, 12);
      ctx.font = `${Math.round(W / 44)}px ${FONT}`; ctx.fillStyle = '#c4b5fd'; ctx.fillText('◀ ▶ ▲ ▼ move · ● punch', W / 2, 12 + W / 26);
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
