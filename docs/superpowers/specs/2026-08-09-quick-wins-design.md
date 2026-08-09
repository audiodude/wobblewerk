# Wobblewerk Round 2, Spec B — Quick Wins: palettes, grain, S/M/L sheets

**Date:** 2026-08-09
**Status:** implemented (see docs/superpowers/plans/2026-08-09-quick-wins.md)
**Prereq reading:** `2026-08-08-wobblewerk-design.md` (v1 spec — covenant, data model, vintage policy)

## Context

Round 2 of wobblewerk splits into two specs. This one (Spec B, built first) is the
quick-win bundle: two new palettes, a global paper-grain dial, and a small/medium/large
sheet-size picker. Spec A (next cycle) is the shape-source × region-fill grid: lasso /
click-polygon / dragged-primitive outlines feeding hexpack plus new solid, stripe, dot,
and scatter fills, with "stamps" as named presets over that grid and a user-customizable
stamp library as a later TODO.

## New covenant: WYSIWYG at default zoom

**Whatever Reset Zoom shows is what the PNG contains.** Same composition, same
mark-to-sheet proportions, same grain — differing only by one uniform resolution factor
(2 sheet-units → px), constant across all sheet sizes. Zero surprises when you open your
PNG.

Corollary: **no screen-only visuals.** Every visible effect must live in the SVG DOM that
the exporters serialize (inside `svg#sheet`, not in stage CSS or overlays that exports
strip). Grain is therefore an in-DOM SVG filter, never a stage decoration.

## Feature 1: two new palettes

Appended to `PALETTES` in `src/model/palettes.ts`. Zero new UI — the existing select,
swatch strip, pin, and re-slot flows pick them up automatically.

| id | label | paper | inks |
|---|---|---|---|
| `constructivist` | Constructivist | `#f2e6d0` aged cream | `#d33f2e` revolutionary red, `#211d1a` soot black, `#8a7f72` warm grey |
| `neon` | Neon on black | `#1b1b1e` near-black | `#2de1fc` cyan, `#ff3d9e` magenta, `#b8f533` lime, `#ffb52e` amber |

Neon is the first dark paper. The slot-ref color model needs no changes; the selection
halo and paper drop-shadow get a visual check against dark paper during implementation
(adjust halo styling only if it is genuinely invisible — not speculatively).

## Feature 2: global grain dial

A second per-sheet global dial, directly under `hand` in the rail, labeled `grain`
(lowercase, same style).

- **Model:** `Scene.grain: number` (0–1), default `0`. Serialized with the scene; file
  format stays version 1 — `deserializeScene` treats a missing/invalid `grain` as `0`,
  so every existing autosave and .json file remains valid.
- **Behavior:** identical event contract to the hand dial — live re-render on `input`,
  exactly one history commit on `change`. Undo/redo restores the dial position
  (`refreshChrome` syncs it, like `hand`). Grain touches no strokes: no re-bake, no
  vintage interaction, palette-independent state.
- **Rendering:** one `<rect class="grain">` covering the sheet, rendered above the paper
  rect and below `g.strokes`, carrying an `feTurbulence` (`fractalNoise`, **fixed seed**
  so re-renders are deterministic) filter defined in `<defs>`. Dial drives the rect's
  opacity (0 = rect hidden or opacity 0). Speckle tone is computed from the palette's
  paper luminance: dark speckle on light paper, light speckle on dark paper.
