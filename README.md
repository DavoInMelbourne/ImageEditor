# 🎨 SVG Image Editor — PNG to SVG Converter & Recolour Tool

A free, browser-based **PNG to SVG converter** and **SVG editor** with colour palette recoloring, component extraction, and one-click social media export. Runs entirely on your own machine — no cloud upload, no account, no subscription.

Built for logo designers, content creators, and anyone who needs to take a raster image, convert it to a clean SVG, and get it export-ready for multiple platforms fast.

**Key features:**

- **PNG → SVG conversion** — pixel-perfect High Quality mode (embedded raster) or fully vectorised colour-layer tracing
- **SVG recolour tool** — interactive colour wheel with lightness and depth controls; dial in rich deep tones or soft pastels
- **Component extraction** — detect, select, delete, or extract individual parts of an image as standalone SVGs
- **Social media export** — 20+ presets for YouTube, Instagram, Facebook, X/Twitter, Bluesky, LinkedIn, Ko-fi, Flickr, Discord, and Twitch at correct 2025/2026 dimensions
- **Custom export** — export any SVG or PNG at any pixel dimensions you choose
- **Undo/redo** — full history with up to 50 steps

---

## Author

Made with ❤️ by **[Paul Davies](https://github.com/DavoInMelbourne)**

**Like this project?** Help keep the lights on at [weluvbeer.com](https://www.weluvbeer.com) by buying me a Ko-fi!

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/weluvbeer)

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org) (managed via [nvm](https://github.com/nvm-sh/nvm) on this machine)

### Run the app

```bash
npm install       # first time only
npm run dev       # starts the server and watches for code changes
```

Then open **http://localhost:3000** in your browser.

To build without the dev watcher:

```bash
npm run build
npm start
```

---

## User Guide

### Importing an image

You can get an image into the editor three ways:

- **Drag and drop** a PNG or SVG anywhere onto the canvas area
- Click **Import PNG** to browse for a raster image (PNG, JPG, WebP, GIF, BMP)
- Click **Import SVG** to load an existing SVG file

When you import a PNG, the app converts it to SVG automatically using the settings in the left panel.

---

### PNG to SVG Conversion

The conversion panel appears whenever you load a PNG. Three modes are available:

| Mode                             | What it does                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **High Quality** _(recommended)_ | Embeds your original PNG inside the SVG for pixel-perfect display. A hidden vector layer is generated in the background for editing operations. |
| **Color vector**                 | Fully vectorises the image into coloured layers — one per quantised colour. Good for logos with flat colours.                                   |
| **Monochrome**                   | Single-colour vector trace.                                                                                                                     |

**Sliders (Color vector / Mono modes):**

- **Color layers** — how many distinct colours to trace (2–16)
- **Detail level** — how much tiny speck noise to ignore (higher = cleaner, less detail)
- **Threshold** — brightness cutoff for monochrome tracing

After changing settings you can click **Re-convert** to redo the conversion without re-importing.

> **Tip:** High Quality mode gives the best-looking result for photos and complex logos. Switch to Color vector if you need fully editable vector paths.

---

### Recolouring

The **Color Palette** panel lets you repaint the entire image in a new colour scheme while preserving all the light and dark relationships of the original.

1. **Click the colour wheel** to pick a hue and saturation. The position on the wheel sets the colour; distance from the centre sets how vivid it is.
2. **Lightness slider** — drag this to make the selected colour darker or lighter. The wheel redraws to show how the colours look at that lightness. Your picked colour updates in real time as you drag.
3. **Depth slider** — controls the contrast range between the darkest and lightest parts of the recoloured image. Drag left for more contrast (deeper darks), drag right for a more washed-out / pastel look.
4. **Preview swatches** — the left box shows the exact colour your darkest image areas will become; the right box shows what the lightest areas will become.
5. Click **Recolor Image** to apply.

You can recolour multiple times and use **Undo / Redo** (or Ctrl+Z / Ctrl+Shift+Z) to step back.

---

### Smooth Paths

> ⚠️ **Work in progress** — smoothing is not reliable yet and may distort paths. Best to skip this feature for now.

Applies path smoothing to vector paths to reduce jagged edges.

- Drag the **Smoothing** slider to set the intensity
- Click **Apply Smoothing**

> In High Quality mode, applying smoothing switches the display from the embedded PNG to the vector layer. You will notice a quality difference — this is expected.

---

### Components

The **Components** panel lets you select, group, delete, or extract parts of the image.

1. Click **Detect Components** to analyse the image
2. Components appear as a list — click one to select it on the canvas, or Shift+click for multiple
3. Actions available once something is selected:
   - **Group Selected** — combine multiple elements into one group
   - **Ungroup** — break a group apart
   - **Delete Selected** — remove the selected component
   - **Extract Selected** — download just the selected component as a standalone SVG

---

### Text Replace

Requires components to be detected first (see above). Select a component, then:

1. The **Find** field will populate with the selected component's identifier
2. Type your replacement text (or an emoji, or leave blank to delete)
3. Choose a **Font**
4. Click **Replace Text**

> Note: text replacement works best on vector-mode SVGs. In High Quality mode, text is embedded in the raster image and cannot be replaced directly.

---

### Exporting

#### Quick export (toolbar)

- **Export SVG** — saves the current SVG to your browser downloads
- **Export PNG** — saves a PNG at the current canvas dimensions

#### Export for Social Media

The **Export for Social Media** panel gives you one-click export at the right dimensions for each platform.

1. Set your **Output Directory** (defaults to `~/Downloads`) — click **Change** to pick a different folder
2. Filter by **Platform** if you want to narrow the list
3. Choose **PNG** or **SVG** format
4. Click any preset button to save immediately

**Available presets:**

| Platform    | Preset         | Size      |
| ----------- | -------------- | --------- |
| YouTube     | Channel Banner | 2560×1440 |
| YouTube     | Thumbnail      | 1280×720  |
| Instagram   | Post (Square)  | 1080×1080 |
| Instagram   | Story / Reel   | 1080×1920 |
| Instagram   | Landscape Post | 1080×566  |
| Facebook    | Cover Photo    | 820×360   |
| Facebook    | Post           | 1200×630  |
| Facebook    | Profile Photo  | 170×170   |
| X / Twitter | Header         | 1500×500  |
| X / Twitter | Post Image     | 1200×675  |
| Bluesky     | Banner         | 1500×500  |
| Bluesky     | Post Image     | 1200×675  |
| Ko-fi       | Shop Banner    | 1200×400  |
| Ko-fi       | Post Image     | 1200×600  |
| Flickr      | Cover Photo    | 2048×492  |
| LinkedIn    | Banner         | 1584×396  |
| LinkedIn    | Post           | 1200×627  |
| Discord     | Server Banner  | 960×540   |
| Twitch      | Offline Banner | 1920×1080 |
| Twitch      | Panel          | 320×160   |

You can also enter a **Custom Size** at the bottom of the panel.

---

### Keyboard shortcuts

| Shortcut     | Action                  |
| ------------ | ----------------------- |
| Ctrl+Z       | Undo                    |
| Ctrl+Shift+Z | Redo                    |
| Ctrl+Scroll  | Zoom in/out             |
| Shift+Click  | Multi-select components |

---

## Known Limitations

- **Text replacement in HQ mode** — text baked into the raster image cannot be replaced. Convert to Color vector mode first if text editing is important.
- **Component detection in HQ mode** — the vector layer contains colour regions, not logical objects. Detection is approximate.
- **PNG export of HQ images** — server-side rasterisation may not perfectly handle embedded base64 images at large sizes. If a PNG export looks wrong, try SVG format instead.

---

---

## Under the Hood _(for nerds)_

### Tech stack

- **Backend:** Node.js + Express + TypeScript, compiled with esbuild (~60ms build)
- **Frontend:** TypeScript, vanilla DOM, ES modules bundled by esbuild (~10ms build)
- **Image processing:** `sharp` (resize, colour quantisation, PNG rasterisation), `potrace` (bitmap-to-vector tracing)
- **File uploads:** `multer`
- **Dev tooling:** `tsx` (watch mode), `concurrently` (parallel server + client builds)

No frontend framework — the UI is straightforward enough that React/Vue would add complexity without benefit.

### Architecture

```
src/
  server/
    index.ts          Express entry point (port 3000)
    routes.ts         API endpoints
    conversion.ts     PNG-to-SVG pipeline
    potrace.d.ts      Type declarations for potrace
  client/
    app.ts            Entry point, wires all modules
    state.ts          Central state + undo/redo (max 50 steps)
    canvas.ts         SVG rendering, zoom, element selection
    conversion.ts     PNG upload + conversion UI
    smoothing.ts      Path smoothing (RDP + Catmull-Rom)
    components.ts     Component list, group/ungroup/delete/extract
    palette.ts        Colour wheel + recolouring
    text.ts           Text find/replace
    io.ts             File import/export, drag-and-drop
    export-presets.ts Social media presets + custom export
    logger.ts         Client-side logging (coloured timestamps)
public/
  index.html
  styles.css
  bundle.js           Built by esbuild (gitignored)
```

### API endpoints

| Method | Path               | Description                                                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------------ |
| POST   | `/api/png-to-svg`  | Upload image, returns SVG string. Params: `mode`, `nColors`, `turdSize`, `threshold` |
| POST   | `/api/save-svg`    | Save SVG string to uploads dir                                                       |
| POST   | `/api/export-png`  | Rasterise SVG to PNG at given dimensions (returns binary)                            |
| GET    | `/api/output-dir`  | Get configured output directory                                                      |
| POST   | `/api/output-dir`  | Set output directory                                                                 |
| POST   | `/api/save-to-dir` | Save PNG or SVG to the configured output directory                                   |

### Conversion modes in detail

**High Quality mode** — the default. The original PNG is embedded as a base64 `<image>` element inside the SVG (`#pixel-layer`). A full vector trace is also generated and stored in a hidden `<g id="vector-layer">`. This gives pixel-perfect display while keeping vector paths available for editing operations like smoothing and recolouring. Images over 1200px are resized before tracing (potrace is slow on large inputs).

**Color vector mode** — pure vector output. The image is colour-quantised using sharp's palette mode (dithering off) into N colours. A binary mask is traced with potrace for each colour, producing a stack of filled path layers ordered lightest-first so darker layers paint on top. Original pixel colours are sampled and averaged per quantised region for richer fills.

**Monochrome** — single potrace pass with a brightness threshold.

### Recolouring

In **HQ mode**, recolouring applies an SVG `feColorMatrix` filter to the embedded `<image>`. The matrix implements a **duotone luminance-mapping** transform:

- Pixel luminance is computed using ITU-R BT.709 perceptual weights: `L = 0.213R + 0.715G + 0.072B`
- This luminance is mapped linearly from the range [0, 1] onto a gradient from the picked dark colour to a computed lighter shade
- Black pixels → exactly the picked colour. White pixels → computed light colour. Everything in between is interpolated proportionally.
- The depth slider shifts the lightness and saturation of the light end (lower = more contrast, higher = more washed out)
- The lightness slider updates the picked colour in real time, tracking the hue and saturation of the last wheel click so all three controls remain live simultaneously

In **vector mode**, recolouring walks all SVG elements and replaces each `fill`, `stroke`, and `stop-color` attribute by mapping through HSL space, preserving relative luminance.

### Smoothing

Path smoothing runs on the client:

1. Compound paths are split at each `M` command into individual subpaths
2. Ramer-Douglas-Peucker point reduction is applied (tolerance proportional to the smoothing amount)
3. Simplified points are rebuilt as smooth cubic beziers using Catmull-Rom spline interpolation

In HQ mode, applying smoothing switches the visible layer from pixel to vector.

### Undo / redo

Every destructive operation pushes the full SVG string onto a history stack (max 50 entries). Undo/redo swap the current SVG with the previous/next entry and re-render.

### Build pipeline

```bash
npm run build        # server (esbuild → dist/server.js) + client (esbuild → public/bundle.js)
npm run dev          # watch mode via tsx + concurrently
npm run typecheck    # tsc --noEmit (types only)
```

esbuild was chosen over webpack/Vite for its near-instant rebuild times. No config complexity.
