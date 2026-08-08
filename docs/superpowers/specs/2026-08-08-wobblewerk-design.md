# Wobblewerk — Design Spec

**Date:** 2026-08-08
**Status:** Approved (brainstormed + grilled interactively; all decisions ratified by user)
**Deploy target (future):** Cloudflare Pages at `wobble.audiodude.xyz`

## Mission

A web-based procedural sketch **instrument** that makes marks in the visual language of the
user's notebook pages: axis-aligned zigzag staircase walks in cycling marker colors, regions
packed with wobbly hexagons, sun/burst glyphs — with future growth toward Bauhaus/
Constructivist styles (pattern fills, multi-stripe motifs, filled geometric stamps).

It is three things at once:

1. **Instrument** — you draw gestures; brushes render them in the mark language. Drawing feels
   like drawing.
2. **Generator** — every stroke is a seeded recipe; re-roll it, re-parameterize it, re-skin the
   whole sheet.
3. **Toy** — small, opinionated, fun. The constraint *is* the feature.

## The Covenant (non-negotiable scope rules)

**Instrument, never an editor.** Editing is limited to: undo/redo, select a stroke to
**re-roll**, **re-parameterize**, **re-slot color**, or **delete** it. That is the complete
list, forever.

Never-list: no moving strokes, no resize, no rotate, no bezier/vertex editing, no grouping,
no boolean ops, no text tool, no snapping, no alignment tools, no layers panel.
The escape hatch for all editor desires: **Export SVG → open in Inkscape.** The two tools
compose; we never build a worse Inkscape.

**Param cap:** every brush exposes at most **4** parameters, as sliders only. A brush that
needs a 5th gets redesigned, not a 5th slider.

## Data Model

```ts
type SlotRef = number;              // index into palette; 0 = paper, 1..n = inks

interface Scene {
  version: 1;                       // file-format version
  sheet: { w: number; h: number };  // px
  paletteId: string;                // references built-in palette presets
  hand: number;                     // 0..1 global hand-wobble dial
  strokes: Stroke[];                // z-order = array order (append = on top)
}

interface Stroke {
  id: string;
  brush: string;                    // brush id, e.g. "zigzag"
  brushVersion: number;             // integer version of the algorithm that baked it
  input: BrushInput;                // the gesture, in sheet coordinates
  seed: number;                     // uint32
  params: Record<string, number>;   // slider values, keys defined by the brush
  colorSlot: SlotRef;               // ink slot (never an RGB value)
  baked: BakedPath[];               // cached final geometry (post-hand-pass)
}

type BrushInput =
  | { kind: "point";  at: XY }
  | { kind: "path";   points: XY[] }     // raw pointer samples (the spine)
  | { kind: "region"; points: XY[] };    // raw loop; closed + simplified by the brush

interface BakedPath {
  d: string;                        // SVG path data
  stroke: boolean;                  // stroked with the stroke's ink slot?
  fill: boolean;                    // filled with the stroke's ink slot? (v1 brushes: false)
  width: number;                    // stroke width in sheet px (0 if !stroke)
}
```

Colors are **resolved at render time** from `colorSlot` → palette. Baked geometry never
contains color. Consequence: palette swaps recolor *everything*, including vintage strokes.

### Brush interface

```ts
interface BrushDef {
  id: string;
  version: number;                  // bump on any change to generated output
  inputKind: "point" | "path" | "region";
  handDamping: number;              // 0..1 multiplier applied to the global hand dial
  strokeWidth: number;              // default width in sheet px (at 1600px sheet width)
  params: ParamDef[];               // length <= 4
  generate(input: BrushInput, params: Record<string, number>, rng: Rng): IdealPath[];
}

interface ParamDef { key: string; label: string; min: number; max: number; default: number }

interface IdealPath { points: XY[]; closed: boolean; stroke: boolean; fill: boolean }
```

`generate` must be a **pure function** of `(input, params, seed)`. Determinism is a hard
requirement: the same triple always yields identical geometry.

