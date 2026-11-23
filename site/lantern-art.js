// Shared lantern drawing for the iPad and projector pages: the detailed paper-lantern look.
// Needs ambient.js (shape outlines, colors and the sparkle burst) loaded first.
(() => {
  const { ROUND, OB_END, rrect, halfWidth, facePath, face, clipFace, isPath, FILL_RULE, rgb, mix, css, WHITE, BLACK } = window.Ambient;
  const OFF_PAPER = [78, 70, 84];      // unlit paper

  // ---------- Detailed lantern (iPad) ----------
  // Room the detailed drawing needs around the lantern's box: glow at the sides, string above, tassel below
  function margins(shape, w, h, frame) {
    const glow = Math.max(w, h) * 0.2;
    if (frame) {                                      // room for the whole wooden piece, plus its glow and shadow
      const b = extent(frame), pad = Math.max(w, h) * 0.1;
      return {
        x: Math.max(0, -b.u0, b.u1 - 1) * w + pad,
        top: Math.max(0, -b.v0) * h + pad,
        bottom: Math.max(0, b.v1 - 1) * h + pad * 1.3
      };
    }
    if (isPath(shape)) return { x: glow, top: glow, bottom: glow };
    return { x: glow, top: Math.max(glow, h * 0.32), bottom: Math.max(glow, ROUND.has(shape) ? h * 0.38 : h * 0.08) };
  }

  function capSize(shape, w, h) {
    if (shape === 'capsule') return { w: Math.min(w, h) * 0.42, h: Math.max(3, h * 0.035) };
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

  // Bounding box of a normalized path (u = across, v = down), cached
  const extents = new Map();
  function extent(d) {
    let b = extents.get(d);
    if (!b) {
      const n = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
      b = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
      for (let i = 0; i + 1 < n.length; i += 2) {
        b.u0 = Math.min(b.u0, n[i]); b.u1 = Math.max(b.u1, n[i]);
        b.v0 = Math.min(b.v0, n[i + 1]); b.v1 = Math.max(b.v1, n[i + 1]);
      }
      extents.set(d, b);
    }
    return b;
  }

  // ---------- Laser-cut lantern (iPad): the wooden piece with paper glowing through its openings ----------
  const WOOD = [[150, 101, 58], [112, 72, 38], [78, 48, 24]];   // light grain, body, dark
  function drawCut(ctx, { shape, frame, color, img }, x, y, w, h) {
    const lit = rgb(color), base = lit || OFF_PAPER;
    const F = face(shape, x, y, w, h), B = face(frame, x, y, w, h), b = extent(frame);
    const fx = x + b.u0 * w, fy = y + b.v0 * h, fw = (b.u1 - b.u0) * w, fh = (b.v1 - b.v0) * h;
    const cx = x + w / 2, cy = y + h / 2, m = Math.min(fw, fh);
    ctx.save();

    // Warm light on the wall behind the piece
    if (lit) {
      ctx.save();
      ctx.translate(fx + fw / 2, fy + fh / 2); ctx.scale(fw * 0.62, fh * 0.62);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, css(lit, 0.32)); g.addColorStop(0.6, css(lit, 0.1)); g.addColorStop(1, css(lit, 0));
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    // Paper in the openings
    ctx.save();
    ctx.clip(F, FILL_RULE);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(w * 0.62, h * 0.62);
    const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    if (lit) {
      pg.addColorStop(0, css(mix(lit, WHITE, 0.55))); pg.addColorStop(0.5, css(mix(lit, WHITE, 0.2)));
      pg.addColorStop(1, css(mix(lit, BLACK, 0.25)));
    } else {
      pg.addColorStop(0, css(mix(base, WHITE, 0.1))); pg.addColorStop(1, css(mix(base, BLACK, 0.4)));
    }
    ctx.fillStyle = pg; ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    ctx.restore();
    if (img) ctx.drawImage(img, x, y, w, h);          // drawing / text sits on the paper
    ctx.fillStyle = paperPattern(ctx); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,14,4,0.35)';             // the wood's shadow just inside each opening
    ctx.lineWidth = Math.max(2, m * 0.03);
    ctx.stroke(F);
    ctx.restore();

    // The wooden piece: drop shadow, then the board with grain
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = m * 0.05; ctx.shadowOffsetY = m * 0.018;
    ctx.fillStyle = css(WOOD[2]); ctx.fill(B, FILL_RULE);
    ctx.restore();
    ctx.save();
    ctx.clip(B, FILL_RULE);
    const wg = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
    wg.addColorStop(0, css(WOOD[0])); wg.addColorStop(0.5, css(WOOD[1])); wg.addColorStop(1, css(WOOD[2]));
    ctx.fillStyle = wg; ctx.fillRect(fx, fy, fw, fh);
    // grain: long, gently wavy lines along the board (the board's length runs top to bottom once turned)
    const seed = frame.length, lines = 34, amp = fw * 0.012;
    ctx.lineWidth = Math.max(0.6, m * 0.0035);
    for (let i = 0; i < lines; i++) {
      const gx = fx + fw * (i + 0.5) / lines + Math.sin(i * 12.9898 + seed) * fw * 0.008;
      ctx.strokeStyle = i % 3 ? 'rgba(60,34,14,0.22)' : 'rgba(205,160,110,0.16)';
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const t = k / 20, yy = fy + fh * t;
        const xx = gx + Math.sin(t * 5.2 + i * 1.7 + seed) * amp + Math.sin(t * 13 + i) * amp * 0.3;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }
    if (lit) {                                         // the lantern's light catching the wood around the openings
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy); ctx.scale(w * 0.75, h * 0.75);
      const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      lg.addColorStop(0, css(lit, 0.22)); lg.addColorStop(1, css(lit, 0));
      ctx.fillStyle = lg; ctx.fillRect(-1.5, -1.5, 3, 3);
    }
    ctx.restore();
    // laser-darkened cut edges, with a faint highlight on the top edge of the board
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(38,18,6,0.9)'; ctx.lineWidth = Math.max(1, m * 0.006);
    ctx.stroke(B);
    ctx.save();
    ctx.translate(0, Math.max(0.5, m * 0.003));
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,214,160,0.08)'; ctx.lineWidth = Math.max(0.75, m * 0.003);
    ctx.stroke(B);
    ctx.restore();
    ctx.restore();
  }

  // Draws the full lantern with its body in the box (x, y, w, h). Extras spill into margins().
  // shape = a shape name or a real cut path (Ambient.faceOf): cut shapes get no string, caps or tassel.
  function drawDetailed(ctx, L, x, y, w, h) {
    if (L.frame && isPath(L.shape)) return drawCut(ctx, L, x, y, w, h);
    const { shape, color, img } = L;
    const lit = rgb(color), base = lit || OFF_PAPER, round = ROUND.has(shape), cut = isPath(shape);
    const F = face(shape, x, y, w, h);
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
    if (!cut) {
    ctx.strokeStyle = 'rgba(18,12,8,0.9)'; ctx.lineWidth = Math.max(1, m * 0.012);
    ctx.beginPath(); ctx.moveTo(cx, capTop - ring * 2); ctx.lineTo(cx, y - mg.top); ctx.stroke();
    ctx.strokeStyle = '#a08c62'; ctx.lineWidth = Math.max(1, m * 0.014);
    ctx.beginPath(); ctx.arc(cx, capTop - ring, ring, 0, Math.PI * 2); ctx.stroke();
    }

    // Paper body
    ctx.save();
    ctx.clip(F, FILL_RULE);
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
      const v = i / creases, yy = y + v * h, hw = w / 2 * halfWidth(shape, v, w / h);
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
      ctx.strokeStyle = '#3a2414'; ctx.lineWidth = m * (cut ? 0.025 : 0.08);   // wooden frame (half of it shows inside the clip)
      ctx.stroke(F);
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
    ctx.stroke(F);

    // Caps and tassel
    if (!cut) {
      drawCap(ctx, cx, capTop, cap.w, cap.h);
      drawCap(ctx, cx, y + h - cap.h * 0.55, cap.w, cap.h);
    }
    if (round) drawTassel(ctx, cx, y + h + cap.h * 0.45, m, h, lit);
    ctx.restore();
  }

  // Pre-renders a detailed lantern whose body is w x h (in the target canvas's pixels / dpr).
  // Returns { c, mg, w, h, dpr }; copy c onto the screen with its top-left at (box x - mg.x, box y - mg.top).
  function sprite(L, w, h, dpr = 1) {
    const mg = margins(L.shape, w, h, L.frame), c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((w + 2 * mg.x) * dpr));
    c.height = Math.max(1, Math.ceil((h + mg.top + mg.bottom) * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawDetailed(g, L, mg.x, mg.top, w, h);
    return { c, mg, w, h, dpr };
  }

  // Shape paths and the sparkle burst live in ambient.js; re-exported here for the editor
  const { burst, drawBurst, reduceMotion } = window.Ambient;
  window.LanternArt = { ROUND, halfWidth, facePath, face, clipFace, FILL_RULE, margins, drawDetailed, sprite, burst, drawBurst, reduceMotion };
})();
