// Shared lantern drawing for the iPad and projector pages:
// shape outlines, the detailed paper-lantern look (iPad only), and the rising sparkle burst.
(() => {
  const ROUND = new Set(['circle', 'oval', 'oblong']);
  const OB_END = 0.46;                 // oblong: width of the top/bottom openings, as a fraction of full width
  const OFF_PAPER = [78, 70, 84];      // unlit paper
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const WARM = [255, 241, 214];        // sparkle color for an unlit lantern

  const rgb = c => (!c || c === 'off') ? null : [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

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

  // ---------- Shapes ----------
  // Half-width of the body at height v (0 = top, 1 = bottom), as a fraction of half the box width
  function halfWidth(shape, v) {
    const u = 2 * v - 1, s = Math.max(0, 1 - u * u);
    if (shape === 'circle' || shape === 'oval') return Math.sqrt(s);
    if (shape === 'oblong') return OB_END + (1 - OB_END) * Math.pow(s, 0.6);
    return 1;
  }

  function facePath(ctx, shape, x, y, w, h) {
    ctx.beginPath();
    if (shape === 'circle' || shape === 'oval') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shape === 'oblong') {
      // Sampled more densely near the ends, where the curve turns fastest
      const N = 48, cx = x + w / 2, vAt = i => (1 - Math.cos(Math.PI * i / N)) / 2;
      for (let i = 0; i <= N; i++) { const v = vAt(i); ctx.lineTo(cx + w / 2 * halfWidth(shape, v), y + v * h); }
      for (let i = N; i >= 0; i--) { const v = vAt(i); ctx.lineTo(cx - w / 2 * halfWidth(shape, v), y + v * h); }
      ctx.closePath();
    } else {
      rrect(ctx, x, y, w, h, Math.min(w, h) * 0.045);
    }
  }

  // ---------- Detailed lantern (iPad) ----------
  // Room the detailed drawing needs around the lantern's box: glow at the sides, string above, tassel below
  function margins(shape, w, h) {
    const glow = Math.max(w, h) * 0.2;
    return { x: glow, top: Math.max(glow, h * 0.32), bottom: Math.max(glow, ROUND.has(shape) ? h * 0.38 : h * 0.08) };
  }

  function capSize(shape, w, h) {
    if (!ROUND.has(shape)) return { w: w * 1.06, h: Math.max(3, h * 0.06) };
    return { w: w * (shape === 'oblong' ? OB_END * 1.14 : 0.42), h: Math.max(3, h * 0.075) };
  }

  let noise = null;
  function paperPattern(ctx) {
    if (!noise) {
      const S = 128;
      noise = document.createElement('canvas');
      noise.width = noise.height = S;
      const n = noise.getContext('2d'), d = n.createImageData(S, S);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 255 : 30;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = Math.random() * 20;
      }
      n.putImageData(d, 0, 0);
      n.lineWidth = 0.6;
      for (let i = 0; i < 40; i++) {      // paper fibers
        const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 6 + Math.random() * 14;
        n.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,25,10,0.10)';
        n.beginPath(); n.moveTo(x, y);
        n.quadraticCurveTo(x + Math.cos(a) * l / 2 + 2, y + Math.sin(a) * l / 2 - 2, x + Math.cos(a) * l, y + Math.sin(a) * l);
        n.stroke();
      }
    }
    return ctx.createPattern(noise, 'repeat');
  }

  function drawCap(ctx, cx, top, w, h) {
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, '#74502e'); g.addColorStop(0.35, '#4a2c16'); g.addColorStop(1, '#1c0f06');
    ctx.fillStyle = g;
    ctx.beginPath(); rrect(ctx, cx - w / 2, top, w, h, h * 0.3); ctx.fill();
    const lw = Math.max(0.75, h * 0.12);
    ctx.strokeStyle = 'rgba(255,215,160,0.28)'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(cx - w / 2 + h * 0.3, top + lw); ctx.lineTo(cx + w / 2 - h * 0.3, top + lw); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(cx - w / 2, top + h * 0.62); ctx.lineTo(cx + w / 2, top + h * 0.62); ctx.stroke();
  }

  function drawTassel(ctx, cx, top, m, h, lit) {
    const tc = mix(lit || [120, 60, 50], [160, 24, 28], 0.55);
    const cord = h * 0.05, r = m * 0.028;
    ctx.strokeStyle = 'rgba(18,12,8,0.9)'; ctx.lineWidth = Math.max(1, m * 0.012);
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + cord); ctx.stroke();
    // knot bead
    const kb = ctx.createRadialGradient(cx - r * 0.3, top + cord - r * 0.3, 0, cx, top + cord, r);
    kb.addColorStop(0, '#f0d08a'); kb.addColorStop(1, '#8a6224');
    ctx.fillStyle = kb; ctx.beginPath(); ctx.arc(cx, top + cord, r, 0, Math.PI * 2); ctx.fill();
    // skirt of threads
    const y0 = top + cord + r * 0.8, y1 = y0 + h * 0.2, w0 = m * 0.05, w1 = m * 0.11;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, css(mix(tc, WHITE, 0.15))); g.addColorStop(1, css(mix(tc, BLACK, 0.35)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w0 / 2, y0); ctx.lineTo(cx + w0 / 2, y0);
    ctx.lineTo(cx + w1 / 2, y1); ctx.quadraticCurveTo(cx, y1 + h * 0.015, cx - w1 / 2, y1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(mix(tc, BLACK, 0.45), 0.6); ctx.lineWidth = Math.max(0.5, m * 0.005);
    for (let i = 0; i <= 8; i++) {
      const s = i / 4 - 1;
      ctx.beginPath(); ctx.moveTo(cx + s * w0 / 2, y0); ctx.lineTo(cx + s * w1 / 2, y1); ctx.stroke();
    }
    ctx.fillStyle = '#c89b4a';                       // gold binding
    ctx.fillRect(cx - w0 * 0.6, y0 + h * 0.02, w0 * 1.2, Math.max(1, h * 0.018));
  }

  // Draws the full lantern with its body in the box (x, y, w, h). Extras spill into margins().
  function drawDetailed(ctx, { shape, color, img }, x, y, w, h) {
    const lit = rgb(color), base = lit || OFF_PAPER, round = ROUND.has(shape);
    const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);
    const mg = margins(shape, w, h), cap = capSize(shape, w, h);
    const thin = Math.max(0.75, m * 0.006);
    ctx.save();

    // Soft glow on the wall around a lit lantern
    if (lit) {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(w / 2 + mg.x * 0.95, h / 2 + mg.x * 0.95);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, css(lit, 0.45)); g.addColorStop(0.55, css(lit, 0.16)); g.addColorStop(1, css(lit, 0));
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    // Hanging string and hook
    const capTop = y - cap.h * 0.45, ring = m * 0.03;
    ctx.strokeStyle = 'rgba(18,12,8,0.9)'; ctx.lineWidth = Math.max(1, m * 0.012);
    ctx.beginPath(); ctx.moveTo(cx, capTop - ring * 2); ctx.lineTo(cx, y - mg.top); ctx.stroke();
    ctx.strokeStyle = '#a08c62'; ctx.lineWidth = Math.max(1, m * 0.014);
    ctx.beginPath(); ctx.arc(cx, capTop - ring, ring, 0, Math.PI * 2); ctx.stroke();

    // Paper body
    ctx.save();
    facePath(ctx, shape, x, y, w, h); ctx.clip();
    ctx.save();                                       // glow: bright center, darker edges
    ctx.translate(cx, cy - h * 0.04); ctx.scale(w / 2, h / 2);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    if (lit) {
      bg.addColorStop(0, css(mix(lit, WHITE, 0.6))); bg.addColorStop(0.4, css(mix(lit, WHITE, 0.2)));
      bg.addColorStop(0.8, css(lit)); bg.addColorStop(1, css(mix(lit, BLACK, 0.45)));
    } else {
      bg.addColorStop(0, css(mix(base, WHITE, 0.12))); bg.addColorStop(0.7, css(base)); bg.addColorStop(1, css(mix(base, BLACK, 0.45)));
    }
    ctx.fillStyle = bg; ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();

    if (img) ctx.drawImage(img, x, y, w, h);         // drawing / text sits on the paper

    ctx.fillStyle = paperPattern(ctx); ctx.fillRect(x, y, w, h);

    // Horizontal paper creases (a shadow line with a lit edge under it)
    const creases = round ? 10 : 8, sag = round ? h * 0.016 : 0;
    for (let i = 1; i < creases; i++) {
      const v = i / creases, yy = y + v * h, hw = w / 2 * halfWidth(shape, v);
      [['rgba(40,20,5,0.18)', 0], ['rgba(255,255,255,0.10)', thin]].forEach(([s, dy]) => {
        ctx.strokeStyle = s; ctx.lineWidth = thin;
        ctx.beginPath(); ctx.moveTo(cx - hw, yy + dy); ctx.quadraticCurveTo(cx, yy + dy + sag * 2, cx + hw, yy + dy); ctx.stroke();
      });
    }

    // Bamboo ribs following the body's curve
    ctx.lineWidth = Math.max(1, m * 0.011);
    if (round) {
      ctx.strokeStyle = 'rgba(45,25,8,0.28)';
      for (const k of [-0.93, -0.72, -0.4, 0, 0.4, 0.72, 0.93]) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const v = i / 24; ctx.lineTo(cx + k * w / 2 * halfWidth(shape, v), y + v * h); }
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(45,25,8,0.14)';
      for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(x + w * j / 4, y); ctx.lineTo(x + w * j / 4, y + h); ctx.stroke(); }
      ctx.strokeStyle = '#3a2414'; ctx.lineWidth = m * 0.08;   // wooden frame (half of it shows inside the clip)
      facePath(ctx, shape, x, y, w, h); ctx.stroke();
    }

    // Roundness: darker toward the sides, plus a soft highlight
    const sd = round ? 0.38 : 0.18, sg = ctx.createLinearGradient(x, 0, x + w, 0);
    sg.addColorStop(0, `rgba(0,0,0,${sd})`); sg.addColorStop(0.25, 'rgba(0,0,0,0)');
    sg.addColorStop(0.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, `rgba(0,0,0,${sd})`);
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, h);
    if (lit && round) {
      const hx = cx - w * 0.2, hy = cy - h * 0.22, hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, m * 0.28);
      hg.addColorStop(0, 'rgba(255,255,255,0.22)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg; ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, m * 0.008);
    facePath(ctx, shape, x, y, w, h); ctx.stroke();

    // Caps and tassel
    drawCap(ctx, cx, capTop, cap.w, cap.h);
    drawCap(ctx, cx, y + h - cap.h * 0.55, cap.w, cap.h);
    if (round) drawTassel(ctx, cx, y + h + cap.h * 0.45, m, h, lit);
    ctx.restore();
  }

  // Pre-renders a detailed lantern whose body is w x h (in the target canvas's pixels / dpr).
  // Returns { c, mg, w, h, dpr }; copy c onto the screen with its top-left at (box x - mg.x, box y - mg.top).
  function sprite(L, w, h, dpr = 1) {
    const mg = margins(L.shape, w, h), c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((w + 2 * mg.x) * dpr));
    c.height = Math.max(1, Math.ceil((h + mg.top + mg.bottom) * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawDetailed(g, L, mg.x, mg.top, w, h);
    return { c, mg, w, h, dpr };
  }

  // ---------- Sparkle burst ----------
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const dots = new Map();

  function dot(c) {
    const key = c.join();
    if (dots.has(key)) return dots.get(key);
    const S = 48, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, css(mix(c, WHITE, 0.7))); gr.addColorStop(0.22, css(mix(c, WHITE, 0.25), 0.9));
    gr.addColorStop(0.55, css(c, 0.25)); gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    dots.set(key, cv);
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

  // New burst rising from the bottom of a lantern. Returns null when the viewer prefers reduced motion.
  function burst(shape, color, short = false) {
    if (reduceMotion.matches) return null;
    const count = short ? 22 : 44, parts = [];
    for (let i = 0; i < count; i++) {
      const v0 = 0.8 + Math.random() * 0.17, delay = Math.random() * 0.25;
      parts.push({
        v0, delay,
        u0: 0.5 + (Math.random() * 2 - 1) * 0.45 * halfWidth(shape, v0),
        life: 0.5 + Math.random() * (0.5 - delay),   // delay + life <= 1, so every particle ends on time
        rise: (short ? 0.35 : 0.55) + Math.random() * 0.5,
        size: 0.06 + Math.random() * 0.07,
        amp: 0.02 + Math.random() * 0.05, freq: 1 + Math.random() * 1.5, ph: Math.random() * 6.283,
        white: Math.random() < 0.3
      });
    }
    return { t0: performance.now(), dur: short ? 750 : 1200, parts, color: rgb(color) || WARM };
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
      const px = x + w * (p.u0 + p.amp * Math.sin(p.ph + t * p.freq * 6.283) * (0.3 + t));
      const py = y + h * (p.v0 - p.rise * e);
      const s = m * p.size * scale * (1 - 0.35 * t);
      ctx.globalAlpha = Math.min(1, t / 0.12) * Math.pow(1 - t, 1.2) * (0.75 + 0.25 * Math.sin(t * 24 + p.ph));
      ctx.drawImage(p.white ? st : tint, px - s / 2, py - s / 2, s, s);
    }
    ctx.restore();
    return true;
  }

  window.LanternArt = { ROUND, halfWidth, facePath, margins, drawDetailed, sprite, burst, drawBurst, reduceMotion };
})();