**Prefix stability (path brushes only):** generators must consume the spine sequentially so
that with a fixed seed, a longer spine produces output whose prefix matches the shorter
spine's output. This is what makes live ink flicker-free without any incremental API — the
app just regenerates the whole stroke per pointermove.

### Generation pipeline

```
gesture → brush.generate(input, params, rngA) → ideal paths
        → handPass(ideal, hand * brush.handDamping, rngB) → wobbled paths
        → bake to BakedPath[] (d strings)  → render via palette
```

`rngA` and `rngB` are independent streams derived from the stroke seed (e.g. sfc32 seeded
with `seed` and `seed ^ 0x9e3779b9`). The hand pass draws only from `rngB`, so moving the
dial rescales the *same* tremor rather than re-rolling its character.

## The Hand Pass

One shared post-process that turns ideal geometry into hand-drawn geometry. Behavior:

- `hand = 0` → **identity**. Output must be exactly the ideal paths (Bauhaus-clean).
- Increasing `hand`: resample each path to ~8px intervals, displace each vertex
  perpendicular to the path with smooth 1D value-noise (amplitude ≈ `hand * damping * 4px`
  at 1600px sheet width, wavelength ~40px), plus low-frequency drift; at `hand > 0.5`,
  corners gain slight overshoot and closed shapes may under-close by a few px (page-2
  hexagon character).
- Deterministic from `rngB`; noise phase fixed per stroke so dial drags animate amplitude,
  not shape.

The hand dial is **global, one per drawing**. Per-brush `handDamping` is baked into brush
definitions (e.g. a future frame brush can be steadier); it is not UI.

## v1 Brushes (one per input kind)

### zigzag (path) — the flagship

Gesture-as-spine: axis-aligned staircase walk that tracks the drawn spine within a corridor.
Segments are strictly horizontal/vertical (sheet axes) in the ideal geometry; the hand pass
supplies all waver. Walk decisions (run lengths, turn points, occasional backtracks) come
from `rngA`.

| param | range | default | meaning |
|---|---|---|---|
| runLength | 8–80 px | 28 | mean straight-run length (runs are randomized around it) |
| jaggedness | 0–1 | 0.5 | variance of run lengths + probability of extra micro-steps |
| hug | 0–1 | 0.6 | corridor tightness: 1 = clings to spine, 0 = wanders freely |
| reversals | 0–1 | 0.15 | probability of a brief doubling-back (the page-1 stutters) |

### hexpack (region)

Loop gesture → auto-closed on release → boundary simplified (RDP, tolerance driven by the
`simplify` param: high tolerance collapses a lazy loop to a few near-straight edges — the
page-2 wedge). The boundary itself is always inked in v1 (matches the notebook; an
uninked-region variant is a future change). The interior is packed with wobbly-sized
hexagons — loose, gappy, occasionally overlapping — each fully inside the boundary; a
fraction get a small oval "nucleus".

| param | range | default | meaning |
|---|---|---|---|
| cellSize | 20–120 px | 55 | mean hexagon diameter |
| looseness | 0–1 | 0.4 | packing irregularity: jitter, gaps, size variance |
| nucleus | 0–1 | 0.3 | probability a hexagon contains an oval nucleus |
| simplify | 0–1 | 0.5 | RDP tolerance for the boundary (0 = raw loop, 1 = few straight edges) |

### sunstamp (point)

Click places a page-1-style sun: a wobbly circle ringed by dots/dashes. Cursor shows a live
ghost preview before the click.

| param | range | default | meaning |
|---|---|---|---|
| size | 12–120 px | 40 | core circle diameter |
| ringDensity | 0–1 | 0.6 | how many satellites ring the circle |
| ringDistance | 0–1 | 0.4 | gap between circle and satellites |
| dashMix | 0–1 | 0.2 | 0 = all dots, 1 = all dashes |

## Color System

