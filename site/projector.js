// Projector display: draws every lantern's light color + latest PNG at its calibrated spot.
// Changes arrive live from Supabase and cross-fade in.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');

  const FADE_MS = 350;

  // id -> { lantern, img, prev: { color, img } | null, t0 }
  const views = new Map();
  const loadSeq = new Map();   // id -> latest update number, so a slow image load can't overwrite a newer one
  let calibrating = false, unlocked = false, selected = null, dragInfo = null, dirtyLayout = false;

  // ---------- Size ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    requestDraw();
  }
  addEventListener('resize', resize);

  // ---------- Notices ----------
  function notice(msg) {
    const n = $('#notice');
    n.textContent = msg || '';
    n.hidden = !msg;
  }

  // ---------- Data ----------
  async function applyLantern(l) {
    const seq = (loadSeq.get(l.id) || 0) + 1;
    loadSeq.set(l.id, seq);

    const old = views.get(l.id);
    // While calibrating, keep the positions being edited here
    if (calibrating && old) l.proj = old.lantern.proj;

    let img = old?.img || null;
    const imageChanged = (old?.lantern.imageUrl || null) !== (l.imageUrl || null);
    if (imageChanged) {
      img = null;
      if (l.imageUrl) {
        try {
          img = await LW.loadImage(l.imageUrl);
          if (img.decode) await img.decode().catch(() => {});
        } catch { img = null; }
      }
    }
    if (loadSeq.get(l.id) !== seq) return;   // a newer update already arrived

    const current = views.get(l.id);
    const changed = !current || imageChanged || current.lantern.color !== l.color || current.lantern.shape !== l.shape;
    views.set(l.id, {
      lantern: l, img,
      prev: current && changed ? { color: current.lantern.color, img: current.img } : null,
      t0: performance.now()
    });
    notice('');
    requestDraw();
  }

  function removeLantern(id) {
    views.delete(id);
    loadSeq.set(id, (loadSeq.get(id) || 0) + 1);
    requestDraw();
  }

  function start() {
    if (LW.libMissing) {
      notice("Can't reach the internet. Check the connection, then reload this page.");
      setTimeout(() => location.reload(), 15000);
      return;
    }
    if (!LW.configured) {
      notice("Not connected to Supabase yet. Add your project URL and anon key to config.js.");
      return;
    }
    LW.subscribe({
      onAll: list => {
        const ids = new Set(list.map(l => l.id));
        for (const id of [...views.keys()]) if (!ids.has(id)) removeLantern(id);
        if (!list.length) notice('No lanterns yet. Run supabase/setup.sql in Supabase, or press C and reset to layout.js.');
        if (!dragInfo) list.forEach(applyLantern);
      },
      onChange: applyLantern,
      onRemove: removeLantern,
      onStatus: s => $('#conn').classList.toggle('down', s !== 'open')
    });
  }

  // ---------- Drawing ----------
  let rafPending = false;
  function requestDraw() {
    if (!rafPending) { rafPending = true; requestAnimationFrame(draw); }
  }

  function rectPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }

  function facePath(shape, R) {
    ctx.beginPath();
    if (shape === 'circle' || shape === 'oval') ctx.ellipse(R.x + R.w / 2, R.y + R.h / 2, R.w / 2, R.h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(R.x, R.y, R.w, R.h, Math.min(R.w, R.h) * 0.045);
  }

  function paintLantern(shape, color, img, R, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    facePath(shape, R); ctx.clip();
    if (color && color !== 'off') { ctx.fillStyle = color; ctx.fillRect(R.x, R.y, R.w, R.h); }
    if (img) ctx.drawImage(img, R.x, R.y, R.w, R.h);   // stretched to the lantern's calibrated box
    ctx.restore();
  }

  function draw() {
    rafPending = false;
    const now = performance.now();
    let animating = false;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const v of views.values()) {
      const R = rectPx(v.lantern.proj);
      const k = v.prev ? Math.min(1, (now - v.t0) / FADE_MS) : 1;
      if (v.prev && k < 1) {
        animating = true;
        paintLantern(v.lantern.shape, v.prev.color, v.prev.img, R, 1 - k);
      } else v.prev = null;
      paintLantern(v.lantern.shape, v.lantern.color, v.img, R, k);

      if (calibrating && unlocked) {
        const sel = selected === v.lantern.id;
        ctx.save();
        ctx.lineWidth = sel ? 6 : 3;
        ctx.strokeStyle = sel ? '#f4a64a' : '#ffffff';
        facePath(v.lantern.shape, R); ctx.stroke();
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
    if (animating) requestDraw();
  }

  // ---------- Calibration ----------
  const help = $('#help');
  const status = msg => { $('#status').textContent = msg; };
  let helpTimer = setTimeout(() => help.classList.add('hide'), 6000);

  LW.codes.fromUrl('admin', 'admin');   // projector.html?admin=... unlocks calibration on this laptop

  async function setCalibrating(on) {
    calibrating = on;
    document.body.classList.toggle('calibrating', on);
    clearTimeout(helpTimer);
    help.classList.remove('hide');
    status('');
    if (on && !unlocked) {
      const saved = LW.codes.get('admin');
      if (saved && LW.configured) {
        try { unlocked = await LW.checkCode(saved, 'admin'); } catch { /* offline */ }
        if (!unlocked) LW.codes.clear('admin');
      }
    }
    $('#adminForm').hidden = !on || unlocked;
    $('#calTools').hidden = !on || !unlocked;
    if (on && !unlocked) $('#adminCode').focus();
    if (on && unlocked && dirtyLayout) status('Unsaved changes');
    if (!on) { selected = null; helpTimer = setTimeout(() => help.classList.add('hide'), 2500); }
    requestDraw();
  }

  $('#adminForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#adminCode').value.trim();
    if (!code) return;
    status('Checking…');
    try {
      if (await LW.checkCode(code, 'admin')) {
        LW.codes.set('admin', code);
        unlocked = true; $('#adminCode').value = '';
        setCalibrating(true);
      } else status("That admin code didn't work.");
    } catch (err) { status(err.message); }
  });

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
    if (!calibrating || !unlocked) return;
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
    markDirty();
    requestDraw();
  });
  const endDrag = () => { dragInfo = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function markDirty() { dirtyLayout = true; status('Unsaved changes · press S to save'); }

  async function adminCall(name, args, doneMsg) {
    try {
      await LW.rpc(name, { ...args, p_code: LW.codes.get('admin') });
      status(doneMsg);
      return true;
    } catch (err) {
      if (err.badCode) { LW.codes.clear('admin'); unlocked = false; setCalibrating(true); }
      status(err.message);
      return false;
    }
  }

  async function saveLayout() {
    status('Saving…');
    const rows = [...views.values()].map(v => ({ id: v.lantern.id, proj: v.lantern.proj }));
    if (await adminCall('save_positions', { p_rows: rows }, 'Saved. Positions are stored in Supabase.')) dirtyLayout = false;
  }

  // Dangerous buttons need a second click within 4 seconds
  function confirmButton(btn, label, run) {
    let armed = null;
    btn.addEventListener('click', () => {
      if (armed) { clearTimeout(armed); armed = null; btn.textContent = label; run(); return; }
      btn.textContent = 'Click again to confirm';
      armed = setTimeout(() => { armed = null; btn.textContent = label; }, 4000);
    });
  }

  $('#saveBtn').addEventListener('click', saveLayout);
  // Cycle the panel around the corners so it never hides a lantern you're lining up
  const corners = ['', 'top', 'top right', 'right'];
  let corner = 0;
  $('#moveBtn').addEventListener('click', () => {
    corner = (corner + 1) % corners.length;
    help.className = 'overlay ' + corners[corner];
  });
  $('#doneBtn').addEventListener('click', () => setCalibrating(false));
  confirmButton($('#clearBtn'), 'Clear all drawings', () => {
    status('Clearing…');
    adminCall('clear_drawings', {}, 'All drawings cleared.');
  });
  confirmButton($('#resetBtn'), 'Reset to layout.js', async () => {
    status('Resetting…');
    views.clear();
    if (await adminCall('reset_layout', { p_rows: window.buildLanternRows() }, 'Layout reset from layout.js.')) dirtyLayout = false;
  });

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input')) return;   // typing the admin code
    const k = e.key.toLowerCase();
    if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    if (k === 'c') setCalibrating(!calibrating);
    if (!calibrating || !unlocked) return;
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
      markDirty();
      requestDraw();
    }
  });

  resize();
  start();
})();
