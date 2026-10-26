// iPad controller: pick a lantern, then draw / write / change its light, then send it to the wall.
// The wall view animates with the same ambient engine as the projector (ambient.js).
(() => {
  const $ = s => document.querySelector(s);

  // ---------- Settings ----------
  const FACE_MAX = 800;            // longest side of the drawing space; the other side follows the lantern's shape
  const SS = 1.5;                  // export scale -> a 3:4 lantern exports at 900 x 1200
  const IDLE_MS = 90_000;          // editor returns to the wall after this long untouched
  const AFTERGLOW_MS = 4200;       // "Look up" message after sending
  let W = 600, H = 800;            // current drawing space, set per lantern in openEditor()
  let shape = 'rect';              // current lantern's shape

  const INK = ['#1b1420', '#ffffff', '#d93a4a', '#f28a2e', '#f2c12e', '#2e9e5b', '#2f6fd6', '#8a4fd6'];
  const GLOW = [
    { n: 'Amber', c: '#f4a64a' }, { n: 'Warm white', c: '#fff1d6' }, { n: 'Cool white', c: '#e8f1ff' },
    { n: 'Rose', c: '#ec6f86' }, { n: 'Red', c: '#e0453a' }, { n: 'Orange', c: '#f28a2e' },
    { n: 'Yellow', c: '#f5d547' }, { n: 'Lime', c: '#9ad46f' }, { n: 'Teal', c: '#3fc1b0' },
    { n: 'Sky', c: '#5fb7d4' }, { n: 'Blue', c: '#3d6fe0' }, { n: 'Violet', c: '#9b7be8' },
    { n: 'Off', c: 'off' }
  ];
  const FONTS = {
    hand:  { label: 'Hand',  css: "600 SIZEpx Caveat, 'Comic Sans MS', cursive" },
    bold:  { label: 'Bold',  css: "700 SIZEpx 'Bricolage Grotesque', system-ui, sans-serif" },
    serif: { label: 'Serif', css: "600 SIZEpx Fraunces, Georgia, serif" }
  };
  const HINTS = {
    draw: 'Draw with your finger or Apple Pencil',
    text: 'Type your message, then drag the box to place it',
    color: 'This is how the lantern will glow'
  };
  const MODE_NAMES = { draw: 'Draw', text: 'Add text', color: 'Change the light' };

  // ---------- State ----------
  let lanterns = [];
  let current = null;   // lantern id being edited
  let mode = null;      // 'draw' | 'text' | 'color'
  const ed = {
    base: null, strokes: [], color: '#f4a64a',
    brush: { color: INK[0], size: 16, erase: false },
    text: { value: '', size: 96, color: INK[0], font: 'hand', dx: 0, dy: 0, box: null, placing: false }
  };

  // ---------- Startup: setup check -> wall ----------
  const conn = $('#conn');
  const show = id => ['screen-setup', 'screen-wall', 'screen-editor']
    .forEach(s => { $('#' + s).hidden = s !== id; });

  function boot() {
    if (LW.libMissing) {
      $('#setupMsg').textContent = "Can't reach the internet right now. Check the Wi-Fi, then reload this page.";
      return show('screen-setup');
    }
    if (!LW.configured) return show('screen-setup');
    enterWall();
  }

  let live = false;
  function enterWall() {
    show('screen-wall');
    fitWall(); loop(); touch();
    if (live) return;
    live = true;
    LW.subscribe({
      onAll: list => { lanterns = list; renderWall(); },
      onChange: l => {
        const i = lanterns.findIndex(x => x.id === l.id);
        if (i >= 0) lanterns[i] = l; else lanterns.push(l);
        const el = document.getElementById('lan-' + l.id);
        if (el && !el.classList.contains('shape-' + l.shape)) return renderWall();
        updateWallLantern(l, true);
      },
      onRemove: id => {
        lanterns = lanterns.filter(x => x.id !== id);
        document.getElementById('lan-' + id)?.remove();
        art.delete(id); syncEngine();
      },
      onStatus: status => {
        conn.className = 'conn ' + status;
        conn.querySelector('span').textContent = status === 'open' ? 'Wall connected' : 'Reconnecting…';
      }
    });
  }

  // ---------- Wall screen ----------
  // The wall mirrors the projector: one canvas paints every lantern (a detailed sprite rendered once per
  // change), then the shared ambient engine adds breathing, flicker, color drift and wisps between lanterns.
  // Each lantern also gets an invisible button on top for tapping.
  const wall = $('#wall'), wallWrap = $('#wallWrap'), wallCanvas = $('#wallCanvas');
  const FADE_MS = 1000;
  const art = new Map();      // id -> { img, url, color, seq, pending, prev, t0, burst, sprites }
  const touched = new Set();  // lanterns changed while this page was open (they keep their color)
  const eng = Ambient.createEngine({ WISP_SIZE: 0.02, MAX_WISPS: 3 });
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const layoutColor = id => (window.LANTERN_LAYOUT || [])[id - 1]?.color;
  function syncEngine() {
    eng.setLanterns(lanterns.map(l => {
      const a = art.get(l.id) || {};
      return {
        id: l.id, ...l.wall, color: l.color, content: !!a.img,
        custom: !!a.img || touched.has(l.id) || l.color !== layoutColor(l.id)
      };
    }), 16 / 9);
  }

  function renderWall() {
    wall.querySelectorAll('.lan').forEach(b => b.remove());
    lanterns.forEach(l => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lan shape-' + l.shape; b.id = 'lan-' + l.id;
      b.setAttribute('aria-label', `Lantern ${l.id}`);
      b.innerHTML = '<span class="num"></span>';
      b.querySelector('.num').textContent = l.id;
      b.addEventListener('pointerdown', () => eng.poke(l.id, 0.7));     // lanterns brighten under a finger
      b.addEventListener('click', () => openChooser(l.id));
      wall.append(b);
      updateWallLantern(l, false);
    });
    syncEngine();
  }

  // animate = true when this is a live change (bloom + sparkle + ripple); false for the first draw
  async function updateWallLantern(l, animate) {
    const b = document.getElementById('lan-' + l.id);
    if (!b) return renderWall();
    Object.assign(b.style, {
      left: l.wall.x * 100 + '%', top: l.wall.y * 100 + '%',
      width: l.wall.w * 100 + '%', height: l.wall.h * 100 + '%'
    });
    if (!art.has(l.id)) art.set(l.id, { sprites: {} });
    const a = art.get(l.id), seq = a.seq = (a.seq || 0) + 1;
    const urlChanged = (a.url || null) !== (l.imageUrl || null);
    const changed = animate && a.seen && (urlChanged || a.color !== l.color);
    const before = { color: a.color, img: a.img, sprites: {} };
    if (urlChanged) {            // load the new drawing first so it blooms in complete
      let img = null;
      if (l.imageUrl) { try { img = await LW.loadImage(l.imageUrl); } catch { /* show without it */ } }
      if (a.seq !== seq) return;  // a newer update already arrived
      a.img = img; a.url = l.imageUrl;
    }
    a.color = l.color; a.seen = true;
    if (changed) { touched.add(l.id); a.pending = before; }
    syncEngine();
    if (wallVisible()) startPending();
  }

  // A change that arrived while the wall was hidden plays its reveal when the wall comes back
  function startPending() {
    for (const l of lanterns) {
      const a = art.get(l.id);
      if (!a || !a.pending) continue;
      a.prev = a.pending; a.pending = null;
      a.t0 = performance.now();
      a.burst = Ambient.burst(l.shape, l.color);
      eng.reveal(l.id, l.color);
    }
    loop();
  }

  // Detailed lantern sprite for one surface, re-rendered only when something changes
  function spriteFor(holder, surface, l, color, img, w, h) {
    const key = `${l.shape}|${color}|${Math.round(w)}x${Math.round(h)}`;
    const c = holder.sprites[surface];
    if (c && c.key === key && c.img === img) return c.sprite;
    holder.sprites[surface] = { key, img, sprite: LanternArt.sprite({ shape: l.shape, color, img }, w, h, dpr()) };
    return holder.sprites[surface].sprite;
  }

  // box = where the 16:9 wall sits on the canvas (CSS pixels); the canvas spills past the wall for glow
  const surfaces = { wall: { canvas: wallCanvas, box: null } };

  function sizeSurface(name) {
    const s = surfaces[name], d = dpr();
    const w = wall.offsetWidth, h = wall.offsetHeight, pad = Math.round(Math.max(w, h) * 0.06);
    const cw = w + pad * 2, ch = h + pad * 2, box = { x: pad, y: pad, w, h };
    Object.assign(s.canvas.style, { left: -pad + 'px', top: -pad + 'px', width: cw + 'px', height: ch + 'px' });
    if (s.canvas.width !== Math.round(cw * d) || s.canvas.height !== Math.round(ch * d)) {
      s.canvas.width = Math.round(cw * d); s.canvas.height = Math.round(ch * d);
    }
    s.box = box;
  }

  const wallClock = now => (performance.timeOrigin + now) / 1000;
  function paintSurface(name, now) {
    const s = surfaces[name], g = s.canvas.getContext('2d'), d = dpr(), B = s.box;
    if (!B || B.w < 2) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s.canvas.width, s.canvas.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    const wallSec = wallClock(now);
    for (const l of lanterns) {
      const a = art.get(l.id);
      if (!a) continue;
      const R = { x: B.x + l.wall.x * B.w, y: B.y + l.wall.y * B.h, w: l.wall.w * B.w, h: l.wall.h * B.h };
      const Lt = eng.light(l.id, wallSec);
      const T = a.prev ? Math.min(1, (now - a.t0) / FADE_MS) : 1, k = Ambient.ease.outCubic(T);
      if (a.prev && T < 1) {
        const ps = spriteFor(a.prev, name, l, a.prev.color, a.prev.img, R.w, R.h);
        g.globalAlpha = 1 - k; g.drawImage(ps.c, R.x - ps.mg.x, R.y - ps.mg.top, ps.c.width / d, ps.c.height / d);
      } else a.prev = null;
      if (Lt) Ambient.paintHalo(g, R, Lt, k, 1.2);
      const sp = spriteFor(a, name, l, l.color, a.img, R.w, R.h);
      g.globalAlpha = k; g.drawImage(sp.c, R.x - sp.mg.x, R.y - sp.mg.top, sp.c.width / d, sp.c.height / d);
      g.globalAlpha = 1;
      if (Lt) {
        const glow = Lt.glow;
        if (a.prev) Lt.glow += Math.sin(Math.PI * T) * 0.7;                // bloom
        Ambient.paintOverlay(g, l.shape, R, Lt, k, { drift: !a.img && !touched.has(l.id) && l.color === layoutColor(l.id), flame: a.img ? 0.4 : 1 });
        Lt.glow = glow;
      }
      if (a.burst && !Ambient.drawBurst(g, a.burst, R.x, R.y, R.w, R.h, now)) a.burst = null;
    }
    g.save();
    g.translate(B.x, B.y);
    eng.drawWisps(g, B.w, B.h);
    g.restore();
  }

  // One animation loop, running only while the wall is on screen
  const wallVisible = () => !$('#screen-wall').hidden;
  let rafOn = false, lastNow = 0;
  function loop() {
    if (rafOn || !wallVisible()) return;
    rafOn = true; lastNow = 0;
    requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!wallVisible()) { rafOn = false; return; }
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    eng.update(dt);
    paintSurface('wall', now);
    requestAnimationFrame(tick);
  }

  function fitWall() {
    const r = wallWrap.getBoundingClientRect();
    const w = Math.min(r.width, r.height * 16 / 9) * 0.94;
    wall.style.width = w + 'px'; wall.style.height = (w * 9 / 16) + 'px';
    sizeSurface('wall');
  }
  new ResizeObserver(fitWall).observe(wallWrap);

  // ---------- Chooser ----------
  const chooser = $('#chooser');
  let chosenId = null;
  function openChooser(id) {
    chosenId = id;
    const l = lanterns.find(x => x.id === id);
    $('#chooserTitle').textContent = 'Lantern ' + id;
    drawMini(l);
    const c = Ambient.rgb(l.color);
    chooser.style.setProperty('--mini-glow', c ? Ambient.css(c, 0.55) : 'rgba(255,241,214,0.25)');
    chooser.classList.remove('closing');
    chooser.hidden = false;
  }
  // Fades the chooser out instead of snapping it away
  let chooserTimer;
  function closeChooser(instant = false) {
    if (chooser.hidden) return;
    clearTimeout(chooserTimer);
    if (instant || Ambient.reduceMotion.matches) { chooser.hidden = true; return; }
    chooser.classList.add('closing');
    chooserTimer = setTimeout(() => { chooser.hidden = true; chooser.classList.remove('closing'); }, 450);
  }
  // Small detailed preview of the chosen lantern, at its real proportions
  function drawMini(l) {
    const mini = $('#chooserMini');
    const aspect = (l.wall.w * 16) / (l.wall.h * 9);
    let h = 60, w = h * aspect;
    if (w > 84) { w = 84; h = w / aspect; }
    const mg = LanternArt.margins(l.shape, w, h), dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = w + 2 * mg.x, ch = h + mg.top + mg.bottom;
    mini.width = Math.ceil(cw * dpr); mini.height = Math.ceil(ch * dpr);
    mini.style.width = cw + 'px'; mini.style.height = ch + 'px';
    const g = mini.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LanternArt.drawDetailed(g, { shape: l.shape, color: l.color, img: art.get(l.id)?.img }, mg.x, mg.top, w, h);
  }
  chooser.querySelectorAll('[data-mode]').forEach(b =>
    b.addEventListener('click', () => { closeChooser(); openEditor(chosenId, b.dataset.mode); }));
  $('#chooserCancel').addEventListener('click', () => closeChooser());
  chooser.addEventListener('click', e => { if (e.target === chooser) closeChooser(); });

  // ---------- Editor ----------
  const stage = $('#stage'), frame = $('#frame');
  const bg = $('#bg'), ink = $('#ink');
  const bctx = bg.getContext('2d'), ictx = ink.getContext('2d', { willReadFrequently: true });

  // Size the drawing space to the lantern's real proportions (wall rect is on a 16:9 surface)
  function sizeCanvases(l) {
    const aspect = (l.wall.w * 16) / (l.wall.h * 9);   // width / height
    if (aspect >= 1) { W = FACE_MAX; H = Math.round(FACE_MAX / aspect); }
    else { H = FACE_MAX; W = Math.round(FACE_MAX * aspect); }
    [bg, ink].forEach(c => { c.width = Math.round(W * SS); c.height = Math.round(H * SS); });
    bctx.setTransform(SS, 0, 0, SS, 0, 0);
    ictx.setTransform(SS, 0, 0, SS, 0, 0);
    frame.classList.toggle('round', l.shape === 'circle' || l.shape === 'oval');
  }

  // The lantern in the editor glows softly in its light color
  function frameGlow() {
    const c = Ambient.rgb(ed.color);
    frame.style.setProperty('--frame-glow', c ? Ambient.css(c, 0.45) : 'rgba(255,241,214,0.12)');
  }

  async function openEditor(id, m) {
    const l = lanterns.find(x => x.id === id);
    current = id; mode = m; shape = l.shape;
    sizeCanvases(l);
    ed.strokes = []; ed.base = null; ed.color = l.color;
    ed.brush.erase = false;
    ed.text = { ...ed.text, value: '', dx: 0, dy: 0, box: null, placing: false, size: Math.round(96 * Math.min(W, H) / 600) };

    $('#edTitle').textContent = `Lantern ${id} · ${MODE_NAMES[m]}`;
    ['draw', 'text', 'color'].forEach(k => { $('#tools-' + k).hidden = k !== m; });
    stage.className = 'stage ' + m;
    $('#hint').textContent = HINTS[m];
    $('#screen-wall').hidden = true;
    $('#screen-editor').hidden = false;
    fitFrame(); syncControls(); renderBg(); renderInk(); touch();

    // Start from what's already on the lantern so people can add to it
    if (l.imageUrl) {
      try {
        const img = await LW.loadImage(l.imageUrl);
        if (current === id) { ed.base = img; renderInk(); }
      } catch { /* start blank */ }
    }
  }

  function goWall() {
    $('#screen-editor').hidden = true;
    $('#screen-wall').hidden = false;
    current = null; mode = null;
    frame.classList.remove('sent');
    fitWall();
    startPending();
    touch();
  }
  $('#back').addEventListener('click', goWall);

  const facePath = ctx => LanternArt.facePath(ctx, shape, 0, 0, W, H);

  // Background = the light color, the way the projector will show it
  function renderBg() {
    bctx.clearRect(0, 0, W, H);
    facePath(bctx);
    bctx.fillStyle = ed.color === 'off' ? '#2d2733' : ed.color;
    bctx.fill();
    frameGlow();
    // faint paper ribs
    bctx.save(); facePath(bctx); bctx.clip();
    bctx.strokeStyle = 'rgba(0,0,0,.10)'; bctx.lineWidth = 2;
    for (let y = H / 9; y < H; y += H / 9) { bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(W, y); bctx.stroke(); }
    bctx.restore();
  }

  function drawStroke(ctx, s, from) {
    const p = s.points;
    const w = pt => s.size * (0.35 + pt.p * 1.3);
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (from === 0) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, w(p[0]) / 2, 0, Math.PI * 2); ctx.fill(); }
    for (let i = Math.max(1, from); i < p.length; i++) {
      ctx.beginPath(); ctx.lineWidth = w(p[i]);
      ctx.moveTo(p[i - 1].x, p[i - 1].y); ctx.lineTo(p[i].x, p[i].y); ctx.stroke();
    }
    ctx.restore();
  }

  function wrapLines(ctx, text, max) {
    const out = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > max && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  // Text is centered on the letters you actually see (not the font's em box), wrapped to the lantern's
  // usable width (narrower for round shapes), and shrunk below the chosen size only if it wouldn't fit
  function drawText(ctx, t) {
    t.box = null;
    if (!t.value.trim()) return;
    ctx.save();
    ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const round = Ambient.ROUND.has(shape);
    const maxW = W * (round ? 0.7 : 0.84), maxH = H * (round ? 0.62 : 0.82);
    let size = t.size, lines, lh;
    for (;;) {
      ctx.font = FONTS[t.font].css.replace('SIZE', Math.round(size));
      lines = wrapLines(ctx, t.value, maxW);
      lh = size * 1.1;
      const widest = Math.max(...lines.map(ln => ctx.measureText(ln).width));
      if ((widest <= maxW && lines.length * lh <= maxH) || size <= 20) break;
      size *= 0.93;
    }
    const m = ctx.measureText(lines.join(' ') || 'M');
    const asc = m.actualBoundingBoxAscent || size * 0.7, desc = m.actualBoundingBoxDescent || size * 0.2;
    const blockH = (lines.length - 1) * lh + asc + desc;
    const metrics = lines.map(ln => {
      const lm = ctx.measureText(ln);
      const half = lm.actualBoundingBoxRight != null ? (lm.actualBoundingBoxRight + lm.actualBoundingBoxLeft) / 2 : lm.width / 2;
      const shift = lm.actualBoundingBoxRight != null ? (lm.actualBoundingBoxRight - lm.actualBoundingBoxLeft) / 2 : 0;
      return { half, shift };
    });
    const halfW = Math.max(...metrics.map(q => q.half));
    // keep the whole block on the lantern while it's dragged around
    const pad = Math.max(6, 22 * W / (frame.clientWidth || W));    // room for the dashed box around it
    t.dx = Math.max(-(W / 2 - halfW - pad), Math.min(W / 2 - halfW - pad, t.dx));
    t.dy = Math.max(-(H / 2 - blockH / 2 - pad), Math.min(H / 2 - blockH / 2 - pad, t.dy));
    const top = H / 2 + t.dy - blockH / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2 + t.dx - metrics[i].shift, top + asc + i * lh));
    t.box = { x: W / 2 + t.dx - halfW, y: top, w: halfW * 2, h: blockH };
    ctx.restore();
  }

  // Ink layer = what gets sent. Order: existing image, text, strokes (so the eraser works on everything).
  function renderInk() {
    ictx.save();
    ictx.clearRect(0, 0, W, H);
    facePath(ictx); ictx.clip();
    if (ed.base) ictx.drawImage(ed.base, 0, 0, W, H);
    drawText(ictx, ed.text);
    ed.strokes.forEach(s => drawStroke(ictx, s, 0));
    ictx.restore();
    textUi();
  }

  // ---------- Text placement: dashed box, "Drag to move" tag and a ✓ Done button ----------
  // Drawn on the fx layer (never part of the PNG that gets sent)
  const textDone = $('#textDone'), textTag = $('#textTag');
  let antsOn = false;
  function textUi() {
    const b = mode === 'text' && ed.text.placing && ed.text.box;
    textDone.hidden = textTag.hidden = !b;
    $('#hint').textContent = mode !== 'text' ? HINTS[mode]
      : !ed.text.box ? HINTS.text
      : ed.text.placing ? 'Drag the box to move your text · tap ✓ Done when it looks right'
      : 'Tap your text to move it again';
    if (!b) { if (!sending) clearFx(); return; }
    const k = frame.clientWidth / W, B = ed.text.box, P = 14;
    const x = B.x * k - P, y = B.y * k - P, w = B.w * k + 2 * P, h = B.h * k + 2 * P;
    const fw = frame.clientWidth, fh = frame.clientHeight;
    Object.assign(textDone.style, { left: Math.min(fw - 50, Math.max(-6, x + w - 26)) + 'px', top: Math.max(-6, Math.min(fh - 50, y - 26)) + 'px' });
    Object.assign(textTag.style, { left: Math.max(0, x) + 'px', top: Math.min(fh - 30, y + h + 8) + 'px' });
    paintBox(x, y, w, h);
    if (!antsOn && !Ambient.reduceMotion.matches) { antsOn = true; requestAnimationFrame(ants); }
  }
  let boxRect = null;
  function paintBox(x, y, w, h, offset = 0) {
    boxRect = [x, y, w, h];
    const d = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(frame.clientWidth * d), ch = Math.round(frame.clientHeight * d);
    if (fx.width !== cw || fx.height !== ch) { fx.width = cw; fx.height = ch; }
    const g = fx.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fx.width, fx.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    g.lineWidth = 2; g.setLineDash([9, 7]); g.lineDashOffset = -offset;
    g.beginPath(); Ambient.rrect(g, x, y, w, h, 12);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.stroke();     // dark edge so it shows on light lanterns
    g.strokeStyle = 'rgba(255,248,236,0.95)'; g.lineWidth = 2; g.stroke();
    g.setLineDash([]);
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {   // corner dots
      g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2);
      g.fillStyle = '#fff8ec'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.stroke();
    }
  }
  // Marching dashes, slowly, so the box reads as "you can move this"
  function ants(now) {
    if (mode !== 'text' || !ed.text.placing || !boxRect || sending) { antsOn = false; return; }
    paintBox(...boxRect, (now / 60) % 16);
    requestAnimationFrame(ants);
  }
  function clearFx() {
    boxRect = null;
    fx.getContext('2d').clearRect(0, 0, fx.width, fx.height);
  }
  function placeText(on) { ed.text.placing = on; textUi(); }
  textDone.addEventListener('click', () => { placeText(false); touch(); });
  textDone.addEventListener('pointerdown', e => e.stopPropagation());

  function fitFrame() {
    const r = stage.getBoundingClientRect();
    let h = r.height - 48, w = h * W / H;
    if (w > r.width - 32) { w = r.width - 32; h = w * H / W; }
    frame.style.width = Math.max(0, w) + 'px';
    frame.style.height = Math.max(0, h) + 'px';
  }
  new ResizeObserver(fitFrame).observe(stage);

  // ---------- Touch / pen input (no bounce, no zoom) ----------
  ['touchstart', 'touchmove'].forEach(evt =>
    stage.addEventListener(evt, e => e.preventDefault(), { passive: false }));
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt =>
    document.addEventListener(evt, e => e.preventDefault()));
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) { e.preventDefault(); return; }     // no pinch zoom anywhere
    // Only the tools panel may scroll, and only when it has something to scroll (sliders always work)
    const tools = e.target.closest('.tools');
    if (tools && (tools.scrollHeight > tools.clientHeight || e.target.closest('input'))) return;
    e.preventDefault();
  }, { passive: false });
  // Safari's keyboard can leave the page pushed up after typing; put it back when the field loses focus
  document.addEventListener('focusout', () => setTimeout(() => { if (scrollX || scrollY) scrollTo(0, 0); }, 60));
  // Long press on the drawing shouldn't pop up Save Image / Copy
  ['contextmenu', 'selectstart'].forEach(evt => stage.addEventListener(evt, e => e.preventDefault()));

  let active = null, cur = null, drag = null, sawPen = false, sending = false;
  const pt = e => {
    const r = ink.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H,
      p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5
    };
  };

  ink.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen') sawPen = true;
    if (sawPen && e.pointerType === 'touch') return;      // palm rejection once a Pencil is in use
    if (active !== null || mode === 'color') return;
    e.preventDefault();
    ink.setPointerCapture(e.pointerId);
    active = e.pointerId; touch();
    const p = pt(e);
    if (mode === 'draw') {
      cur = { color: ed.brush.color, size: ed.brush.size, erase: ed.brush.erase, points: [p] };
      ed.strokes.push(cur);
      ictx.save(); facePath(ictx); ictx.clip(); drawStroke(ictx, cur, 0); ictx.restore();
    } else if (mode === 'text' && ed.text.box) {
      drag = { x: p.x, y: p.y, dx: ed.text.dx, dy: ed.text.dy };
      if (!ed.text.placing) placeText(true);
    }
  });

  ink.addEventListener('pointermove', e => {
    if (e.pointerId !== active) return;
    e.preventDefault();
    if (mode === 'draw' && cur) {
      const from = cur.points.length;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(ev => cur.points.push(pt(ev)));
      ictx.save(); facePath(ictx); ictx.clip(); drawStroke(ictx, cur, from); ictx.restore();
    } else if (mode === 'text' && drag) {
      const p = pt(e);
      ed.text.dx = drag.dx + p.x - drag.x;
      ed.text.dy = drag.dy + p.y - drag.y;
      renderInk();
    }
  });

  const endPointer = e => {
    if (e.pointerId !== active) return;
    active = null; cur = null; drag = null;
    syncControls();
  };
  ink.addEventListener('pointerup', endPointer);
  ink.addEventListener('pointercancel', endPointer);

  // ---------- Tool controls ----------
  function makeSwatches(host, list, onPick) {
    list.forEach(item => {
      const c = item.c || item;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sw' + (c === 'off' ? ' off' : '');
      b.dataset.c = c;
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', item.n || c); b.title = item.n || c;
      b.addEventListener('click', () => { onPick(c); syncControls(); touch(); });
      host.append(b);
    });
  }
  makeSwatches($('#inkSw'), INK, c => { ed.brush.color = c; ed.brush.erase = false; });
  makeSwatches($('#textSw'), INK, c => { ed.text.color = c; renderInk(); });
  makeSwatches($('#glowSw'), GLOW, c => { ed.color = c; renderBg(); });

  Object.entries(FONTS).forEach(([key, f]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.f = key; b.textContent = f.label;
    b.style.font = f.css.replace('SIZE', 18);
    b.addEventListener('click', () => { ed.text.font = key; syncControls(); renderInk(); touch(); });
    $('#fontChips').append(b);
  });

  $('#eraser').addEventListener('click', () => { ed.brush.erase = !ed.brush.erase; syncControls(); });
  $('#size').addEventListener('input', e => { ed.brush.size = +e.target.value; syncControls(); touch(); });
  $('#tsize').addEventListener('input', e => { ed.text.size = +e.target.value; ed.text.placing = true; renderInk(); touch(); });
  $('#txt').addEventListener('input', e => { ed.text.value = e.target.value; ed.text.placing = true; renderInk(); touch(); });
  $('#customGlow').addEventListener('input', e => { ed.color = e.target.value; renderBg(); syncControls(); touch(); });
  $('#undo').addEventListener('click', () => { ed.strokes.pop(); renderInk(); syncControls(); });
  const clearAll = () => {
    ed.strokes = []; ed.base = null; ed.text.value = ''; ed.text.dx = ed.text.dy = 0; ed.text.placing = false;
    renderInk(); syncControls();
  };
  $('#clearDraw').addEventListener('click', clearAll);
  $('#clearText').addEventListener('click', clearAll);

  function syncControls() {
    const press = (sel, fn) => document.querySelectorAll(sel).forEach(x => x.setAttribute('aria-pressed', fn(x)));
    press('#inkSw .sw', x => !ed.brush.erase && x.dataset.c === ed.brush.color);
    press('#textSw .sw', x => x.dataset.c === ed.text.color);
    press('#glowSw .sw', x => x.dataset.c === ed.color);
    press('#fontChips .chip', x => x.dataset.f === ed.text.font);
    $('#eraser').setAttribute('aria-pressed', ed.brush.erase);
    $('#undo').disabled = !ed.strokes.length;
    $('#size').value = ed.brush.size;
    $('#tsize').value = ed.text.size;
    $('#txt').value = ed.text.value;
    const dot = $('#sizeDot');
    dot.style.width = dot.style.height = Math.min(60, ed.brush.size * 0.85) + 'px';
  }

  // ---------- Send ----------
  function inkIsEmpty() {
    const d = ictx.getImageData(0, 0, ink.width, ink.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i]) return false;
    return true;
  }

  // Short sparkle over the editor's lantern the moment Send is tapped
  const fx = $('#fx');
  function sendSparkle() {
    const b = LanternArt.burst(shape, ed.color, true);
    if (!b) return 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = frame.clientWidth, h = frame.clientHeight;
    fx.width = Math.round(w * dpr); fx.height = Math.round(h * dpr);
    const g = fx.getContext('2d');
    const step = now => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fx.width, fx.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (LanternArt.drawBurst(g, b, 0, 0, w, h, now)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return b.dur;
  }

  const sendBtn = $('#send');
  sendBtn.addEventListener('click', async () => {
    if (current == null) return;
    const id = current;
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    sending = true; placeText(false);
    frame.classList.add('sent');
    const showUntil = performance.now() + sendSparkle() * 0.85;
    try {
      if (mode === 'color') {
        await LW.rpc('set_lantern_color', { p_id: id, p_color: ed.color });
      } else if (inkIsEmpty()) {
        await LW.rpc('set_lantern_image', { p_id: id, p_path: null });
      } else {
        const blob = await new Promise(r => ink.toBlob(r, 'image/png'));
        const path = await LW.uploadPng(id, blob);
        await LW.rpc('set_lantern_image', { p_id: id, p_path: path });
      }
      const wait = showUntil - performance.now();   // let the sparkle play before leaving
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (current === id) { goWall(); showAfterglow(); }
    } catch (err) {
      frame.classList.remove('sent');
      toast(err.message, true);
    } finally {
      sending = false;
      sendBtn.disabled = false; sendBtn.textContent = 'Send to wall';
    }
  });

  // ---------- After Send: "Look up — your light is on the wall" ----------
  const afterglow = $('#afterglow');
  let agTimer;
  function showAfterglow() {
    clearTimeout(agTimer);
    afterglow.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => afterglow.classList.add('on')));
    agTimer = setTimeout(hideAfterglow, AFTERGLOW_MS);
  }
  function hideAfterglow() {
    clearTimeout(agTimer);
    if (afterglow.hidden) return;
    afterglow.classList.remove('on');
    agTimer = setTimeout(() => { afterglow.hidden = true; }, 1400);
  }

  // ---------- Idle reset (so the next visitor starts at the wall) ----------
  let idleTimer;
  function touch() {
    clearTimeout(idleTimer);
    if ($('#screen-setup').hidden === false) return;
    idleTimer = setTimeout(() => {
      if (current != null) goWall();
      closeChooser(true); hideAfterglow();
    }, IDLE_MS);
  }
  document.addEventListener('pointerdown', touch);

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 3500 : 1800);
  }

  if (document.fonts) document.fonts.ready.then(() => { if (mode === 'text') renderInk(); });
  syncControls();
  boot();
})();
