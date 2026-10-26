// Shared ambient motion for the projector and the iPad.
//   - easing, noise and color helpers
//   - lantern shape paths (used by lantern-art.js, the editor and both walls)
//   - breathing math, the sparkle burst, soft glow sprites
//   - the attract-mode engine: wisps of light drifting between lanterns, ripples, "conversations",
//     a choreographer that picks a calm sequence every so often, and the reveal after a visitor sends.
// The engine works in surface fractions (0..1 across and down), so the same choreography drives the
// projector canvas and the iPad's picture of the wall. Tune the projector in the CONFIG at the top of projector.js.
(() => {
  const TAU = Math.PI * 2;

  // ---------- Math ----------
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const ease = {
    inOutSine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    smooth: t => t * t * (3 - 2 * t)
  };

  // Smooth 1D value noise in -1..1, plus a two-octave version for candle flicker
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x) { const i = Math.floor(x), f = x - i; return lerp(hash(i), hash(i + 1), ease.smooth(f)) * 2 - 1; }
  const noise2 = x => noise(x) * 0.65 + noise(x * 2.3 + 17.1) * 0.35;

  // 0..1, one slow breath per period; phase shifts each lantern so they never pulse together
  const breath = (t, period, phase) => 0.5 - 0.5 * Math.cos(TAU * (t / period + phase));

  // ---------- Color ----------
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const WARM = [255, 241, 214];                       // light for an unlit lantern / sparkles
  const rgb = c => (!c || c === 'off') ? null : [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // Final face color for a lantern this frame, from engine.light(): breathing level, tint, glow
  function shade(Lt, out = [0, 0, 0]) {
    if (!Lt.base) return null;
    const c = mix(Lt.base, Lt.tint, Lt.tintAmt);
    const k = Lt.level * (1 + Lt.glow * 0.3), w = clamp(Lt.glow * 0.28);
    for (let i = 0; i < 3; i++) out[i] = Math.min(255, lerp(c[i] * k, 252 - i * 6, w));
    return out;
  }

  // ---------- Shapes ----------
  const ROUND = new Set(['circle', 'oval', 'oblong']);
  const OB_END = 0.46;                 // oblong: width of the top/bottom openings, as a fraction of full width

  // Rounded rectangle path. ctx.roundRect only exists on iPadOS 16+ / Safari 16+, so older iPads get arcTo.
  function rrect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Half-width of the body at height v (0 = top, 1 = bottom), as a fraction of half the box width
  function halfWidth(shape, v) {
    const u = 2 * v - 1, s = Math.max(0, 1 - u * u);
    if (shape === 'circle' || shape === 'oval') return Math.sqrt(s);
    if (shape === 'oblong') return OB_END + (1 - OB_END) * Math.pow(s, 0.6);
    return 1;
  }

  // Adds the face outline to the current path (call ctx.beginPath() first when you want only this face)
  function addFace(ctx, shape, x, y, w, h) {
    if (shape === 'circle' || shape === 'oval') {
      ctx.moveTo(x + w, y + h / 2);
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU);
    } else if (shape === 'oblong') {
      // Sampled more densely near the ends, where the curve turns fastest
      const N = 48, cx = x + w / 2, vAt = i => (1 - Math.cos(Math.PI * i / N)) / 2;
      ctx.moveTo(cx + w / 2 * OB_END, y);
      for (let i = 0; i <= N; i++) { const v = vAt(i); ctx.lineTo(cx + w / 2 * halfWidth(shape, v), y + v * h); }
      for (let i = N; i >= 0; i--) { const v = vAt(i); ctx.lineTo(cx - w / 2 * halfWidth(shape, v), y + v * h); }
      ctx.closePath();
    } else {
      rrect(ctx, x, y, w, h, Math.min(w, h) * 0.045);
    }
  }
  function facePath(ctx, shape, x, y, w, h) { ctx.beginPath(); addFace(ctx, shape, x, y, w, h); }

  // ---------- Glow sprites ----------
  // Soft round glow with a pale core, cached per (rounded) color and scaled when drawn
  const dots = new Map();
  function dot(c) {
    const q = c.map(v => Math.round(v / 16) * 16), key = q.join();
    if (dots.has(key)) return dots.get(key);
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, css(mix(q, WHITE, 0.7))); gr.addColorStop(0.22, css(mix(q, WHITE, 0.25), 0.9));
    gr.addColorStop(0.55, css(q, 0.25)); gr.addColorStop(1, css(q, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    dots.set(key, cv);
    return cv;
  }
  // Wide, soft glow without a hot core (halos, candle flame)
  const hazes = new Map();
  function haze(c) {
    const q = c.map(v => Math.round(v / 16) * 16), key = q.join();
    if (hazes.has(key)) return hazes.get(key);
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, css(q, 1)); gr.addColorStop(0.35, css(q, 0.45)); gr.addColorStop(1, css(q, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    hazes.set(key, cv);
    return cv;
  }

  let star = null;
  function starDot() {
    if (star) return star;
    const S = 48, h = S / 2;
    star = document.createElement('canvas');
    star.width = star.height = S;
    const g = star.getContext('2d');
    g.drawImage(dot(WHITE), S * 0.2, S * 0.2, S * 0.6, S * 0.6);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.moveTo(h, 0); g.lineTo(h + 1.6, h); g.lineTo(h, S); g.lineTo(h - 1.6, h); g.fill();
    g.beginPath(); g.moveTo(0, h); g.lineTo(h, h + 1.6); g.lineTo(S, h); g.lineTo(h, h - 1.6); g.fill();
    return star;
  }

  // ---------- Sparkle burst ----------
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // New burst rising from the bottom of a lantern. Returns null when the viewer prefers reduced motion.
  function burst(shape, color, short = false) {
    if (reduceMotion.matches) return null;
    const count = short ? 22 : 48, parts = [];
    for (let i = 0; i < count; i++) {
      const v0 = 0.8 + Math.random() * 0.17, delay = Math.random() * 0.25;
      parts.push({
        v0, delay,
        u0: 0.5 + (Math.random() * 2 - 1) * 0.45 * halfWidth(shape, v0),
        life: 0.5 + Math.random() * (0.5 - delay),   // delay + life <= 1, so every particle ends on time
        rise: (short ? 0.35 : 0.55) + Math.random() * 0.5,
        size: 0.06 + Math.random() * 0.07,
        amp: 0.02 + Math.random() * 0.05, freq: 1 + Math.random() * 1.5, ph: Math.random() * TAU,
        white: Math.random() < 0.3
      });
    }
    return { t0: performance.now(), dur: short ? 900 : 1500, parts, color: rgb(color) || WARM };
  }

  // Draws one frame of a burst over the box (x, y, w, h). Returns false once it has finished.
  // scale > 1 makes the particles bigger (the projected wall is seen from across the room).
  function drawBurst(ctx, b, x, y, w, h, now, scale = 1) {
    const T = (now - b.t0) / b.dur;
    if (T >= 1) return false;
    const m = Math.min(w, h), tint = dot(b.color), st = starDot();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of b.parts) {
      const t = (T - p.delay) / p.life;
      if (t <= 0 || t >= 1) continue;
      const e = 1 - Math.pow(1 - t, 1.7);
      const px = x + w * (p.u0 + p.amp * Math.sin(p.ph + t * p.freq * TAU) * (0.3 + t));
      const py = y + h * (p.v0 - p.rise * e);
      const s = m * p.size * scale * (1 - 0.35 * t);
      ctx.globalAlpha = Math.min(1, t / 0.12) * Math.pow(1 - t, 1.2) * (0.75 + 0.25 * Math.sin(t * 18 + p.ph));
      ctx.drawImage(p.white ? st : tint, px - s / 2, py - s / 2, s, s);
    }
    ctx.restore();
    return true;
  }

  // ---------- Shared painting ----------
  // Ambient light over a lantern that's already been drawn (a detailed sprite, or a flat fill):
  // breathing shadow, color drift, tint/glow and the candle flame, all clipped to the face.
  function paintOverlay(ctx, shape, R, Lt, alpha, { drift = false, flame = 1 } = {}) {
    if (alpha <= 0 || !Lt.base) return;
    ctx.save();
    facePath(ctx, shape, R.x, R.y, R.w, R.h); ctx.clip();
    if (drift && Lt.drift > 0) {                         // shift the paper's hue toward the drifting color
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = alpha * Lt.drift;
      ctx.fillStyle = css(Lt.base); ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    if (Lt.level < 1) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha * (1 - Lt.level) * 0.85;
      ctx.fillStyle = '#000'; ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    ctx.globalCompositeOperation = 'lighter';
    const c = mix(Lt.base, Lt.tint, Lt.tintAmt);
    if (Lt.glow > 0.005) {
      ctx.globalAlpha = alpha * Math.min(1, Lt.glow) * 0.32;
      ctx.fillStyle = css(mix(c, WHITE, 0.3)); ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    if (flame > 0 && Lt.flame.a > 0.005) {
      const fx = R.x + R.w * Lt.flame.x, fy = R.y + R.h * Lt.flame.y, fw = R.w * 0.95, fh = R.h * 0.8;
      ctx.globalAlpha = alpha * Lt.flame.a * flame;
      ctx.drawImage(haze(mix(c, WARM, 0.55)), fx - fw / 2, fy - fh / 2, fw, fh);
    }
    ctx.restore();
  }

  // Breathing halo on the wall around a lantern (screens and the detailed look only, never on the real wall)
  function paintHalo(ctx, R, Lt, alpha, strength = 1) {
    const c = Lt.base && shade(Lt);
    if (!c || alpha <= 0) return;
    const b = clamp((Lt.level - 0.6) / 0.4 + Lt.glow * 0.8, 0, 1.6);
    const s = 1.45 + 0.35 * Math.min(1, b), cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * strength * (0.1 + 0.2 * b);
    ctx.drawImage(haze(c), cx - R.w * s / 2, cy - R.h * s / 2, R.w * s, R.h * s);
    ctx.restore();
  }

  // ---------- Embers ----------
  // Glowing motes drifting slowly up the background, twinkling as they go. Positions are surface fractions.
  function createEmbers({ count = 70, colors = [[255, 200, 120], [244, 166, 74], [255, 230, 190], [242, 138, 46]],
    minSpeed = 0.006, maxSpeed = 0.024, minSize = 0.004, maxSize = 0.014 } = {}) {
    const make = (y = 1.05) => ({
      x: Math.random(), y,
      speed: rand(minSpeed, maxSpeed),                     // surface heights per second
      size: rand(minSize, maxSize),                        // fraction of surface height
      sway: rand(0.004, 0.016), swayHz: rand(0.05, 0.17), ph: Math.random() * TAU,
      tw: rand(0.4, 1.6),                                  // twinkle rate
      color: pick(colors)
    });
    const list = Array.from({ length: count }, () => make(Math.random()));
    let sec = 0;
    return {
      update(dt) {
        sec += dt;
        for (let i = 0; i < list.length; i++) {
          list[i].y -= list[i].speed * dt;
          if (list[i].y < -0.05) list[i] = make();
        }
      },
      // level: overall brightness; fadeTop: fraction of the height over which embers fade out near the top
      draw(ctx, W, H, level = 1, fadeTop = 0.3) {
        if (level <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const e of list) {
          const x = (e.x + e.sway * Math.sin(sec * e.swayHz * TAU + e.ph)) * W, s = e.size * H;
          const fadeIn = Math.min(1, (1.05 - e.y) / 0.25), fadeOut = Math.min(1, e.y / fadeTop);
          ctx.globalAlpha = level * fadeIn * fadeOut * (0.3 + 0.45 * Math.sin(sec * e.tw * TAU + e.ph) ** 2);
          ctx.drawImage(haze(e.color), x - s / 2, e.y * H - s / 2, s, s);
        }
        ctx.restore();
      }
    };
  }

  // Warm light pooling up from the floor, breathing slowly
  function paintFloorGlow(ctx, W, H, sec, level = 1) {
    const b = 0.5 - 0.5 * Math.cos(sec * TAU / 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(W / 2, H * 1.08); ctx.scale(W * 0.75, H * 0.55);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(244,150,60,${(0.10 + 0.06 * b) * level})`);
    g.addColorStop(0.5, `rgba(200,90,40,${(0.04 + 0.025 * b) * level})`);
    g.addColorStop(1, 'rgba(120,40,30,0)');
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // ---------- Attract-mode engine ----------
  // Fallback values (the iPad uses these). The projector passes its own CONFIG from projector.js.
  const DEFAULTS = {
    DRAW_BETWEEN: true,
    BREATH_MIN_S: 4, BREATH_MAX_S: 7, BREATH_DEPTH: 0.3, CONTENT_BREATH_DEPTH: 0.08,
    FLICKER_DEPTH: 0.05, FLICKER_SPEED: 2.4, FLAME_ALPHA: 0.22, FLAME_WANDER: 0.06,
    DRIFT_COLORS: ['#f4a64a', '#ec7f8f', '#f2c35b', '#f59a6a'], DRIFT_PERIOD_S: 180, DRIFT_AMOUNT: 0.8,
    CONTENT_AMBIENT: 0.3,
    ATTACK_S: 0.4, SETTLE_S: 2.4,
    WISP_SPEED: 0.075, WISP_MIN_S: 2.4, WISP_MAX_S: 6, WISP_ARC: 0.35, WISP_WOBBLE: 0.012,
    WISP_SIZE: 0.018, WISP_TRAIL_S: 0.8, WISP_BRIGHTNESS: 0.9,
    LAUNCH_GLOW: 0.15, ARRIVE_GLOW: 0.6, ARRIVE_TINT: 0.45, TRAVEL_DIM: 0.4, TRAVEL_GLOW: 0.35,
    RIPPLE_SPEED: 0.32, RIPPLE_GLOW: 0.55, RIPPLE_TINT: 0.3,
    CONVERSATION_MIN: 3, CONVERSATION_MAX: 5, RELAY_MIN: 3, RELAY_MAX: 4,
    SEQ_FIRST_S: 3, SEQ_MIN_S: 5, SEQ_MAX_S: 12, MAX_WISPS: 8, MAX_SEQS: 2,
    WISP_EVERY_MIN_S: 1.5, WISP_EVERY_MAX_S: 4,
    SEQ_WEIGHTS: { wisp: 1, relay: 0.8, ripple: 0.7, conversation: 0.9 },
    REVEAL_QUIET_S: 7, REVEAL_RING_DELAY_S: 0.5, REVEAL_RIPPLE_SPEED: 0.55,
    REVEAL_GLOW: 0.8, REVEAL_TINT: 0.6, REVEAL_SPARKS: 2
  };

  function createEngine(opts = {}) {
    const C = { ...DEFAULTS, ...opts };
    const drift = C.DRIFT_COLORS.map(rgb);
    const L = new Map();           // id -> lantern state
    const wisps = [];
    let events = [];               // [{ at, fn }] on the engine clock
    const seqs = new Set();        // sequences in progress (an interrupting reveal ends them)
    let t = 0;                     // engine clock in seconds; stops while disabled
    let local = 0;                 // seconds since load, for flicker
    let nextSeq = C.SEQ_FIRST_S, lastSeq = null, quietUntil = 0, nextStray = 1;
    const emit = (type, data) => { try { C.onEvent && C.onEvent(type, data); } catch (e) { console.error(e); } };
    let aspect = 16 / 9, enabled = true;
    const reduced = () => reduceMotion.matches;

    // ----- Lanterns -----
    // list: [{ id, x, y, w, h (surface fractions), color: '#rrggbb' | 'off', content, custom }]
    function setLanterns(list, surfaceAspect = aspect) {
      aspect = surfaceAspect;
      const ids = new Set();
      for (const d of list) {
        ids.add(d.id);
        let s = L.get(d.id);
        if (!s) {
          s = {
            id: d.id, seed: hash(d.id * 7.31) * 100,
            period: lerp(C.BREATH_MIN_S, C.BREATH_MAX_S, hash(d.id * 3.17)),
            phase: hash(d.id * 5.71), driftPhase: hash(d.id * 9.13),
            charge: 0, glow: 0, tintCharge: 0, tintAmt: 0, tint: WARM.slice(), travel: 0, revealAt: -99,
            out: { base: null, level: 1, glow: 0, tint: WARM, tintAmt: 0, drift: 0, flame: { x: 0.5, y: 0.6, a: 0 } },
            baseBuf: [0, 0, 0]
          };
          L.set(d.id, s);
        }
        // geometry in "width units" so distances and curves aren't squashed by the surface's aspect
        s.cx = d.x + d.w / 2; s.cy = (d.y + d.h / 2) / aspect;
        s.rx = d.w / 2; s.ry = d.h / 2 / aspect;
        s.color = rgb(d.color); s.content = !!d.content; s.custom = !!d.custom;
      }
      for (const id of [...L.keys()]) if (!ids.has(id)) L.delete(id);
      for (let i = wisps.length - 1; i >= 0; i--) if (!L.has(wisps[i].from) || !L.has(wisps[i].to)) wisps.splice(i, 1);
    }

    const lit = () => [...L.values()].filter(s => s.color);
    const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const neighbors = (a, n) => lit().filter(s => s !== a).sort((p, q) => dist(a, p) - dist(a, q)).slice(0, n);

    // Current color of a lantern: its own, or the warm drift for lanterns nobody has customized
    function baseColor(s, wall, out) {
      if (!s.color) return null;
      if (s.custom || reduced() || !enabled || drift.length < 2) { out[0] = s.color[0]; out[1] = s.color[1]; out[2] = s.color[2]; return out; }
      const u = (wall / C.DRIFT_PERIOD_S + s.driftPhase) % 1 * drift.length;
      const i = Math.floor(u), f = ease.inOutSine(u - i);
      const d = mix(drift[i], drift[(i + 1) % drift.length], f);
      const c = mix(s.color, d, C.DRIFT_AMOUNT);
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      return out;
    }
    const orbColor = s => mix(baseColor(s, Date.now() / 1000, [0, 0, 0]) || WARM, WARM, 0.35);

    function impulse(s, amount, tint, tintAmt = 0) {
      if (!s) return;
      s.charge = Math.min(1.4, s.charge + amount);
      if (tint && tintAmt > 0) {
        const w = tintAmt / (s.tintCharge + tintAmt);
        s.tint = mix(s.tint, tint, w);
        s.tintCharge = Math.min(1, s.tintCharge + tintAmt);
      }
    }

    // ----- Timeline -----
    const at = (delay, fn) => events.push({ at: t + delay, fn });
    function startSeq() {
      const seq = { dead: false, end() { seqs.delete(seq); seq.dead = true; } };
      seqs.add(seq);
      return seq;
    }

    // ----- Wisps -----
    // A small orb that leaves one lantern and floats on a bowed, wobbling bezier to another
    function launch(a, b, o = {}) {
      if (!a || !b || a === b) return null;
      const d = dist(a, b);
      const between = C.DRAW_BETWEEN;
      const w = {
        from: a.id, to: b.id, p: 0,
        dur: o.dur || clamp(d / C.WISP_SPEED, C.WISP_MIN_S, C.WISP_MAX_S),
        color: o.color || orbColor(a),
        bow: (Math.random() < 0.75 ? 1 : -1) * rand(0.18, 1) * C.WISP_ARC,   // mostly floats up and over
        bow2: rand(0.6, 1.2), seed: Math.random() * 100,
        rim: between ? 0.9 : 0.42,       // start/end just inside the rim, or deeper inside when light stays in lanterns
        fade: 1, fading: false, trail: [], lastTrail: -1,
        arriveGlow: o.arriveGlow ?? C.ARRIVE_GLOW, arriveTint: o.arriveTint ?? C.ARRIVE_TINT,
        onArrive: o.onArrive
      };
      impulse(a, C.LAUNCH_GLOW, w.color, 0.15);
      wisps.push(w);
      return w;
    }

    // Point on the rim of lantern s toward (tx, ty), scaled by k (1 = exactly on the ellipse)
    function rimPoint(s, tx, ty, k) {
      let dx = tx - s.cx, dy = ty - s.cy;
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const r = 1 / Math.sqrt((dx / s.rx) ** 2 + (dy / s.ry) ** 2);
      return [s.cx + dx * r * k, s.cy + dy * r * k];
    }

    // Wisp position in width units
    function wispPos(w, p = w.p, out = [0, 0]) {
      const a = L.get(w.from), b = L.get(w.to);
      const [ax, ay] = rimPoint(a, b.cx, b.cy, w.rim), [bx, by] = rimPoint(b, a.cx, a.cy, w.rim);
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; }             // normal points up the wall
      const bow = w.bow * len;                        // bow > 0 curves up, bow < 0 curves down
      const x1 = ax + dx * 0.3 + nx * bow, y1 = ay + dy * 0.3 + ny * bow;
      const x2 = ax + dx * 0.7 + nx * bow * w.bow2, y2 = ay + dy * 0.7 + ny * bow * w.bow2;
      const e = ease.inOutSine(p), m = 1 - e;
      let x = m * m * m * ax + 3 * m * m * e * x1 + 3 * m * e * e * x2 + e * e * e * bx;
      let y = m * m * m * ay + 3 * m * m * e * y1 + 3 * m * e * e * y2 + e * e * e * by;
      const wob = C.WISP_WOBBLE * Math.sin(Math.PI * p);
      x += nx * wob * noise(local * 0.9 + w.seed) + dx / len * wob * 0.5 * noise(local * 0.7 + w.seed + 40);
      y += ny * wob * noise(local * 0.9 + w.seed);
      out[0] = x; out[1] = y;
      return out;
    }

    function wispAlpha(w) {
      const inn = clamp(w.p / 0.12), outn = clamp((1 - w.p) / 0.12);
      return C.WISP_BRIGHTNESS * w.fade * ease.smooth(inn) * ease.smooth(outn) * (0.82 + 0.18 * Math.sin(local * 3.1 + w.seed));
    }

    // ----- Sequences -----
    function seqWisp() {
      const all = lit(); if (all.length < 2) return false;
      const a = pick(all), b = pick(neighbors(a, 2));
      const seq = startSeq();
      launch(a, b, { onArrive: () => seq.end() });
      return true;
    }

    // One wisp hopping across several lanterns, picking up a little of each one's color
    function seqRelay() {
      const all = lit(); if (all.length < 2) return false;
      const seq = startSeq();
      let hops = Math.round(rand(C.RELAY_MIN, C.RELAY_MAX)), prev = null, cur = pick(all), color = orbColor(cur);
      const visited = new Set([cur.id]);
      const hop = () => {
        if (seq.dead || !L.has(cur.id)) return seq.end();
        const options = neighbors(cur, 3).filter(s => s !== prev);
        const fresh = options.filter(s => !visited.has(s.id));
        const next = pick(fresh.length ? fresh : options.length ? options : neighbors(cur, 1));
        if (!next) return seq.end();
        launch(cur, next, {
          color,
          onArrive: () => {
            prev = cur; cur = next; visited.add(cur.id);
            color = mix(color, orbColor(cur), 0.3);
            if (--hops > 0) at(rand(0.25, 0.7), hop); else seq.end();
          }
        });
      };
      hop();
      return true;
    }

    // Two neighbors passing light back and forth, as if talking
    function seqConversation() {
      const all = lit(); if (all.length < 2) return false;
      const a = pick(all), b = neighbors(a, 1)[0];
      const seq = startSeq();
      let left = Math.round(rand(C.CONVERSATION_MIN, C.CONVERSATION_MAX)), from = a, to = b;
      const say = () => {
        if (seq.dead || !L.has(from.id) || !L.has(to.id)) return seq.end();
        launch(from, to, {
          dur: clamp(dist(from, to) / C.WISP_SPEED, C.WISP_MIN_S, C.WISP_MAX_S) * rand(0.75, 1),
          onArrive: () => {
            [from, to] = [to, from];
            if (--left > 0) at(rand(0.5, 1.4), say); else seq.end();
          }
        });
      };
      say();
      return true;
    }

    // A wave of light spreading lantern by lantern, by distance
    function ripple(origin, { speed = C.RIPPLE_SPEED, glow = C.RIPPLE_GLOW, tint = C.RIPPLE_TINT, color, self = true } = {}) {
      const c = color || orbColor(origin);
      const others = lit().filter(s => s !== origin);
      const far = Math.max(0.0001, ...others.map(s => dist(origin, s)));
      if (self) impulse(origin, glow * 1.1, c, tint);
      for (const s of others) {
        const d = dist(origin, s);
        at(d / speed, () => { if (L.has(s.id)) impulse(s, glow * (0.55 + 0.45 * (1 - d / far)), c, tint); });
      }
      return far / speed;
    }
    function seqRipple() {
      const all = lit(); if (!all.length) return false;
      const seq = startSeq();
      at(ripple(pick(all)) + 1.5, () => seq.end());
      return true;
    }

    const SEQUENCES = { wisp: seqWisp, relay: seqRelay, ripple: seqRipple, conversation: seqConversation };

    // Picks a sequence at random by weight, never the same one twice in a row
    function choreograph() {
      const choices = Object.entries(C.SEQ_WEIGHTS).filter(([k, wt]) => wt > 0 && k !== lastSeq && SEQUENCES[k]);
      let total = choices.reduce((n, [, wt]) => n + wt, 0), r = Math.random() * total;
      for (const [k, wt] of choices) {
        if ((r -= wt) <= 0) { if (SEQUENCES[k]()) lastSeq = k; return; }
      }
    }

    // ----- Reveal: a visitor just sent something to lantern id -----
    function reveal(id, color) {
      const s = L.get(id);
      if (!s) return;
      s.revealAt = t;
      quietUntil = t + C.REVEAL_QUIET_S;
      nextSeq = Math.max(nextSeq, quietUntil + rand(2, 5));
      for (const seq of [...seqs]) seq.end();                         // interrupt attract mode
      for (const w of wisps) if (w.from === id || w.to === id) w.fading = true;
      const c = rgb(color) || s.color || WARM;
      impulse(s, 0.4, c, 0.5);
      emit('reveal', { id, color: c });
      if (reduced()) return;
      at(C.REVEAL_RING_DELAY_S, () => {
        if (!L.has(id)) return;
        ripple(s, { speed: C.REVEAL_RIPPLE_SPEED, glow: C.REVEAL_GLOW, tint: C.REVEAL_TINT, color: c, self: false });
        if (C.DRAW_BETWEEN) {
          for (const nb of neighbors(s, C.REVEAL_SPARKS)) {
            launch(s, nb, { color: mix(c, WHITE, 0.25), dur: rand(1.1, 1.5), arriveGlow: 0.2, arriveTint: 0.3 });
          }
        }
      });
    }

    // Brief brightening, e.g. when a lantern is tapped on the iPad
    function poke(id, amount = 0.5) { const s = L.get(id); if (s) impulse(s, amount, s.color, 0.2); }

    // ----- Frame update -----
    function update(dt) {
      local += dt;
      if (!enabled) return;
      t += dt;

      if (events.length) {
        const due = events.filter(e => e.at <= t).sort((a, b) => a.at - b.at);
        if (due.length) { events = events.filter(e => e.at > t); due.forEach(e => e.fn()); }
      }

      for (const s of L.values()) s.travel = 0;
      for (let i = wisps.length - 1; i >= 0; i--) {
        const w = wisps[i];
        w.p += dt / w.dur;
        if (w.fading) w.fade -= dt / 0.5;
        const a = L.get(w.from), b = L.get(w.to);
        if (w.fade <= 0) { wisps.splice(i, 1); continue; }
        if (w.p >= 1) {
          wisps.splice(i, 1);
          impulse(b, w.arriveGlow, w.color, w.arriveTint);
          emit('arrive', { id: w.to, color: w.color });
          w.onArrive && w.onArrive();
          continue;
        }
        // Light leaving one lantern dims it a little while the next one brightens in anticipation
        const k = (C.DRAW_BETWEEN ? 0.35 : 1) * w.fade;
        a.travel -= C.TRAVEL_DIM * Math.sin(Math.PI * Math.min(1, w.p * 1.4)) * k;
        b.travel += C.TRAVEL_GLOW * ease.inCubic(w.p) * k;
        // trail, sampled about 60 times a second whatever the frame rate
        if (local - w.lastTrail > 1 / 60) {
          w.lastTrail = local;
          const pos = wispPos(w);
          w.trail.push({ x: pos[0], y: pos[1], t: local });
        }
        while (w.trail.length && local - w.trail[0].t > C.WISP_TRAIL_S) w.trail.shift();
      }

      const atk = 1 - Math.exp(-dt / C.ATTACK_S), decay = Math.exp(-dt / C.SETTLE_S);
      for (const s of L.values()) {
        s.charge *= decay; s.tintCharge *= decay;
        s.glow += (s.charge - s.glow) * atk;
        s.tintAmt += (s.tintCharge - s.tintAmt) * atk;
      }

      if (!reduced() && t >= nextSeq) {
        const busy = seqs.size >= C.MAX_SEQS || wisps.length >= C.MAX_WISPS || t < quietUntil;
        if (busy) nextSeq = t + 1.5;
        else { choreograph(); nextSeq = t + rand(C.SEQ_MIN_S, C.SEQ_MAX_S); }
      }
      // Stray wisps between sequences, so light is always moving somewhere on the wall
      if (!reduced() && t >= nextStray) {
        nextStray = t + rand(C.WISP_EVERY_MIN_S, C.WISP_EVERY_MAX_S);
        const all = lit();
        if (all.length > 1 && wisps.length < C.MAX_WISPS && t >= quietUntil - C.REVEAL_QUIET_S * 0.5) {
          const a = pick(all);
          launch(a, pick(neighbors(a, 3)));
        }
      }
    }

    // ----- What each lantern looks like right now -----
    // wall = wall-clock seconds (Date.now() / 1000), so every screen breathes and drifts in step
    function light(id, wall) {
      const s = L.get(id);
      if (!s) return null;
      const o = s.out;
      o.base = baseColor(s, wall, s.baseBuf);
      o.drift = s.custom || !enabled || reduced() ? 0 : C.DRIFT_AMOUNT;
      if (!enabled) {
        o.level = 1; o.glow = 0; o.tintAmt = 0; o.flame.a = 0;
        return o;
      }
      const red = reduced(), amb = s.content ? C.CONTENT_AMBIENT : 1;
      const settling = clamp((t - s.revealAt) / 1.5);                 // let the reveal bloom on its own
      const depth = (s.content ? C.CONTENT_BREATH_DEPTH : C.BREATH_DEPTH) * ease.smooth(settling);
      let level = 1 - depth * (1 - breath(wall, s.period * (red ? 1.6 : 1), s.phase));
      if (!red) level += noise2(local * C.FLICKER_SPEED + s.seed) * C.FLICKER_DEPTH * amb * settling;
      let glow = (s.glow + s.travel) * amb;
      if (glow < 0) { level *= 1 + Math.max(-0.6, glow); glow = 0; }
      o.level = clamp(level, 0, 1);
      o.glow = glow;
      o.tint = s.tint; o.tintAmt = clamp(s.tintAmt * amb, 0, 0.8);
      o.flame.x = 0.5 + noise(local * 0.45 + s.seed) * C.FLAME_WANDER;
      o.flame.y = 0.62 + noise(local * 0.38 + s.seed + 9) * C.FLAME_WANDER * 0.6;
      o.flame.a = red ? 0 : (0.55 + 0.45 * noise2(local * C.FLICKER_SPEED * 1.3 + s.seed + 3)) * C.FLAME_ALPHA * amb;
      return o;
    }

    // ----- Drawing wisps -----
    // clip(ctx): optional, restricts drawing (e.g. to the lantern faces when DRAW_BETWEEN is off)
    const pos = [0, 0];
    function drawWisps(ctx, W, H, { scale = 1, clip = null } = {}) {
      if (!enabled || !wisps.length) return;
      const S = C.WISP_SIZE * H * scale, toY = W;            // positions are in width units: pixels = x * W, y * W
      ctx.save();
      if (clip) clip(ctx);
      ctx.globalCompositeOperation = 'lighter';
      for (const w of wisps) {
        const A = wispAlpha(w);
        if (A <= 0.003) continue;
        const sprite = dot(w.color);
        const n = w.trail.length;
        for (let i = 0; i < n; i++) {
          const p = w.trail[i], age = (local - p.t) / C.WISP_TRAIL_S;
          if (age >= 1) continue;
          const k = 1 - age, s = S * (0.35 + 0.65 * k);
          ctx.globalAlpha = A * 0.28 * k * k;
          ctx.drawImage(sprite, p.x * W - s / 2, p.y * toY - s / 2, s, s);
        }
        wispPos(w, w.p, pos);
        const x = pos[0] * W, y = pos[1] * toY;
        ctx.globalAlpha = A * 0.35;
        ctx.drawImage(haze(w.color), x - S * 2.2, y - S * 2.2, S * 4.4, S * 4.4);
        ctx.globalAlpha = A;
        ctx.drawImage(sprite, x - S / 2, y - S / 2, S, S);
      }
      ctx.restore();
    }

    return {
      config: C, setLanterns, update, light, drawWisps, reveal, poke,
      setEnabled(on) { enabled = on; },
      get enabled() { return enabled; },
      get wisps() { return wisps; },
      get lastSequence() { return lastSeq; }
    };
  }

  window.Ambient = {
    TAU, clamp, lerp, rand, ease, noise, noise2, breath,
    WHITE, BLACK, WARM, rgb, mix, css, shade,
    ROUND, OB_END, rrect, halfWidth, addFace, facePath,
    dot, haze, starDot, reduceMotion, burst, drawBurst,
    paintOverlay, paintHalo, createEmbers, paintFloorGlow, createEngine, DEFAULTS
  };
})();
