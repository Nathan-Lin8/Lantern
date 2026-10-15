// Shared helpers for the controller and projector pages.
(function () {
  const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => {
    const A = hexRGB(a), B = hexRGB(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  };

  // WebSocket that reconnects on its own. onMessage(msg), onStatus('open' | 'closed')
  function connect(onMessage, onStatus) {
    let ws, retry = 500;
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { retry = 500; onStatus && onStatus('open'); };
      ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
      ws.onclose = () => {
        onStatus && onStatus('closed');
        setTimeout(open, retry);
        retry = Math.min(retry * 2, 5000);
      };
      ws.onerror = () => ws.close();
    };
    open();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ---------- Lantern drawing ----------
  // A lantern's rect covers, top to bottom: hanger, top cap, body, bottom cap, tassel (fractions of its height).
  // BODY must match BODY_FRAC in server.js.
  const LANTERN = { hanger: 0.04, cap: 0.06, body: 0.74, bottomCap: 0.05 };   // tassel gets the rest
  const SHAPES = {
    oval:   { neck: 0.56, ribs: 'vertical' },     // neck = body width where it meets the caps
    barrel: { neck: 0.86, ribs: 'horizontal' }
  };
  const OFF_BODY = '#1a151d';
  const GOLD = ['#5c3a10', '#c98f2c', '#f0c46a', '#c98f2c', '#5c3a10'];

  function lanternGeom(shape, R) {
    const s = SHAPES[shape] || SHAPES.oval;
    const capTop = R.y + R.h * LANTERN.hanger;
    const body = { x: R.x, y: capTop + R.h * LANTERN.cap, w: R.w, h: R.h * LANTERN.body };
    const bottomCapY = body.y + body.h;
    return {
      s, cx: R.x + R.w / 2, capTop, body, bottomCapY,
      tasselTop: bottomCapY + R.h * LANTERN.bottomCap,
      capW: R.w * s.neck * 1.06
    };
  }

  // The drawing area's width / height for a lantern rect (only the ratio of w to h matters)
  const bodyAspect = r => r.w / (r.h * LANTERN.body);

  // Body outline inside its bounding box B: an ellipse cut flat where it meets the caps
  function ellipseFor(shape, B) {
    const neck = (SHAPES[shape] || SHAPES.oval).neck;
    const h2 = B.h / 2, ry = h2 / Math.sqrt(1 - neck * neck);
    return { cx: B.x + B.w / 2, cy: B.y + h2, rx: B.w / 2, ry, cut: Math.asin(h2 / ry) };
  }
  function bodyPath(ctx, shape, B) {
    const e = ellipseFor(shape, B);
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, -e.cut, e.cut);
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, Math.PI - e.cut, Math.PI + e.cut);
    ctx.closePath();
  }

  // Light color, then the drawing, then shading and paper ribs on top (like ink on paper)
  function paintBody(ctx, shape, B, color, img) {
    const e = ellipseFor(shape, B);
    const halfW = y => e.rx * Math.sqrt(Math.max(0, 1 - ((y - e.cy) / e.ry) ** 2));
    const lw = Math.max(1, B.w * 0.008);
    ctx.save();
    bodyPath(ctx, shape, B); ctx.clip();
    ctx.fillStyle = color && color !== 'off' ? color : OFF_BODY;
    ctx.fillRect(B.x, B.y, B.w, B.h);
    if (img) ctx.drawImage(img, B.x, B.y, B.w, B.h);

    // soft highlight up-left, darker toward the edges so it reads round
    const g = ctx.createRadialGradient(e.cx - B.w * 0.14, e.cy - B.h * 0.1, 0, e.cx, e.cy, Math.max(B.w * 0.62, B.h * 0.55));
    g.addColorStop(0, 'rgba(255,255,255,0.2)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g; ctx.fillRect(B.x, B.y, B.w, B.h);

    ctx.strokeStyle = 'rgba(40,20,10,0.3)'; ctx.lineWidth = lw;
    if ((SHAPES[shape] || SHAPES.oval).ribs === 'vertical') {
      // meridians curving around the body
      const n = 10, steps = 28;
      for (let k = 1; k < n; k++) {
        const f = -1 + 2 * k / n;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const y = B.y + B.h * i / steps;
          ctx.lineTo(e.cx + f * halfW(y), y);
        }
        ctx.stroke();
      }
    } else {
      // stacked hoops, bowed a little as if seen from slightly below
      const n = 11, bow = B.h * 0.014;
      for (let k = 1; k < n; k++) {
        const y = B.y + B.h * k / n, hw = halfW(y);
        ctx.beginPath();
        ctx.moveTo(e.cx - hw, y);
        ctx.quadraticCurveTo(e.cx, y + bow * 2, e.cx + hw, y);
        ctx.stroke();
      }
      // two faint seams so it still has some vertical structure
      ctx.globalAlpha = 0.5;
      for (const f of [-0.45, 0.45]) {
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const y = B.y + B.h * i / 20; ctx.lineTo(e.cx + f * halfW(y), y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function goldFill(ctx, x, w) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    GOLD.forEach((c, i) => g.addColorStop(i / (GOLD.length - 1), c));
    return g;
  }

  // Trapezoid cap: wTop at y, wBot at y + h
  function cap(ctx, cx, y, h, wTop, wBot) {
    const w = Math.max(wTop, wBot);
    ctx.fillStyle = goldFill(ctx, cx - w / 2, w);
    ctx.beginPath();
    ctx.moveTo(cx - wTop / 2, y); ctx.lineTo(cx + wTop / 2, y);
    ctx.lineTo(cx + wBot / 2, y + h); ctx.lineTo(cx - wBot / 2, y + h);
    ctx.closePath(); ctx.fill();
    // engraved bands
    ctx.strokeStyle = 'rgba(50,25,5,0.55)'; ctx.lineWidth = Math.max(1, h * 0.09);
    for (const t of [0.35, 0.68]) {
      const ww = wTop + (wBot - wTop) * t;
      ctx.beginPath(); ctx.moveTo(cx - ww / 2, y + h * t); ctx.lineTo(cx + ww / 2, y + h * t); ctx.stroke();
    }
  }

  // Parts that never change: hanger and the two gold caps (drawn over the body's cut ends)
  function paintFrame(ctx, shape, R) {
    const G = lanternGeom(shape, R);
    const lw = Math.max(1, R.w * 0.014);
    ctx.save();
    ctx.strokeStyle = GOLD[2]; ctx.lineWidth = lw;
    const ringR = R.h * LANTERN.hanger * 0.32;
    ctx.beginPath(); ctx.moveTo(G.cx, R.y + ringR * 2); ctx.lineTo(G.cx, G.capTop); ctx.stroke();
    ctx.beginPath(); ctx.arc(G.cx, R.y + ringR, ringR * 0.9, 0, Math.PI * 2); ctx.stroke();
    cap(ctx, G.cx, G.capTop, G.body.y - G.capTop + 1, G.capW * 0.72, G.capW);
    // lip where the cap meets the paper
    const lip = R.h * 0.008;
    ctx.fillStyle = goldFill(ctx, G.cx - G.capW * 0.53, G.capW * 1.06);
    ctx.fillRect(G.cx - G.capW * 0.53, G.body.y - lip, G.capW * 1.06, lip * 1.6);
    cap(ctx, G.cx, G.bottomCapY - 1, G.tasselTop - G.bottomCapY + 1, G.capW, G.capW * 0.72);
    ctx.fillRect(G.cx - G.capW * 0.53, G.bottomCapY - lip * 0.6, G.capW * 1.06, lip * 1.6);
    ctx.restore();
  }

  // Parts that change with the light: body (+ drawing) and the tassel, which matches the light
  function paintLight(ctx, shape, R, color, img, alpha = 1) {
    if (alpha <= 0) return;
    const G = lanternGeom(shape, R);
    ctx.save();
    ctx.globalAlpha = alpha;
    paintBody(ctx, shape, G.body, color, img);

    const top = G.tasselTop, len = R.y + R.h - top;
    const knotR = Math.max(1.5, R.w * 0.035), knotY = top + len * 0.22;
    const tassel = color && color !== 'off' ? color : '#7a2a24';
    ctx.strokeStyle = GOLD[2]; ctx.lineWidth = Math.max(1, R.w * 0.012);
    ctx.beginPath(); ctx.moveTo(G.cx, top); ctx.lineTo(G.cx, knotY); ctx.stroke();
    ctx.fillStyle = GOLD[2];
    ctx.beginPath(); ctx.arc(G.cx, knotY, knotR, 0, Math.PI * 2); ctx.fill();
    const fy = knotY + knotR * 0.6, wTop = R.w * 0.07, wBot = R.w * 0.15, bottom = R.y + R.h;
    ctx.fillStyle = tassel;
    ctx.beginPath();
    ctx.moveTo(G.cx - wTop / 2, fy); ctx.lineTo(G.cx + wTop / 2, fy);
    ctx.lineTo(G.cx + wBot / 2, bottom); ctx.lineTo(G.cx - wBot / 2, bottom);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(0.75, R.w * 0.006);
    for (let i = 1; i < 6; i++) {
      const t = -0.5 + i / 6;
      ctx.beginPath(); ctx.moveTo(G.cx + wTop * t, fy); ctx.lineTo(G.cx + wBot * t, bottom); ctx.stroke();
    }
    ctx.fillStyle = GOLD[2];   // binding wrap at the top of the fringe
    ctx.fillRect(G.cx - wTop * 0.6, fy, wTop * 1.2, Math.max(1, len * 0.06));
    ctx.restore();
  }

  function paintLantern(ctx, shape, R, color, img) {
    paintLight(ctx, shape, R, color, img);
    paintFrame(ctx, shape, R);
  }

  window.LW = {
    hexRGB, mix, connect, loadImage,
    LANTERN, lanternGeom, bodyAspect, bodyPath, paintBody, paintLight, paintFrame, paintLantern
  };
})();
