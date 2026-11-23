// iPad controller. Only the main lantern (interactive in layout.js) can be customized. The home screen is a
// live picture of the whole exhibit with the main lantern pulsing: tap it (or the prompt) to open the editor,
// which has Draw / Write / Light tabs. After Send: the reveal, "Look up", then back home for the next visitor.
// The picture animates with the same ambient engine as the projector (ambient.js).
(() => {
  const $ = s => document.querySelector(s);

  // ---------- Settings ----------
  const FACE_MAX = 800;            // longest side of the drawing space; the other side follows the lantern's shape
  const SS = 1.5;                  // export scale -> a 3:4 lantern exports at 900 x 1200
  const IDLE_MS = 90_000;          // editor returns home after this long untouched
  const AFTERGLOW_MS = 4200;       // "Look up" message after sending
  let W = 600, H = 800;            // current drawing space, set per lantern in openEditor()
  let shape = 'rect';              // current lantern's face: its real cut path (layout.js) or a shape name

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
    text: 'Your message stays centered on the lantern',
    color: 'This is how the lantern will glow'
  };

  // Stamps: drawn in a 100 x 100 box, filled with the current ink color
  const star = (n, r1, r2) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1;
      pts.push(`${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`);
    }
    return 'M' + pts.join(' L') + ' Z';
  };
  const ring = (cx, cy, r) => `M${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
  const petals = (n, d, r) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return ring(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, r);
  }).join(' ');
  const rays = (n, r1, r2, w) => Array.from({ length: n }, (_, i) => {
    const a = i * 2 * Math.PI / n, b = w / 2;
    const P = (r, da) => `${(50 + Math.cos(a + da) * r).toFixed(1)} ${(50 + Math.sin(a + da) * r).toFixed(1)}`;
    return `M${P(r1, -b)} L${P(r2, 0)} L${P(r1, b)} Z`;
  }).join(' ');
  const STAMPS = {
    star:    { label: 'Star',    d: star(5, 48, 20) },
    heart:   { label: 'Heart',   d: 'M50 90 C22 70 4 52 4 32 C4 16 16 6 29 6 C39 6 46 12 50 21 C54 12 61 6 71 6 C84 6 96 16 96 32 C96 52 78 70 50 90 Z' },
    sparkle: { label: 'Sparkle', d: 'M50 2 C53 35 65 47 98 50 C65 53 53 65 50 98 C47 65 35 53 2 50 C35 47 47 35 50 2 Z' },
    moon:    { label: 'Moon',    d: 'M64 4 A46 46 0 1 0 96 70 A38 38 0 1 1 64 4 Z' },
    flower:  { label: 'Flower',  d: petals(5, 25, 21), hole: [50, 50, 12] },
    sun:     { label: 'Sun',     d: ring(50, 50, 24) + ' ' + rays(10, 31, 49, 0.32) },
    leaf:    { label: 'Leaf',    d: 'M10 92 C8 50 30 12 92 8 C92 62 60 90 10 92 Z', vein: true },
    cloud:   { label: 'Cloud',   d: 'M26 78 C12 78 4 68 4 57 C4 45 14 37 26 38 C28 24 40 14 54 14 C68 14 79 24 81 37 C91 38 96 47 96 57 C96 69 87 78 75 78 Z' }
  };
  const stampPaths = {};
  const stampPath = k => stampPaths[k] || (stampPaths[k] = new Path2D(STAMPS[k].d));
  // Paints stamp k centered at (x, y), size px across
  function paintStamp(ctx, k, x, y, size, color) {
    const S = STAMPS[k];
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 100, size / 100);
    ctx.fillStyle = color;
    ctx.fill(stampPath(k));
    if (S.hole || S.vein) {             // cut a center out of the flower / a vein down the leaf
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      if (S.hole) ctx.arc(S.hole[0], S.hole[1], S.hole[2], 0, Math.PI * 2), ctx.fill();
      else { ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.moveTo(18, 84); ctx.quadraticCurveTo(48, 54, 80, 20); ctx.stroke(); }
    }
    ctx.restore();
  }
  const stampSize = brush => Math.round(36 + brush * 3.4);   // brush 4..60 -> about 50..240 px on the 800 px face

  // ---------- State ----------
  let lanterns = [];
  let current = null;   // lantern id being edited
  let mainId = null;    // the one interactive lantern
  let mode = null;      // 'draw' | 'text' | 'color'
  const ed = {
    base: null, strokes: [], color: '#f4a64a',
    brush: { color: INK[0], size: 16, erase: false, stamp: null },
    text: { value: '', size: 96, color: INK[0], font: 'hand' },
    startColor: null, inkDirty: false
  };

  // ---------- Startup: setup check -> wall ----------
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
        updateWallLantern(l, true);
      },
      onRemove: id => {
        lanterns = lanterns.filter(x => x.id !== id);
        art.delete(id); syncEngine();
      }
    });
  }

  // ---------- Home screen: live picture of the exhibit ----------
  // One canvas paints every lantern (a detailed sprite rendered once per change), then the shared ambient
  // engine adds breathing, flicker and color drift. Like the real exhibit, no light travels between lanterns:
  // the main lantern shows the visitor's work, the decorative ones breathe and echo the visitor's color.
  const wall = $('#wall'), wallWrap = $('#wallWrap'), wallCanvas = $('#wallCanvas');
  const FADE_MS = 1000;
  const art = new Map();      // id -> { img, url, color, seq, pending, prev, t0, burst, sprites }
  const eng = Ambient.createEngine({ DRAW_BETWEEN: false, MAX_WISPS: 3, CONTENT_BREATH_DEPTH: 0.06 });
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const isMain = l => l.id === mainId;
  function syncEngine() {
    mainId = LW.mainOf(lanterns)?.id ?? null;
    eng.setLanterns(lanterns.map(l => {
      const a = art.get(l.id) || {};
      const custom = isMain(l) || !!a.img;      // the main lantern keeps its color; decorative ones drift
      return { id: l.id, ...l.wall, color: l.color, content: custom, custom };
    }), 16 / 9);
    refreshPrompt();
    placeSpot();
  }

  // The lantern (and the prompt under it) open the editor only once there's a main lantern
  function refreshPrompt() {
    const ready = mainId != null;
    $('#homePrompt').disabled = !ready;
    $('#homePrompt').textContent = ready ? 'Leave your light on the large lantern'
      : lanterns.length ? 'The main lantern isn\u2019t set up yet' : 'Waking the lanterns…';
  }

  function renderWall() {
    lanterns.forEach(l => updateWallLantern(l, false));
    syncEngine();
  }

  // animate = true when this is a live change (bloom + sparkle + echo); false for the first draw
  async function updateWallLantern(l, animate) {
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
    if (changed) a.pending = before;
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
      a.burst = Ambient.burst(Ambient.faceOf(l), l.color);
      eng.reveal(l.id, l.color);
    }
    loop();
  }

  // Detailed lantern sprite for one surface, re-rendered only when something changes
  function spriteFor(holder, surface, l, color, img, w, h) {
    const key = `${Ambient.faceOf(l)}|${color}|${Math.round(w)}x${Math.round(h)}`;
    const c = holder.sprites[surface];
    if (c && c.key === key && c.img === img) return c.sprite;
    holder.sprites[surface] = { key, img, sprite: LanternArt.sprite({ shape: Ambient.faceOf(l), frame: l.frame, color, img }, w, h, dpr()) };
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
      if (isMain(l)) paintBeacon(g, l, R, now);
      const sp = spriteFor(a, name, l, l.color, a.img, R.w, R.h);
      g.globalAlpha = k; g.drawImage(sp.c, R.x - sp.mg.x, R.y - sp.mg.top, sp.c.width / d, sp.c.height / d);
      g.globalAlpha = 1;
      if (isMain(l)) paintInnerGlow(g, l, R, now);
      if (Lt) {
        const glow = Lt.glow;
        if (a.prev) Lt.glow += Math.sin(Math.PI * T) * 0.7;                // bloom
        Ambient.paintOverlay(g, Ambient.faceOf(l), R, Lt, k, { drift: !isMain(l) && !a.img, flame: isMain(l) ? 0.4 : 1 });
        Lt.glow = glow;
      }
      if (a.burst && !Ambient.drawBurst(g, a.burst, R.x, R.y, R.w, R.h, now)) a.burst = null;
    }
    const main = lanterns.find(isMain);
    if (main) {
      const R = { x: B.x + main.wall.x * B.w, y: B.y + main.wall.y * B.h, w: main.wall.w * B.w, h: main.wall.h * B.h };
      paintShimmer(g, main, R, now);
      paintMotes(g, main, R, B, now);
    }
  }

  // ---------- Quiet cues that the big lantern is the one to touch (no words needed) ----------
  // 1. The room is a little darker away from it, as if it's the one lighting the space (#spot, a full-screen
  //    gradient centered on it, positioned in fitWall)
  function placeSpot() {
    const l = lanterns.find(isMain), spot = $('#spot');
    if (!l || !spot) return;
    const r = wall.getBoundingClientRect();
    spot.style.setProperty('--sx', r.left + (l.wall.x + l.wall.w / 2) * r.width + 'px');
    spot.style.setProperty('--sy', r.top + (l.wall.y + l.wall.h / 2) * r.height + 'px');
    spot.style.setProperty('--sr', Math.max(l.wall.w * r.width, l.wall.h * r.height) * 0.75 + 'px');
  }

  // 2. Every so often a soft glint slides down across its paper, like light catching it
  const SHIMMER_EVERY = 9, SHIMMER_LEN = 1.8;
  function paintShimmer(g, l, R, now) {
    if (Ambient.reduceMotion.matches) return;
    const p = ((now / 1000) % SHIMMER_EVERY) / SHIMMER_LEN;
    if (p >= 1) return;
    const e = Ambient.ease.outCubic(p), band = R.h * 0.35;
    const y = R.y - band + e * (R.h + 2 * band), a = 0.16 * Math.sin(Math.PI * p);
    g.save();
    Ambient.clipFace(g, Ambient.faceOf(l), R);
    g.globalCompositeOperation = 'lighter';
    const sg = g.createLinearGradient(0, y - band, 0, y + band);
    sg.addColorStop(0, 'rgba(255,236,200,0)'); sg.addColorStop(0.5, `rgba(255,236,200,${a})`); sg.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = sg; g.fillRect(R.x, y - band, R.w, band * 2);
    g.restore();
  }

  // 3. Tiny motes of light drift in from around the room and are drawn into it, like moths to a lamp
  const motes = [];
  let moteClock = 0, moteLast = 0;
  function paintMotes(g, l, R, B, now) {
    if (Ambient.reduceMotion.matches) return;
    const dt = moteLast ? Math.min(0.1, (now - moteLast) / 1000) : 0;
    moteLast = now; moteClock -= dt;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    if (moteClock <= 0 && motes.length < 14) {
      moteClock = 0.5 + Math.random() * 0.7;
      const ang = Math.random() * Math.PI * 2, dist = Math.max(B.w, B.h) * (0.35 + Math.random() * 0.2);
      motes.push({
        x0: cx + Math.cos(ang) * dist, y0: cy + Math.sin(ang) * dist * 0.6,
        bend: (Math.random() - 0.5) * dist * 0.5, t: 0, life: 5 + Math.random() * 3,
        r: 0.8 + Math.random() * 1.4, tw: Math.random() * 6
      });
    }
    const c = Ambient.mix(Ambient.rgb(l.color) || [255, 210, 154], [255, 200, 130], 0.5);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.t += dt / m.life;
      if (m.t >= 1) { motes.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - m.t, 2);
      // aim at the lantern's edge, not its middle, then fade as it arrives
      const tx = cx + (m.x0 - cx) * 0.18, ty = cy + (m.y0 - cy) * 0.18;
      const nx = -(m.y0 - cy), ny = m.x0 - cx, nl = Math.hypot(nx, ny) || 1;
      const arc = Math.sin(Math.PI * e) * m.bend;
      const x = m.x0 + (tx - m.x0) * e + nx / nl * arc, y = m.y0 + (ty - m.y0) * e + ny / nl * arc;
      const a = Math.min(1, m.t * 5) * (1 - m.t) * (0.55 + 0.45 * Math.sin(now / 300 + m.tw));
      const rr = m.r * 4;
      const mg = g.createRadialGradient(x, y, 0, x, y, rr);
      mg.addColorStop(0, Ambient.css(c, 0.8 * a)); mg.addColorStop(0.3, Ambient.css(c, 0.3 * a)); mg.addColorStop(1, Ambient.css(c, 0));
      g.fillStyle = mg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    g.restore();
  }

  // The main lantern glows a little warmer than the rest and breathes slowly, with a faint candle flicker,
  // so it reads as the one to tap without looking like a button
  const BREATH_S = 5.5;
  function paintBeacon(g, l, R, now) {
    const c = Ambient.mix(Ambient.rgb(l.color) || [255, 210, 154], [255, 178, 96], 0.35);
    const t = now / 1000;
    const breath = Ambient.reduceMotion.matches ? 0.5 : 0.5 - 0.5 * Math.cos(t * 2 * Math.PI / BREATH_S);
    const flicker = Ambient.reduceMotion.matches ? 0 : 0.04 * (Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.7));
    const a = 0.16 + 0.12 * breath + flicker;
    g.save();
    g.translate(R.x + R.w / 2, R.y + R.h / 2); g.scale(R.w * 0.95, R.h * 0.8);
    const hg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    hg.addColorStop(0, Ambient.css(c, a)); hg.addColorStop(0.55, Ambient.css(c, a * 0.4)); hg.addColorStop(1, Ambient.css(c, 0));
    g.fillStyle = hg; g.fillRect(-1, -1, 2, 2);
    g.restore();
  }
  // ...and the paper itself brightens a touch on each breath, like a flame drawing in air
  function paintInnerGlow(g, l, R, now) {
    if (Ambient.reduceMotion.matches) return;
    const t = now / 1000, breath = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI / BREATH_S);
    const a = 0.10 * breath + 0.025 * Math.sin(t * 6.1) * Math.sin(t * 2.3 + 0.4);
    if (a <= 0) return;
    g.save();
    Ambient.clipFace(g, Ambient.faceOf(l), R);
    g.globalCompositeOperation = 'lighter';
    g.translate(R.x + R.w / 2, R.y + R.h * 0.55); g.scale(R.w * 0.6, R.h * 0.55);
    const ig = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    ig.addColorStop(0, `rgba(255,214,150,${a})`); ig.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = ig; g.fillRect(-1, -1, 2, 2);
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
    placeSpot();
  }
  new ResizeObserver(fitWall).observe(wallWrap);

  // ---------- Tap the main lantern (or the prompt) to start ----------
  function overMain(e) {
    const l = lanterns.find(isMain);
    if (!l) return false;
    const r = wall.getBoundingClientRect(), pad = 0.15;
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, b = l.wall;
    return x > b.x - b.w * pad && x < b.x + b.w * (1 + pad) && y > b.y - b.h * pad && y < b.y + b.h * (1 + pad);
  }
  const start = () => { if (mainId != null) { hideAfterglow(); openEditor(mainId, 'draw'); } };
  wallWrap.addEventListener('click', e => { if (overMain(e)) start(); });
  wallWrap.addEventListener('pointermove', e => wallWrap.classList.toggle('over-main', overMain(e)));
  $('#homePrompt').addEventListener('click', start);

  // ---------- Editor ----------
  const stage = $('#stage'), frame = $('#frame');
  const bg = $('#bg'), ink = $('#ink');
  const bctx = bg.getContext('2d'), ictx = ink.getContext('2d', { willReadFrequently: true });

  // Size the drawing space to the main lantern's proportions from layout.js (on a 16:9 image). The projector
  // fits the PNG to its calibrated box; text stays centered however much that stretches it.
  function sizeCanvases(l) {
    const box = l.wall || l.proj;
    const aspect = (box.w * 16) / (box.h * 9);   // width / height
    if (aspect >= 1) { W = FACE_MAX; H = Math.round(FACE_MAX / aspect); }
    else { H = FACE_MAX; W = Math.round(FACE_MAX * aspect); }
    [bg, ink].forEach(c => { c.width = Math.round(W * SS); c.height = Math.round(H * SS); });
    bctx.setTransform(SS, 0, 0, SS, 0, 0);
    ictx.setTransform(SS, 0, 0, SS, 0, 0);
    frame.classList.toggle('round', l.shape === 'circle' || l.shape === 'oval');
    frame.classList.toggle('capsule', l.shape === 'capsule');
  }

  // The lantern in the editor glows softly in its light color
  function frameGlow() {
    const c = Ambient.rgb(ed.color);
    frame.style.setProperty('--frame-glow', c ? Ambient.css(c, 0.45) : 'rgba(255,241,214,0.12)');
  }

  async function openEditor(id, m) {
    const l = lanterns.find(x => x.id === id);
    current = id; mode = m; shape = Ambient.faceOf(l);
    sizeCanvases(l);
    ed.strokes = []; ed.base = null; ed.color = ed.startColor = l.color; ed.inkDirty = false;
    ed.brush.erase = false; ed.brush.stamp = null;
    ed.text = { ...ed.text, value: '', size: Math.round(96 * Math.min(W, H) / 600) };

    setMode(m);
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

  function setMode(m) {
    mode = m;
    ['draw', 'text', 'color'].forEach(k => { $('#tools-' + k).hidden = k !== m; });
    document.querySelectorAll('#tabs [data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    stage.className = 'stage ' + m;
    updateHint();
  }
  document.querySelectorAll('#tabs [data-mode]').forEach(b =>
    b.addEventListener('click', () => { setMode(b.dataset.mode); touch(); }));

  function updateHint() {
    const st = mode === 'draw' && ed.brush.stamp;
    $('#hint').textContent = st ? `Tap the lantern to place a ${STAMPS[st].label.toLowerCase()} · drag to adjust` : HINTS[mode] || '';
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

  // The lit area of the lantern over the whole drawing space (= the lantern's bounding box, like the PNG).
  // Real cut shapes have holes (frame pieces inside the opening), so always fill / clip with the even-odd rule.
  const faceNow = () => Ambient.face(shape, 0, 0, W, H);
  const clipToFace = ctx => ctx.clip(faceNow(), Ambient.FILL_RULE);

  // Background = the light color, the way the projector will show it
  function renderBg() {
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = ed.color === 'off' ? '#2d2733' : ed.color;
    bctx.fill(faceNow(), Ambient.FILL_RULE);
    frameGlow();
    // faint paper ribs
    bctx.save(); clipToFace(bctx);
    bctx.strokeStyle = 'rgba(0,0,0,.10)'; bctx.lineWidth = 2;
    for (let y = H / 9; y < H; y += H / 9) { bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(W, y); bctx.stroke(); }
    bctx.restore();
  }

  function drawStroke(ctx, s, from) {
    if (s.stamp) return paintStamp(ctx, s.stamp, s.x, s.y, s.size, s.color);
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

  // Text is always centered on the lantern, horizontally and vertically, measured on the letters you actually
  // see (not the font's em box). It wraps to the lantern's usable width (narrower for round shapes) and
  // shrinks below the chosen size only if it wouldn't fit. Centering survives any stretch to the real lantern.
  function drawText(ctx, t) {
    if (!t.value.trim()) return;
    ctx.save();
    ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const round = Ambient.ROUND.has(shape), capsule = shape === 'capsule';
    // capsule: the round ends lose about a third of the short side at each end
    const endPad = capsule ? Math.min(W, H) * 0.3 : 0;
    const maxW = W * (round ? 0.7 : 0.84) - (capsule && W > H ? 2 * endPad : 0);
    const maxH = H * (round ? 0.62 : 0.82) - (capsule && H >= W ? 2 * endPad : 0);
    let size = t.size, lines, lh, ms;
    for (;;) {
      ctx.font = FONTS[t.font].css.replace('SIZE', Math.round(size));
      lines = wrapLines(ctx, t.value.trim(), maxW).filter((ln, k, a) => ln || (k > 0 && k < a.length - 1));
      lh = size * 1.1;
      ms = lines.map(ln => inkBox(ctx, ln, size));
      const widest = Math.max(...ms.map(q => q.w));
      const tall = Math.max(...ms.map((q, k) => k * lh + q.desc)) - Math.min(...ms.map((q, k) => k * lh - q.asc));
      if ((widest <= maxW && tall <= maxH) || size <= 20) break;
      size *= 0.93;
    }
    // Ink extent of the whole block relative to the first baseline, then put its middle at the center
    const top = Math.min(...ms.map((q, k) => k * lh - q.asc)), bot = Math.max(...ms.map((q, k) => k * lh + q.desc));
    const base0 = H / 2 - (top + bot) / 2;
    lines.forEach((ln, k) => ctx.fillText(ln, W / 2 - ms[k].shift, base0 + k * lh));
    ctx.restore();
  }
  // Visible ink box of one line drawn with textAlign center: width, offset of its middle, ascent, descent
  function inkBox(ctx, ln, size) {
    if (!ln) return { w: 0, shift: 0, asc: 0, desc: 0 };
    const m = ctx.measureText(ln), has = m.actualBoundingBoxRight != null;
    return {
      w: has ? m.actualBoundingBoxRight + m.actualBoundingBoxLeft : m.width,
      shift: has ? (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 : 0,
      asc: m.actualBoundingBoxAscent ?? size * 0.7,
      desc: m.actualBoundingBoxDescent ?? size * 0.2
    };
  }

  // Ink layer = what gets sent. Order: existing image, text, strokes (so the eraser works on everything).
  function renderInk() {
    ictx.save();
    ictx.clearRect(0, 0, W, H);
    clipToFace(ictx);
    if (ed.base) ictx.drawImage(ed.base, 0, 0, W, H);
    drawText(ictx, ed.text);
    ed.strokes.forEach(s => drawStroke(ictx, s, 0));
    ictx.restore();
  }

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

  let active = null, cur = null, sawPen = false, sending = false;
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
    if (active !== null || mode !== 'draw') return;
    e.preventDefault();
    ink.setPointerCapture(e.pointerId);
    active = e.pointerId; touch();
    const p = pt(e);
    ed.inkDirty = true;
    if (ed.brush.stamp) {           // drop the stamp where they tapped; dragging nudges it until release
      cur = { stamp: ed.brush.stamp, color: ed.brush.color, size: stampSize(ed.brush.size), x: p.x, y: p.y };
      ed.strokes.push(cur);
      renderInk();
    } else {
      cur = { color: ed.brush.color, size: ed.brush.size, erase: ed.brush.erase, points: [p] };
      ed.strokes.push(cur);
      ictx.save(); clipToFace(ictx); drawStroke(ictx, cur, 0); ictx.restore();
    }
  });

  ink.addEventListener('pointermove', e => {
    if (e.pointerId !== active) return;
    e.preventDefault();
    if (cur && cur.stamp) {
      const p = pt(e);
      cur.x = p.x; cur.y = p.y;
      renderInk();
    } else if (cur) {
      const from = cur.points.length;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(ev => cur.points.push(pt(ev)));
      ictx.save(); clipToFace(ictx); drawStroke(ictx, cur, from); ictx.restore();
    }
  });

  const endPointer = e => {
    if (e.pointerId !== active) return;
    active = null; cur = null;
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

  Object.entries(STAMPS).forEach(([key, st]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'stamp'; b.dataset.s = key;
    b.setAttribute('aria-label', st.label); b.title = st.label;
    const c = document.createElement('canvas'), d = 2;
    c.width = c.height = 40 * d;
    const g = c.getContext('2d'); g.scale(d, d);
    paintStamp(g, key, 20, 20, 38, '#f6eee4');
    b.append(c);
    b.addEventListener('click', () => {      // tap again to put it away and go back to the brush
      ed.brush.stamp = ed.brush.stamp === key ? null : key;
      if (ed.brush.stamp) ed.brush.erase = false;
      syncControls(); touch();
    });
    $('#stamps').append(b);
  });

  Object.entries(FONTS).forEach(([key, f]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.f = key; b.textContent = f.label;
    b.style.font = f.css.replace('SIZE', 18);
    b.addEventListener('click', () => { ed.text.font = key; syncControls(); renderInk(); touch(); });
    $('#fontChips').append(b);
  });

  $('#eraser').addEventListener('click', () => {
    ed.brush.erase = !ed.brush.erase;
    if (ed.brush.erase) ed.brush.stamp = null;
    syncControls();
  });
  $('#size').addEventListener('input', e => { ed.brush.size = +e.target.value; syncControls(); touch(); });
  $('#tsize').addEventListener('input', e => { ed.text.size = +e.target.value; ed.inkDirty = true; renderInk(); touch(); });
  $('#txt').addEventListener('input', e => { ed.text.value = e.target.value; ed.inkDirty = true; renderInk(); touch(); });
  $('#customGlow').addEventListener('input', e => { ed.color = e.target.value; renderBg(); syncControls(); touch(); });
  $('#undo').addEventListener('click', () => { ed.strokes.pop(); ed.inkDirty = true; renderInk(); syncControls(); });
  const clearAll = () => {
    ed.strokes = []; ed.base = null; ed.text.value = ''; ed.inkDirty = true;
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
    press('#stamps .stamp', x => x.dataset.s === ed.brush.stamp);
    $('#sizeLabel').textContent = ed.brush.stamp ? 'Stamp size' : 'Brush size';
    updateHint();
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
    sending = true;
    frame.classList.add('sent');
    const showUntil = performance.now() + sendSparkle() * 0.85;
    try {
      // Everything from all three tabs goes out together: the drawing/text if it changed, the light if it changed
      if (ed.inkDirty) {
        if (inkIsEmpty()) await LW.rpc('set_lantern_image', { p_id: id, p_path: null });
        else {
          const blob = await new Promise(r => ink.toBlob(r, 'image/png'));
          const path = await LW.uploadPng(id, blob);
          await LW.rpc('set_lantern_image', { p_id: id, p_path: path });
        }
      }
      if (ed.color !== ed.startColor) await LW.rpc('set_lantern_color', { p_id: id, p_color: ed.color });
      const wait = showUntil - performance.now();   // let the sparkle play before leaving
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (current === id) { goWall(); showAfterglow(); }
    } catch (err) {
      frame.classList.remove('sent');
      toast(err.message, true);
    } finally {
      sending = false;
      sendBtn.disabled = false; sendBtn.textContent = 'Send to lantern';
    }
  });

  // ---------- After Send: "Look up — your light is on the lantern" ----------
  const afterglow = $('#afterglow'), homeActions = $('.home-actions');
  let agTimer;
  function showAfterglow() {
    clearTimeout(agTimer);
    afterglow.hidden = false;
    homeActions.classList.add('away');      // the prompt steps aside while "Look up" is showing
    requestAnimationFrame(() => requestAnimationFrame(() => afterglow.classList.add('on')));
    agTimer = setTimeout(hideAfterglow, AFTERGLOW_MS);
  }
  function hideAfterglow() {
    clearTimeout(agTimer);
    if (afterglow.hidden) return;
    afterglow.classList.remove('on');
    agTimer = setTimeout(() => { afterglow.hidden = true; homeActions.classList.remove('away'); }, 1400);
  }

  // ---------- Idle reset (so the next visitor starts at the home screen) ----------
  let idleTimer;
  function touch() {
    clearTimeout(idleTimer);
    if ($('#screen-setup').hidden === false) return;
    idleTimer = setTimeout(() => {
      if (current != null) goWall();
      hideAfterglow();
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
