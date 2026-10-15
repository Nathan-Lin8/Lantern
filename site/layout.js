// The lanterns on your physical wall. Edit this list to match what you built.
//
//   shape   'rect' | 'square'  -> can show drawings and text
//           'circle' | 'oval'  -> light color only
//   cx, cy  center of the lantern, 0..1 across and down the wall
//   size    width as a fraction of the wall width
//   aspect  real-world width / height (1 = square or circle, 0.75 = tall 3:4, 1.33 = wide 4:3)
//   color   starting light color ('#rrggbb' or 'off')
//
// After editing: open the projector page, press C, and click "Reset to layout.js".
window.LANTERN_LAYOUT = [
  { shape: 'circle', cx: 0.09,  cy: 0.30, size: 0.08, aspect: 1,    color: '#f4a64a' },
  { shape: 'rect',   cx: 0.23,  cy: 0.32, size: 0.12, aspect: 0.75, color: '#fff1d6' },
  { shape: 'circle', cx: 0.39,  cy: 0.26, size: 0.13, aspect: 1,    color: '#ec6f86' },
  { shape: 'square', cx: 0.555, cy: 0.30, size: 0.11, aspect: 1,    color: '#5fb7d4' },
  { shape: 'oval',   cx: 0.69,  cy: 0.28, size: 0.08, aspect: 0.7,  color: '#9ad46f' },
  { shape: 'rect',   cx: 0.86,  cy: 0.30, size: 0.16, aspect: 1.33, color: '#fff1d6' },
  { shape: 'square', cx: 0.11,  cy: 0.72, size: 0.08, aspect: 1,    color: '#9b7be8' },
  { shape: 'oval',   cx: 0.26,  cy: 0.72, size: 0.07, aspect: 0.65, color: '#f28a2e' },
  { shape: 'rect',   cx: 0.45,  cy: 0.69, size: 0.14, aspect: 0.75, color: '#f4a64a' },
  { shape: 'circle', cx: 0.62,  cy: 0.72, size: 0.10, aspect: 1,    color: '#3fc1b0' },
  { shape: 'rect',   cx: 0.78,  cy: 0.72, size: 0.10, aspect: 0.75, color: '#ec6f86' },
  { shape: 'circle', cx: 0.92,  cy: 0.75, size: 0.06, aspect: 1,    color: '#f5d547' }
];

// Turns the list above into database rows. Positions are fractions of a 16:9 wall.
window.buildLanternRows = function () {
  const r4 = n => Math.round(n * 10000) / 10000;
  return window.LANTERN_LAYOUT.map((d, i) => {
    const w = d.size;
    const h = w * (16 / 9) / d.aspect;
    const rect = { x: r4(d.cx - w / 2), y: r4(d.cy - h / 2), w: r4(w), h: r4(h) };
    return { id: i + 1, shape: d.shape, color: d.color, wall: rect, proj: { ...rect } };
  });
};
