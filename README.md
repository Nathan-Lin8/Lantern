# Lantern Wall

An iPad controller and a projector display for an interactive lantern wall.

- **Controller** (`site/index.html`): opens straight onto the one main lantern with three choices:
  **A** draw, **B** write, **C** change the light. A live picture of the whole exhibit breathes above them.
- **Projector** (`site/projector.html`): rear projection through hanging lanterns. Light is only ever
  painted inside the lantern shapes (everything else stays pure black), and the output is mirrored so it
  reads correctly from the front. The main lantern shows the visitor's color, drawing or text; the
  decorative lanterns breathe, drift through warm colors and echo each new visitor's color.
- **Netlify** hosts the pages. **Supabase** stores the lanterns, the drawings (as PNGs), and pushes
  every change to the projector instantly. There's no server of your own to run.

## One-time setup (about 15 minutes)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open `supabase/setup.sql` and change `admin_code` near the top: what the projector needs for
   calibration and resets. Keep it to yourself. The iPad needs no code.
3. In Supabase go to **SQL Editor → New query**, paste the whole file, and click **Run**.
   It creates the lanterns table, the image bucket, live updates, and the permissions.
4. Go to **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the
   **anon public** key.

### 2. Config

Paste those two values into `site/config.js`:

```js
window.LANTERN_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  bucket: 'lanterns'
};
```

The anon key is meant to be public. Anyone with the site can send drawings, text and colors;
calibration and resets need the admin code, which is checked inside the database.

### 3. Netlify

Pick one:

- **Drag and drop:** at [app.netlify.com/drop](https://app.netlify.com/drop), drag the `site` folder in.
  To update later, open the site in Netlify → **Deploys** → drag the folder again.
- **From GitHub:** push this repo, then **Add new site → Import from Git**. `netlify.toml` already
  tells Netlify to publish `site/` with no build step. Every push redeploys.

You'll get a URL like `https://lantern-wall.netlify.app`.

### 4. Calibrate once

1. On the projector laptop, open `https://YOUR-SITE.netlify.app/projector.html?admin=YOUR-ADMIN-CODE`.
   The code in the link is remembered on that laptop, then removed from the address bar.
2. Press `F` for full screen, then `C` to calibrate.
3. Drag each shape onto its real lantern, and drag the white corner square to resize.
   Arrow keys nudge the selected one (hold Shift for bigger steps).
   If the panel is in the way, click **Move this panel**.
4. Press `S` to save. Positions are stored in Supabase, so they survive restarts and redeploys.

### 5. Set up the iPad

Open `https://YOUR-SITE.netlify.app/` in Safari, then tap **Share → Add to Home Screen**.
The home-screen icon opens straight to the wall.

## Links to give your team

| Device | Link |
|---|---|
| Projector laptop | `https://YOUR-SITE.netlify.app/projector.html` |
| iPad | `https://YOUR-SITE.netlify.app/` |

`TEAM-GUIDE.md` is a one-page version of this for teammates.

## Changing the lanterns

Edit `site/layout.js`. Each line is one lantern:

```js
{ shape: 'capsule', interactive: true, cx: 0.50, cy: 0.50, size: 0.17, aspect: 0.5, color: '#fff1d6' }
```

| Field | Meaning |
|---|---|
| `shape` | `capsule` (flat, tall, fully rounded ends: the main lantern), `circle`, `oval`, `oblong` (a tall classic paper lantern), `rect` or `square` |
| `interactive` | `true` for the one main lantern visitors customize. Leave it out on decorative lanterns. The database refuses colors and drawings for non-interactive lanterns. |
| `cx`, `cy` | Center of the lantern, 0 to 1 across and down the wall |
| `size` | Width as a fraction of the wall width |
| `aspect` | Real width ÷ height: 1 for squares and circles, 0.75 for a tall 3:4 box, 1.33 for a wide one |
| `color` | Starting light color, `#rrggbb` or `off` |

Redeploy, then on the projector press `C` → **Reset to layout.js** (click twice to confirm).
This replaces every lantern, so recalibrate afterward.

## Admin tools (projector page, `C`)

- **Save positions** (`S`): stores calibration and the mirroring setting.
- **Flip** (`X`): mirrors the output left/right. On for rear projection (default `MIRROR_X` in `projector.js`).
  While mirrored, stand in front of the lanterns to calibrate: moving the mouse right moves the shape right as seen from the front.
- **Clear all drawings**: wipes every drawing, keeps colors and positions. Good between sessions.
- **Reset to layout.js**: rebuilds all lanterns from `layout.js`. Clears drawings and calibration.

To change the admin code, edit it in the "Access codes" block of `setup.sql` and run just that
block in the SQL Editor.

## How it works

| Action | What happens |
|---|---|
| Draw / text | The iPad renders a transparent PNG at the lantern's proportions, uploads it to the `lanterns` storage bucket, then calls `set_lantern_image` |
| Clear and send | `set_lantern_image` with no image |
| Change light | `set_lantern_color` |
| Projector | Subscribes to changes on the `lanterns` table and fades each update in |

All writes go through database functions; the admin ones check the admin code. The website can't
edit the table directly or read the codes.

## Files

```
site/                  what Netlify publishes
  index.html           iPad controller
  controller.js / .css
  projector.html       projector display + calibration
  projector.js
  lw.js                Supabase connection, uploads, admin code
  config.js            your Supabase URL + anon key
  layout.js            the list of lanterns
supabase/setup.sql     run once in the Supabase SQL Editor (fresh installs)
supabase/migrate-main-lantern.sql   upgrade an existing database to the main-lantern setup
netlify.toml           tells Netlify to publish site/
TEAM-GUIDE.md          one-page guide for the showcase
```

## Tuning the projector

Everything worth tuning on the real lanterns is in the `CONFIG` block at the top of `site/projector.js`:
`MIRROR_X`, `EDGE_INSET` (how far inside each outline the light stops), breathing, the main lantern's
ambient strength, drift colors, echo timing. Keys on the projector: `F` fullscreen, `C` calibrate,
`A` ambient on/off, `R` preview a reveal, `M` sound, `H` help. `projector.html?demo` previews
layout.js locally without Supabase.

## Good to know

- **Free Supabase projects pause after about a week without use.** Open the site once in the days
  before the showcase. If it's paused, the Supabase dashboard has a Restore button.
- Both devices need internet. Campus Wi-Fi is fine, since nothing talks device to device.
- Every send stores a new PNG, and old ones stay in the bucket. That's fine for a showcase. To
  clean up, empty the `lanterns` bucket in Supabase **Storage** after running **Clear all drawings**.
- Calibration uses rectangles. If the projector hits the wall at a steep angle, the next step is a
  four-corner warp per lantern.
