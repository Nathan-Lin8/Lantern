// Lantern Wall backend
// - Serves the iPad controller (/) and the projector display (/projector.html)
// - Stores each lantern's color + latest transparent PNG
// - Pushes every change to all connected screens over a WebSocket (/ws)

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(IMG_DIR, { recursive: true });

// ---------- State ----------
// Coordinates are normalized 0..1 of a 16:9 surface.
//   wall: where the lantern appears on the iPad's picture of the wall
//   proj: where the projector draws it (adjust with calibration mode on the projector page)
//
// Shapes (all oblong, all can show drawings and text since we project onto flat matte panels):
//   'oval'   -> swollen in the middle, narrow at the caps, vertical ribs
//   'barrel' -> nearly straight sides, horizontal ribs
// Each lantern's rect covers the whole lantern: hanger, top cap, body, bottom cap and tassel.
const STATE_VERSION = 3;
const DRAWABLE = new Set(['oval', 'barrel']);
const BODY_FRAC = 0.74;   // share of the lantern's height that is body; keep in sync with LANTERN in public/shared.js

// Edit this list to match your physical wall.
//   cx, cy  = center of the lantern (0..1 across / down the wall)
//   size    = body width as a fraction of the wall width
//   aspect  = body width / height (0.68 = a plump oval, 0.6 = a tall barrel)
// Two staggered rows; each row rises and falls in a gentle wave, the bottom row out of step with the top.
const LAYOUT = [
  { shape: 'oval',   cx: 0.075, cy: 0.27,  size: 0.09,  aspect: 0.68, color: '#f4a64a' },
  { shape: 'barrel', cx: 0.23,  cy: 0.319, size: 0.074, aspect: 0.6,  color: '#fff1d6' },
  { shape: 'oval',   cx: 0.385, cy: 0.314, size: 0.097, aspect: 0.68, color: '#ec6f86' },
  { shape: 'barrel', cx: 0.54,  cy: 0.261, size: 0.076, aspect: 0.6,  color: '#5fb7d4' },
  { shape: 'oval',   cx: 0.695, cy: 0.218, size: 0.094, aspect: 0.68, color: '#9ad46f' },
  { shape: 'barrel', cx: 0.85,  cy: 0.231, size: 0.072, aspect: 0.6,  color: '#fff1d6' },
  { shape: 'barrel', cx: 0.15,  cy: 0.72,  size: 0.075, aspect: 0.6,  color: '#9b7be8' },
  { shape: 'oval',   cx: 0.305, cy: 0.671, size: 0.095, aspect: 0.68, color: '#f28a2e' },
  { shape: 'barrel', cx: 0.46,  cy: 0.676, size: 0.072, aspect: 0.6,  color: '#f4a64a' },
  { shape: 'oval',   cx: 0.615, cy: 0.729, size: 0.093, aspect: 0.68, color: '#3fc1b0' },
  { shape: 'barrel', cx: 0.77,  cy: 0.772, size: 0.077, aspect: 0.6,  color: '#ec6f86' },
  { shape: 'oval',   cx: 0.925, cy: 0.759, size: 0.096, aspect: 0.68, color: '#f5d547' }
];

function defaultState() {
  return {
    version: STATE_VERSION,
    lanterns: LAYOUT.map((d, i) => {
      const w = d.size;
      const h = w * (16 / 9) / d.aspect / BODY_FRAC;   // real body proportions on a 16:9 wall, plus caps and tassel
      const rect = { x: d.cx - w / 2, y: d.cy - h / 2, w, h };
      return { id: i + 1, shape: d.shape, color: d.color, image: null, wall: { ...rect }, proj: { ...rect } };
    })
  };
}

let state;
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (state.version !== STATE_VERSION) throw new Error('old layout');
} catch {
  state = defaultState();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  }, 200);
}

