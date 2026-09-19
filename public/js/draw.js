/* Family Calendar - kids draw mode.
   Free drawing (several tools, sizes, colours, rainbow, fill, undo) plus a pane of shapes to drag in:
   basic shapes and paper-doll body parts (heads, torsos with arms, legs, feet, hands) drawn as outlines,
   ready for the kids to add the details by hand. Everything stays on the device. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const COLORS = ['#111827', '#6b7280', '#92400e', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6',
    '#3b82f6', '#8b5cf6', '#ec4899', '#fbcfe8', '#fde0c4', '#d9a066', '#8d5524', '#ffffff'];
  const TOOLS = [['pencil', '✏️', 'Pencil'], ['brush', '🖌️', 'Brush'], ['crayon', '🖍️', 'Crayon'], ['spray', '💨', 'Spray'], ['fill', '🪣', 'Fill'], ['eraser', '🧽', 'Eraser']];
  const SIZES = [['S', 4], ['M', 10], ['L', 20], ['XL', 36]];
  const st = { tool: 'brush', color: '#111827', rainbow: false, size: 10, hue: 0 };

  // ---- Shapes: parts are given in a 0..1 box and drawn in order, each filled white then outlined,
  // so later parts sit on top of earlier ones like paper cut-outs.
  const cap = (x1, y1, x2, y2, w) => ({ k: 'cap', x1, y1, x2, y2, w });       // a limb: thick line with round ends (w is a fraction of the width)
  const ell = (cx, cy, rx, ry) => ({ k: 'ell', cx, cy, rx, ry });
  const rr = (x, y, w, h, r) => ({ k: 'rr', x, y, w, h, r });                 // r: 0..0.5 of the part's smaller side
  const poly = (...pts) => ({ k: 'poly', pts });
  const star = () => { const p = []; for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.2 : 0.5; p.push([0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r]); } return poly(...p); };
  const heart = { k: 'path', fn: (c, W, H) => { c.moveTo(0.5 * W, 0.95 * H); c.bezierCurveTo(-0.15 * W, 0.5 * H, 0.1 * W, -0.05 * H, 0.5 * W, 0.28 * H); c.bezierCurveTo(0.9 * W, -0.05 * H, 1.15 * W, 0.5 * H, 0.5 * W, 0.95 * H); } };
  const toes = (left) => [0, 1, 2, 3, 4].map((i) => { const cx = 0.41 - i * 0.078; return ell(left ? cx : 1 - cx, 0.2 + i * 0.035, 0.042 - i * 0.004, 0.12 - i * 0.012); });
  const SHAPES = [
    { id: 'circle', group: 'Shapes', aspect: 1, size: 0.25, parts: [ell(0.5, 0.5, 0.48, 0.48)] },
    { id: 'square', group: 'Shapes', aspect: 1, size: 0.25, parts: [rr(0.03, 0.03, 0.94, 0.94, 0.04)] },
    { id: 'rect', group: 'Shapes', aspect: 1.7, size: 0.2, parts: [rr(0.02, 0.04, 0.96, 0.92, 0.06)] },
    { id: 'triangle', group: 'Shapes', aspect: 1.1, size: 0.25, parts: [poly([0.5, 0.04], [0.97, 0.96], [0.03, 0.96])] },
    { id: 'star', group: 'Shapes', aspect: 1, size: 0.25, parts: [star()] },
    { id: 'heart', group: 'Shapes', aspect: 1.05, size: 0.22, parts: [heart] },
    { id: 'head-round', group: 'Heads', aspect: 1.1, size: 0.22, parts: [ell(0.07, 0.52, 0.07, 0.11), ell(0.93, 0.52, 0.07, 0.11), ell(0.5, 0.5, 0.41, 0.48)] },
    { id: 'head-oval', group: 'Heads', aspect: 0.8, size: 0.24, parts: [ell(0.5, 0.5, 0.47, 0.49)] },
    { id: 'head-square', group: 'Heads', aspect: 1.05, size: 0.22, parts: [ell(0.06, 0.52, 0.06, 0.1), ell(0.94, 0.52, 0.06, 0.1), rr(0.1, 0.04, 0.8, 0.92, 0.28)] },
    { id: 'torso-down', group: 'Bodies', aspect: 1, size: 0.34, parts: [cap(0.27, 0.22, 0.12, 0.8, 0.13), cap(0.73, 0.22, 0.88, 0.8, 0.13), rr(0.43, 0, 0.14, 0.16, 0.2), rr(0.25, 0.1, 0.5, 0.88, 0.22)] },
    { id: 'torso-out', group: 'Bodies', aspect: 1.7, size: 0.32, parts: [cap(0.38, 0.27, 0.07, 0.27, 0.085), cap(0.62, 0.27, 0.93, 0.27, 0.085), rr(0.46, 0, 0.08, 0.16, 0.2), rr(0.35, 0.1, 0.3, 0.88, 0.22)] },
    { id: 'torso-up', group: 'Bodies', aspect: 1.1, size: 0.4, parts: [cap(0.3, 0.4, 0.1, 0.08, 0.12), cap(0.7, 0.4, 0.9, 0.08, 0.12), rr(0.44, 0.2, 0.12, 0.14, 0.2), rr(0.27, 0.3, 0.46, 0.68, 0.22)] },
    { id: 'legs-stand', group: 'Legs', aspect: 0.75, size: 0.34, parts: [cap(0.3, 0.15, 0.27, 0.86, 0.26), cap(0.7, 0.15, 0.73, 0.86, 0.26), rr(0.12, 0, 0.76, 0.24, 0.3)] },
    { id: 'legs-walk', group: 'Legs', aspect: 1, size: 0.34, parts: [cap(0.4, 0.15, 0.2, 0.86, 0.19), cap(0.6, 0.15, 0.82, 0.86, 0.19), rr(0.25, 0, 0.5, 0.24, 0.3)] },
    { id: 'feet-shoes', group: 'Feet', aspect: 2.4, size: 0.1, parts: [rr(0.28, 0, 0.15, 0.6, 0.2), rr(0.03, 0.45, 0.42, 0.52, 0.5), rr(0.57, 0, 0.15, 0.6, 0.2), rr(0.55, 0.45, 0.42, 0.52, 0.5)] },
    { id: 'feet-boots', group: 'Feet', aspect: 1.8, size: 0.15, parts: [rr(0.26, 0, 0.2, 0.75, 0.15), rr(0.03, 0.6, 0.44, 0.38, 0.45), rr(0.54, 0, 0.2, 0.75, 0.15), rr(0.53, 0.6, 0.44, 0.38, 0.45)] },
    { id: 'feet-bare', group: 'Feet', aspect: 2.2, size: 0.12, parts: [...toes(true), ell(0.25, 0.64, 0.2, 0.34), ...toes(false), ell(0.75, 0.64, 0.2, 0.34)] },
    { id: 'hand-open', group: 'Hands', aspect: 0.9, size: 0.14, parts: [cap(0.3, 0.55, 0.3, 0.16, 0.12), cap(0.45, 0.55, 0.45, 0.08, 0.12), cap(0.6, 0.55, 0.6, 0.12, 0.12), cap(0.75, 0.55, 0.75, 0.24, 0.11), cap(0.27, 0.72, 0.08, 0.48, 0.13), rr(0.2, 0.42, 0.65, 0.56, 0.3)] },
    { id: 'hand-mitten', group: 'Hands', aspect: 0.85, size: 0.13, parts: [cap(0.27, 0.66, 0.1, 0.42, 0.18), ell(0.57, 0.5, 0.36, 0.48)] },
  ];

  function drawShape(c, shape, W, H, color, lw) {
    c.lineJoin = 'round';
    for (const p of shape.parts) {
      if (p.k === 'cap') {
        c.lineCap = 'round';
        const line = () => { c.beginPath(); c.moveTo(p.x1 * W, p.y1 * H); c.lineTo(p.x2 * W, p.y2 * H); c.stroke(); };
        c.strokeStyle = color; c.lineWidth = p.w * W + lw * 2; line();
        c.strokeStyle = '#fff'; c.lineWidth = p.w * W; line();
        continue;
      }
      c.beginPath();
      if (p.k === 'ell') c.ellipse(p.cx * W, p.cy * H, p.rx * W, p.ry * H, 0, 0, Math.PI * 2);
      else if (p.k === 'rr') c.roundRect(p.x * W, p.y * H, p.w * W, p.h * H, Math.min(p.w * W, p.h * H) * p.r);
      else if (p.k === 'poly') { p.pts.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H))); c.closePath(); }
      else if (p.k === 'path') p.fn(c, W, H);
      c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = color; c.lineWidth = lw; c.stroke();
    }
  }

  // ---- DOM ------------------------------------------------------------------------------------------
  let root = null; let cv = null; let ctx = null; let ov = null; let octx = null;
  const undo = []; const pointers = new Map();
  let pending = null; let drag = null; let saveT = null;

  function build() {
    root = document.createElement('div');
    root.id = 'draw'; root.hidden = true;
    const groups = [...new Set(SHAPES.map((s) => s.group))];
    root.innerHTML = `
      <div class="draw-top">
        <button class="btn" data-draw-close>✕ Close</button>
        <div class="draw-title">🎨 Draw</div>
        <div class="draw-top-actions"><button class="btn" data-draw-undo>↩ Undo</button><button class="btn" data-draw-clear>📄 New page</button><button class="btn" data-draw-load>📂 Open</button><button class="btn primary-btn" data-draw-save>💾 Save</button></div>
      </div>
      <div class="draw-main">
        <div class="draw-tools">
          <div class="draw-grid two">${TOOLS.map(([k, ic, l]) => `<button class="draw-btn" data-tool="${k}" title="${l}"><span>${ic}</span><small>${l}</small></button>`).join('')}</div>
          <div class="draw-grid four">${SIZES.map(([l, n]) => `<button class="draw-btn size" data-size="${n}"><i style="width:${Math.min(30, n)}px;height:${Math.min(30, n)}px"></i><small>${l}</small></button>`).join('')}</div>
          <div class="draw-grid four">${COLORS.map((c) => `<button class="draw-swatch" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
          <button class="draw-btn wide rainbow" data-rainbow>🌈 Rainbow</button>
        </div>
        <div class="draw-stage">
          <canvas class="draw-canvas"></canvas><canvas class="draw-overlay"></canvas><div class="draw-cursor" hidden></div>
          <div class="draw-pending" hidden>
            <button class="btn" data-pend="smaller">➖</button><button class="btn" data-pend="bigger">➕</button>
            <button class="btn" data-pend="ccw">↺</button><button class="btn" data-pend="cw">↻</button>
            <button class="btn" data-pend="flip">↔</button>
            <button class="btn" data-pend="remove">🗑</button><button class="btn primary-btn" data-pend="stick">✓ Stick it</button>
          </div>
        </div>
        <div class="draw-shapes">
          <p class="draw-hint">Drag a shape onto the page, then draw the details!</p>
          ${groups.map((g) => `<h4>${g}</h4><div class="draw-grid three">${SHAPES.filter((s) => s.group === g).map((s) => `<button class="draw-thumb" data-shape="${s.id}"><canvas width="64" height="64"></canvas></button>`).join('')}</div>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(root);
    for (const b of root.querySelectorAll('.draw-thumb')) {
      const s = SHAPES.find((x) => x.id === b.dataset.shape); const c = b.firstElementChild.getContext('2d');
      const H = s.aspect >= 1 ? 56 / s.aspect : 56; const W = H * s.aspect;
      c.translate((64 - W) / 2, (64 - H) / 2); drawShape(c, s, W, H, '#111827', 2);
    }
    cv = $('.draw-canvas', root); ov = $('.draw-overlay', root);
    ctx = cv.getContext('2d', { willReadFrequently: true }); octx = ov.getContext('2d');
    ov.addEventListener('pointerdown', onDown);
    ov.addEventListener('pointermove', onMove);
    ['pointerup', 'pointercancel'].forEach((ev) => ov.addEventListener(ev, onUp));
    ov.addEventListener('pointerleave', hideCursor);
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onThumbDown);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keep the page the same size as its frame, whenever the layout settles or changes (the drawing is kept).
    if (window.ResizeObserver) new ResizeObserver(() => { if (!root.hidden) { fitCanvas(); renderOverlay(); } }).observe($('.draw-stage', root));
  }

  function fitCanvas() {
    const stage = $('.draw-stage', root); const w = stage.clientWidth; const h = stage.clientHeight;
    if (!w || !h || (cv.width === w && cv.height === h)) return;
    const old = cv.width && cv.height && cv.dataset.ready ? ctx.getImageData(0, 0, cv.width, cv.height) : null;
    cv.width = w; cv.height = h; ov.width = w; ov.height = h;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    if (old) ctx.putImageData(old, 0, 0);
    else {
      try {
        const saved = localStorage.getItem('fc_drawing');
        if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = saved; }
      } catch { /* no saved drawing */ }
    }
    cv.dataset.ready = '1'; undo.length = 0;
  }

  function syncUi() {
    root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === st.tool));
    root.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === st.size));
    root.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', !st.rainbow && b.dataset.color === st.color));
    $('[data-rainbow]', root).classList.toggle('on', st.rainbow);
    $('.draw-pending', root).hidden = !pending;
  }

  // ---- Drawing --------------------------------------------------------------------------------------
  const pos = (e) => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ov.width / r.width), y: (e.clientY - r.top) * (ov.height / r.height) }; };
  function pushUndo() { try { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 8) undo.shift(); } catch { /* out of memory: skip */ } }
  function autosave() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('fc_drawing', cv.toDataURL('image/png')); } catch { /* too big: skip */ } }, 2500); }
  function inkColor() {
    if (st.tool === 'eraser') return '#ffffff';
    if (st.rainbow) { st.hue = (st.hue + 3) % 360; return `hsl(${st.hue}, 90%, 55%)`; }
    return st.color;
  }
  const penWidth = () => (st.tool === 'pencil' ? Math.max(2, st.size / 3) : st.tool === 'eraser' ? st.size * 2 : st.size);

  // A ring the size of the current tool: follows a mouse or stylus as it hovers, sits under the finger while
  // drawing, and flashes in the middle of the page when the tool or size changes (touchscreens cannot hover).
  const toolDiameter = () => (st.tool === 'fill' ? 0 : st.tool === 'spray' ? (st.size * 1.6 + 6) * 2 : st.tool === 'crayon' ? st.size + Math.max(1.5, st.size / 4) : penWidth());
  let cursorT = null;
  function showCursor(clientX, clientY, lingerMs) {
    const el = $('.draw-cursor', root); const d = toolDiameter();
    clearTimeout(cursorT);
    if (!d || pending) { el.hidden = true; return; }
    const r = ov.getBoundingClientRect(); const size = Math.max(6, d * (r.width / ov.width));
    el.style.width = `${size}px`; el.style.height = `${size}px`;
    el.style.left = `${clientX - r.left - size / 2}px`; el.style.top = `${clientY - r.top - size / 2}px`;
    el.classList.toggle('eraser', st.tool === 'eraser');
    el.hidden = false;
    if (lingerMs) cursorT = setTimeout(() => { el.hidden = true; }, lingerMs);
  }
  function hideCursor() { clearTimeout(cursorT); const el = root && $('.draw-cursor', root); if (el) el.hidden = true; }
  function flashCursor() { const r = ov.getBoundingClientRect(); showCursor(r.left + r.width / 2, r.top + r.height / 2, 1200); }

  function segment(p, x, y) {
    const c = inkColor();
    if (st.tool === 'spray') {
      ctx.fillStyle = c; const R = st.size * 1.6 + 6;
      for (let i = 0; i < 16; i += 1) { const a = Math.random() * 6.283; const r = Math.sqrt(Math.random()) * R; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 2); }
    } else if (st.tool === 'crayon') {
      ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, st.size / 4);
      for (let i = 0; i < 5; i += 1) {
        const j = () => (Math.random() - 0.5) * st.size;
        ctx.beginPath(); ctx.moveTo(p.x + j(), p.y + j()); ctx.lineTo(x + j(), y + j()); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = c; ctx.lineWidth = penWidth(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const mx = (p.x + x) / 2; const my = (p.y + y) / 2;
      ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.quadraticCurveTo(p.x, p.y, mx, my); ctx.stroke();
      p.mx = mx; p.my = my;
    }
    p.x = x; p.y = y;
  }

  function floodFill(x0, y0, css) {
    const w = cv.width; const h = cv.height; const x = Math.floor(x0); const y = Math.floor(y0);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    ctx.fillStyle = css; const hex = ctx.fillStyle; // normalises hsl() to #rrggbb
    const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16);
    const img = ctx.getImageData(0, 0, w, h); const d = img.data;
    const i0 = (y * w + x) * 4; const tr = d[i0]; const tg = d[i0 + 1]; const tb = d[i0 + 2];
    if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 12) return;
    const match = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= 110;
    const seen = new Uint8Array(w * h); const stack = [x, y];
    while (stack.length) {
      const cy = stack.pop(); const cx = stack.pop();
      let lx = cx; while (lx >= 0 && !seen[cy * w + lx] && match((cy * w + lx) * 4)) lx -= 1; lx += 1;
      let rx = cx; while (rx < w && !seen[cy * w + rx] && match((cy * w + rx) * 4)) rx += 1; rx -= 1;
      if (rx < lx) continue;
      for (let px = lx; px <= rx; px += 1) { const p = cy * w + px; seen[p] = 1; const i = p * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
      for (const ny of [cy - 1, cy + 1]) {
        if (ny < 0 || ny >= h) continue;
        let inSpan = false;
        for (let px = lx; px <= rx; px += 1) {
          const p = ny * w + px; const ok = !seen[p] && match(p * 4);
          if (ok && !inSpan) { stack.push(px, ny); inSpan = true; } else if (!ok) inSpan = false;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- A shape that has been dragged in but not stuck down yet ---------------------------------------
  const shapeColor = () => (st.rainbow || st.color === '#ffffff' ? '#111827' : st.color);
  function paintShape(c, p) {
    const H = p.h; const W = H * p.shape.aspect;
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(p.flip ? -1 : 1, 1); c.translate(-W / 2, -H / 2);
    drawShape(c, p.shape, W, H, shapeColor(), 4);
    c.restore();
  }
  function renderOverlay() {
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!pending) return;
    paintShape(octx, pending);
    const H = pending.h; const W = H * pending.shape.aspect;
    octx.save(); octx.translate(pending.x, pending.y); octx.rotate(pending.rot);
    octx.setLineDash([8, 6]); octx.strokeStyle = '#3b82f6'; octx.lineWidth = 2; octx.strokeRect(-W / 2 - 8, -H / 2 - 8, W + 16, H + 16);
    octx.setLineDash([]); octx.fillStyle = '#3b82f6'; octx.beginPath(); octx.arc(W / 2 + 8, H / 2 + 8, 16, 0, Math.PI * 2); octx.fill();
    octx.fillStyle = '#fff'; octx.font = 'bold 18px sans-serif'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText('⤡', W / 2 + 8, H / 2 + 9);
    octx.restore();
  }
  function hitPending(pt) {
    if (!pending) return null;
    const dx = pt.x - pending.x; const dy = pt.y - pending.y; const cs = Math.cos(-pending.rot); const sn = Math.sin(-pending.rot);
    const lx = dx * cs - dy * sn; const ly = dx * sn + dy * cs; const H = pending.h; const W = H * pending.shape.aspect;
    if (Math.hypot(lx - (W / 2 + 8), ly - (H / 2 + 8)) < 34) return 'handle';
    return Math.abs(lx) <= W / 2 + 14 && Math.abs(ly) <= H / 2 + 14 ? 'body' : null;
  }
  function place(shape, x, y) {
    stick();
    pending = { shape, x, y, h: Math.max(40, cv.height * shape.size), rot: 0, flip: false };
    syncUi(); renderOverlay();
  }
  function stick() {
    if (!pending) return;
    pushUndo(); paintShape(ctx, pending); pending = null; drag = null;
    syncUi(); renderOverlay(); autosave();
  }

  // ---- Pointer handling on the page --------------------------------------------------------------------
  function onDown(e) {
    e.preventDefault();
    try { ov.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const pt = pos(e);
    if (pending) {
      const hit = hitPending(pt);
      if (hit === 'handle') { drag = { id: e.pointerId, mode: 'resize', d0: Math.hypot(pt.x - pending.x, pt.y - pending.y) || 1, h0: pending.h }; return; }
      if (hit === 'body') { drag = { id: e.pointerId, mode: 'move', dx: pt.x - pending.x, dy: pt.y - pending.y }; return; }
      stick(); // touching the page anywhere else sticks the shape down and carries on drawing
    }
    showCursor(e.clientX, e.clientY);
    pushUndo();
    if (st.tool === 'fill') { floodFill(pt.x, pt.y, st.rainbow ? `hsl(${(st.hue += 40) % 360}, 90%, 55%)` : st.color); autosave(); return; }
    const p = { x: pt.x, y: pt.y, mx: pt.x, my: pt.y };
    pointers.set(e.pointerId, p);
    segment(p, pt.x + 0.01, pt.y + 0.01); // a tap leaves a dot
  }
  function onMove(e) {
    if (!drag) showCursor(e.clientX, e.clientY);
    if (drag && drag.id === e.pointerId && pending) {
      const pt = pos(e);
      if (drag.mode === 'move') { pending.x = pt.x - drag.dx; pending.y = pt.y - drag.dy; }
      else pending.h = Math.max(30, Math.min(cv.height * 1.2, drag.h0 * (Math.hypot(pt.x - pending.x, pt.y - pending.y) / drag.d0)));
      renderOverlay(); return;
    }
    const p = pointers.get(e.pointerId); if (!p) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ce of (evs.length ? evs : [e])) { const pt = pos(ce); segment(p, pt.x, pt.y); }
  }
  function onUp(e) {
    if (e.pointerType === 'touch') showCursor(e.clientX, e.clientY, 500); // fingers cannot hover: let the ring linger a moment
    if (drag && drag.id === e.pointerId) { drag = null; return; }
    const p = pointers.get(e.pointerId); if (!p) return;
    if (st.tool !== 'spray' && st.tool !== 'crayon') { ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    pointers.delete(e.pointerId); autosave();
  }

  // Dragging a shape out of the pane: a ghost follows the finger; dropping on the page places it, a plain tap puts it in the middle.
  function onThumbDown(e) {
    const b = e.target.closest('.draw-thumb'); if (!b) return;
    e.preventDefault();
    const shape = SHAPES.find((s) => s.id === b.dataset.shape);
    const ghost = document.createElement('canvas'); ghost.className = 'draw-ghost'; ghost.width = 96; ghost.height = 96;
    const H = shape.aspect >= 1 ? 88 / shape.aspect : 88; const W = H * shape.aspect; const g = ghost.getContext('2d');
    g.translate((96 - W) / 2, (96 - H) / 2); drawShape(g, shape, W, H, shapeColor(), 3);
    const moveGhost = (ev) => { ghost.style.left = `${ev.clientX - 48}px`; ghost.style.top = `${ev.clientY - 48}px`; };
    moveGhost(e); document.body.appendChild(ghost);
    try { b.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const done = (ev) => {
      b.removeEventListener('pointermove', moveGhost); b.removeEventListener('pointerup', done); b.removeEventListener('pointercancel', done);
      ghost.remove();
      if (ev.type === 'pointercancel') return;
      const r = ov.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside) { const pt = pos(ev); place(shape, pt.x, pt.y); } else place(shape, cv.width / 2, cv.height / 2);
    };
    b.addEventListener('pointermove', moveGhost); b.addEventListener('pointerup', done); b.addEventListener('pointercancel', done);
  }

  function onClick(e) {
    const t = e.target;
    const tool = t.closest('[data-tool]'); if (tool) { st.tool = tool.dataset.tool; syncUi(); flashCursor(); return; }
    const size = t.closest('[data-size]'); if (size) { st.size = Number(size.dataset.size); syncUi(); flashCursor(); return; }
    const color = t.closest('[data-color]'); if (color) { st.color = color.dataset.color; st.rainbow = false; if (st.tool === 'eraser') st.tool = 'brush'; syncUi(); renderOverlay(); return; }
    if (t.closest('[data-rainbow]')) { st.rainbow = !st.rainbow; if (st.tool === 'eraser') st.tool = 'brush'; syncUi(); renderOverlay(); return; }
    const pend = t.closest('[data-pend]');
    if (pend && pending) {
      const a = pend.dataset.pend;
      if (a === 'smaller') pending.h = Math.max(30, pending.h * 0.85);
      if (a === 'bigger') pending.h = Math.min(cv.height * 1.2, pending.h * 1.18);
      if (a === 'ccw') pending.rot -= Math.PI / 12;
      if (a === 'cw') pending.rot += Math.PI / 12;
      if (a === 'flip') pending.flip = !pending.flip;
      if (a === 'remove') { pending = null; syncUi(); }
      if (a === 'stick') { stick(); return; }
      renderOverlay(); return;
    }
    if (t.closest('[data-draw-undo]')) {
      if (pending) { pending = null; syncUi(); renderOverlay(); return; }
      const img = undo.pop(); if (img) { ctx.putImageData(img, 0, 0); autosave(); }
      return;
    }
    if (t.closest('[data-draw-clear]')) { stick(); pushUndo(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); autosave(); return; } // Undo brings it back
    if (t.closest('[data-draw-save]')) { openSlots('save'); return; }
    if (t.closest('[data-draw-load]')) { openSlots('open'); return; }
    if (t.closest('[data-draw-close]')) { close(); return; }
    onSlotsClick(t);
  }

  // ---- Saved pictures: eight slots per kid, kept on the Pi ----------------------------------------------
  const SLOTS = 8;
  const gal = { mode: 'save', kid: null, kids: [], slots: [], ask: null }; // ask: { slot, what: 'replace' | 'delete' }
  async function api(url, opts = {}) {
    const res = await fetch(url, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg) {
    const el = document.createElement('div'); el.className = 'draw-toast'; el.textContent = msg; root.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  function closeSlots() { const m = $('.draw-modal', root); if (m) m.remove(); gal.ask = null; }
  async function openSlots(mode) {
    stick(); gal.mode = mode; gal.ask = null;
    try {
      const members = await api('/api/members');
      gal.kids = members.filter((m) => m.role === 'kid');
      if (gal.kid && !gal.kids.some((k) => k.id === gal.kid)) gal.kid = null;
      if (gal.kids.length === 1) gal.kid = gal.kids[0].id;
      if (gal.kid) gal.slots = await api(`/api/drawings?member=${gal.kid}`);
    } catch (err) { toast(err.message); return; }
    renderSlots();
  }
  function renderSlots() {
    closeSlotsKeepAsk();
    const modal = document.createElement('div'); modal.className = 'draw-modal';
    const kid = gal.kids.find((k) => k.id === gal.kid);
    let body;
    if (!kid) {
      body = `<h2>${gal.mode === 'save' ? '💾 Save' : '📂 Open'} — whose pictures?</h2>
        <div class="draw-kids">${gal.kids.map((k) => `<button class="draw-kid" data-gal-kid="${k.id}" style="--c:${esc(k.color)}"><span class="avatar">${esc(k.emoji)}</span>${esc(k.name)}</button>`).join('') || '<p>Add kids in the parent app first.</p>'}</div>`;
    } else {
      const frames = Array.from({ length: SLOTS }, (_, i) => {
        const s = gal.slots.find((x) => x.slot === i + 1) || { slot: i + 1, url: null };
        const asking = gal.ask && gal.ask.slot === s.slot;
        if (!s.url) return `<button class="draw-slot empty" data-gal-slot="${s.slot}" ${gal.mode === 'open' ? 'disabled' : ''}><span class="plus">+</span><small>${gal.mode === 'save' ? 'Save here' : 'Empty'}</small></button>`;
        return `<div class="draw-slot filled" data-gal-slot="${s.slot}"><img src="${esc(s.url)}" alt="Picture ${s.slot}">
          <button class="draw-slot-del" data-gal-del="${s.slot}" title="Throw this picture away">🗑</button>
          ${asking ? `<div class="draw-ask"><b>${gal.ask.what === 'delete' ? 'Throw this picture away?' : 'Save over this picture?'}</b><div><button class="btn primary-btn" data-gal-yes>${gal.ask.what === 'delete' ? 'Yes, throw away' : 'Yes, save here'}</button><button class="btn" data-gal-no>Keep it</button></div></div>` : `<small>${gal.mode === 'save' ? 'Tap to save over' : 'Tap to open'}</small>`}</div>`;
      }).join('');
      body = `<h2><span class="avatar" style="--c:${esc(kid.color)}">${esc(kid.emoji)}</span> ${esc(kid.name)}'s pictures <span class="draw-mode">${gal.mode === 'save' ? '💾 tap a frame to save' : '📂 tap a picture to open'}</span>
          ${gal.kids.length > 1 ? `<button class="btn" data-gal-switch>Not ${esc(kid.name)}?</button>` : ''}</h2>
        <div class="draw-slots">${frames}</div>`;
    }
    modal.innerHTML = `<div class="draw-modal-card">${body}<div class="draw-modal-foot"><button class="btn" data-gal-close>Close</button></div></div>`;
    root.appendChild(modal);
  }
  function closeSlotsKeepAsk() { const m = $('.draw-modal', root); if (m) m.remove(); }
  async function saveTo(slot) {
    try {
      gal.slots = await api(`/api/drawings/${gal.kid}/${slot}`, { method: 'PUT', body: { image: cv.toDataURL('image/png') } });
      gal.ask = null; renderSlots(); toast('Saved! 🎉');
      setTimeout(closeSlots, 900);
    } catch (err) { toast(err.message); }
  }
  function loadFrom(slot) {
    const s = gal.slots.find((x) => x.slot === slot); if (!s || !s.url) return;
    const img = new Image();
    img.onload = () => {
      pushUndo(); // Undo brings the old page back
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      const k = Math.min(cv.width / img.width, cv.height / img.height); const w = img.width * k; const h = img.height * k;
      ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      autosave(); closeSlots();
    };
    img.onerror = () => toast('Could not open that picture');
    img.src = s.url;
  }
  async function onSlotsClick(t) {
    if (!$('.draw-modal', root)) return;
    if (t.closest('[data-gal-close]') || t.classList.contains('draw-modal')) { closeSlots(); return; }
    const kidBtn = t.closest('[data-gal-kid]');
    if (kidBtn) { gal.kid = Number(kidBtn.dataset.galKid); try { gal.slots = await api(`/api/drawings?member=${gal.kid}`); } catch (err) { toast(err.message); return; } renderSlots(); return; }
    if (t.closest('[data-gal-switch]')) { gal.kid = null; gal.ask = null; renderSlots(); return; }
    if (t.closest('[data-gal-no]')) { gal.ask = null; renderSlots(); return; }
    if (t.closest('[data-gal-yes]') && gal.ask) {
      if (gal.ask.what === 'replace') { await saveTo(gal.ask.slot); return; }
      try { gal.slots = await api(`/api/drawings/${gal.kid}/${gal.ask.slot}`, { method: 'DELETE' }); } catch (err) { toast(err.message); }
      gal.ask = null; renderSlots(); return;
    }
    const del = t.closest('[data-gal-del]');
    if (del) { gal.ask = { slot: Number(del.dataset.galDel), what: 'delete' }; renderSlots(); return; }
    const slotEl = t.closest('[data-gal-slot]');
    if (!slotEl || t.closest('.draw-ask')) return;
    const slot = Number(slotEl.dataset.galSlot); const filled = slotEl.classList.contains('filled');
    if (gal.mode === 'open') { if (filled) loadFrom(slot); return; }
    if (filled) { gal.ask = { slot, what: 'replace' }; renderSlots(); } else await saveTo(slot);
  }

  function open() {
    if (!root) build();
    root.hidden = false;
    fitCanvas(); syncUi(); renderOverlay();
  }
  function close() {
    if (!root) return;
    stick(); pointers.clear(); closeSlots(); gal.kid = null; // the next artist picks their own name
    clearTimeout(saveT); try { localStorage.setItem('fc_drawing', cv.toDataURL('image/png')); } catch { /* skip */ }
    root.hidden = true;
  }

  document.addEventListener('click', (e) => { if (e.target.closest('[data-draw-open]')) open(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root && !root.hidden) close(); });
  window.addEventListener('resize', () => { if (root && !root.hidden) { fitCanvas(); renderOverlay(); } });
  window.DrawMode = { open, close };
})();
