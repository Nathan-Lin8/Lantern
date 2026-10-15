// iPad controller: pick a lantern, then draw / write / change its light, then send it to the wall.
(() => {
  const $ = s => document.querySelector(s);

  // ---------- Settings ----------
  const FACE_MAX = 800;            // longest side of the drawing space; the other side follows the lantern's shape
  const SS = 1.5;                  // export scale -> a 3:4 lantern exports at 900 x 1200
  const IDLE_MS = 90_000;          // editor returns to the wall after this long untouched
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
    text: 'Drag on the lantern to move your text',
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
    text: { value: '', size: 96, color: INK[0], font: 'hand', dx: 0, dy: 0 }
  };

  // ---------- Live connection ----------
  const conn = $('#conn');
  LW.connect(msg => {
    if (msg.type === 'state') { lanterns = msg.state.lanterns; renderWall(); }
    if (msg.type === 'lantern') {
      const i = lanterns.findIndex(l => l.id === msg.lantern.id);
      if (i >= 0) lanterns[i] = msg.lantern; else lanterns.push(msg.lantern);
      updateWallLantern(msg.lantern);
    }
  }, status => {
    conn.className = 'conn ' + status;
    conn.querySelector('span').textContent = status === 'open' ? 'Wall connected' : 'Reconnecting…';
  });

  // ---------- Wall screen ----------
  const wall = $('#wall'), wallWrap = $('#wallWrap');

  function renderWall() {
    wall.innerHTML = '';
    lanterns.forEach(l => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lan shape-' + l.shape; b.id = 'lan-' + l.id;
      b.setAttribute('aria-label', `Lantern ${l.id}${l.canDraw ? '' : ' (light only)'}`);
      Object.assign(b.style, {
        left: l.wall.x * 100 + '%', top: l.wall.y * 100 + '%',
        width: l.wall.w * 100 + '%', height: l.wall.h * 100 + '%'
      });
      b.innerHTML = '<canvas></canvas><span class="num"></span>';
      b.querySelector('.num').textContent = l.id;
      b.addEventListener('click', () => openChooser(l.id));
      wall.append(b);
      updateWallLantern(l, false);
    });
  }

  // Draw a lantern into a canvas at its on-screen size (same drawing as the projector)
  function paintLanternCanvas(cv, l, img) {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;                                  // hidden; fitWall redraws when it shows
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    LW.paintLantern(c, l.shape, { x: 0, y: 0, w: cv.width, h: cv.height }, l.color, img);
  }

  const wallImgs = new Map();   // id -> { url, img }
  const wallImg = l => { const hit = wallImgs.get(l.id); return hit && hit.url === l.imageUrl ? hit.img : null; };

  function drawWallLantern(l) {
    const b = document.getElementById('lan-' + l.id);
    if (b) paintLanternCanvas(b.querySelector('canvas'), l, wallImg(l));
  }

  function updateWallLantern(l, flash = true) {
    const b = document.getElementById('lan-' + l.id);
    if (!b) return renderWall();
    drawWallLantern(l);
    if (l.imageUrl && !wallImg(l)) {
      const url = l.imageUrl;
      LW.loadImage(url).then(img => {
        wallImgs.set(l.id, { url, img });
        const now = lanterns.find(x => x.id === l.id);
        if (now && now.imageUrl === url) drawWallLantern(now);
      }).catch(() => {});
    }
    if (flash) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
  }

  function fitWall() {
    const r = wallWrap.getBoundingClientRect();
    const w = Math.min(r.width, r.height * 16 / 9);
    wall.style.width = w + 'px'; wall.style.height = (w * 9 / 16) + 'px';
    lanterns.forEach(drawWallLantern);
  }
  new ResizeObserver(fitWall).observe(wallWrap);

  // ---------- Chooser ----------
  const chooser = $('#chooser');
  let chosenId = null;
  function openChooser(id) {
    chosenId = id;
    const l = lanterns.find(x => x.id === id);
    $('#chooserTitle').textContent = 'Lantern ' + id;
    const mini = $('#chooserMini');
    mini.style.aspectRatio = `${l.wall.w * 16} / ${l.wall.h * 9}`;
    // Only flat (square / rectangle) lanterns can show drawings and text
    chooser.querySelectorAll('[data-mode="draw"], [data-mode="text"]').forEach(b => { b.disabled = !l.canDraw; });
    $('#chooserNote').hidden = l.canDraw;
    chooser.hidden = false;
    paintLanternCanvas(mini, l, wallImg(l));
  }
  chooser.querySelectorAll('[data-mode]').forEach(b =>
    b.addEventListener('click', () => { chooser.hidden = true; openEditor(chosenId, b.dataset.mode); }));
  $('#chooserCancel').addEventListener('click', () => { chooser.hidden = true; });
  chooser.addEventListener('click', e => { if (e.target === chooser) chooser.hidden = true; });

  // ---------- Editor ----------
  const stage = $('#stage'), frame = $('#frame');
  const bg = $('#bg'), ink = $('#ink');
  const bctx = bg.getContext('2d'), ictx = ink.getContext('2d', { willReadFrequently: true });

  // Size the drawing space to the lantern body's real proportions (wall rect is on a 16:9 surface)
  function sizeCanvases(l) {
    const aspect = LW.bodyAspect({ w: l.wall.w * 16, h: l.wall.h * 9 });   // width / height
    if (aspect >= 1) { W = FACE_MAX; H = Math.round(FACE_MAX / aspect); }
    else { H = FACE_MAX; W = Math.round(FACE_MAX * aspect); }
    [bg, ink].forEach(c => { c.width = Math.round(W * SS); c.height = Math.round(H * SS); });
    bctx.setTransform(SS, 0, 0, SS, 0, 0);
    ictx.setTransform(SS, 0, 0, SS, 0, 0);
  }

  async function openEditor(id, m) {
    const l = lanterns.find(x => x.id === id);
    if (!l.canDraw && m !== 'color') m = 'color';      // light-only lanterns
    current = id; mode = m; shape = l.shape;
    sizeCanvases(l);
    ed.strokes = []; ed.base = null; ed.color = l.color;
    ed.brush.erase = false;
    ed.text = { ...ed.text, value: '', dx: 0, dy: 0, size: Math.round(96 * Math.min(W, H) / 600) };

    $('#edTitle').textContent = `Lantern ${id} · ${MODE_NAMES[m]}`;
    ['draw', 'text', 'color'].forEach(k => { $('#tools-' + k).hidden = k !== m; });
    stage.className = 'stage ' + m;
    $('#hint').textContent = HINTS[m];
    $('#screen-wall').hidden = true;
    $('#screen-editor').hidden = false;
    fitFrame(); syncControls(); renderBg(); renderInk(); touch();

    // Start from what's already on the lantern so people can add to it
    if (l.imageUrl) {
      try { ed.base = await LW.loadImage(l.imageUrl); renderInk(); } catch { /* start blank */ }
    }
  }

  function goWall() {
    $('#screen-editor').hidden = true;
    $('#screen-wall').hidden = false;
    current = null; mode = null;
    fitWall();
  }
  $('#back').addEventListener('click', goWall);

  const facePath = ctx => LW.bodyPath(ctx, shape, { x: 0, y: 0, w: W, h: H });

  // Background = the lantern body in its light color with ribs, the way the projector will show it
  function renderBg() {
    bctx.clearRect(0, 0, W, H);
    LW.paintBody(bctx, shape, { x: 0, y: 0, w: W, h: H }, ed.color, null);
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

  function drawText(ctx, t) {
    if (!t.value.trim()) return;
    ctx.save();
    ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = FONTS[t.font].css.replace('SIZE', t.size);
    const lines = wrapLines(ctx, t.value, W - 110);
    const lh = t.size * 1.08;
    const y0 = H / 2 + t.dy - (lines.length - 1) * lh / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2 + t.dx, y0 + i * lh));
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
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (!e.target.closest('.tools')) e.preventDefault();
  }, { passive: false });

  let active = null, cur = null, drag = null, sawPen = false;
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
    } else if (mode === 'text') {
      drag = { x: p.x, y: p.y, dx: ed.text.dx, dy: ed.text.dy };
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
  $('#tsize').addEventListener('input', e => { ed.text.size = +e.target.value; renderInk(); touch(); });
  $('#txt').addEventListener('input', e => { ed.text.value = e.target.value; renderInk(); touch(); });
  $('#customGlow').addEventListener('input', e => { ed.color = e.target.value; renderBg(); syncControls(); touch(); });
  $('#undo').addEventListener('click', () => { ed.strokes.pop(); renderInk(); syncControls(); });
  const clearAll = () => {
    ed.strokes = []; ed.base = null; ed.text.value = ''; ed.text.dx = ed.text.dy = 0;
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

  async function api(url, opts) {
    let res;
    try { res = await fetch(url, opts); }
    catch { throw new Error("Can't reach the wall. Check the Wi-Fi and try again."); }
    if (!res.ok) {
      let msg = 'The wall rejected that. Try again.';
      try { msg = (await res.json()).error || msg; } catch { /* keep default */ }
      throw new Error(msg);
    }
    return res.json();
  }

  const sendBtn = $('#send');
  sendBtn.addEventListener('click', async () => {
    if (current == null) return;
    const id = current;
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      if (mode === 'color') {
        await api(`/api/lanterns/${id}/color`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color: ed.color })
        });
      } else if (inkIsEmpty()) {
        await api(`/api/lanterns/${id}/image`, { method: 'DELETE' });
      } else {
        const blob = await new Promise(r => ink.toBlob(r, 'image/png'));
        await api(`/api/lanterns/${id}/image`, {
          method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob
        });
      }
      toast(`Sent to lantern ${id}`);
      goWall();
    } catch (err) {
      toast(err.message, true);
    } finally {
      sendBtn.disabled = false; sendBtn.textContent = 'Send to wall';
    }
  });

  // ---------- Idle reset (so the next visitor starts at the wall) ----------
  let idleTimer;
  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (current != null) goWall(); chooser.hidden = true; }, IDLE_MS);
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

  // Fallback first load in case the socket is slow
  fetch('/api/state').then(r => r.json()).then(s => { if (!lanterns.length) { lanterns = s.lanterns; renderWall(); } }).catch(() => {});
  if (document.fonts) document.fonts.ready.then(() => { if (mode === 'text') renderInk(); });
  syncControls();
  fitWall();
})();
