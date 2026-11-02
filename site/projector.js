// Projector display for REAR projection: the projector sits behind the lanterns and shines through them.
//   - Everything outside the lantern shapes is pure black, always. Light is only ever painted inside each
//     lantern's face (shrunk by EDGE_INSET so a slightly-off calibration doesn't spill onto the wall or
//     into visitors' eyes). Nothing travels across the gaps.
//   - The output is mirrored (MIRROR_X) so text and drawings read correctly from the front.
//   - One main lantern (interactive in layout.js) shows the visitor's color, drawing and text.
//     The decorative lanterns breathe and drift through warm colors; when a visitor sends something they
//     echo its color one after another, outward from the main lantern, then settle back.
// projector.html?demo shows the layout.js lanterns locally without connecting to Supabase (R plays a reveal).
(() => {
  // ================================================================================================
  // CONFIG: everything worth tuning on the real lanterns. Times are in seconds unless they end in _MS.
  // ================================================================================================
  const CONFIG = {
    // ----- Rear projection -----
    MIRROR_X: true,               // flip the output left/right so it reads correctly from the front.
                                  // Default only: the Flip button in calibration (C) changes it and S saves it to Supabase.
    EDGE_INSET: 0.03,             // light stops this far inside each lantern's outline (fraction of the lantern's
                                  // smaller side, per edge). Raise it if light spills past the paper.

    // ----- Breathing: each lantern pulses on its own slow cycle, picked between these -----
    BREATH_MIN_S: 4,
    BREATH_MAX_S: 7,
    BREATH_DEPTH: 0.3,            // how far a decorative lantern dims at the bottom of a breath (0.3 = to 70%)

    // ----- Main lantern: keep ambient effects subtle so the visitor's drawing / text stays readable -----
    MAIN_BREATH_DEPTH: 0.06,      // breathing depth on the main lantern
    MAIN_AMBIENT: 0.3,            // flicker, glow and echo-tint on the main lantern are scaled by this
    MAIN_FLAME: 0.35,             // brightness of the wandering warm hotspot on the main lantern (0 = none)

    // ----- Candle flicker inside each lantern -----
    FLICKER_DEPTH: 0.05,          // brightness noise (0..1)
    FLICKER_SPEED: 2.4,           // higher = quicker flicker
    FLAME_ALPHA: 0.22,            // brightness of the soft warm hotspot that wanders inside each lantern
    FLAME_WANDER: 0.06,           // how far the hotspot wanders (fraction of the lantern)

    // ----- Colors: decorative lanterns drift slowly through these -----
    DRIFT_COLORS: ['#f4a64a', '#ec7f8f', '#f2c35b', '#f59a6a'],   // amber -> rose -> gold -> peach -> ...
    DRIFT_PERIOD_S: 180,          // one full trip through the colors
    DRIFT_AMOUNT: 0.8,            // 0 = keep layout.js colors, 1 = pure drift colors

    // ----- How light settles: rise time after something arrives, and the slower fade back to calm -----
    ATTACK_S: 0.4,
    SETTLE_S: 2.4,

    // ----- Travel between lanterns (attract mode). Nothing is drawn in the gap: the sending lantern
    //       dims while the receiving one brightens over the "flight" time. -----
    WISP_SPEED: 0.075,            // projected widths per second (flight time is clamped to the next two values)
    WISP_MIN_S: 2.4,
    WISP_MAX_S: 6,
    LAUNCH_GLOW: 0.15,            // sender brightens a little as light leaves
    ARRIVE_GLOW: 0.6,             // receiver brightens this much when it arrives
    ARRIVE_TINT: 0.45,            // ...and takes on this much of the sender's color, then settles
    TRAVEL_DIM: 0.4,              // sender dims while light travels
    TRAVEL_GLOW: 0.35,            // receiver brightens in anticipation

    // ----- Ripples: a wave of light spreading lantern by lantern -----
    RIPPLE_SPEED: 0.32,           // projected widths per second
    RIPPLE_GLOW: 0.55,
    RIPPLE_TINT: 0.3,

    // ----- Choreographer: picks a sequence every SEQ_MIN_S..SEQ_MAX_S, never the same one twice in a row -----
    SEQ_FIRST_S: 3,
    SEQ_MIN_S: 5,
    SEQ_MAX_S: 12,
    MAX_SEQS: 2,                  // sequences allowed to overlap
    MAX_WISPS: 6,                 // never more than this many travels at once
    WISP_EVERY_MIN_S: 2,          // plus a stray travel between two neighbors every MIN..MAX seconds
    WISP_EVERY_MAX_S: 5,
    SEQ_WEIGHTS: { wisp: 1, relay: 0.8, ripple: 0.7, conversation: 0.9 },   // 0 turns one off
    CONVERSATION_MIN: 3,          // passes back and forth in a conversation
    CONVERSATION_MAX: 5,
    RELAY_MIN: 3,                 // hops for light relayed across the lanterns
    RELAY_MAX: 4,

    // ----- Reveal when a visitor sends something -----
    REVEAL_BLOOM_MS: 1100,        // new color / drawing blooms in on the main lantern over this long
    REVEAL_QUIET_S: 7,            // attract sequences pause this long around a reveal
    REVEAL_RING_DELAY_S: 0.5,     // then the decorative lanterns echo the visitor's color...
    ECHO_STEP_S: 0.45,            // ...one after another, nearest first, this far apart
    ECHO_DIP: 0.35,               // each one dims this much just before it brightens
    ECHO_DIP_LEAD_S: 0.4,         // ...this long before
    REVEAL_GLOW: 0.8,             // how bright each echo gets
    REVEAL_TINT: 0.6,             // how much of the visitor's color each echo takes on
    ECHO_SPARKLE: true,           // a small sparkle inside each lantern as it echoes
    SPARKLE_SCALE: 1.5,           // sparkle size (seen from across the room)

    // ----- A decorative lantern sparkles by itself now and then -----
    IDLE_SPARKLE_MIN_S: 5,
    IDLE_SPARKLE_MAX_S: 10
  };

  // Sound, generated live (sound.js). The browser needs one click or key press on the projector page before it can play,
  // or start Chrome with --autoplay-policy=no-user-gesture-required. M mutes / unmutes.
  const SOUND = {
    ENABLED: true,
    MASTER_VOLUME: 0.8,
    MUSIC_VOLUME: 0.35,           // the slow ambient pad
    CHORD_S: 12,                  // seconds per pad chord
    REVERB: 0.55,                 // reverb amount (0..1)
    BELL_VOLUME: 0.08,            // faint random high bells
    BELL_MIN_S: 5,
    BELL_MAX_S: 14,
    ARRIVE_VOLUME: 0.05,          // a whisper of a note when traveling light reaches a lantern...
    ARRIVE_CHANCE: 0.5,           // ...on this fraction of arrivals
    CHIME_VOLUME: 0.32            // the chime when a visitor's light arrives from the iPad
  };

  const $ = s => document.querySelector(s);
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');
  const A = window.Ambient;

  // id -> { lantern, img, prev: { color, img } | null, t0, burst }
  const views = new Map();
  const loadSeq = new Map();   // id -> latest update number, so a slow image load can't overwrite a newer one
  let calibrating = false, unlocked = false, selected = null, dragInfo = null, dirtyLayout = false;
  let mirror = CONFIG.MIRROR_X;
  let pointer = null;          // last pointer position (canvas pixels, front-view coordinates) for the calibration cursor
  const pref = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch { return fallback; } };
  const savePref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ } };
  let ambient = pref('lw-projector-ambient', true);
  const demo = new URL(location.href).searchParams.has('demo');

  const isMain = v => v.lantern.id === mainId;
  let mainId = null;
  function findMain() { mainId = LW.mainOf([...views.values()].map(v => v.lantern))?.id ?? null; }

  // Lantern center across the wall as heard from the front (0..1), for panning sounds left / right
  const panOf = id => { const v = views.get(id); return v ? v.lantern.proj.x + v.lantern.proj.w / 2 : 0.5; };
  const eng = A.createEngine({
    ...CONFIG,
    DRAW_BETWEEN: false,                         // never: light stays inside the lanterns
    CONTENT_BREATH_DEPTH: CONFIG.MAIN_BREATH_DEPTH,
    CONTENT_AMBIENT: CONFIG.MAIN_AMBIENT,
    onEvent: (type, d) => {
      if (type === 'arrive') Sound.arrive(panOf(d.id));
      if (type === 'reveal') Sound.chime(panOf(d.id));
      if (type === 'echo' && CONFIG.ECHO_SPARKLE) {
        const v = views.get(d.id);
        if (v && !v.burst) {
          v.burst = A.burst(v.lantern.shape, null, true);
          if (v.burst) v.burst.color = d.color;            // the visitor's color, as [r, g, b]
        }
      }
    }
  });
  Sound.setup(SOUND);

  // ---------- Size ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    syncEngine();
  }
  addEventListener('resize', resize);

  // ---------- Notices ----------
  function notice(msg) {
    const n = $('#notice');
    n.textContent = msg || '';
    n.hidden = !msg;
  }
  function flash(msg) {   // short status line in the help panel
    clearTimeout(helpTimer);
    help.classList.remove('hide');
    status(msg);
    if (!calibrating) helpTimer = setTimeout(() => help.classList.add('hide'), 2500);
  }

  // ---------- Mirroring ----------
  function setMirror(on) {
    mirror = on;
    document.body.classList.toggle('mirrored', on);
    $('#mirrorState').textContent = on
      ? 'Mirrored for rear projection (reads correctly from the front)'
      : 'Not mirrored (reads correctly on the laptop / from behind)';
  }

  // ---------- Data ----------
  // Feeds lantern positions and colors to the ambient engine. The main lantern counts as "content"
  // (subtle ambient) and never drifts; decorative lanterns always drift.
  function syncEngine() {
    findMain();
    eng.setLanterns([...views.values()].map(v => ({
      id: v.lantern.id, ...v.lantern.proj, color: v.lantern.color,
      content: isMain(v) || !!v.img,
      custom: isMain(v) || !!v.img
    })), canvas.width / canvas.height);
  }

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
      prev: live ? { color: current.lantern.color, img: current.img } : current?.prev || null,
      t0: live || !current ? performance.now() : current.t0,
      burst: live ? A.burst(l.shape, l.color) : current?.burst || null
    });
    notice('');
    syncEngine();
    if (live) eng.reveal(l.id, l.color);
  }

  function removeLantern(id) {
    views.delete(id);
    loadSeq.set(id, (loadSeq.get(id) || 0) + 1);
    syncEngine();
  }

  async function start() {
    if (demo) return startDemo();
    if (LW.libMissing) {
      notice("Can't reach the internet. Check the connection, then reload this page.");
      setTimeout(() => location.reload(), 15000);
      return;
    }
    if (!LW.configured) {
      notice("Not connected to Supabase yet. Add your project URL and anon key to config.js.");
      return;
    }
    const display = await LW.fetchDisplay();
    if (display && display.mirrorX != null) setMirror(display.mirrorX);
    LW.subscribe({
      onAll: list => {
        const ids = new Set(list.map(l => l.id));
        for (const id of [...views.keys()]) if (!ids.has(id)) removeLantern(id);
        if (!list.length) notice('No lanterns yet. Press C and reset to layout.js.');
        if (!dragInfo) list.forEach(applyLantern);
      },
      onChange: applyLantern,
      onRemove: removeLantern,
      onStatus: s => $('#conn').classList.toggle('down', s !== 'open')
    });
  }

  // The layout.js lanterns, locally. Nothing is saved.
  function startDemo() {
    for (const r of window.buildLanternRows()) {
      views.set(r.id, { lantern: { ...r, imageUrl: null }, img: null, prev: null, t0: 0, burst: null });
    }
    syncEngine();
    flash('Demo: layout.js lanterns, not connected. R plays a reveal.');
  }

  // ---------- Drawing ----------
  // All drawing happens in front-view coordinates; the canvas transform mirrors it for rear projection.
  function rectPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }
  // The lit area: the lantern's box pulled in by EDGE_INSET on every side
  function lightRect(R) {
    const i = Math.min(R.w, R.h) * CONFIG.EDGE_INSET;
    return { x: R.x + i, y: R.y + i, w: Math.max(1, R.w - 2 * i), h: Math.max(1, R.h - 2 * i) };
  }

  const facePath = (shape, R) => A.facePath(ctx, shape, R.x, R.y, R.w, R.h);

  const fill = [0, 0, 0];
  // One lantern's light, clipped to its (inset) face. Lt = this frame's ambient light; bloom adds a brief
  // swell of light under the content. The drawing sits on top untouched so it always stays readable.
  function paintLantern(holder, shape, color, img, R, alpha, Lt, bloom = 0, main = false) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    facePath(shape, R); ctx.clip();
    const lit = color && color !== 'off';
    if (lit) {
      let c = A.rgb(color);
      if (Lt && Lt.base) {
        const glow = Lt.glow, base = Lt.base;
        Lt.glow = glow + bloom;
        if (holder.prevColor) Lt.base = A.rgb(holder.prevColor);   // fading-out content keeps its own color
        c = A.shade(Lt, fill);
        Lt.glow = glow; Lt.base = base;
      }
      ctx.fillStyle = A.css(c); ctx.fillRect(R.x, R.y, R.w, R.h);
      if (Lt && Lt.flame.a > 0.005) {
        const fx = R.x + R.w * Lt.flame.x, fy = R.y + R.h * Lt.flame.y, fw = R.w * 0.95, fh = R.h * 0.8;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * Lt.flame.a * (main ? CONFIG.MAIN_FLAME : 1);
        ctx.drawImage(A.haze(A.mix(c, A.WARM, 0.55)), fx - fw / 2, fy - fh / 2, fw, fh);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
      }
    } else if (bloom > 0) {                     // a lantern switched off still gets a brief farewell glow
      ctx.globalAlpha = alpha * bloom * 0.4;
      ctx.fillStyle = A.css(A.WARM); ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.globalAlpha = alpha;
    }
    if (img) ctx.drawImage(img, R.x, R.y, R.w, R.h);   // stretched to the lantern's calibrated box
    ctx.restore();
  }

  // Every few seconds a random decorative lantern sparkles on its own, as if beckoning
  let nextSparkle = CONFIG.IDLE_SPARKLE_MIN_S, bgSec = 0;
  function idleSparkle(sec) {
    if (sec < nextSparkle) return;
    nextSparkle = sec + A.rand(CONFIG.IDLE_SPARKLE_MIN_S, CONFIG.IDLE_SPARKLE_MAX_S);
    const lit = [...views.values()].filter(v => !isMain(v) && !v.burst && !v.prev && !v.img && A.rgb(v.lantern.color));
    if (!lit.length) return;
    const v = lit[Math.floor(Math.random() * lit.length)];
    v.burst = A.burst(v.lantern.shape, v.lantern.color, true);
  }

  function draw(now, wall) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (mirror) ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);

    const still = calibrating || !ambient;
    if (!still && !A.reduceMotion.matches) idleSparkle(bgSec);
    for (const v of views.values()) {
      const full = rectPx(v.lantern.proj), R = lightRect(full);
      const Lt = still ? null : eng.light(v.lantern.id, wall);
      const main = isMain(v);
      const T = v.prev ? Math.min(1, (now - v.t0) / CONFIG.REVEAL_BLOOM_MS) : 1;
      const k = A.ease.outCubic(T);
      let bloom = 0;
      if (v.prev && T < 1) {
        bloom = still ? 0 : Math.sin(Math.PI * T) * 0.7;
        v.prev.prevColor = v.prev.color;
        paintLantern(v.prev, v.lantern.shape, v.prev.color, v.prev.img, R, 1 - k, Lt, 0, main);
      } else v.prev = null;
      paintLantern(v, v.lantern.shape, v.lantern.color, v.img, R, k, Lt, bloom, main);
      if (v.burst) {
        ctx.save();
        facePath(v.lantern.shape, R); ctx.clip();        // sparkles stay inside the lantern too
        if (!A.drawBurst(ctx, v.burst, R.x, R.y, R.w, R.h, now, CONFIG.SPARKLE_SCALE)) v.burst = null;
        ctx.restore();
      }
      if (calibrating && unlocked) drawCalibration(v, full, main);
    }
    if (calibrating && unlocked && mirror && pointer) drawCursor(pointer);
  }

  // Outline, id and resize handle for one lantern (calibration only). Drawn in front-view space, so the
  // labels read correctly from the front when mirrored.
  function drawCalibration(v, R, main) {
    const sel = selected === v.lantern.id;
    ctx.save();
    ctx.lineWidth = sel ? 6 : 3;
    ctx.strokeStyle = sel ? '#f4a64a' : '#ffffff';
    facePath(v.lantern.shape, R); ctx.stroke();
    ctx.setLineDash([8, 8]); ctx.lineWidth = 1; ctx.strokeRect(R.x, R.y, R.w, R.h); ctx.setLineDash([]);
    ctx.fillStyle = sel ? '#f4a64a' : '#ffffff';
    ctx.fillRect(R.x + R.w - 24, R.y + R.h - 24, 24, 24);           // resize handle
    const label = main ? `${v.lantern.id} MAIN` : String(v.lantern.id);
    ctx.font = `700 ${Math.max(20, Math.min(R.w * 0.3, R.w / label.length * 1.6))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#000';
    ctx.strokeText(label, R.x + R.w / 2, R.y + R.h / 2);
    ctx.fillText(label, R.x + R.w / 2, R.y + R.h / 2);
    ctx.restore();
  }

  // While mirrored, the system cursor would move the wrong way as seen from the front, so it is hidden
  // over the canvas and this crosshair is drawn instead (it follows the mouse as seen from the front).
  function drawCursor(p) {
    const s = 18 * (canvas.width / innerWidth);
    ctx.save();
    ctx.lineCap = 'round';
    for (const [style, lw] of [['#000', 6], ['#f4a64a', 2.5]]) {
      ctx.strokeStyle = style; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
      ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
      ctx.stroke();
    }
    ctx.restore();
  }

  // One animation loop for everything, driven by delta time
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    eng.setEnabled(ambient && !calibrating);
    eng.update(dt);
    if (ambient && !calibrating) bgSec += dt;
    draw(now, (performance.timeOrigin + now) / 1000);
  }

  // ---------- Calibration ----------
  const help = $('#help');
  const status = msg => { $('#status').textContent = msg; };
  let helpTimer = null;          // the help panel starts hidden: nothing but lantern light on the wall

  LW.codes.fromUrl('admin', 'admin');   // projector.html?admin=... unlocks calibration on this laptop

  async function setCalibrating(on) {
    calibrating = on;
    document.body.classList.toggle('calibrating', on);
    clearTimeout(helpTimer);
    help.classList.remove('hide');
    status('');
    if (on && !unlocked && !demo) {
      const saved = LW.codes.get('admin');
      if (saved && LW.configured) {
        try { unlocked = await LW.checkCode(saved, 'admin'); } catch { /* offline */ }
        if (!unlocked) LW.codes.clear('admin');
      }
    }
    if (demo) unlocked = true;
    $('#adminForm').hidden = !on || unlocked;
    $('#calTools').hidden = !on || !unlocked;
    if (on && !unlocked) $('#adminCode').focus();
    if (on && unlocked && dirtyLayout) status('Unsaved changes · press S to save');
    if (!on) { selected = null; helpTimer = setTimeout(() => help.classList.add('hide'), 2500); }
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

  // Pointer -> front-view canvas pixels. The mouse's raw position is used as-is, NOT un-mirrored:
  // with rear projection, moving the mouse right then moves the crosshair and the dragged shape right
  // as seen from the front (which is where you stand to line shapes up with the real lanterns).
  const toCanvas = e => {
    const dpr = canvas.width / innerWidth;
    return { x: e.clientX * dpr, y: e.clientY * dpr };
  };

  canvas.addEventListener('pointerdown', e => {
    if (!calibrating || !unlocked) return;
    const p = toCanvas(e);
    pointer = p;
    const h = hit(p.x, p.y);
    selected = h ? h.v.lantern.id : null;
    if (h) {
      canvas.setPointerCapture(e.pointerId);
      dragInfo = { v: h.v, corner: h.corner, start: p, orig: { ...h.v.lantern.proj } };
    }
  });
  canvas.addEventListener('pointermove', e => {
    pointer = toCanvas(e);
    if (!dragInfo) return;
    const p = pointer;
    const dx = (p.x - dragInfo.start.x) / canvas.width;
    const dy = (p.y - dragInfo.start.y) / canvas.height;
    const r = dragInfo.v.lantern.proj, o = dragInfo.orig;
    if (dragInfo.corner) { r.w = Math.max(0.02, o.w + dx); r.h = Math.max(0.02, o.h + dy); }
    else { r.x = o.x + dx; r.y = o.y + dy; }
    markDirty();
  });
  canvas.addEventListener('pointerleave', () => { if (!dragInfo) pointer = null; });
  const endDrag = () => { dragInfo = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function markDirty() { dirtyLayout = true; syncEngine(); status('Unsaved changes · press S to save'); }

  async function adminCall(name, args, doneMsg) {
    if (demo) { status('Demo mode: nothing is saved.'); return false; }
    try {
      await LW.rpc(name, { ...args, p_code: LW.codes.get('admin') });
      status(doneMsg);
      return true;
    } catch (err) {
      if (err.badCode) { LW.codes.clear('admin'); unlocked = false; setCalibrating(true); }
      status(/save_positions|p_mirror|function/i.test(err.message)
        ? err.message + ' (Run supabase/migrate-main-lantern.sql in Supabase first.)'
        : err.message);
      return false;
    }
  }

  async function saveLayout() {
    status('Saving…');
    const rows = [...views.values()].map(v => ({ id: v.lantern.id, proj: v.lantern.proj }));
    if (await adminCall('save_positions', { p_rows: rows, p_mirror: mirror },
      `Saved positions and mirroring (${mirror ? 'on' : 'off'}) to Supabase.`)) dirtyLayout = false;
  }

  function flip() {
    setMirror(!mirror);
    markDirty();
    status(`Mirroring ${mirror ? 'on' : 'off'} · press S to save`);
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
  $('#flipBtn').addEventListener('click', flip);
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
    if (demo) { views.clear(); startDemo(); return; }
    views.clear(); syncEngine();
    if (await adminCall('reset_layout', { p_rows: window.buildLanternRows() }, 'Layout reset from layout.js. Line the shapes up, then press S.')) dirtyLayout = false;
  });

  // Replays the reveal on the main lantern, locally only (for tuning the effect on the real lanterns)
  function previewReveal() {
    const v = views.get(mainId) || [...views.values()][0];
    if (!v) return;
    v.prev = { color: v.lantern.color, img: v.img };
    v.t0 = performance.now();
    v.burst = A.burst(v.lantern.shape, v.lantern.color);
    eng.reveal(v.lantern.id, v.lantern.color);
  }

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input')) return;   // typing the admin code
    const k = e.key.toLowerCase();
    if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    if (k === 'c') setCalibrating(!calibrating);
    if (k === 'h' && !calibrating) {
      clearTimeout(helpTimer);
      help.classList.toggle('hide');
      if (!help.classList.contains('hide')) { status(Sound.ready ? '' : 'Sound starts after a click or key press.'); helpTimer = setTimeout(() => help.classList.add('hide'), 8000); }
    }
    if (k === 'a') { ambient = !ambient; savePref('lw-projector-ambient', ambient); flash(ambient ? 'Ambient motion on' : 'Ambient motion off'); }
    if (k === 'r' && !calibrating) previewReveal();
    if (k === 'm') flash(Sound.toggle() ? 'Sound on' : 'Sound off');
    if (!calibrating || !unlocked) return;
    if (k === 's') { e.preventDefault(); saveLayout(); }
    if (k === 'x') flip();
    const v = selected != null && views.get(selected);
    if (v && e.key.startsWith('Arrow')) {
      e.preventDefault();
      // Arrows move the shape as seen from the front (the drawing space is already front-view)
      const step = (e.shiftKey ? 10 : 1);
      const r = v.lantern.proj;
      if (e.key === 'ArrowLeft') r.x -= step / canvas.width;
      if (e.key === 'ArrowRight') r.x += step / canvas.width;
      if (e.key === 'ArrowUp') r.y -= step / canvas.height;
      if (e.key === 'ArrowDown') r.y += step / canvas.height;
      markDirty();
    }
  });

  // A few hooks for checking the projector from the browser console (window.LWProjector)
  window.LWProjector = { config: CONFIG, engine: eng, views, previewReveal, get mirror() { return mirror; }, get mainId() { return mainId; } };

  setMirror(mirror);
  resize();
  start();
  requestAnimationFrame(frame);
})();
