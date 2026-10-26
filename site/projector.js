// Projector display: draws every lantern's light color + latest PNG at its calibrated spot.
// Between visitors the wall runs "attract mode" (see ambient.js): every lantern breathes and flickers like a
// candle, untouched lanterns drift through warm hues, and wisps of light travel between lanterns.
// When a visitor sends something, that lantern blooms in with rising sparkles and a ring of their color
// ripples out to its neighbors, then the wall settles back into attract mode.
// Two looks, switched with D: 'detailed' draws full paper lanterns (for a wall without physical lanterns yet);
// 'flat' fills only each face, keeping everything else black, for projecting onto real lanterns.
// projector.html?demo=12 shows 12 local lanterns without connecting to Supabase (for previewing motion).
(() => {
  // ================================================================================================
  // CONFIG: everything worth tuning on the real wall. Times are in seconds unless they end in _MS.
  // Distances and speeds are in "wall widths" (1 = the full projected width).
  // ================================================================================================
  const CONFIG = {
    // Light between lanterns.
    //   true:  wisps and their trails fly through the black space between lanterns.
    //   false: light only appears inside lantern shapes; travel shows as one lantern dimming while the next brightens.
    // Press W on the projector to flip it live (remembered on this laptop) and compare both on the real wall.
    DRAW_BETWEEN: true,

    // Breathing: each lantern pulses on its own slow cycle, picked between these, so the wall shimmers
    BREATH_MIN_S: 4,
    BREATH_MAX_S: 7,
    BREATH_DEPTH: 0.3,            // how far a lantern dims at the bottom of a breath (0 = none, 0.3 = to 70%)
    CONTENT_BREATH_DEPTH: 0.08,   // the same for a lantern holding a drawing or text (keep small: content stays readable)

    // Candle flicker inside each lantern
    FLICKER_DEPTH: 0.05,          // brightness noise (0..1)
    FLICKER_SPEED: 2.4,           // higher = quicker flicker
    FLAME_ALPHA: 0.22,            // brightness of the soft warm hotspot that wanders inside each lantern
    FLAME_WANDER: 0.06,           // how far the hotspot wanders (fraction of the lantern)

    // Slow color drift for lanterns nobody has customized (color still matches layout.js, no drawing)
    DRIFT_COLORS: ['#f4a64a', '#ec7f8f', '#f2c35b', '#f59a6a'],   // amber -> rose -> gold -> peach -> ...
    DRIFT_PERIOD_S: 180,          // one full trip through the colors
    DRIFT_AMOUNT: 0.8,            // 0 = keep layout.js colors, 1 = pure drift colors

    // Visitor content always wins: ambient effects on a lantern with a drawing/text are scaled by this
    CONTENT_AMBIENT: 0.3,

    // How light settles: rise time after something arrives, and the slower fade back to calm
    ATTACK_S: 0.4,
    SETTLE_S: 2.4,

    // Wisps: small glowing orbs with soft trails, drifting from one lantern to a neighbor
    WISP_SPEED: 0.075,            // wall widths per second (flight time is clamped to the next two values)
    WISP_MIN_S: 2.4,
    WISP_MAX_S: 6,
    WISP_ARC: 0.35,               // how much the path bows (fraction of the distance)
    WISP_WOBBLE: 0.012,           // noise wobble along the path (wall widths)
    WISP_SIZE: 0.022,             // orb size, fraction of wall height
    WISP_TRAIL_S: 0.8,            // trail length in seconds
    WISP_BRIGHTNESS: 0.9,         // 0..1
    LAUNCH_GLOW: 0.15,            // the sending lantern brightens a little as a wisp leaves
    ARRIVE_GLOW: 0.6,             // the receiving lantern brightens this much
    ARRIVE_TINT: 0.45,            // ...and takes on this much of the wisp's color, then settles
    TRAVEL_DIM: 0.4,              // sender dims while a wisp travels (full strength when DRAW_BETWEEN is off)
    TRAVEL_GLOW: 0.35,            // receiver brightens in anticipation (same)

    // Ripples: a wave of light spreading lantern by lantern
    RIPPLE_SPEED: 0.32,           // wall widths per second
    RIPPLE_GLOW: 0.55,
    RIPPLE_TINT: 0.3,

    // Choreographer: picks a sequence every SEQ_MIN_S..SEQ_MAX_S, never the same one twice in a row
    SEQ_FIRST_S: 3,
    SEQ_MIN_S: 5,
    SEQ_MAX_S: 12,
    MAX_SEQS: 2,                  // sequences allowed to overlap
    MAX_WISPS: 8,                 // never more than this many wisps in the air at once
    WISP_EVERY_MIN_S: 1.5,        // plus a stray wisp between two neighbors every MIN..MAX seconds
    WISP_EVERY_MAX_S: 4,
    SEQ_WEIGHTS: { wisp: 1, relay: 0.8, ripple: 0.7, conversation: 0.9 },   // 0 turns one off
    CONVERSATION_MIN: 3,          // wisps passed back and forth in a conversation
    CONVERSATION_MAX: 5,
    RELAY_MIN: 3,                 // hops for a wisp relayed across the wall
    RELAY_MAX: 4,

    // Reveal when a visitor sends something
    REVEAL_BLOOM_MS: 1100,        // new color / drawing blooms in over this long
    REVEAL_QUIET_S: 7,            // attract sequences pause this long around a reveal
    REVEAL_RING_DELAY_S: 0.5,     // then a ring of the visitor's color ripples out...
    REVEAL_RIPPLE_SPEED: 0.55,
    REVEAL_GLOW: 0.8,             // ...and the neighbors glow this much
    REVEAL_TINT: 0.6,             // ...in this much of the visitor's color
    REVEAL_SPARKS: 2,             // quick wisps to the nearest neighbors (only when DRAW_BETWEEN is on)
    SPARKLE_SCALE: 1.5,           // sparkle size on the wall (seen from across the room)

    // Background: glowing embers drifting up the wall, and a lantern sparkling by itself now and then
    EMBERS: 70,                   // how many (0 = none)
    EMBER_LEVEL_DETAILED: 1,      // ember brightness in the detailed look
    EMBER_LEVEL_FLAT: 0.45,       // ember brightness in the flat look (projected onto a real wall)
    FLOOR_GLOW: 1,                // warm light pooling up from the floor, detailed look only (0 = off)
    IDLE_SPARKLE_MIN_S: 5,        // a random lantern sparkles every MIN..MAX seconds
    IDLE_SPARKLE_MAX_S: 10
  };

  // Sound, generated live (sound.js). The browser needs one click or key press on the projector page before it can play,
  // or start Chrome with --autoplay-policy=no-user-gesture-required. M mutes / unmutes.
  const SOUND = {
    ENABLED: true,
    MASTER_VOLUME: 0.8,
    MUSIC_VOLUME: 0.5,            // the slow ambient pad
    CHORD_S: 12,                  // seconds per pad chord
    REVERB: 0.55,                 // reverb amount (0..1)
    BELL_VOLUME: 0.05,            // faint random high bells
    BELL_MIN_S: 5,
    BELL_MAX_S: 14,
    ARRIVE_VOLUME: 0.035,         // a whisper of a note when a wisp reaches a lantern...
    ARRIVE_CHANCE: 0.5,           // ...on this fraction of arrivals
    CHIME_VOLUME: 0.32            // the chime when a visitor's light arrives from the iPad
  };

  const $ = s => document.querySelector(s);
  const canvas = $('#c');
  const ctx = canvas.getContext('2d');
  const A = window.Ambient;

  // id -> { lantern, img, prev: { color, img } | null, t0, burst, custom }
  const views = new Map();
  const loadSeq = new Map();   // id -> latest update number, so a slow image load can't overwrite a newer one
  const touched = new Set();   // lanterns a visitor changed while this page was open
  const LOOK_KEY = 'lw-projector-look';
  let detailed = (() => { try { return localStorage.getItem(LOOK_KEY) !== 'flat'; } catch { return true; } })();
  let calibrating = false, unlocked = false, selected = null, dragInfo = null, dirtyLayout = false;
  const pref = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch { return fallback; } };
  const savePref = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* private mode */ } };
  let ambient = pref('lw-projector-ambient', true);
  let showTitle = pref('lw-projector-title', true);
  CONFIG.DRAW_BETWEEN = pref('lw-projector-between', CONFIG.DRAW_BETWEEN);
  $('#cta').classList.toggle('hide', !showTitle);

  // Lantern center across the wall (0..1), for panning sounds left / right
  const panOf = id => { const v = views.get(id); return v ? v.lantern.proj.x + v.lantern.proj.w / 2 : 0.5; };
  const eng = A.createEngine({
    ...CONFIG,
    onEvent: (type, d) => {
      if (type === 'arrive') Sound.arrive(panOf(d.id));
      if (type === 'reveal') Sound.chime(panOf(d.id));
    }
  });
  const embers = A.createEmbers({ count: CONFIG.EMBERS });
  Sound.setup(SOUND);
  const demo = +new URL(location.href).searchParams.get('demo') || 0;

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

  // ---------- Data ----------
  const layoutColor = id => (window.LANTERN_LAYOUT || [])[id - 1]?.color;
  // A lantern a visitor has customized keeps its color; the rest drift through warm hues
  const isCustom = v => !!v.img || touched.has(v.lantern.id) || v.lantern.color !== (v.startColor || layoutColor(v.lantern.id));

  // Feeds lantern positions and colors to the ambient engine
  function syncEngine() {
    eng.setLanterns([...views.values()].map(v => ({
      id: v.lantern.id, ...v.lantern.proj, color: v.lantern.color,
      content: !!v.img,
      custom: isCustom(v)
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
    if (live) touched.add(l.id);
    views.set(l.id, {
      lantern: l, img,
      prev: live ? { color: current.lantern.color, img: current.img, art: current.art } : current?.prev || null,
      t0: live || !current ? performance.now() : current.t0,
      burst: live ? A.burst(l.shape, l.color) : current?.burst || null,
      art: current?.art, startColor: current?.startColor
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

  function start() {
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

  // Local lanterns in a loose grid, cycling through layout.js shapes and colors. Nothing is saved.
  function startDemo() {
    const base = window.LANTERN_LAYOUT || [{ shape: 'rect', color: '#f4a64a', aspect: 0.75 }];
    const cols = Math.ceil(Math.sqrt(demo * 16 / 9)), rows = Math.ceil(demo / cols);
    for (let i = 0; i < demo; i++) {
      const d = base[i % base.length], c = i % cols, r = Math.floor(i / cols);
      const w = Math.min(0.11, 0.7 / cols, 0.6 / rows * d.aspect * 9 / 16), h = w * (16 / 9) / d.aspect;
      const cx = (c + 0.5) / cols + (r % 2 ? 0.02 : -0.02), cy = (r + 0.5) / rows + (c % 2 ? 0.03 : -0.03);
      views.set(i + 1, {
        lantern: { id: i + 1, shape: d.shape, color: d.color, imageUrl: null, proj: { x: cx - w / 2, y: cy - h / 2, w, h } },
        img: null, prev: null, t0: 0, burst: null, startColor: d.color
      });
    }
    syncEngine();
    flash(`Demo: ${demo} local lanterns. R plays a reveal.`);
  }

  // ---------- Drawing ----------
  function rectPx(r) {
    return { x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height };
  }

  const facePath = (shape, R) => A.facePath(ctx, shape, R.x, R.y, R.w, R.h);

  // Detailed lanterns are rendered once into a sprite (kept on `holder`) and re-rendered only when they change
  function spriteFor(holder, shape, color, img, R) {
    const key = `${shape}|${color}|${Math.round(R.w)}x${Math.round(R.h)}`;
    const a = holder.art;
    if (a && a.key === key && a.img === img) return a.sprite;
    holder.art = { key, img, sprite: LanternArt.sprite({ shape, color, img }, R.w, R.h, 1) };
    return holder.art.sprite;
  }

  const fill = [0, 0, 0];
  // One lantern's look. Lt = this frame's ambient light; bloom adds a brief swell of light under the content.
  function paintLantern(holder, shape, color, img, R, alpha, Lt, bloom = 0, custom = true) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (detailed) {
      const s = spriteFor(holder, shape, color, img, R);
      ctx.drawImage(s.c, R.x - s.mg.x, R.y - s.mg.top);
      ctx.restore();
      if (Lt && Lt.base) {
        const glow = Lt.glow;
        Lt.glow = glow + bloom;
        A.paintOverlay(ctx, shape, R, Lt, alpha, { drift: !custom, flame: img ? 0.4 : 1 });
        Lt.glow = glow;
      }
      return;
    }
    // Flat look (real lanterns): only the face is lit; the color fill carries all the ambient light,
    // and the drawing sits on top untouched so it always stays readable
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
        ctx.globalAlpha = alpha * Lt.flame.a * (img ? 0.4 : 1);
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

  // Union of every lantern face, for keeping light inside the lanterns when DRAW_BETWEEN is off
  function clipToFaces(g) {
    g.beginPath();
    for (const v of views.values()) {
      const R = rectPx(v.lantern.proj);
      A.addFace(g, v.lantern.shape, R.x, R.y, R.w, R.h);
    }
    g.clip();
  }

  // Every few seconds a random lantern without visitor content sparkles on its own, as if beckoning
  let nextSparkle = CONFIG.IDLE_SPARKLE_MIN_S;
  function idleSparkle(sec) {
    if (sec < nextSparkle) return;
    nextSparkle = sec + A.rand(CONFIG.IDLE_SPARKLE_MIN_S, CONFIG.IDLE_SPARKLE_MAX_S);
    const lit = [...views.values()].filter(v => !v.burst && !v.prev && !v.img && A.rgb(v.lantern.color));
    if (!lit.length) return;
    const v = lit[Math.floor(Math.random() * lit.length)];
    v.burst = A.burst(v.lantern.shape, v.lantern.color, true);
  }

  let bgSec = 0;
  function draw(now, wall) {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const still = calibrating || !ambient;
    if (!still && !A.reduceMotion.matches) {
      if (detailed && CONFIG.FLOOR_GLOW > 0) A.paintFloorGlow(ctx, canvas.width, canvas.height, bgSec, CONFIG.FLOOR_GLOW);
      embers.draw(ctx, canvas.width, canvas.height, detailed ? CONFIG.EMBER_LEVEL_DETAILED : CONFIG.EMBER_LEVEL_FLAT);
      idleSparkle(bgSec);
    }
    for (const v of views.values()) {
      const R = rectPx(v.lantern.proj);
      const Lt = still ? null : eng.light(v.lantern.id, wall);
      const custom = isCustom(v);
      const T = v.prev ? Math.min(1, (now - v.t0) / CONFIG.REVEAL_BLOOM_MS) : 1;
      const k = A.ease.outCubic(T);
      let bloom = 0;
      if (v.prev && T < 1) {
        bloom = still ? 0 : Math.sin(Math.PI * T) * 0.7;
        v.prev.prevColor = v.prev.color;
        paintLantern(v.prev, v.lantern.shape, v.prev.color, v.prev.img, R, 1 - k, Lt, 0, true);
      } else v.prev = null;
      if (Lt && detailed) A.paintHalo(ctx, R, Lt, k);
      paintLantern(v, v.lantern.shape, v.lantern.color, v.img, R, k, Lt, bloom, custom);
      if (v.burst) {
        ctx.save();
        if (!detailed) { facePath(v.lantern.shape, R); ctx.clip(); }   // flat look: keep the wall around it black
        if (!A.drawBurst(ctx, v.burst, R.x, R.y, R.w, R.h, now, CONFIG.SPARKLE_SCALE)) v.burst = null;
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
    if (!still) {
      eng.drawWisps(ctx, canvas.width, canvas.height, {
        scale: detailed ? 1 : 1.15,
        clip: CONFIG.DRAW_BETWEEN ? null : clipToFaces
      });
    }
  }

  // One animation loop for everything, driven by delta time
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    eng.setEnabled(ambient && !calibrating);
    eng.update(dt);
    if (ambient && !calibrating) { embers.update(dt); bgSec += dt; }
    draw(now, (performance.timeOrigin + now) / 1000);
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
  });
  const endDrag = () => { dragInfo = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function markDirty() { dirtyLayout = true; syncEngine(); status('Unsaved changes · press S to save'); }

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
    views.clear(); touched.clear(); syncEngine();
    if (await adminCall('reset_layout', { p_rows: window.buildLanternRows() }, 'Layout reset from layout.js.')) dirtyLayout = false;
  });

  // Replays the reveal on a random lantern, locally only (for tuning the effect on the real wall)
  function previewReveal() {
    const list = [...views.values()];
    if (!list.length) return;
    const v = list[Math.floor(Math.random() * list.length)];
    v.prev = { color: v.lantern.color, img: v.img, art: v.art };
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
    if (k === 'd') {
      detailed = !detailed;
      try { localStorage.setItem(LOOK_KEY, detailed ? 'detailed' : 'flat'); } catch { /* private mode */ }
    }
    if (k === 'a') { ambient = !ambient; savePref('lw-projector-ambient', ambient); flash(ambient ? 'Ambient motion on' : 'Ambient motion off'); }
    if (k === 't') { showTitle = !showTitle; savePref('lw-projector-title', showTitle); $('#cta').classList.toggle('hide', !showTitle); }
    if (k === 'w') {
      CONFIG.DRAW_BETWEEN = !CONFIG.DRAW_BETWEEN;
      savePref('lw-projector-between', CONFIG.DRAW_BETWEEN);
      flash(CONFIG.DRAW_BETWEEN ? 'Light travels between lanterns' : 'Light stays inside lanterns');
    }
    if (k === 'r' && !calibrating) previewReveal();
    if (k === 'm') flash(Sound.toggle() ? 'Sound on' : 'Sound off');
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
    }
  });

  // A few hooks for checking the wall from the browser console (window.LWProjector)
  window.LWProjector = { config: CONFIG, engine: eng, views, previewReveal };

  resize();
  start();
  requestAnimationFrame(frame);
})();
