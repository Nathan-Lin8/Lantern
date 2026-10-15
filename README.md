# Lantern Wall

An iPad controller and a projector display for an interactive lantern wall.

- **Controller** (`/`): visitors see the wall, get "Please select a lantern", then pick
  **A** draw on it, **B** add text, or **C** change the light.
- **Backend** (`server.js`): stores each lantern's light color and its latest drawing as a
  transparent PNG, and pushes every change to all screens over a WebSocket.
- **Projector** (`/projector.html`): full-screen black canvas that draws each lantern's color
  and PNG at its calibrated spot, cross-fading updates in as they arrive.

## Run it

Needs Node 18 or newer.

```bash
npm install
npm start
```

The terminal prints the addresses, for example:

```
Controller (iPad):  http://192.168.1.20:3000/
Projector:          http://192.168.1.20:3000/projector.html
```

1. On the laptop connected to the projector, open the **Projector** URL in Chrome and press
   `F` for full screen.
2. On the iPad (same Wi-Fi), open the **Controller** URL in Safari. Tap Share → Add to Home
   Screen so it opens full screen without the Safari bars.

## Line the projection up with the real lanterns

On the projector page press `C`. Every lantern shows as a numbered box.

- Drag a box onto its physical lantern.
- Drag the bottom-right corner to resize it.
- Arrow keys nudge the selected box (hold Shift for bigger steps).
- Press `S` to save, then `C` to exit.

Positions are saved in `data/state.json`, so they survive restarts.

## How a send works

| Mode | Request | What the projector does |
|---|---|---|
| A Draw / B Text | `PUT /api/lanterns/:id/image` with the PNG as the body (`Content-Type: image/png`) | Loads the new PNG and fades it in on that lantern |
| A / B with an empty canvas | `DELETE /api/lanterns/:id/image` | Removes the drawing, keeps the light |
| C Light | `PUT /api/lanterns/:id/color` with `{ "color": "#ff8800" }` or `{ "color": "off" }` | Fades the lantern to the new color |

Text is rendered to a PNG on the iPad, so the projector only ever deals with images and colors.
PNGs have a transparent background and match the lantern body's proportions (longest side 1200 px).

Other endpoints:

- `GET /api/state` — every lantern's color, image URL and positions
- `PUT /api/layout` — save projector positions (the calibration screen uses this)
- `POST /api/reset` — clear all drawings and colors but keep the calibration

Try it from a terminal:

```bash
curl -X PUT localhost:3000/api/lanterns/2/color -H 'Content-Type: application/json' -d '{"color":"#e0453a"}'
curl -X POST localhost:3000/api/reset
```

## Lantern shapes and layout

Every lantern is oblong and drawn in full: hanger ring, gold top cap, paper body with ribs, gold
bottom cap and a tassel that matches the light. Drawings and text go on the body only.

| Shape | Look | Draw / text | Light color |
|---|---|---|---|
| `oval` | Swollen in the middle, vertical ribs | Yes | Yes |
| `barrel` | Nearly straight sides, horizontal ribs | Yes | Yes |

To match your physical wall, edit the `LAYOUT` list at the top of `server.js`:

```js
{ shape: 'oval', cx: 0.385, cy: 0.314, size: 0.097, aspect: 0.68, color: '#ec6f86' }
```

- `cx`, `cy`: center of the whole lantern, 0 to 1 across and down the wall
- `size`: body width as a fraction of the wall width
- `aspect`: body width ÷ height (0.68 for a plump oval, 0.6 for a tall barrel)

The default layout is two staggered rows of six. Sizes vary a little, and each row rises and falls
in a gentle wave, with the bottom row out of step with the top.

Drawings are exported at the body's own proportions, so a plump lantern gets a wider canvas.

After editing, delete `data/state.json` and restart. (Bumping `STATE_VERSION` in `server.js` does the
same thing automatically.) Then fine-tune the projector positions with calibration mode. Each
calibration box covers the whole lantern, from the hanger ring to the bottom of the tassel.

## Files

```
server.js              Express + WebSocket backend
public/index.html      iPad controller
public/controller.css
public/controller.js
public/projector.html  Projector display + calibration
public/projector.js
public/shared.js       WebSocket reconnect, helpers, and the lantern drawing used by both screens
data/                  Created on first run: state.json and images/
```

## Notes for the real install

- The iPad page blocks scrolling, rubber-banding and pinch-zoom so the canvas stays still while
  drawing. Once an Apple Pencil touches the screen, finger touches are ignored (palm rejection).
- The controller returns to the wall after 90 seconds without a touch, so the next visitor
  starts fresh. Change `IDLE_MS` in `controller.js`.
- Calibration uses rectangles. If the projector hits the wall at an angle and the boxes look
  skewed, the next step is a four-corner (perspective) warp per lantern.
- There's no login. Keep it on a private network for the show.