- A palette = ordered slots: slot 0 **paper**, slots 1..n **inks**. Strokes store slot
  indices; render resolves `colorSlot` as `1 + (colorSlot - 1) % inkCount` so palettes of
  different sizes stay valid.
- **Auto-rotate:** by default each new stroke takes the next ink slot in rotation (page-1
  color cycling for free). **Click a swatch to pin** all upcoming strokes to that slot;
  click the `auto` chip to resume rotation. Selected strokes can be re-slotted.
- v1 ships **preset palettes only** (no palette editor): `notebook` (white; teal, orange,
  purple, magenta, olive — page 1), `ballpoint` (white; single dark violet-blue — page 2's
  feel), `blackwork` (white; black), `bauhaus` (cream; red, black, mustard, deep blue).
  Switching palettes re-renders the sheet instantly.

## Canvas & Viewport

- Fixed sheet, chosen at creation: square 1600×1600, portrait 1600×2000, landscape
  2000×1600. Paper color = slot 0. Sheet renders centered with a subtle shadow on a neutral
  app background.
- Wheel = zoom about cursor (0.25×–8×); Space+drag = pan; Fit button / `Ctrl+0` = fit sheet
  to window (also the initial view). Viewport is app state, not scene state (not saved).

## Interaction Model

Toolbar tools: **zigzag**, **hexpack**, **sunstamp**, **select** (keys `1 2 3 V`).

- **Path brush:** pointerdown starts the stroke (seed — any uint32 — chosen then); each
  pointermove appends to the spine and re-runs the full pipeline (generate **and** hand
  pass) with that fixed seed (**live ink** — the staircase grows under the cursor, prefix
  stable, and nothing jumps on release). Pointerup finalizes: bake + commit + history push.
- **Region brush:** while dragging, show the raw loop as a thin ghost trail (a region has no
  meaningful partial render). Pointerup auto-closes, simplifies, generates, commits.
- **Stamp:** ghost preview follows the cursor (current params + a preview seed); click
  commits it at that spot with that seed.
- **Select tool:** click = select topmost stroke within ~6px of rendered geometry;
  Esc/click-empty deselects. Selected stroke gets a highlight halo. Actions: **R** or
  `[re-roll]` button = new seed, same everything else; param-panel sliders = live
  re-parameterize; swatch click = re-slot; **Delete** = remove.
- Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo, `R` re-roll selection, `Delete` delete
  selection, `Esc` deselect, `Space` pan, `1/2/3/V` tools, `Ctrl+0` fit.

## Editing & History

Snapshot-based undo: after every committed mutation (stroke add, delete, re-roll, re-param
commit, re-slot, palette swap, hand-dial commit), push the serialized scene. Cap 100
entries. Slider drags (params, hand dial) coalesce into **one** entry per release.
`Ctrl+Z`/`Ctrl+Shift+Z` restore snapshots wholesale. Everything is undoable — re-roll must
never irrecoverably destroy a seed.

## Persistence

- **Autosave:** debounced ~300ms after any mutation → `localStorage["wobblewerk:autosave"]`.
  On load, restore it if present; else show the new-sheet chooser. Refresh must never lose
  work.
- **Save/Open `.json`:** download / file-input of the full `Scene` — recipes **and** baked
  geometry. Files are self-contained and small.

### Bake & vintage policy (brush drift)

Files store baked geometry so old drawings stay pixel-faithful forever, per stroke:

- A stroke is **vintage** iff `stroke.brushVersion !== currentBrush.version` (or its brush id
  no longer exists). Vintage strokes always render from their bake.
- Palette swaps and re-slots still affect vintage strokes (color lives outside the bake).
  The **hand dial does not** — regenerating is the only thing that would apply it.
- When the sheet contains vintage strokes and the user moves the hand dial, show an
  unobtrusive banner: "N vintage strokes unaffected — [Regenerate them]". The button
  migrates all vintage strokes to current brushes (one undoable history entry).
- Selecting a vintage stroke shows its params grayed out with "vintage (zigzag v1) —
  [Regenerate to edit]". Re-roll/re-param/re-generate migrates that stroke (undoable).
  Delete and re-slot work without migration.
