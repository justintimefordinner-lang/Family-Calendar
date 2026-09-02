/* Pac-Man for the family display. Touch: swipe on the maze or use the d-pad. Keys: arrows / WASD. */
(() => {
  'use strict';

  const MAP = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###==### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];
  const ROWS = MAP.length;
  const COLS = MAP[0].length;
  const HUD = 2; // rows of HUD above the maze
  const DIRS = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };
  const PAC_START = { x: 13, y: 23 };
  const HOUSE = { x: 13, y: 14 };
  const DOOR_OUT = { x: 13, y: 11 };
  const GHOSTS = [
    { name: 'blinky', color: '#ff3b3b', scatter: { x: 25, y: -2 }, start: { x: 13, y: 11 }, release: 0 },
    { name: 'pinky', color: '#ffb8ff', scatter: { x: 2, y: -2 }, start: { x: 13, y: 14 }, release: 2 },
    { name: 'inky', color: '#00ffff', scatter: { x: 27, y: 32 }, start: { x: 11, y: 14 }, release: 6 },
    { name: 'clyde', color: '#ffb852', scatter: { x: 0, y: 32 }, start: { x: 15, y: 14 }, release: 10 },
  ];

  const wrapX = (x) => ((x % COLS) + COLS) % COLS;
  const tileAt = (c, r) => (r < 0 || r >= ROWS ? ' ' : MAP[r][wrapX(c)]);
  function blocked(c, r, ent) {
    const ch = tileAt(c, r);
    if (r < 0 || r >= ROWS) return true;
    if (ch === '#') return true;
    if (ch === '=') return !(ent && ent.door);
    return false;
  }

  let canvas; let ctx; let T = 24; let raf = 0; let last = 0; let running = false;
  let onHud = () => {};
  let game;

  function freshPellets() {
    const s = new Set();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === '.' || MAP[r][c] === 'o') s.add(`${c},${r}`);
    return s;
  }

  function newGame() {
    game = {
      score: 0, lives: 3, level: 1, pellets: freshPellets(), state: 'ready', stateT: 2,
      pac: null, ghosts: [], frightT: 0, eatChain: 0, modeT: 7, mode: 'scatter', mouth: 0, tick: 0,
      high: Number(localStorage.getItem('fc_pacman_high') || 0),
    };
    placeEntities();
  }

  function placeEntities() {
    game.pac = { x: PAC_START.x, y: PAC_START.y, dir: DIRS.left, want: DIRS.left, speed: 7.5 + game.level * 0.25, moving: true };
    game.ghosts = GHOSTS.map((g, i) => ({
      ...g, x: g.start.x, y: g.start.y, dir: i === 0 ? DIRS.left : DIRS.up, speed: 6.5 + game.level * 0.25,
      state: i === 0 ? 'out' : 'house', releaseT: g.release, door: false, bob: 0,
    }));
    game.frightT = 0; game.eatChain = 0; game.mode = 'scatter'; game.modeT = 7;
  }

  function nextLevel() {
    game.level += 1;
    game.pellets = freshPellets();
    placeEntities();
    game.state = 'ready'; game.stateT = 2;
  }

  // Move an entity along its direction, deciding at tile centres. `decide(ent, c, r)` returns a dir or null (stop).
  function advance(ent, dt, decide) {
    let left = ent.speed * dt;
    let guard = 0;
    while (left > 0 && guard++ < 8) {
      const cx = Math.round(ent.x); const cy = Math.round(ent.y);
      const atCenter = Math.abs(ent.x - cx) < 1e-6 && Math.abs(ent.y - cy) < 1e-6;
      if (atCenter) {
        ent.x = cx; ent.y = cy;
        const d = decide(ent, cx, cy);
        if (!d) { ent.moving = false; return; }
        ent.dir = d; ent.moving = true;
      }
      // distance to the next centre along dir
      let dist;
      if (ent.dir.dx) dist = ent.dir.dx > 0 ? Math.floor(ent.x + 1e-9) + 1 - ent.x : ent.x - (Math.ceil(ent.x - 1e-9) - 1);
      else dist = ent.dir.dy > 0 ? Math.floor(ent.y + 1e-9) + 1 - ent.y : ent.y - (Math.ceil(ent.y - 1e-9) - 1);
      const mv = Math.min(dist, left);
      ent.x += ent.dir.dx * mv; ent.y += ent.dir.dy * mv;
      left -= mv;
      if (ent.x < -0.5) ent.x += COLS; if (ent.x >= COLS - 0.5) ent.x -= COLS; // tunnel
      if (Math.abs(mv - dist) < 1e-9) { ent.x = Math.round(ent.x * 1e6) / 1e6; ent.y = Math.round(ent.y * 1e6) / 1e6; }
    }
  }

  function pacDecide(p, c, r) {
    if (!blocked(c + p.want.dx, r + p.want.dy, p)) return p.want;
    if (!blocked(c + p.dir.dx, r + p.dir.dy, p)) return p.dir;
    return null;
  }

  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

  function ghostTarget(g) {
    const p = game.pac;
    if (g.state === 'eyes') return DOOR_OUT;
    if (g.state === 'leaving') return DOOR_OUT;
    if (g.state === 'entering') return HOUSE;
    if (game.mode === 'scatter') return g.scatter;
    switch (g.name) {
      case 'pinky': return { x: p.x + p.dir.dx * 4, y: p.y + p.dir.dy * 4 };
      case 'inky': { const b = game.ghosts[0]; const px = p.x + p.dir.dx * 2; const py = p.y + p.dir.dy * 2; return { x: px * 2 - b.x, y: py * 2 - b.y }; }
      case 'clyde': return dist2(g.x, g.y, p.x, p.y) > 64 ? { x: p.x, y: p.y } : g.scatter;
      default: return { x: p.x, y: p.y };
    }
  }

  function ghostDecide(g, c, r) {
    // Finished travelling?
    if (g.state === 'leaving' && c === DOOR_OUT.x && r === DOOR_OUT.y) { g.state = 'out'; g.door = false; }
    if (g.state === 'eyes' && c === DOOR_OUT.x && r === DOOR_OUT.y) { g.state = 'entering'; g.door = true; }
    if (g.state === 'entering' && c === HOUSE.x && r === HOUSE.y) { g.state = 'house'; g.releaseT = 1.5; g.door = false; return null; }
    const frightened = g.state === 'out' && game.frightT > 0;
    const options = Object.values(DIRS).filter((d) => !(d.dx === -g.dir.dx && d.dy === -g.dir.dy) && !blocked(c + d.dx, r + d.dy, g));
    const all = options.length ? options : Object.values(DIRS).filter((d) => !blocked(c + d.dx, r + d.dy, g));
    if (!all.length) return null;
    if (frightened) return all[Math.floor(Math.random() * all.length)];
    const t = ghostTarget(g);
    // ghosts may not turn up into the door area from outside unless returning
    let best = all[0]; let bd = Infinity;
    for (const d of all) {
      const nx = c + d.dx; const ny = r + d.dy;
      const dd = dist2(nx, ny, t.x, t.y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  function loseLife() {
    game.lives -= 1;
    if (game.lives <= 0) {
      game.state = 'over'; game.stateT = 0;
      if (game.score > game.high) { game.high = game.score; localStorage.setItem('fc_pacman_high', String(game.high)); }
    } else {
      game.state = 'dying'; game.stateT = 1.4;
    }
  }

  function update(dt) {
    game.tick += dt;
    game.mouth = (Math.sin(game.tick * 18) + 1) / 2;
    if (game.state === 'ready') { game.stateT -= dt; if (game.stateT <= 0) game.state = 'play'; return; }
    if (game.state === 'dying') { game.stateT -= dt; if (game.stateT <= 0) { placeEntities(); game.state = 'ready'; game.stateT = 1.5; } return; }
    if (game.state === 'over' || game.state === 'paused') return;

    // scatter/chase cycle
    if (game.frightT > 0) game.frightT -= dt;
    else {
      game.modeT -= dt;
      if (game.modeT <= 0) { game.mode = game.mode === 'scatter' ? 'chase' : 'scatter'; game.modeT = game.mode === 'scatter' ? 6 : 20; }
    }

    const p = game.pac;
    if (p.moving || pacDecide(p, Math.round(p.x), Math.round(p.y))) advance(p, dt, pacDecide);
    // eat
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (game.pellets.has(key)) {
      game.pellets.delete(key);
      const power = tileAt(Math.round(p.x), Math.round(p.y)) === 'o';
      game.score += power ? 50 : 10;
      if (power) { game.frightT = Math.max(3, 7 - game.level * 0.5); game.eatChain = 0; for (const g of game.ghosts) if (g.state === 'out') g.dir = { dx: -g.dir.dx, dy: -g.dir.dy }; }
      if (game.pellets.size === 0) { game.score += 500; nextLevel(); return; }
    }

    for (const g of game.ghosts) {
      if (g.state === 'house') {
        g.releaseT -= dt; g.bob += dt;
        g.y = g.start.y + Math.sin(g.bob * 4) * 0.25;
        if (g.releaseT <= 0) { g.state = 'leaving'; g.door = true; g.x = Math.round(g.x); g.y = g.start.y; g.dir = DIRS.up; }
        continue;
      }
      const frightened = g.state === 'out' && game.frightT > 0;
      const base = 6.2 + game.level * 0.25;
      g.speed = g.state === 'eyes' ? 12 : frightened ? base * 0.6 : (Math.round(g.y) === 14 && (g.x < 5 || g.x > 22) ? base * 0.55 : base);
      advance(g, dt, ghostDecide);
      // collision with pac
      if (g.state === 'out' && dist2(g.x, g.y, p.x, p.y) < 0.6 * 0.6) {
        if (game.frightT > 0) {
          game.eatChain += 1;
          game.score += 200 * (2 ** (game.eatChain - 1));
          g.state = 'eyes'; g.door = true;
        } else {
          loseLife();
          return;
        }
      }
    }
    if (game.score >= (game.nextLifeAt || 10000)) { game.lives += 1; game.nextLifeAt = (game.nextLifeAt || 10000) + 10000; }
    onHud(game);
  }

  // ---- drawing --------------------------------------------------------------
  function drawWalls() {
    ctx.fillStyle = '#1f2fd8';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = MAP[r][c];
      if (ch === '#') {
        ctx.fillRect(c * T + 1, (r + HUD) * T + 1, T - 2, T - 2);
      } else if (ch === '=') {
        ctx.fillStyle = '#ffb8de'; ctx.fillRect(c * T, (r + HUD) * T + T * 0.4, T, T * 0.2); ctx.fillStyle = '#1f2fd8';
      }
    }
    // inner shading so walls read as blocks
    ctx.fillStyle = '#0c1580';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === '#') ctx.fillRect(c * T + T * 0.3, (r + HUD) * T + T * 0.3, T * 0.4, T * 0.4);
  }

  function drawPellets() {
    ctx.fillStyle = '#ffd9a8';
    const blink = Math.floor(game.tick * 4) % 2 === 0;
    for (const key of game.pellets) {
      const [c, r] = key.split(',').map(Number);
      const power = MAP[r][c] === 'o';
      if (power && !blink) continue;
      ctx.beginPath();
      ctx.arc(c * T + T / 2, (r + HUD) * T + T / 2, power ? T * 0.32 : T * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPac() {
    const p = game.pac;
    const cx = p.x * T + T / 2; const cy = (p.y + HUD) * T + T / 2;
    const ang = Math.atan2(p.dir.dy, p.dir.dx);
    let open = game.state === 'dying' ? Math.min(Math.PI, (1.4 - game.stateT) * 2.4) : 0.15 + game.mouth * 0.65;
    if (!p.moving && game.state === 'play') open = 0.15;
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, T * 0.62, ang + open, ang - open + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    const cx = g.x * T + T / 2; const cy = (g.y + HUD) * T + T / 2; const R = T * 0.62;
    const frightened = g.state === 'out' && game.frightT > 0;
    const eyesOnly = g.state === 'eyes' || g.state === 'entering';
    if (!eyesOnly) {
      const flash = frightened && game.frightT < 2 && Math.floor(game.tick * 6) % 2 === 0;
      ctx.fillStyle = frightened ? (flash ? '#ffffff' : '#2b3cff') : g.color;
      ctx.beginPath();
      ctx.arc(cx, cy - R * 0.1, R, Math.PI, 0);
      const bottom = cy + R * 0.8;
      ctx.lineTo(cx + R, bottom);
      const wave = Math.floor(game.tick * 8) % 2 ? 1 : 0;
      for (let i = 0; i < 4; i++) {
        const x1 = cx + R - (i * 2 + 1) * (R / 4); const x2 = cx + R - (i * 2 + 2) * (R / 4);
        ctx.lineTo(x1, bottom - ((i + wave) % 2 ? R * 0.28 : 0));
        ctx.lineTo(x2, bottom);
      }
      ctx.closePath();
      ctx.fill();
      if (frightened) {
        ctx.fillStyle = flash ? '#ff3b3b' : '#ffd9a8';
        ctx.fillRect(cx - R * 0.42, cy - R * 0.25, R * 0.2, R * 0.2); ctx.fillRect(cx + R * 0.22, cy - R * 0.25, R * 0.2, R * 0.2);
        ctx.beginPath(); for (let i = 0; i < 5; i++) ctx.lineTo(cx - R * 0.5 + i * R * 0.25, cy + R * 0.3 + (i % 2 ? -R * 0.12 : 0)); ctx.lineWidth = 2; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
        return;
      }
    }
    // eyes
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx + s * R * 0.35, cy - R * 0.2, R * 0.22, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2bd6'; ctx.beginPath(); ctx.arc(cx + s * R * 0.35 + g.dir.dx * R * 0.12, cy - R * 0.2 + g.dir.dy * R * 0.15, R * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHud() {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${T * 0.9}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillText(`SCORE ${game.score}`, T * 0.5, T * 1);
    ctx.textAlign = 'center'; ctx.fillText(`HIGH ${Math.max(game.high, game.score)}`, COLS * T / 2, T * 1);
    ctx.textAlign = 'right'; ctx.fillText(`LEVEL ${game.level}`, COLS * T - T * 0.5, T * 1);
    // lives (bottom-left, under the maze)
    for (let i = 0; i < game.lives - 1; i++) {
      const cx = T * (1 + i * 1.4); const cy = (ROWS + HUD) * T + T * 0.6;
      ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, T * 0.45, 0.6, Math.PI * 2 - 0.6); ctx.closePath(); ctx.fill();
    }
    if (game.state === 'ready' || game.state === 'over' || game.state === 'paused') {
      const msg = game.state === 'ready' ? (game.level === 1 && game.score === 0 ? 'READY!' : `LEVEL ${game.level}`) : game.state === 'paused' ? 'PAUSED' : 'GAME OVER';
      ctx.fillStyle = game.state === 'over' ? '#ff3b3b' : '#ffe600';
      ctx.font = `bold ${T * 1.3}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(msg, COLS * T / 2, (17 + HUD) * T + T / 2);
      if (game.state === 'over') { ctx.font = `bold ${T * 0.8}px "Segoe UI", system-ui, sans-serif`; ctx.fillText('Tap ▶ Play again', COLS * T / 2, (19 + HUD) * T + T / 2); }
    }
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWalls();
    drawPellets();
    for (const g of game.ghosts) if (game.state !== 'dying') drawGhost(g);
    drawPac();
    drawHud();
  }

  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---- public API -----------------------------------------------------------
  function start(cv, opts = {}) {
    canvas = cv; ctx = cv.getContext('2d');
    onHud = opts.onHud || (() => {});
    const availH = opts.height || cv.parentElement.clientHeight || 900;
    const availW = opts.width || cv.parentElement.clientWidth || 700;
    T = Math.floor(Math.min(availH / (ROWS + HUD + 1.2), availW / COLS));
    canvas.width = COLS * T; canvas.height = (ROWS + HUD + 1.2) * T;
    newGame();
    running = true; last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function setDir(name) {
    if (!game || !DIRS[name]) return;
    if (game.state === 'over') { newGame(); return; }
    if (game.state === 'paused') game.state = 'play';
    game.pac.want = DIRS[name];
    if (!game.pac.moving) game.pac.moving = true;
  }
  function togglePause() { if (!game) return; if (game.state === 'play') game.state = 'paused'; else if (game.state === 'paused') game.state = 'play'; }
  function restart() { newGame(); }

  window.PacMan = { start, stop, setDir, togglePause, restart, get game() { return game; } };
  window.Games = window.Games || {};
  window.Games.pacman = { start, stop, press: setDir, release() {}, togglePause, restart };
})();
