// Shared lantern drawing for the iPad and projector pages: the detailed paper-lantern look.
// Needs ambient.js (shape outlines, colors and the sparkle burst) loaded first.
(() => {
  const { ROUND, OB_END, rrect, halfWidth, facePath, rgb, mix, css, WHITE, BLACK } = window.Ambient;
  const OFF_PAPER = [78, 70, 84];      // unlit paper

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

  // Shape paths and the sparkle burst live in ambient.js; re-exported here for the editor
  const { burst, drawBurst, reduceMotion } = window.Ambient;
  window.LanternArt = { ROUND, halfWidth, facePath, margins, drawDetailed, sprite, burst, drawBurst, reduceMotion };
})();
