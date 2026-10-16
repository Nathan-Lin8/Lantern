// Projector display: draws every lantern's light color + latest PNG at its calibrated spot.
// Changes arrive live from Supabase and cross-fade in with a sparkle rising from the bottom of the lantern.
// Two looks, switched with D: 'detailed' draws full paper lanterns (for a wall without physical lanterns yet);
// 'flat' fills only each face with flat bright color, keeping everything else black, for projecting onto real lanterns.
// Between visitors the wall idles invitingly: lanterns breathe out of step, embers drift upward,
// and now and then a lantern sparkles by itself. A toggles that motion, T toggles the title.
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');

  const FADE_MS = 600;

  // id -> { lantern, img, prev: { color, img } | null, t0, burst }
  const views = new Map();
  const loadSeq = new Map();   // id -> latest update number, so a slow image load can't overwrite a newer one
  const LOOK_KEY = 'lw-projector-look';
  let detailed = (() => { try { return localStorage.getItem(LOOK_KEY) !== 'flat'; } catch { return true; } })();
  let calibrating = false, unlocked = false, selected = null, dragInfo = null, dirtyLayout = false;
  const pref = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch { return fallback; } };
  const savePref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ } };
  let ambient = pref('lw-projector-ambient', true);
  let showTitle = pref('lw-projector-title', true);
  $('#cta').classList.toggle('hide', !showTitle);

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
    const live = current && changed;    // a real change, not the first load
    views.set(l.id, {
      lantern: l, img,
      prev: live ? { color: current.lantern.color, img: current.img, art: current.art } : current?.prev || null,
      t0: live || !current ? performance.now() : current.t0,
      burst: live ? LanternArt.burst(l.shape, l.color) : current?.burst || null
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

  // ---------- Ambient motion ----------
  const PULSE_MS = 4200;        // one slow breath
  const SPARKLE_MIN_MS = 6000, SPARKLE_MAX_MS = 11000;
  const EMBER_COLORS = [[255, 200, 120], [244, 166, 74], [255, 230, 190], [242, 138, 46]];
  const moving = () => ambient && !LanternArt.reduceMotion.matches;

  const hexRgb = c => (!c || c === 'off') ? null : [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));

  // Soft round glow, white at the center, cached per color and scaled when drawn
  const glows = new Map();
  function glowSprite(c) {
    const key = c.join();
    if (glows.has(key)) return glows.get(key);
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.35, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    glows.set(key, cv);
    return cv;
  }

  // 0..1 breath for a lantern; neighbours are offset so a slow wave rolls across the wall
  function breath(id, now) {
    const t = now / PULSE_MS + id * 0.17;
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  }

  // Detailed look: a halo on the wall behind the lantern that swells and fades
  function drawHalo(v, R, now, alpha) {
    const c = hexRgb(v.lantern.color);
    if (!c || alpha <= 0) return;
    const b = breath(v.lantern.id, now);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, s = 1.5 + 0.35 * b;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (0.12 + 0.22 * b);
    ctx.drawImage(glowSprite(c), cx - R.w * s / 2, cy - R.h * s / 2, R.w * s, R.h * s);
    ctx.restore();
  }

  // The face itself brightens on the in-breath (clipped to the face, so the flat look's wall stays black)
  function drawPulse(v, R, now, alpha) {
    const c = hexRgb(v.lantern.color);
    if (!c || alpha <= 0) return;
    const b = breath(v.lantern.id, now);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    facePath(v.lantern.shape, R); ctx.clip();
    ctx.globalAlpha = alpha * (detailed ? 0.16 : 0.22) * b;
    ctx.fillStyle = `rgb(${c})`;
    ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.restore();
    if (!detailed && b < 0.5) {     // flat look: dip a little below full on the out-breath
      ctx.save();
      facePath(v.lantern.shape, R); ctx.clip();
      ctx.globalAlpha = alpha * 0.18 * (0.5 - b) * 2;
      ctx.fillStyle = '#000'; ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.restore();
    }
  }

  // Embers drifting up the wall, in fractions of the screen
  const embers = Array.from({ length: 70 }, () => newEmber(Math.random()));
  function newEmber(y = 1.05) {
    return {
      x: Math.random(), y,
      speed: 0.006 + Math.random() * 0.018,              // screen heights per second
      size: 0.004 + Math.random() * 0.01,                // fraction of screen height
      sway: 0.004 + Math.random() * 0.012, swayHz: 0.05 + Math.random() * 0.12, ph: Math.random() * 6.283,
      tw: 0.4 + Math.random() * 1.2,                     // twinkle rate
      color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]
    };
  }

  let lastFrame = 0;
  function drawBackground(now) {
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const W = canvas.width, H = canvas.height, sec = now / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (detailed) {
      // Warm light pooling up from the floor, breathing slowly
      const b = 0.5 - 0.5 * Math.cos(sec * Math.PI * 2 / 9);
      ctx.save();
      ctx.translate(W / 2, H * 1.08); ctx.scale(W * 0.75, H * 0.55);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(244,150,60,${0.10 + 0.06 * b})`); g.addColorStop(0.5, `rgba(200,90,40,${0.04 + 0.025 * b})`);
      g.addColorStop(1, 'rgba(120,40,30,0)');
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    // Flat look is projected onto a real wall, so the embers stay faint there
    const level = detailed ? 1 : 0.45;
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.y -= e.speed * dt;
      if (e.y < -0.05) { embers[i] = newEmber(); continue; }
      const x = (e.x + e.sway * Math.sin(sec * e.swayHz * 6.283 + e.ph)) * W;
      const s = e.size * H;
      const fadeIn = Math.min(1, (1.05 - e.y) / 0.25), fadeOut = Math.min(1, e.y / 0.3);   // gone before reaching the title
      ctx.globalAlpha = level * fadeIn * fadeOut * (0.35 + 0.35 * Math.sin(sec * e.tw * 6.283 + e.ph) ** 2);
      ctx.drawImage(glowSprite(e.color), x - s / 2, e.y * H - s / 2, s, s);
    }
    ctx.restore();
  }

  // Every few seconds a random lit lantern sparkles on its own, as if beckoning
  let nextSparkle = performance.now() + SPARKLE_MIN_MS;
  function idleSparkle(now) {
    if (now < nextSparkle || calibrating) return;
    nextSparkle = now + SPARKLE_MIN_MS + Math.random() * (SPARKLE_MAX_MS - SPARKLE_MIN_MS);
    const lit = [...views.values()].filter(v => !v.burst && !v.prev && hexRgb(v.lantern.color));
    if (!lit.length) return;
    const v = lit[Math.floor(Math.random() * lit.length)];
    v.burst = LanternArt.burst(v.lantern.shape, v.lantern.color, true);
  }

  // ---------- Drawing ----------
  let rafPending = false;
  function requestDraw() {
    if (!rafPending) { rafPending = true; requestAnimationFrame(draw); }
  }

  function rectPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }

  const facePath = (shape, R) => LanternArt.facePath(ctx, shape, R.x, R.y, R.w, R.h);

  // Detailed lanterns are rendered once into a sprite (kept on `holder`) and re-rendered only when they change
  function spriteFor(holder, shape, color, img, R) {
    const key = `${shape}|${color}|${Math.round(R.w)}x${Math.round(R.h)}`;
    const a = holder.art;
    if (a && a.key === key && a.img === img) return a.sprite;
    holder.art = { key, img, sprite: LanternArt.sprite({ shape, color, img }, R.w, R.h, 1) };
    return holder.art.sprite;
  }

  function paintLantern(holder, shape, color, img, R, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (detailed) {
      const s = spriteFor(holder, shape, color, img, R);
      ctx.drawImage(s.c, R.x - s.mg.x, R.y - s.mg.top);
    } else {
      facePath(shape, R); ctx.clip();
      if (color && color !== 'off') { ctx.fillStyle = color; ctx.fillRect(R.x, R.y, R.w, R.h); }
      if (img) ctx.drawImage(img, R.x, R.y, R.w, R.h);   // stretched to the lantern's calibrated box
    }
    ctx.restore();
  }

  function draw() {
    rafPending = false;
    const now = performance.now();
    let animating = false;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const live = moving();
    if (live) { drawBackground(now); idleSparkle(now); } else lastFrame = 0;

    for (const v of views.values()) {
      const R = rectPx(v.lantern.proj);
      const k = v.prev ? Math.min(1, (now - v.t0) / FADE_MS) : 1;
      if (v.prev && k < 1) {
        animating = true;
        paintLantern(v.prev, v.lantern.shape, v.prev.color, v.prev.img, R, 1 - k);
      } else v.prev = null;
      if (live && detailed) drawHalo(v, R, now, k);
      paintLantern(v, v.lantern.shape, v.lantern.color, v.img, R, k);
      if (live) drawPulse(v, R, now, k);
      if (v.burst) {
        ctx.save();
        if (!detailed) { facePath(v.lantern.shape, R); ctx.clip(); }   // flat look: keep the wall around it black
        if (LanternArt.drawBurst(ctx, v.burst, R.x, R.y, R.w, R.h, now, 1.5)) animating = true; else v.burst = null;
        ctx.restore();
      }

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
    if (animating || live) requestDraw();
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
    if (k === 'd') {
      detailed = !detailed;
      try { localStorage.setItem(LOOK_KEY, detailed ? 'detailed' : 'flat'); } catch { /* private mode */ }
      requestDraw();
    }
    if (k === 'a') { ambient = !ambient; savePref('lw-projector-ambient', ambient); requestDraw(); }
    if (k === 't') { showTitle = !showTitle; savePref('lw-projector-title', showTitle); $('#cta').classList.toggle('hide', !showTitle); }
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
