// The lanterns hanging from the truss. Edit this list to match what you built.
//
//   shape        'capsule' | 'circle' | 'oval' | 'oblong' | 'rect' | 'square'
//                'capsule' = the flat, tall, softly rounded main lantern (fully round top and bottom)
//                'oblong'  = tall classic paper lantern
//   interactive  true for the ONE main lantern: the only one visitors can draw, write on or recolor
//                from the iPad. Every other lantern is decorative (ambient light only).
//   cx, cy       center of the lantern, 0..1 across and down the projected image (as seen from the front)
//   size         width as a fraction of the projected width
//   aspect       real-world width / height (1 = round, 0.5 = twice as tall as wide)
//   color        starting light color ('#rrggbb' or 'off')
//
// After editing: open the projector page, press C, and click "Reset to layout.js" (twice, to confirm).
window.LANTERN_LAYOUT = [
  // The main lantern: centered, biggest, the one visitors customize
  { shape: 'capsule', interactive: true, cx: 0.50, cy: 0.50, size: 0.17,  aspect: 0.5,  color: '#fff1d6' },

  // Decorative lanterns, scattered at different heights on their fishing lines
  { shape: 'oval',    cx: 0.10, cy: 0.30, size: 0.07,  aspect: 0.75, color: '#f4a64a' },
  { shape: 'circle',  cx: 0.22, cy: 0.63, size: 0.09,  aspect: 1,    color: '#f59a6a' },
  { shape: 'oblong',  cx: 0.31, cy: 0.25, size: 0.068, aspect: 0.62, color: '#ec7f8f' },
  { shape: 'circle',  cx: 0.355,cy: 0.80, size: 0.055, aspect: 1,    color: '#f2c35b' },
  { shape: 'oblong',  cx: 0.67, cy: 0.69, size: 0.078, aspect: 0.62, color: '#f4a64a' },
  { shape: 'circle',  cx: 0.715,cy: 0.29, size: 0.075, aspect: 1,    color: '#ec7f8f' },
  { shape: 'oval',    cx: 0.84, cy: 0.57, size: 0.08,  aspect: 0.8,  color: '#f2c35b' },
  { shape: 'circle',  cx: 0.93, cy: 0.21, size: 0.052, aspect: 1,    color: '#f59a6a' }
];

// Turns the list above into database rows. Positions are fractions of a 16:9 image.
window.buildLanternRows = function () {
  const r4 = n => Math.round(n * 10000) / 10000;
  return window.LANTERN_LAYOUT.map((d, i) => {
    const w = d.size;
    const h = w * (16 / 9) / d.aspect;
    const rect = { x: r4(d.cx - w / 2), y: r4(d.cy - h / 2), w: r4(w), h: r4(h) };
    return { id: i + 1, shape: d.shape, color: d.color, interactive: !!d.interactive, wall: rect, proj: { ...rect } };
  });
};