- **Export:** because the rect + filter live inside `svg#sheet`, `exportSvgString` and
  `exportPngBlob` include them with no exporter changes beyond *not* stripping them
  (exporters strip `.live`/`.overlay`/`.hit` only). Verify Inkscape renders the filter
  (feTurbulence is core SVG 1.1) and that `artworkClip` ignores the grain rect when
  computing the ink bbox (it reads stroke bakes only — confirm, don't assume).

## Feature 3: S/M/L sheet sizes with constant-scale viewport

### Size picker

The new-sheet dialog gains a size row (radio-style buttons **S / M / L**, default **S**)
above the existing three orientation buttons. Orientation buttons' printed dimensions
update live as the size selection changes.

| | S | M | L |
|---|---|---|---|
| square | 800 × 800 | 1200 × 1200 | 1600 × 1600 (today's) |
| portrait | 800 × 1000 | 1200 × 1500 | 1600 × 2000 (today's) |
| landscape | 1000 × 800 | 1500 × 1200 | 2000 × 1600 (today's) |

Derivation: base side `b ∈ {800, 1200, 1600}`; square `b×b`, portrait `b × 1.25b`,
landscape `1.25b × b`. L equals the current presets exactly.

`Scene.sheet {w, h}` is unchanged — no schema or file-format change.

### Constant-scale viewport (the WYSIWYG half)

Marks are fixed-size in sheet units, so a smaller sheet must *look* smaller, not zoomed:

- **Reset Zoom rule:** fit the sheet's **L-equivalent** — `(w × k, h × k)` where
  `k = 1600 / min(w, h)` — then center the real sheet in that view. For L sheets `k = 1`
  and behavior is pixel-identical to today. An S sheet renders at exactly half the
  on-screen size of its L sibling, matte around it, marks identical in on-screen size.
- `k` is derived from dims alone: old files (all L-sized) behave exactly as before.
- Free wheel-zoom and space-pan are unchanged; this only redefines what `doFit()`
  (Reset Zoom, Ctrl+0, window resize, sheet-change refit) converges to.
- PNG export already rasterizes at 2 px per sheet unit regardless of sheet size, so
  export density is constant across S/M/L and matches the covenant.

## Feature 4: hand-pass scale fix (required for S/M/L correctness)

`handPass` multiplies wobble amplitude, resample step, and closed-gap size by
`sheetW / 1600`. That rule assumed marks scale with the sheet; they never did. On an
800-wide sheet it would halve the wobble while marks stay fixed-size — small sheets
would read mechanically *cleaner*, the opposite of the intended chunky feel.

**Change:** remove the `sheetW` parameter from `handPass` entirely (constant `scale = 1`
behavior); update `runPipeline` and tests accordingly. Stroke width had the same
`sheetW / 1600` factor in `runPipeline` — it is removed in the same change (baked width
= `brush.strokeWidth`, constant).

**Preservation impact:** zero for any 1600-wide sheet (scale was already 1). Existing
2000-wide landscape drawings re-bake with ~20% less wobble **only when a stroke is next
touched** (re-roll/re-param/hand-dial); frozen bakes render unchanged forever, per the
v1 preservation policy. No brush version bump: brush outputs (ideal geometry) are
unchanged — this alters only the shared hand pass, same category as tuning the hand
dial's feel.

## Testing

Unit (Vitest):
- palettes: new entries exist, `resolveInk` modulo across 3- and 4-ink sets, paper hexes.
- persist: scene with `grain` round-trips; legacy JSON without `grain` deserializes to 0;
  invalid grain values rejected/defaulted consistently with existing validation style.
- scene: `newScene` carries `grain: 0`; a `setGrain` mutation clamps to [0, 1].
- viewport: the L-equivalent fit rule — L sheets identical to current `fit`; S square
  yields exactly half the scale of L square; centering.
- hand: `handPass` output is independent of sheet width (same input → same output where
  the old code diverged); existing hand tests updated for the removed parameter.
- new-sheet presets: the 9 size×orientation combinations produce the table above.

E2e (Playwright):
- grain dial: move it → grain rect visible in DOM with expected opacity; one history
  entry (single Ctrl+Z restores 0 and hides it); survives reload via autosave; appears
  in exported SVG string.
- size picker: S + square → scene.sheet 800×800 and the on-screen sheet rect is ~half
  the width of an L square's at Reset Zoom.
- neon palette: swap to it → paper rect fill `#1b1b1e`, stroke re-skins to a neon ink,
  halo still visible (has a stroke width > 0 and distinct color).

## Documentation

README: palette list gains the two new entries; a short "Sheet sizes" note (S/M/L, marks
are fixed-size so small sheets read bolder); grain dial added to the global-dials
description; shortcuts table unchanged.

## Out of scope

Spec A (next cycle): shape sources (click-polygon, dragged primitives rect / ellipse /
triangle / quarter-circle), new region fills (solid, stripes, dots, scatter), stamps as
presets over source × fill × params, user-customizable stamp library (explicit TODO).
Also out: palette editor, per-palette baked texture levels, ink character (nib/marker
rendering), size picker persistence of last-used choice.
