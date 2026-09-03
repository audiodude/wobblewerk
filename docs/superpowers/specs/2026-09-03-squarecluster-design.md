# Wobblewerk Round 3 — Squarecluster brush; hexpack hidden

**Date:** 2026-09-03
**Status:** Approved (grilled interactively; every decision below ratified by user)
**Prereq reading:** `2026-08-08-wobblewerk-design.md` (covenant, data model, vintage policy),
`2026-08-09-quick-wins-design.md` (WYSIWYG covenant)

## Context

A fresh notebook page reset the roadmap. Its dominant mark — the top half of the page — is
clusters of small overlapping and nested squares in chains, not the primitive-shape ×
pattern-fill grid that Spec A had sketched. This round builds that mark as a new region
brush, **squarecluster**, and hides **hexpack** from the UI: as shipped it is unwieldy and
unused, and its region-loop machinery is what squarecluster repurposes. Spec A's shape
sources and pattern fills are deferred, not cancelled.

Nothing in the covenant changes. Scene file format stays version 1. No brush version bumps.

## Feature 1: hexpack hidden (UI-only removal)

Hexpack leaves the instrument but not the codebase.

**Removed:**
- The `Hexpack` toolbar button in `index.html`.
- `"2": "hexpack"` from `TOOL_KEYS` in `src/main.ts` (key `2` is reassigned, see below).
- `"hexpack"` from the `Tool` union in `src/ui/app-state.ts` and from `DragTool` /
  `isBrushTool` in `src/ui/draw.ts`.

**Kept:** `src/brushes/hexpack.ts`, its registration in `BRUSHES`, and `tests/hexpack.test.ts`.
Consequences, all by existing mechanisms:
- Saved sheets containing hexpack strokes render, autosave, export, and re-load unchanged.
- The select tool still opens a hexpack stroke's param panel (`panel.ts` reads
  `BRUSHES[stroke.brush].params`); re-roll, re-param, re-slot, and delete keep working.
- Hexpack strokes are not vintage (`brushVersion` still matches), so the hand dial
  regenerates them as before.

README: the Hexpack section under "Brushes/Tools/Strokes Reference" is removed; one line
under Development notes that hexpack is hidden from the toolbar and existing sheets
containing it still render and remain editable.

## Feature 2: squarecluster brush

### Identity

| field | value |
|---|---|
| `id` | `squarecluster` |
| toolbar label | Squares |
| key | `2` (path / region / point order is preserved: `1` zigzag, `2` squares, `3` sunstamp) |
| `inputKind` | `region` |
| `version` | 1 |
| `strokeWidth` | 3 (same as zigzag) |
| `handDamping` | 1 (same as zigzag) |

Registered in `BRUSHES`; added to `Tool`, `DragTool`, `TOOL_KEYS`, and the toolbar.

### Interaction

Identical to hexpack's: pointerdown–drag–up sweeps a loop; while dragging the renderer
shows the dashed ghost of the loop (`renderer.renderGhost`); on release the brush packs
and the stroke commits (auto-selected, per the existing `onStrokeCommitted` flow). No live
full-pipeline preview — the walk is seeded from loop geometry and would jump each frame.

A degenerate release (fewer than 3 points, or a loop whose packing yields zero squares)
commits nothing, as today.

### Loop handling

The gesture is closed by re-appending its first point and resampled at 6 px, exactly as
hexpack does. There is **no `simplify` param** and **the boundary is never drawn**: the
resampled loop is used raw, only for containment tests and area.

### Params (five; the panel has no cap on count)

| key | label | range | default | meaning |
|---|---|---|---|---|
| `size` | size | 8–60 | 22 | mean square edge, sheet px |
| `density` | density | 0.1–3 | 1 | squares per `size²` of loop area |
| `variance` | variance | 0–1 | 0.4 | edge spread: edge = `size × (1 + (u·2−1) × 0.5 × variance)` |
| `nesting` | nesting | 0–1 | 0.3 | P(square gets an inner square); P(double nested) = `nesting²` |
| `overlap` | overlap | 0–1 | 0.5 | step length between consecutive squares as a fraction of the current edge: `1.3` at 0 (small gaps) → `0.35` at 1 (heavy stacking), linear |

Ranges are clamped by `sanitizeParams` in `runPipeline`; `size ≥ 8` and `density ≤ 3`
together bound the square count for any sheet-sized loop (a 2000×1600 loop at
`size = 8`, `density = 3` is 150k squares — see the hard cap below).

### Packing model: random-walk chains

Every square is a step in a chain; a chain is a random walk.

1. **Budget.** `area` = polygon area of the resampled loop (shoelace).
   `total = round(density × area / size²)`, minimum 1.
2. **Chains.** Chains have mean length 10, jittered: each chain's target length is
   `round(10 × (1 + (u·2−1) × 0.5))`, i.e. 5–15, clipped to the remaining budget.
