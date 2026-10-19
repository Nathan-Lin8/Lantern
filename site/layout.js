// The lanterns on your physical wall. Edit this list to match what you built.
//
//   shape   'rect' | 'square' | 'circle' | 'oval' | 'oblong'  ('oblong' = tall classic paper lantern)
//           every shape can show drawings, text and light color
//   cx, cy  center of the lantern, 0..1 across and down the wall
//   size    width as a fraction of the wall width
//   aspect  real-world width / height (1 = square or circle, 0.75 = tall 3:4, 1.33 = wide 4:3)
//   color   starting light color ('#rrggbb' or 'off')
//
// After editing: open the projector page, press C, and click "Reset to layout.js".
window.LANTERN_LAYOUT = [
  { shape: 'circle', cx: 0.12, cy: 0.50, size: 0.13, aspect: 1,    color: '#f4a64a' },
  { shape: 'rect',   cx: 0.31, cy: 0.50, size: 0.15, aspect: 0.75, color: '#fff1d6' },
  { shape: 'oblong', cx: 0.50, cy: 0.48, size: 0.13, aspect: 0.62, color: '#ec6f86' },
  { shape: 'square', cx: 0.69, cy: 0.50, size: 0.15, aspect: 1,    color: '#5fb7d4' },
  { shape: 'oval',   cx: 0.88, cy: 0.50, size: 0.12, aspect: 0.7,  color: '#9ad46f' }
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
