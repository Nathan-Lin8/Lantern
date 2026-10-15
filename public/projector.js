// Projector display: draws every lantern's light color + latest PNG at its calibrated spot.
// Updates arrive over the WebSocket and cross-fade in.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');

  const FADE_MS = 350;

  // id -> { lantern, img, prev: { color, img } | null, t0 }
  const views = new Map();
  let calibrating = false, selected = null, dragInfo = null, dirtyLayout = false;

  // ---------- Size ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    requestDraw();
  }
  addEventListener('resize', resize);

  // ---------- Data ----------
  // Changes don't show right away: a sparkle flies up from the bottom of the screen and the
  // lantern switches when it lands. seq keeps a slow, older update from landing over a newer one.
  let seqN = 0;
  const appliedSeq = new Map();   // id -> seq of the update currently shown
  const loaded = new Map();       // id -> { url, img } most recent image loaded for that lantern

  async function loadLanternImage(l) {
    if (!l.imageUrl) return null;
    const hit = loaded.get(l.id);
    if (hit && hit.url === l.imageUrl) return hit.img;
    try {
      const img = await LW.loadImage(l.imageUrl);
      if (img.decode) await img.decode().catch(() => {});
      loaded.set(l.id, { url: l.imageUrl, img });
      return img;
    } catch { return null; }
  }

  function commit(l, img, seq) {
    if (seq < (appliedSeq.get(l.id) || 0)) return;   // a newer update already landed
    appliedSeq.set(l.id, seq);
    const old = views.get(l.id);
    const changed = !old || old.img !== img || old.lantern.color !== l.color;
    views.set(l.id, {
      lantern: l, img,
      prev: old && changed ? { color: old.lantern.color, img: old.img } : null,
      t0: performance.now()
    });
    requestDraw();
  }

  async function applyLantern(l, animate) {
    const seq = ++seqN;
    const img = await loadLanternImage(l);
    const shown = views.get(l.id);
    const changed = shown && (shown.img !== img || shown.lantern.color !== l.color);
    if (animate && changed && !calibrating) launchSparkle(l, () => commit(l, img, seq));
    else commit(l, img, seq);
  }

  LW.connect(msg => {
    if (msg.type === 'state') {
      // Full state (first load, reset, layout save) applies at once and cancels sparkles in flight
      flights.length = 0;
      const ids = new Set(msg.state.lanterns.map(l => l.id));
      for (const id of views.keys()) if (!ids.has(id)) views.delete(id);
      if (!dragInfo) msg.state.lanterns.forEach(l => applyLantern(l, false));
    }
    if (msg.type === 'lantern') applyLantern(msg.lantern, true);
  }, status => {
    $('#conn').classList.toggle('down', status !== 'open');
  });

  // ---------- Sparkle ----------
  const FLY_MS = 1300;          // bottom of the screen -> lantern
  const flights = [];           // sparkles on their way to a lantern
  const motes = [];             // trail glitter, landing burst and ring
  let lastFrame = performance.now();

  // Light changes sparkle in the new color; drawings, text and "off" use warm gold
  const sparkleColor = (l, prevColor) =>
    l.color !== 'off' && l.color !== prevColor ? l.color : '#ffd98a';

  function launchSparkle(l, onArrive) {
    const shown = views.get(l.id);
    const tx = l.proj.x + l.proj.w / 2;
    flights.push({
      id: l.id, proj: l.proj, onArrive,
      color: sparkleColor(l, shown?.lantern.color),
      // start under the lantern-ish, pulled toward the middle, with a little randomness
      sx: Math.min(0.95, Math.max(0.05, 0.5 + (tx - 0.5) * 0.6 + (Math.random() - 0.5) * 0.12)),
      bend: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.1),
      t0: performance.now(), last: null
    });
    requestDraw();
  }

  const easeInOut = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

  function flightPos(f, k) {
    const proj = views.get(f.id)?.lantern.proj || f.proj;   // follows calibration changes
    const S = { x: f.sx * canvas.width, y: canvas.height * 1.03 };
    const shape = views.get(f.id)?.lantern.shape;
    const B = LW.lanternGeom(shape, rectPx(proj)).body;   // aim for the middle of the paper, not the tassel
    const T = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
    const dx = T.x - S.x, dy = T.y - S.y, len = Math.hypot(dx, dy) || 1;
    const C = { x: (S.x + T.x) / 2 - dy / len * f.bend * len, y: (S.y + T.y) / 2 + dx / len * f.bend * len };
    const e = easeInOut(k), u = 1 - e;
    return {
      x: u * u * S.x + 2 * u * e * C.x + e * e * T.x,
      y: u * u * S.y + 2 * u * e * C.y + e * e * T.y,
      T, R: B
    };
  }

  function addMote(m) { motes.push({ age: 0, spin: Math.random() * Math.PI, phase: Math.random() * 6, ...m }); }

  function land(f, T, R) {
    const u = canvas.height / 1000;
    const reach = Math.max(R.w, R.h) / 2;
    addMote({ kind: 'ring', x: T.x, y: T.y, life: 520, r0: reach * 0.25, r1: reach * 1.35, color: f.color });
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.12 + Math.random() * 0.45) * u;
      addMote({
        kind: 'star', x: T.x, y: T.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: true,
        life: 500 + Math.random() * 500, size: (5 + Math.random() * 9) * u,
        color: Math.random() < 0.35 ? '#ffffff' : f.color
      });
    }
    f.onArrive();
  }

  function updateSparkles(now, dt) {
    const u = canvas.height / 1000;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const k = Math.min(1, (now - f.t0) / FLY_MS);
      const p = flightPos(f, k);
      // Trail: drop glitter along the path since last frame so fast stretches don't leave gaps
      const from = f.last || p;
      const n = Math.max(1, Math.round(Math.hypot(p.x - from.x, p.y - from.y) / (3 * u)));
      for (let j = 0; j < n; j++) {
        const t = (j + Math.random()) / n;
        addMote({
          kind: Math.random() < 0.3 ? 'star' : 'dot',
          x: from.x + (p.x - from.x) * t + (Math.random() - 0.5) * 18 * u,
          y: from.y + (p.y - from.y) * t + (Math.random() - 0.5) * 18 * u,
          vx: (Math.random() - 0.5) * 0.04 * u, vy: (Math.random() * 0.03 + 0.01) * u,
          life: 500 + Math.random() * 700, size: (4 + Math.random() * 9) * u,
          color: Math.random() < 0.3 ? '#ffffff' : f.color
        });
      }
      f.last = p; f.head = p;
      if (k >= 1) { flights.splice(i, 1); land(f, p.T, p.R); }
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i];
      m.age += dt;
      if (m.age >= m.life) { motes.splice(i, 1); continue; }
      if (m.vx != null) {
        if (m.drag) { const d = Math.pow(0.9, dt / 16); m.vx *= d; m.vy *= d; }
        m.vy += 0.00012 * u * dt;   // drift down a touch, like falling glitter
        m.x += m.vx * dt; m.y += m.vy * dt;
      }
    }
  }

  function star(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.22 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function glow(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawSparkles(now) {
    if (!flights.length && !motes.length) return;
    const u = canvas.height / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const k = m.age / m.life;
      if (m.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = m.color; ctx.lineWidth = (1 - k) * 10 * u + 1;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r0 + (m.r1 - m.r0) * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const twinkle = 0.6 + 0.4 * Math.sin(m.phase + m.age * 0.03);
      const a = (1 - k) * twinkle, r = m.size * (1 - k * 0.6);
      ctx.globalAlpha = a; ctx.fillStyle = m.color;
      if (m.kind === 'star') star(m.x, m.y, r, m.spin + m.age * 0.004);
      else { ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const f of flights) {
      if (!f.head) continue;
      const { x, y } = f.head;
      glow(x, y, 70 * u, f.color, 0.95);
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
      star(x, y, 34 * u * (0.85 + 0.15 * Math.sin(now * 0.02)), now * 0.006);
    }
    ctx.restore();
  }

  // ---------- Drawing ----------
  let rafPending = false;
  function requestDraw() {
    if (!rafPending) { rafPending = true; requestAnimationFrame(draw); }
  }

  function rectPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }

  function draw() {
    rafPending = false;
    const now = performance.now();
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    let animating = false;
    updateSparkles(now, dt);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const v of views.values()) {
      const R = rectPx(v.lantern.proj);
      const k = v.prev ? Math.min(1, (now - v.t0) / FADE_MS) : 1;
      // Body and tassel cross-fade (old one fully under, new one fading in on top); caps stay put
      if (v.prev && k < 1) {
        animating = true;
        LW.paintLight(ctx, v.lantern.shape, R, v.prev.color, v.prev.img);
      } else v.prev = null;
      LW.paintLight(ctx, v.lantern.shape, R, v.lantern.color, v.img, k);
      LW.paintFrame(ctx, v.lantern.shape, R);

      if (calibrating) {
        const sel = selected === v.lantern.id;
        ctx.save();
        ctx.lineWidth = sel ? 6 : 3;
        ctx.strokeStyle = sel ? '#f4a64a' : '#ffffff';
        LW.bodyPath(ctx, v.lantern.shape, LW.lanternGeom(v.lantern.shape, R).body); ctx.stroke();
        ctx.setLineDash([8, 8]); ctx.lineWidth = 1; ctx.strokeRect(R.x, R.y, R.w, R.h); ctx.setLineDash([]);
        ctx.fillStyle = sel ? '#f4a64a' : '#ffffff';
        ctx.fillRect(R.x + R.w - 24, R.y + R.h - 24, 24, 24);           // resize handle
        ctx.font = `700 ${Math.max(24, R.w * 0.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = '#000';
        ctx.strokeText(v.lantern.id, R.x + R.w / 2, R.y + R.h / 2);
        ctx.fillText(v.lantern.id, R.x + R.w / 2, R.y + R.h / 2);
        ctx.restore();
      }
    }
    drawSparkles(now);
    if (animating || flights.length || motes.length) requestDraw();
  }

  // ---------- Calibration ----------
  const help = $('#help');
  let helpTimer = setTimeout(() => help.classList.add('hide'), 6000);

  function setCalibrating(on) {
    calibrating = on;
    document.body.classList.toggle('calibrating', on);
    $('#calHelp').hidden = !on;
    clearTimeout(helpTimer);
    help.classList.remove('hide');
    if (!on) helpTimer = setTimeout(() => help.classList.add('hide'), 2500);
    status(on ? (dirtyLayout ? 'Unsaved changes' : '') : '');
    requestDraw();
  }
  const status = msg => { $('#calStatus').textContent = msg; };

  function hit(px, py) {
    const list = [...views.values()].reverse();
    for (const v of list) {
      const R = rectPx(v.lantern.proj);
      if (px >= R.x && px <= R.x + R.w && py >= R.y && py <= R.y + R.h) {
        const corner = px > R.x + R.w - 40 && py > R.y + R.h - 40;
        return { v, corner };
      }
    }
    return null;
  }

  const toCanvas = e => {
    const dpr = canvas.width / innerWidth;
    return { x: e.clientX * dpr, y: e.clientY * dpr };
  };

  canvas.addEventListener('pointerdown', e => {
    if (!calibrating) return;
    const p = toCanvas(e);
    const h = hit(p.x, p.y);
    selected = h ? h.v.lantern.id : null;
    if (h) {
      canvas.setPointerCapture(e.pointerId);
      dragInfo = { v: h.v, corner: h.corner, start: p, orig: { ...h.v.lantern.proj } };
    }
    requestDraw();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragInfo) return;
    const p = toCanvas(e);
    const dx = (p.x - dragInfo.start.x) / canvas.width;
    const dy = (p.y - dragInfo.start.y) / canvas.height;
    const r = dragInfo.v.lantern.proj, o = dragInfo.orig;
    if (dragInfo.corner) { r.w = Math.max(0.02, o.w + dx); r.h = Math.max(0.02, o.h + dy); }
    else { r.x = o.x + dx; r.y = o.y + dy; }
    dirtyLayout = true; status('Unsaved changes · press S to save');
    requestDraw();
  });
  const endDrag = () => { dragInfo = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  async function saveLayout() {
    const body = [...views.values()].map(v => ({ id: v.lantern.id, proj: v.lantern.proj }));
    status('Saving…');
    try {
      const res = await fetch('/api/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      dirtyLayout = false; status('Saved');
    } catch { status("Couldn't save. Is the server running?"); }
  }

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    if (k === 'c') setCalibrating(!calibrating);
    if (!calibrating) return;
    if (k === 's') { e.preventDefault(); saveLayout(); }
    const v = selected != null && views.get(selected);
    if (v && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1);
      const r = v.lantern.proj;
      if (e.key === 'ArrowLeft') r.x -= step / canvas.width;
      if (e.key === 'ArrowRight') r.x += step / canvas.width;
      if (e.key === 'ArrowUp') r.y -= step / canvas.height;
      if (e.key === 'ArrowDown') r.y += step / canvas.height;
      dirtyLayout = true; status('Unsaved changes · press S to save');
      requestDraw();
    }
  });

  resize();
})();