3. **Start points.** The first chain starts at the loop's centroid (area centroid; if
   that lands outside a concave loop, fall back to a random interior point). Every
   subsequent chain starts at a random interior point, rejection-sampled uniformly from
   the loop's bbox (up to 50 tries; if all fail, packing stops).
4. **Steps.** From the current square's center, pick a uniform random angle `θ ∈ [0, 2π)`
   and move `step = edge × lerp(1.3, 0.35, overlap)` along it, where `edge` is the
   current square's edge. Draw the next square there with a freshly rolled edge.
5. **Containment.** A square is kept iff its **center** is inside the loop
   (`pointInPolygon`). Straddling is allowed by design: at most ~half a square pokes out,
   giving the page's ragged cluster edges.
6. **Early termination.** A step whose center lands outside the loop ends the chain. Its
   unplaced budget is not lost: a new chain starts (rule 3) with the remainder, so
   `density` holds. Hard stop when `chains ≥ max(4, ceil(total / 5))` or the budget is
   spent, whichever first — this bounds work when the loop is thin and most steps exit.
7. **Hard cap.** Total placed squares never exceed 4000 per stroke, regardless of params.
   Baked path count is what the DOM and exporters carry; 4000 outer + inner paths keeps
   a worst-case stroke under the existing 10k-path test ceiling.

RNG draw order per square is fixed (edge roll, nesting roll, double-nesting roll, angle
roll) so output is deterministic for a `(loop, params, seed)` triple and stable when a
later square is dropped.

### Geometry

- Squares are **axis-aligned**; no per-square rotation. The hand pass supplies wobble.
- Each square is one closed, stroked, unfilled `IdealPath` of 4 corners.
- **Nested squares:** with probability `nesting`, a concentric inner square at
  `0.55 × edge` (jittered ±0.05) is emitted as its own `IdealPath` — so the hand pass
  wobbles it independently of its parent. With probability `nesting²` (rolled only if the
  first passed) a second inner square at `0.55²` of the outer is added.
- Emission order: outer, then inner, then inner-inner, chain by chain. Order affects only
  which square is drawn on top of which in overlaps; all paths share the stroke's color.

### Color

Squarecluster uses the existing slot rotation / pin flow unchanged: one `colorSlot` per
stroke. Two-color clusters (as on the page) are made by drawing two strokes.

## Testing

Unit (Vitest), `tests/squarecluster.test.ts`:
- deterministic: same `(loop, params, seed)` → deep-equal output.
- every emitted path is a closed 4-point path; the center of every outer square is
  inside the loop; no boundary path is emitted (first path is a square, not the loop).
- `density` scaling: doubling the loop's linear size (4× area) yields ~4× the squares
  (within the tolerance the chain jitter and early-termination allow — assert a ratio in
  [2.5, 5.5]).
- `nesting = 0` → no inner squares; `nesting = 1` → every outer has an inner and an
  inner-inner (count relation exact: 3 paths per placed square).
- `overlap` monotonicity: mean distance between consecutive squares in a chain at
  `overlap = 1` is less than at `overlap = 0` for the same seed.
- degenerate input (< 3 points) → `[]`.
- hard cap: pathological params (`size = 8`, `density = 3`, sheet-sized loop) return in
  < 5 s with `< 10000` paths (mirrors the existing hexpack guard tests in
  `tests/generate.test.ts`).

Existing tests updated:
- `tests/sunstamp.test.ts` registry assertion → `["hexpack", "squarecluster", "sunstamp", "zigzag"]`.
- `tests/hexpack.test.ts` unchanged.

E2e (Playwright):
- `e2e/smoke.spec.ts`: the key-`2` drag-arc step now produces a squarecluster stroke
  (assert stroke count and that the stroke's `data-brush`, or equivalent, is
  `squarecluster`). `e2e/helpers.ts` comment on the region-closing behavior updated to
  name squarecluster.
- hexpack hidden: no toolbar button with `data-tool="hexpack"`; pressing `2` activates
  Squares.
- persistence: a fixture `.json` containing a hexpack stroke opens, renders the stroke,
  and selecting it shows the hexpack param panel.

## Documentation

README:
- Shortcuts table: `1` / `2` / `3` / `V` → zigzag / squares / sunstamp / select.
- Brush reference: Hexpack section removed; new "Squares (region tool — `2`)" section
  with the five params, ranges, and defaults, in the existing style.
- Development: one line noting hexpack is hidden from the toolbar but still renders and
  is editable in existing sheets.
- Features bullet list unchanged apart from replacing "hex-packed regions" wording in the
  tagline with squares.

## Out of scope

Chain branching (`branch` param — dropped from this round), a point-tool variant of the
cluster, per-square tilt, hexpack's return (it comes back only once repurposed with
per-cell interior variety: hatch / spokes / nested box / oval, as seen on the page),
Spec A's shape sources and pattern fills, hook stamps, connector lines, asemic scribble.