- Non-vintage strokes regenerate freely whenever params/seed/dial change; their bake is
  just a cache that is always current.

## Export

- **SVG:** serialize the live sheet `<svg>` (paper rect + one `<path>` per stroke, subpaths
  for multi-path strokes; palette colors inlined as attributes). WYSIWYG by construction.
  Must open cleanly in Inkscape.
- **PNG:** rasterize the serialized SVG at **2×** sheet resolution via an offscreen canvas;
  download.

## UI Layout

Single screen, no routing. Left rail: tool buttons + param panel (title = brush/selection
name; ≤4 sliders) + hand dial. Top bar: palette strip (swatches + auto chip + palette
preset dropdown), undo/redo, Fit, New, Open/Save (.json), Export SVG/PNG. Center: the
sheet. Vintage banner slides in above the sheet when relevant. Aesthetic: calm, warm
off-white chrome that stays out of the artwork's way; the sheet is the hero. No framework
needed for this.

## Tech Stack & Architecture

Vanilla **TypeScript + Vite**, no UI framework. Render target: **SVG DOM** — one `<path>`
element per stroke (multi-path strokes become subpaths in one `d`), `<rect>` for paper.
Live updates touch only the affected path's `d`. Deploy (later): static build to Cloudflare
Pages, curated `dist/` only — never the project root.

```
src/
  model/types.ts       # Scene/Stroke/BrushDef/palette types
  model/rng.ts         # sfc32 + stream derivation
  model/geometry.ts    # resample, RDP simplify, point-in-polygon, polyline utils
  model/palettes.ts    # preset palettes
  hand/hand.ts         # the hand pass
  brushes/{zigzag,hexpack,sunstamp}.ts + index.ts (registry)
  engine/generate.ts   # stroke → baked paths (generate + hand + bake)
  engine/scene.ts      # scene mutations + vintage logic
  engine/history.ts    # snapshot undo/redo
  engine/persist.ts    # autosave + .json save/open
  render/svg.ts        # scene → SVG DOM, incremental updates
  render/viewport.ts   # zoom/pan/fit
  export/{svg,png}.ts
  ui/                  # toolbar, palette strip, param panel, dial, dialogs, banner
  main.ts
```

## Testing

- **Vitest** on the pure engine: determinism (same triple → identical output), zigzag prefix
  stability, hand=0 identity, RDP behavior across the simplify range, hexpack containment
  (all hexagons inside boundary), scene mutation + vintage gating logic, history
  push/undo/redo/coalesce, `.json` round-trip with bake fidelity (bytes of `baked` equal
  after save→load).
- **Playwright** smoke (dev-only, headless Chromium): draw a zigzag via synthesized pointer
  events → a path appears; undo → it disappears; export SVG → string contains the path;
  reload → autosave restored.

## Success Criteria

**Gate 1 — verifiable (Claude's):**
- Recreate a page-1-style piece (field of color-cycling zigzag walks) in ~2 min of drawing.
- Recreate a page-2-style piece (near-straight wedge, hex-packed, inked boundary) in ~2 min.
- Hand dial 0→1 visibly sweeps the whole sheet clean→notebook.
- Exported SVG opens cleanly in Inkscape; exported PNG matches the screen.
- Refresh mid-drawing loses nothing; save→open `.json` round-trips exactly (including bake).
- All tests pass.

**Gate 2 — feel (user's):** 20 unforced minutes of play, wanting more.

## Out of Scope for v1 (future brushes/features the architecture must not preclude)

Partition/tile layout generators (patchwork sheets), pattern-fill region brushes (stripes,
dots, concentric, crosshatch), multi-stripe path brushes (mid-century arches/waves),
scatter distributors, filled-shape Bauhaus stamps (the `fill` flag already exists), hook
stamps, palette editing, uninked regions, per-stroke hand override, stroke move/drag, iPad/
touch UI, deploy pipeline.