const findLantern = id => state.lanterns.find(l => l.id === Number(id));
const canDraw = l => DRAWABLE.has(l.shape);
const imageUrl = l => (l.image ? `/images/lantern-${l.id}.png?v=${l.image.v}` : null);
const publicLantern = l => ({ ...l, canDraw: canDraw(l), imageUrl: imageUrl(l) });
const publicState = () => ({ lanterns: state.lanterns.map(publicLantern) });

// ---------- HTTP ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(IMG_DIR, { maxAge: 0 }));

app.get('/api/state', (req, res) => res.json(publicState()));

// Upload a drawing/text as a transparent PNG (raw body, Content-Type: image/png)
app.put('/api/lanterns/:id/image', express.raw({ type: 'image/png', limit: '10mb' }), (req, res) => {
  const l = findLantern(req.params.id);
  if (!l) return res.status(404).json({ error: 'No lantern with that number' });
  if (!canDraw(l)) return res.status(400).json({ error: `Lantern ${l.id} can only change color` });
  const buf = req.body;
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    return res.status(400).json({ error: 'Body must be a PNG image' });
  }
  const file = path.join(IMG_DIR, `lantern-${l.id}.png`);
  fs.writeFileSync(file + '.tmp', buf);
  fs.renameSync(file + '.tmp', file);
  l.image = { v: Date.now() };
  save();
  broadcast({ type: 'lantern', lantern: publicLantern(l) });
  res.json(publicLantern(l));
});

// Remove a lantern's image (keeps its color)
app.delete('/api/lanterns/:id/image', (req, res) => {
  const l = findLantern(req.params.id);
  if (!l) return res.status(404).json({ error: 'No lantern with that number' });
  l.image = null;
  fs.rmSync(path.join(IMG_DIR, `lantern-${l.id}.png`), { force: true });
  save();
  broadcast({ type: 'lantern', lantern: publicLantern(l) });
  res.json(publicLantern(l));
});

// Change the light: { "color": "#rrggbb" } or { "color": "off" }
app.put('/api/lanterns/:id/color', express.json(), (req, res) => {
  const l = findLantern(req.params.id);
  if (!l) return res.status(404).json({ error: 'No lantern with that number' });
  const color = String(req.body?.color || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color) && color !== 'off') {
    return res.status(400).json({ error: 'Color must look like #ff8800 or "off"' });
  }
  l.color = color;
  save();
  broadcast({ type: 'lantern', lantern: publicLantern(l) });
  res.json(publicLantern(l));
});

// Save projector positions from calibration: [{ id, proj: {x,y,w,h} }, ...]
app.put('/api/layout', express.json(), (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Send an array of { id, proj }' });
  const ok = n => typeof n === 'number' && n >= -1 && n <= 2;
  for (const item of req.body) {
    const l = findLantern(item.id);
    const r = item.proj;
    if (l && r && ok(r.x) && ok(r.y) && ok(r.w) && ok(r.h)) l.proj = { x: r.x, y: r.y, w: r.w, h: r.h };
  }
  save();
  broadcast({ type: 'state', state: publicState() });
  res.json(publicState());
});

// Wipe everything back to defaults (handy between sessions)
app.post('/api/reset', (req, res) => {
  for (const l of state.lanterns) fs.rmSync(path.join(IMG_DIR, `lantern-${l.id}.png`), { force: true });
  const keepLayout = new Map(state.lanterns.map(l => [l.id, l.proj]));
  state = defaultState();
  state.lanterns.forEach(l => { if (keepLayout.has(l.id)) l.proj = keepLayout.get(l.id); });
  save();
  broadcast({ type: 'state', state: publicState() });
  res.json(publicState());
});

// ---------- WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) if (client.readyState === 1) client.send(data);
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'state', state: publicState() }));
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Drop dead connections so the projector reconnects cleanly after Wi-Fi blips
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\nLantern Wall running`);
  console.log(`  Controller (iPad):  http://localhost:${PORT}/`);
  console.log(`  Projector:          http://localhost:${PORT}/projector.html`);
  ips.forEach(ip => console.log(`  On your network:    http://${ip}:${PORT}/`));
  console.log('');
});
