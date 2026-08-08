# Wobblewerk

A web-based procedural sketch **instrument** — draw gestures; brushes render them in your notebook's visual language: wobbly zigzags, hex-packed regions, and sun glyphs.

## The Covenant

**Wobblewerk is an instrument, not an editor.** You draw, adjust, and re-roll strokes. That is all.

No moving, resizing, rotating, bezier editing, or alignment tools. If you need that level of control, **export your drawing as SVG and open it in Inkscape.** The two tools compose perfectly — we never try to be a worse Inkscape.

## New Sheet

On first launch, choose your sheet size:

- **Square**: 1600×1600 px
- **Portrait**: 1600×2000 px (tall, like a notebook page)
- **Landscape**: 2000×1600 px (wide)

The size picker also appears via the `New` button. Creating a new sheet or opening a file is an **undoable boundary** — `Ctrl+Z` restores your previous drawing completely.

## Drawing

| Key/Action | Purpose |
|---|---|
| `1` / `2` / `3` / `V` | Select zigzag / hexpack / sunstamp / select tool |
| `R` or [re-roll] | New seed for selected stroke (keep everything else) |
| `Delete` / `Backspace` | Delete selected stroke |
| `Esc` | Deselect |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo (snapshot history, 100 entries max) |
| `Ctrl+0` | Fit sheet to window |
| Mouse wheel | Zoom (0.25× to 8×) |
| `Space` + drag | Pan viewport |

## Brushes

Each stroke is a seeded recipe: change the seed, adjust up to 4 parameters, or re-color it.

### Zigzag (path tool — `1`)

Gesture-as-spine: axis-aligned staircase walk. The hand wobbles all horizontals/verticals.

- **runLength** (8–80 px, default 28): mean straight-run length
- **jaggedness** (0–1, default 0.5): variance + micro-step frequency
- **hug** (0–1, default 0.6): corridor tightness (1 = cling to spine, 0 = wander freely)
- **reversals** (0–1, default 0.15): probability of stuttering doubling-back

### Hexpack (region tool — `2`)

Click and drag a closed loop. The boundary is inked; the interior packs wobbly hexagons.

- **cellSize** (20–120 px, default 55): mean hexagon diameter
- **looseness** (0–1, default 0.4): packing irregularity (jitter, gaps, size variance)
- **nucleus** (0–1, default 0.3): probability each hexagon has a small oval core
- **simplify** (0–1, default 0.5): boundary smoothing (0 = raw loop, 1 = few straight edges)

### Sunstamp (point tool — `3`)

Click to place a sun: wobbly circle ringed by dots or dashes. Ghost preview follows your cursor.

- **size** (12–120 px, default 40): core circle diameter
- **ringDensity** (0–1, default 0.6): how many satellites ring it
- **ringDistance** (0–1, default 0.4): gap between circle and satellites
- **dashMix** (0–1, default 0.2): 0 = all dots, 1 = all dashes

## Palettes

Preset color schemes (select from the palette strip or dropdown):

- **Notebook** (page 1): white paper; teal, orange, purple, magenta, olive inks.
- **Ballpoint** (page 2): white paper; single dark violet-blue ink.
- **Blackwork**: white paper; black ink only.
- **Bauhaus**: cream paper; red, black, mustard, deep blue inks.

By default, each new stroke rotates through available inks automatically. Click an ink swatch to pin upcoming strokes to that color; click the `auto` chip to resume rotation. Selected strokes can be re-slotted to any ink.

## Hand Dial

Drag the **hand** dial (left panel, 0–1) to sweep your sheet from crisp/clean (0) to notebook-sketch loose (1). Hand wobble is globally live and undoable. Vintage strokes (from older brush versions) render from their baked geometry and aren't affected by hand changes until regenerated.

## Files

Wobblewerk saves to `.json` files — recipe + baked geometry, self-contained and small:

- **Autosave** (~300ms debounce): stored in browser localStorage. Refresh never loses work.
- **Save/Open**: download full `.json` or load one via file dialog.
- **Vintage policy**: old strokes render from their baked geometry forever (pixel-faithful). When you update a brush, strokes created with an older version show a "regenerate to edit" prompt. Update them with the banner button or by re-rolling individually — completely undoable.

## Export

- **SVG**: full drawing, palette colors baked in, opens cleanly in Inkscape.
- **PNG**: rasterized at 2× sheet resolution.

## Development

```bash
npm run dev      # Start local dev server (Vite)
npm run test     # Run unit tests (Vitest)
npm run build    # Build for production
npm run preview  # Preview production build locally
npm run e2e      # Run end-to-end tests (Playwright)
```

Requirements: Node.js (modern, tested with asdf-managed versions).

## Status

**v1 feature-complete.** Not yet deployed; will live at `wobble.audiodude.xyz`.

77 unit tests + 1 e2e smoke test, all passing. Gate 1 (verification) complete.

---

Made with wobbles and intention. Draw.
