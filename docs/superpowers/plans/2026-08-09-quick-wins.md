# Quick Wins (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new palettes (Constructivist, Neon on black), a global paper-grain dial rendered as an in-DOM SVG filter, an S/M/L sheet-size picker with a constant-scale (WYSIWYG) viewport, and removal of all sheet-width scaling from the mark pipeline.

**Architecture:** Pure-logic changes land first with unit tests (palettes, scene/persist model, renderer grain layer, hand/width de-scaling, sheet-dims math, ViewBox fit rule), then the two UI wiring tasks (grain dial, size picker) verified by Playwright. No schema/file-format change: `Scene.grain` defaults to 0 for legacy files, sheet dims stay `{w, h}`.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest (jsdom) unit tests in `tests/`, Playwright e2e in `e2e/`. Repo root: `~/code/vibes/wobblewerk`.

**Spec:** `docs/superpowers/specs/2026-08-09-quick-wins-design.md` — read it first.

## Global Constraints

- **WYSIWYG covenant:** no screen-only visuals — every visible effect must live inside `svg#sheet` so `exportSvgString`/`exportPngBlob` carry it. PNG = Reset Zoom view at 2 px per sheet unit, for every sheet size.
- **Instrument covenant (v1 spec):** no move/resize/vertex editing; max 4 params per brush; sliders only.
- Zero runtime dependencies. TypeScript strict; `npm run build` must stay clean.
- Verification commands, from repo root: `npm test -- --run` (89 unit tests pre-plan), `npm run build`, `npm run e2e` (7 e2e tests pre-plan).
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Uncommitted work from the tweak session is already in the tree (auto-select feature, e2e hardening, `@vitest/coverage-v8` dev dep). Task 1's commit sweeps those in first as its own commit (see Task 1 Step 0).

---

### Task 1: New palettes (Constructivist, Neon on black)

**Files:**
- Modify: `src/model/palettes.ts` (append 2 entries to `PALETTES`)
- Test: `tests/palettes.test.ts` (append cases)

**Interfaces:**
- Consumes: existing `Palette` interface `{ id, label, paper, inks }`, `getPalette`, `resolveInk`.
- Produces: palette ids `"constructivist"` and `"neon"` — Task 3 relies on `"neon"` having dark paper `#1b1b1e` for the speckle-tone branch; e2e in Task 4/8 may select them via `#palette-select`.

- [ ] **Step 0: Commit the pre-existing tweak-session work as its own commit**

The tree already contains verified, uncommitted work that predates this plan. Commit it first so plan commits stay clean:

```bash
git add -A
git commit -m "$(cat <<'EOF'
Auto-select finished strokes + harden e2e suite

Finishing a stroke now selects it while the drawing tool stays active,
and param tweaks on it also update the brush defaults while the
matching tool is active. New chrome.spec.ts e2e file covers palette
swap/pin/reslot, hand dial, save-open roundtrip, re-roll, and the
Escape-mid-drag pendingEdit edge; helpers extracted to e2e/helpers.ts.
Adds @vitest/coverage-v8 (dev) and gitignores coverage/.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

Then verify a clean slate: `git status` shows nothing to commit; `npm test -- --run` and `npm run e2e` pass (89 + 7).

- [ ] **Step 1: Write the failing tests**

Append to `tests/palettes.test.ts` (keep existing tests untouched):

```ts
describe("round-2 palettes", () => {
  test("constructivist: cream paper, 3 inks, slot wraps past 3", () => {
    const p = getPalette("constructivist");
    expect(p.label).toBe("Constructivist");
    expect(p.paper).toBe("#f2e6d0");
    expect(p.inks).toEqual(["#d33f2e", "#211d1a", "#8a7f72"]);
    expect(resolveInk(p, 4)).toBe("#d33f2e"); // 1-based modulo wrap
  });

  test("neon: dark paper, 4 inks", () => {
    const p = getPalette("neon");
    expect(p.label).toBe("Neon on black");
    expect(p.paper).toBe("#1b1b1e");
    expect(p.inks).toEqual(["#2de1fc", "#ff3d9e", "#b8f533", "#ffb52e"]);
  });

  test("PALETTES has 6 entries, ids unique", () => {
    expect(PALETTES).toHaveLength(6);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(6);
  });
});
```

If the file doesn't already import `describe` / `PALETTES`, extend its imports (`import { describe, expect, test } from "vitest"` and `PALETTES` from `../src/model/palettes`).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/palettes.test.ts`
Expected: FAIL — `getPalette("constructivist")` falls back to notebook (its id lookup misses), length is 4 not 6.

- [ ] **Step 3: Implement**

In `src/model/palettes.ts`, append to the `PALETTES` array after the `bauhaus` entry:

```ts
  { id: "constructivist", label: "Constructivist", paper: "#f2e6d0",
    inks: ["#d33f2e", "#211d1a", "#8a7f72"] },
  { id: "neon", label: "Neon on black", paper: "#1b1b1e",
    inks: ["#2de1fc", "#ff3d9e", "#b8f533", "#ffb52e"] },
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run`
Expected: all unit tests pass (the palette select UI picks new entries up automatically from `PALETTES` — no other code change).

- [ ] **Step 5: Commit**

```bash
git add src/model/palettes.ts tests/palettes.test.ts
git commit -m "$(cat <<'EOF'
Add Constructivist and Neon-on-black palettes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `Scene.grain` model field + `setGrain` + persistence

**Files:**
- Modify: `src/model/types.ts` (Scene interface), `src/engine/scene.ts` (newScene, new `setGrain`), `src/engine/persist.ts` (validation + default)
- Test: `tests/scene.test.ts`, `tests/persist.test.ts` (append cases)

**Interfaces:**
- Consumes: `Scene` from `src/model/types.ts`, `isFiniteNumber` (module-local in persist.ts).
- Produces: `Scene.grain: number` (0–1), `setGrain(scene: Scene, grain: number): void` (clamps to [0,1], touches no strokes — exported from `src/engine/scene.ts`). `deserializeScene` guarantees `grain` is a clamped finite number (missing → 0) on every returned Scene. Tasks 3 and 4 rely on all of these.

- [ ] **Step 1: Write the failing tests**

Append to `tests/scene.test.ts`:

```ts
describe("grain", () => {
  test("newScene starts with grain 0", () => {
    expect(newScene(800, 800).grain).toBe(0);
  });
  test("setGrain clamps to [0, 1] and never touches strokes", () => {
    const scene = newScene(1600, 1600);
    const stroke = addStroke(scene, {
      brush: "zigzag",
      input: { kind: "path", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }] },
      seed: 7, params: { runLength: 28, jaggedness: 0.5, hug: 0.6, reversals: 0.15 }, colorSlot: 1,
    });
    const bakedBefore = JSON.stringify(stroke.baked);
    setGrain(scene, 0.5);
    expect(scene.grain).toBe(0.5);
    setGrain(scene, -1);
    expect(scene.grain).toBe(0);
    setGrain(scene, 2);
    expect(scene.grain).toBe(1);
    expect(JSON.stringify(stroke.baked)).toBe(bakedBefore); // no re-bake
  });
});
```

(Adjust imports at the top of the file: `setGrain` joins the existing `../src/engine/scene` import; `addStroke`/`newScene` are already imported there.)

Append to `tests/persist.test.ts`:

```ts
describe("grain persistence", () => {
  test("grain round-trips through serialize/deserialize", () => {
    const scene = newScene(1600, 2000);
    scene.grain = 0.7;
    expect(deserializeScene(serializeScene(scene)).grain).toBe(0.7);
  });
  test("legacy JSON without grain deserializes to grain 0", () => {
    const legacy = JSON.parse(serializeScene(newScene(1600, 2000)));
    delete legacy.grain;
    expect(deserializeScene(JSON.stringify(legacy)).grain).toBe(0);
  });
  test("non-numeric grain is rejected", () => {
    const bad = JSON.parse(serializeScene(newScene(1600, 2000)));
    bad.grain = "gritty";
    expect(() => deserializeScene(JSON.stringify(bad))).toThrow();
  });
  test("out-of-range grain is clamped on load", () => {
    const wild = JSON.parse(serializeScene(newScene(1600, 2000)));
    wild.grain = 9;
    expect(deserializeScene(JSON.stringify(wild)).grain).toBe(1);
  });
});
```

(Use the file's existing import style for `newScene`, `serializeScene`, `deserializeScene`, and `describe`.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/scene.test.ts tests/persist.test.ts`
Expected: FAIL — `grain` undefined on newScene, `setGrain` not exported.

- [ ] **Step 3: Implement**

`src/model/types.ts` — add `grain` to `Scene`:

```ts
export interface Scene {
  version: 1;
  sheet: { w: number; h: number };
  paletteId: string;
  hand: number;
  grain: number;
  strokes: Stroke[];
}
```

`src/engine/scene.ts` — extend `newScene` and add `setGrain` next to `setHand`:

```ts
export function newScene(w: number, h: number, paletteId = "notebook"): Scene {
  return { version: 1, sheet: { w, h }, paletteId, hand: 0.6, grain: 0, strokes: [] };
}
```

```ts
// Paper-level only: grain never touches strokes, so no re-bake and no
// vintage interaction (unlike setHand above).
export function setGrain(scene: Scene, grain: number): void {
  scene.grain = Math.min(1, Math.max(0, grain));
}
```

`src/engine/persist.ts` — in `isValidScene`, after the `hand` check, reject a present-but-broken grain (missing is fine — legacy files):

```ts
  if (s.grain !== undefined && !isFiniteNumber(s.grain)) return false;
```

In `deserializeScene`, normalize before returning so every loaded Scene satisfies the new interface:

```ts
export function deserializeScene(json: string): Scene {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("unsupported file"); }
  if (!isValidScene(parsed)) throw new Error("unsupported file");
  // Legacy files predate grain; clamp any stored value to the dial's range.
  parsed.grain = Math.min(1, Math.max(0, parsed.grain ?? 0));
  return parsed;
}
```

(If TypeScript complains that `grain` may be missing on the guarded type, have `isValidScene` guard as `value is Scene & { grain?: number }` — the normalization line above makes it a real `Scene`.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run` then `npm run build`
Expected: all pass; build clean (nothing else constructs Scene literals outside `newScene` — the compiler will confirm).

- [ ] **Step 5: Commit**

```bash
git add src/model/types.ts src/engine/scene.ts src/engine/persist.ts tests/scene.test.ts tests/persist.test.ts
git commit -m "$(cat <<'EOF'
Add Scene.grain with clamping setter and backward-compatible persistence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Grain layer in the renderer (+ export coverage)

**Files:**
- Modify: `src/render/svg.ts`
- Test: `tests/render.test.ts`, `tests/export.test.ts` (append cases)

**Interfaces:**
- Consumes: `Scene.grain` (Task 2), `Palette.paper` hex strings (always `#rrggbb`).
- Produces: `SheetRenderer.updateGrain(scene: Scene): void` (Task 4's dial calls it); DOM contract: `renderScene` always emits `g.grain-layer` (containing `defs > filter#ww-grain` and `rect.grain`) between `rect.paper` and `g.strokes`. Exporters need no change — they strip only `g.live`/`g.overlay`/`path.hit`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/render.test.ts` (it already builds a jsdom `svg` element and scenes; follow its existing fixture style):

```ts
describe("grain layer", () => {
  function grainScene(grain: number, paletteId = "notebook") {
    const scene = newScene(400, 400, paletteId);
    scene.grain = grain;
    return scene;
  }

  test("renderScene emits grain layer between paper and strokes", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(svg).renderScene(grainScene(0.5));
    const kids = Array.from(svg.children).map((c) => c.getAttribute("class"));
    expect(kids).toEqual(["paper", "grain-layer", "strokes", "live", "overlay"]);
    const rect = svg.querySelector("g.grain-layer rect.grain")!;
    expect(rect.getAttribute("opacity")).toBe("0.18"); // 0.5 * 0.35 rounded to 2dp
    expect(rect.getAttribute("filter")).toBe("url(#ww-grain)");
    const turb = svg.querySelector("g.grain-layer feTurbulence")!;
    expect(turb.getAttribute("seed")).toBe("7"); // fixed: deterministic grain
    expect(turb.getAttribute("type")).toBe("fractalNoise");
  });

  test("grain 0 renders the layer at opacity 0", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(svg).renderScene(grainScene(0));
    expect(svg.querySelector("rect.grain")!.getAttribute("opacity")).toBe("0");
  });

  test("speckle tone follows paper luminance: dark on light paper, light on dark", () => {
    const light = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(light).renderScene(grainScene(0.5, "notebook"));
    const dark = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(dark).renderScene(grainScene(0.5, "neon"));
    const values = (s: SVGSVGElement) => s.querySelector("feColorMatrix")!.getAttribute("values")!;
    expect(values(light)).toContain("0 0 0 0 0 "); // black speckle rows
    expect(values(dark)).toContain("0 0 0 0 1 "); // white speckle rows
  });

  test("updateGrain swaps opacity in place without touching strokes DOM", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    const r = new SheetRenderer(svg);
    const scene = grainScene(0);
    r.renderScene(scene);
    const strokesG = svg.querySelector("g.strokes");
    scene.grain = 1;
    r.updateGrain(scene);
    expect(svg.querySelector("rect.grain")!.getAttribute("opacity")).toBe("0.35");
    expect(svg.querySelector("g.strokes")).toBe(strokesG); // same node, untouched
  });
});
```

Append to `tests/export.test.ts` (it already has an svg+scene fixture for `exportSvgString` — reuse its setup):

```ts
test("exported SVG carries the grain layer (WYSIWYG covenant)", () => {
  const scene = newScene(400, 400);
  scene.grain = 0.6;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  new SheetRenderer(svg).renderScene(scene);
  const out = exportSvgString(svg, scene);
  expect(out).toContain("feTurbulence");
  expect(out).toContain('class="grain"');
});
```

(Add any missing imports — `SheetRenderer` from `../src/render/svg`, `newScene` from `../src/engine/scene`.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/render.test.ts tests/export.test.ts`
Expected: FAIL — no `g.grain-layer` in output, `updateGrain` doesn't exist.

- [ ] **Step 3: Implement**

In `src/render/svg.ts`, add module constants and a luminance helper near the top (after `r2`):

```ts
const GRAIN_FILTER_ID = "ww-grain";
const GRAIN_MAX_OPACITY = 0.35;

// Palettes always use #rrggbb. Rec. 709 luma; < 128 counts as dark paper.
function paperIsDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}
```

Add a private builder to `SheetRenderer` (next to `buildStrokeGroup`):

```ts
  // Paper grain: an feTurbulence-filtered rect between paper and strokes.
  // Lives in the sheet DOM (not stage CSS) so SVG/PNG exports carry it —
  // the WYSIWYG covenant. Fixed seed keeps it deterministic across renders.
  private buildGrainLayer(scene: Scene, palette: Palette): SVGGElement {
    const g = el("g");
    g.setAttribute("class", "grain-layer");

    const speckle = paperIsDark(palette.paper) ? 1 : 0;
    const defs = el("defs");
    const filter = el("filter");
    filter.setAttribute("id", GRAIN_FILTER_ID);
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    const turb = el("feTurbulence");
    turb.setAttribute("type", "fractalNoise");
    turb.setAttribute("baseFrequency", "0.9");
    turb.setAttribute("numOctaves", "2");
    turb.setAttribute("seed", "7");
    turb.setAttribute("stitchTiles", "stitch");
    const cm = el("feColorMatrix");
    cm.setAttribute("type", "matrix");
    // Rows 1-3 paint the speckle color; row 4 keys alpha off the noise.
    cm.setAttribute(
      "values",
      `0 0 0 0 ${speckle}  0 0 0 0 ${speckle}  0 0 0 0 ${speckle}  0 0 0 0.7 0`,
    );
    filter.append(turb, cm);
    defs.appendChild(filter);

    const rect = el("rect");
    rect.setAttribute("class", "grain");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(scene.sheet.w));
    rect.setAttribute("height", String(scene.sheet.h));
    rect.setAttribute("filter", `url(#${GRAIN_FILTER_ID})`);
    rect.setAttribute("opacity", String(r2(scene.grain * GRAIN_MAX_OPACITY)));
    rect.style.pointerEvents = "none";

    g.append(defs, rect);
    return g;
  }
```

In `renderScene`, insert the layer between paper and strokes:

```ts
    this.svg.appendChild(paper);
    this.svg.appendChild(this.buildGrainLayer(scene, palette));
```

Add the public update method (next to `setSelection`):

```ts
  // Dial-drag path: replace only the grain layer (turbulence recomputes, but
  // strokes/selection DOM stay untouched — no full renderScene per input tick).
  updateGrain(scene: Scene): void {
    const layer = this.svg.querySelector<SVGGElement>("g.grain-layer");
    if (!layer) return; // renderScene hasn't run yet
    layer.replaceWith(this.buildGrainLayer(scene, getPalette(scene.paletteId)));
  }
```

Note: `renderScene` already reruns on palette change, so the speckle tone re-derives automatically when swapping to/from neon. `artworkClip` reads only stroke bakes (verified), so PNG clipping ignores grain.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run` then `npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/svg.ts tests/render.test.ts tests/export.test.ts
git commit -m "$(cat <<'EOF'
Render paper grain as an in-DOM feTurbulence layer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---### Task 4: Grain dial UI wiring + e2e

**Files:**
- Modify: `index.html`, `src/styles.css`, `src/ui/chrome.ts`, `src/main.ts`
- Test: `e2e/chrome.spec.ts` (append one test)

**Interfaces:**
- Consumes: `setGrain` (Task 2), `renderer.updateGrain` (Task 3), existing `ChromeDeps` pattern and `commit()`/`refreshChrome()` in main.ts.
- Produces: `#grain-dial` DOM (label `grain`, `input#grain-range`), `ChromeDeps.grainDial/onGrainInput/onGrainCommit`. Same event contract as the hand dial: live on `input`, one history commit on `change`, `refreshChrome` re-syncs the dial after undo/redo/open/new.

- [ ] **Step 1: Add the DOM**

`index.html` — insert directly after the `#hand-dial` div (inside the rail, before `#rail-footer`):

```html
          <div id="grain-dial">
            <label for="grain-range">grain</label>
            <input type="range" id="grain-range" min="0" max="1" step="0.01" />
          </div>
```

`src/styles.css` — extend the hand-dial rules to cover both dials (replace the two `#hand-dial` selectors):

```css
#hand-dial,
#grain-dial {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-dim);
}

#hand-dial input[type="range"],
#grain-dial input[type="range"] {
  width: 100%;
}
```

- [ ] **Step 2: Wire chrome.ts**

`src/ui/chrome.ts` — add to `ChromeDeps`:

```ts
  grainDial: HTMLInputElement; // #grain-dial input
  onGrainInput(v: number): void; // live: setGrain + updateGrain (no push)
  onGrainCommit(): void; // change event: commit()
```

In `installChrome`, after the hand-dial listeners:

```ts
  deps.grainDial.addEventListener("input", () => deps.onGrainInput(Number(deps.grainDial.value)));
  deps.grainDial.addEventListener("change", () => deps.onGrainCommit());
```

In `refreshChrome`, next to the hand-dial sync:

```ts
  deps.grainDial.value = String(deps.getScene().grain);
```

- [ ] **Step 3: Wire main.ts**

Add the DOM ref next to `handDialInput`:

```ts
const grainDialInput = document.querySelector<HTMLInputElement>("#grain-dial input")!;
```

Import `setGrain` (extend the existing `./engine/scene` import). Add the callbacks next to `onHandInput`/`onHandCommit`:

```ts
function onGrainInput(v: number): void {
  setGrain(scene, v);
  renderer.updateGrain(scene); // grain touches no strokes — no full re-render
}

function onGrainCommit(): void {
  commit();
}
```

Extend the `chromeDeps` literal:

```ts
  grainDial: grainDialInput,
  onGrainInput,
  onGrainCommit,
```

- [ ] **Step 4: Write the e2e test**

Append to `e2e/chrome.spec.ts`:

```ts
test("grain dial: live render, export coverage, exactly one history entry", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);

  const grainRect = page.locator("svg#sheet rect.grain");
  await expect(grainRect).toHaveAttribute("opacity", "0");

  await page.locator("#grain-range").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await getScene(page)).grain).toBe(1);
  await expect(grainRect).toHaveAttribute("opacity", "0.35");

  // WYSIWYG: the exported SVG carries the grain layer
  const svgStr = await page.evaluate(() => (window as any).__ww.exportSvgString());
  expect(svgStr).toContain("feTurbulence");

  // exactly one history entry: one undo restores 0 (and the dial follows)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("Control+z");
  expect((await getScene(page)).grain).toBe(0);
  await expect(grainRect).toHaveAttribute("opacity", "0");
  await expect(page.locator("#grain-range")).toHaveValue("0");

  // neon (first dark paper): paper re-skins, speckle flips to white, and the
  // selection halo survives the palette swap
  await page.selectOption("#palette-select", "neon");
  await expect(page.locator("svg#sheet rect.paper")).toHaveAttribute("fill", "#1b1b1e");
  expect(await page.locator("svg#sheet feColorMatrix").getAttribute("values")).toContain("0 0 0 0 1 ");
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1);
});
```

- [ ] **Step 5: Verify everything**

Run: `npm test -- --run && npm run build && npm run e2e`
Expected: all unit + e2e pass (e2e count grows by 1). Also eyeball it live if convenient: `npm run dev`, drag the grain dial on the neon palette — light speckle on dark paper.

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles.css src/ui/chrome.ts src/main.ts e2e/chrome.spec.ts
git commit -m "$(cat <<'EOF'
Add global grain dial to the rail

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Remove sheet-width scaling from the mark pipeline (hand pass + stroke width)

**Files:**
- Modify: `src/hand/hand.ts`, `src/engine/generate.ts`, `src/ui/draw.ts:52` (the `runPipeline` call in `bakedFor`)
- Modify: `docs/superpowers/specs/2026-08-09-quick-wins-design.md` (one-line addendum)
- Test: `tests/hand.test.ts`, `tests/generate.test.ts` (update signatures + fixtures)

**Interfaces:**
- Consumes: current `handPass(paths, amount, rng, sheetW = 1600)` and `runPipeline(brush, input, params, seed, hand, sheetW)`.
- Produces: **new signatures** `handPass(paths: IdealPath[], amount: number, rng: Rng): IdealPath[]` and `runPipeline(brush: BrushDef, input: BrushInput, params: Record<string, number>, seed: number, hand: number): BakedPath[]`. Baked width is now exactly `brush.strokeWidth`. All callers (`bakeStroke`, `draw.ts` `bakedFor`, tests) drop the sheet-width argument.

**Why:** marks are fixed-size in sheet units, so wobble amplitude and stroke width must be too. The old `sheetW/1600` factor would make S/M sheets render *cleaner, thinner* marks — the opposite of the chunky intent. For every existing 1600-wide sheet the factor was 1, so nothing changes; 2000-wide landscape strokes get slightly less wobble/width only when next re-baked (frozen bakes stay frozen).

- [ ] **Step 1: Update the tests first**

`tests/hand.test.ts` — in the "degenerate resample" describe block, the octagon fixture relied on sheetW 2000 making the step 10; with the constant step 8, shrink the octagon so it stays degenerate, and drop the 4th argument in both tests:

```ts
  test("tiny closed octagon (perimeter < step) never throws and yields finite points", () => {
    // Mirrors sunstamp's dash-ring satellite dot: an 8-gon with radius 1.0,
    // whose perimeter (~6.12) is shorter than the constant resample step (8).
    const octagon: IdealPath = {
      points: Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return { x: 50 + Math.cos(a) * 1.0, y: 50 + Math.sin(a) * 1.0 };
      }),
      closed: true, stroke: true, fill: false,
    };
    let result: IdealPath[] = [];
    expect(() => {
      result = handPass([octagon], 0.9, rngFromSeed(1));
    }).not.toThrow();
    const pts = result[0]!.points;
    expect(pts.length).toBeGreaterThanOrEqual(1);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
```

In the `tinyDash` test, change `handPass([tinyDash], 0.9, rngFromSeed(1), 2000)` to `handPass([tinyDash], 0.9, rngFromSeed(1))` (fixture already degenerate at step 8).

Add one new test to the main `handPass` describe — the point of this task:

```ts
  test("output is sheet-size independent (no sheetW parameter)", () => {
    // Regression: amplitude/step used to scale with sheetW/1600, which made
    // marks cleaner on small sheets while their size stayed fixed.
    expect(handPass.length).toBe(3); // (paths, amount, rng) — no 4th param
  });
```

`tests/generate.test.ts` — remove the final sheet-width argument from every `runPipeline(...)` call (lines 26, 27, 30, 40, 58, 82, 89, 95, 98, 99 — e.g. `runPipeline(zigzag, input, P, 33, 0.5, 1600)` → `runPipeline(zigzag, input, P, 33, 0.5)`). Rename the "sunstamp at hand 0.6, sheetW 2000..." test to "sunstamp at hand 0.6 never throws and always yields parseable path data". Add one width assertion to any existing zigzag pipeline test:

```ts
    expect(baked[0]!.width).toBe(zigzag.strokeWidth); // constant, not sheet-scaled
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/hand.test.ts tests/generate.test.ts`
Expected: FAIL — the width assertion is the red gate: with the 6th argument removed, the old `runPipeline` computes `width = strokeWidth * undefined / 1600 = NaN`, so `baked[0].width` is `NaN`, not `strokeWidth`. (The `handPass.length` test already passes — the old `sheetW` param had a default so `.length` was 3 — keep it purely as a signature guard. The degenerate-octagon fixture also passes both before and after; it's an updated fixture, not the gate.)

- [ ] **Step 3: Implement**

`src/hand/hand.ts` — new signature, constant step/amplitude (diff against current):

```ts
export function handPass(paths: IdealPath[], amount: number, rng: Rng): IdealPath[] {
  if (amount <= 0) return paths;
  const step = 8;
```

…and inside the map: `const disp = (n * 4 + m * 2.5) * amount;` and `const gapPts = Math.ceil(((amount - 0.5) * 12) / step);`. Delete the `const scale = sheetW / 1600;` line and the `sheetW = 1600` parameter.

`src/engine/generate.ts` — `runPipeline` loses `sheetW`; width becomes constant:

```ts
export function runPipeline(
  brush: BrushDef, input: BrushInput, params: Record<string, number>,
  seed: number, hand: number,
): BakedPath[] {
  const { gen, hand: handRng } = strokeStreams(seed);
  const safeParams = sanitizeParams(brush, params);
  const ideal = brush.generate(input, safeParams, gen);
  const wobbled = handPass(ideal, hand * brush.handDamping, handRng);
  // Marks are fixed-size in sheet units (WYSIWYG covenant) — width included.
  const width = brush.strokeWidth;
  return wobbled.map((p) => ({ d: pathToD(p.points, p.closed), stroke: p.stroke, fill: p.fill, width: p.stroke ? width : 0 }));
}
```

`bakeStroke` drops the last argument: `runPipeline(brush, stroke.input, stroke.params, stroke.seed, scene.hand)`.

`src/ui/draw.ts` `bakedFor` drops it too: `runPipeline(getBrush(brushId), input, params, seed, scene.hand)` (the unused `scene.sheet.w` read can go; keep `const scene = getScene()` for `scene.hand`).

Spec addendum — in `docs/superpowers/specs/2026-08-09-quick-wins-design.md`, Feature 4, append one sentence to the **Change:** paragraph:

```
Stroke width had the same `sheetW / 1600` factor in `runPipeline` — it is removed in the same change (baked width = `brush.strokeWidth`, constant).
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run && npm run build && npm run e2e`
Expected: everything green (all e2e sheets are 1600-wide portrait, where the old factor was exactly 1 — behavior identical).

- [ ] **Step 5: Commit**

```bash
git add src/hand/hand.ts src/engine/generate.ts src/ui/draw.ts tests/hand.test.ts tests/generate.test.ts docs/superpowers/specs/2026-08-09-quick-wins-design.md
git commit -m "$(cat <<'EOF'
Make wobble amplitude and stroke width sheet-size independent

Marks are fixed-size in sheet units; the old sheetW/1600 factor would
have made small sheets render cleaner, thinner marks — the opposite of
the S/M/L chunky intent. No-op for 1600-wide sheets.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Sheet-dims model (`src/model/sheets.ts`)

**Files:**
- Create: `src/model/sheets.ts`
- Test: Create `tests/sheets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SheetSize = "s" | "m" | "l"`, `SheetOrientation = "square" | "portrait" | "landscape"`, `SHEET_BASES: Record<SheetSize, number>` ({s: 800, m: 1200, l: 1600}), `sheetDims(size: SheetSize, orientation: SheetOrientation): { w: number; h: number }`. Task 8's dialog consumes all of these.

- [ ] **Step 1: Write the failing test**

Create `tests/sheets.test.ts`:

```ts
import { expect, test } from "vitest";
import { SHEET_BASES, sheetDims } from "../src/model/sheets";

test("all nine size x orientation combinations match the spec table", () => {
  expect(sheetDims("s", "square")).toEqual({ w: 800, h: 800 });
  expect(sheetDims("s", "portrait")).toEqual({ w: 800, h: 1000 });
  expect(sheetDims("s", "landscape")).toEqual({ w: 1000, h: 800 });
  expect(sheetDims("m", "square")).toEqual({ w: 1200, h: 1200 });
  expect(sheetDims("m", "portrait")).toEqual({ w: 1200, h: 1500 });
  expect(sheetDims("m", "landscape")).toEqual({ w: 1500, h: 1200 });
  expect(sheetDims("l", "square")).toEqual({ w: 1600, h: 1600 });
  expect(sheetDims("l", "portrait")).toEqual({ w: 1600, h: 2000 });
  expect(sheetDims("l", "landscape")).toEqual({ w: 2000, h: 1600 });
});

test("L sizes equal the legacy presets exactly", () => {
  // v1 hard-coded square 1600x1600, portrait 1600x2000, landscape 2000x1600
  expect(SHEET_BASES.l).toBe(1600);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/sheets.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/model/sheets.ts`:

```ts
export type SheetSize = "s" | "m" | "l";
export type SheetOrientation = "square" | "portrait" | "landscape";

// Base = short side. L equals the v1 presets exactly; marks are fixed-size
// in sheet units, so smaller sheets read bolder, not zoomed.
export const SHEET_BASES: Record<SheetSize, number> = { s: 800, m: 1200, l: 1600 };

export function sheetDims(size: SheetSize, orientation: SheetOrientation): { w: number; h: number } {
  const b = SHEET_BASES[size];
  if (orientation === "portrait") return { w: b, h: b * 1.25 };
  if (orientation === "landscape") return { w: b * 1.25, h: b };
  return { w: b, h: b };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run tests/sheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/sheets.ts tests/sheets.test.ts
git commit -m "$(cat <<'EOF'
Add S/M/L sheet dimension model

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Constant-scale viewport (L-equivalent fit)

**Files:**
- Modify: `src/render/viewport.ts`
- Test: `tests/viewport.test.ts` (add cases; update one fixture)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ViewBox.fit` now converges to the sheet's L-equivalent scale. Constructor/public API unchanged (`new ViewBox(w, h)`, `fit(containerW, containerH, margin = 40)`) — main.ts needs no changes. Task 8's e2e relies on an S sheet rendering at half the on-screen size of an L sheet.

- [ ] **Step 1: Update/write tests**

In `tests/viewport.test.ts`, the "panBy shifts origin" test uses a 100×100 sheet, which the new rule treats as a tiny sheet viewed at L scale. Update its fixture to a scale-neutral one:

```ts
test("panBy shifts origin; toString formats", () => {
  const v = new ViewBox(1600, 1600);
  v.fit(1600, 1600, 0);
  v.panBy(10, -5);
  expect(v.toString()).toBe(`${v.x} ${v.y} ${v.w} ${v.h}`);
  expect(v.x).toBeCloseTo(10, 9);
});
```

Add new tests:

```ts
test("fit is unchanged for L sheets (k = 1)", () => {
  const v = new ViewBox(1600, 2000); // L portrait: min side 1600
  v.fit(800, 800, 40);
  expect(v.h).toBeCloseTo(2222.22, 1); // same numbers as the legacy fit test
  expect(v.w).toBeCloseTo(2222.22, 1);
});

test("fit shows an S sheet at exactly half the on-screen size of L (constant scale)", () => {
  const small = new ViewBox(800, 800); // k = 2 -> L-equivalent 1600x1600
  small.fit(800, 800, 40);
  const large = new ViewBox(1600, 1600); // k = 1
  large.fit(800, 800, 40);
  // Same view scale: identical visible sheet-units for the same container...
  expect(small.w).toBeCloseTo(large.w, 6);
  expect(small.h).toBeCloseTo(large.h, 6);
  // ...so the 800-unit sheet occupies half the view the 1600-unit sheet does,
  // centered (matte on all sides).
  expect(small.x).toBeCloseTo((800 - small.w) / 2, 6);
  expect(small.y).toBeCloseTo((800 - small.h) / 2, 6);
});

test("oversized custom sheets never scale down (k clamps at 1)", () => {
  const big = new ViewBox(3200, 3200); // min side > 1600: plain fit
  big.fit(800, 800, 40);
  expect(big.w).toBeCloseTo(800 / ((800 - 80) / 3200), 1); // legacy fit math
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --run tests/viewport.test.ts`
Expected: the "half the on-screen size" test FAILS (old fit fills the container with the S sheet); L tests pass.

- [ ] **Step 3: Implement**

Replace the constructor and `fit` in `src/render/viewport.ts` (zoomAt/panBy/toString unchanged):

```ts
export class ViewBox {
  x = 0; y = 0; w: number; h: number;
  private refW: number;
  private refH: number;
  constructor(private sheetW: number, private sheetH: number) {
    this.w = sheetW; this.h = sheetH;
    // WYSIWYG constant scale: fit() converges to the sheet's L-equivalent
    // (short side scaled up to 1600), so S/M sheets render proportionally
    // smaller on screen while marks keep their on-screen size. k = 1 for
    // every L sheet (legacy behavior untouched); clamped so oversized
    // custom sheets still just fit rather than overflowing.
    const k = Math.max(1, 1600 / Math.min(sheetW, sheetH));
    this.refW = sheetW * k;
    this.refH = sheetH * k;
  }
  fit(containerW: number, containerH: number, margin = 40): void {
    const scale = Math.min((containerW - margin * 2) / this.refW, (containerH - margin * 2) / this.refH);
    this.w = containerW / scale;
    this.h = containerH / scale;
    this.x = (this.sheetW - this.w) / 2;
    this.y = (this.sheetH - this.h) / 2;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- --run && npm run build && npm run e2e`
Expected: all green (every e2e sheet is L-sized; behavior identical there).

- [ ] **Step 5: Commit**

```bash
git add src/render/viewport.ts tests/viewport.test.ts
git commit -m "$(cat <<'EOF'
Fit to the sheet's L-equivalent for constant on-screen scale

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: New-sheet dialog size picker + e2e

**Files:**
- Modify: `index.html`, `src/styles.css`, `src/main.ts`, `e2e/helpers.ts`
- Test: `e2e/chrome.spec.ts` (append one test)

**Interfaces:**
- Consumes: `sheetDims`/`SheetSize`/`SheetOrientation` (Task 6), constant-scale fit (Task 7).
- Produces: `#new-dialog-sizes` buttons (`data-size="s|m|l"`, S default-active), orientation buttons' `<small>` labels driven by JS. `SHEET_PRESETS` in main.ts is deleted. **e2e helper change:** `newPortraitSheet` explicitly clicks L first (existing tests assume 1600×2000).

- [ ] **Step 1: Update the dialog DOM**

`index.html` — replace the `#new-dialog` contents:

```html
    <dialog id="new-dialog">
      <h2>New sheet</h2>
      <div id="new-dialog-sizes">
        <button type="button" data-size="s" data-active="true">S</button>
        <button type="button" data-size="m">M</button>
        <button type="button" data-size="l">L</button>
      </div>
      <div id="new-dialog-options">
        <button type="button" data-sheet="square">Square<br /><small></small></button>
        <button type="button" data-sheet="portrait">Portrait<br /><small></small></button>
        <button type="button" data-sheet="landscape">Landscape<br /><small></small></button>
      </div>
    </dialog>
```

`src/styles.css` — add next to the dialog rules:

```css
#new-dialog-sizes {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

#new-dialog-sizes button {
  flex: 1;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: bold;
}

#new-dialog-sizes button:hover {
  background: var(--bg);
}

#new-dialog-sizes button[data-active="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
```

- [ ] **Step 2: Rewire main.ts**

Delete the `SHEET_PRESETS` const. Add the import:

```ts
import { sheetDims, type SheetOrientation, type SheetSize } from "./model/sheets";
```

Boot default (the `let scene` line) becomes S square:

```ts
let scene: Scene = loaded ?? newScene(sheetDims("s", "square").w, sheetDims("s", "square").h);
```

Replace the new-sheet dialog wiring block with:

```ts
btnNew.addEventListener("click", () => newDialog.showModal());

let newSheetSize: SheetSize = "s";
const sizeButtons = newDialog.querySelectorAll<HTMLButtonElement>("button[data-size]");
const orientationButtons = newDialog.querySelectorAll<HTMLButtonElement>("button[data-sheet]");

function updateNewDialogLabels(): void {
  sizeButtons.forEach((b) => {
    b.dataset.active = String(b.dataset.size === newSheetSize);
  });
  orientationButtons.forEach((b) => {
    const { w, h } = sheetDims(newSheetSize, b.dataset.sheet as SheetOrientation);
    b.querySelector("small")!.textContent = `${w} × ${h}`;
  });
}

sizeButtons.forEach((b) =>
  b.addEventListener("click", () => {
    newSheetSize = b.dataset.size as SheetSize;
    updateNewDialogLabels();
  }),
);
updateNewDialogLabels();

orientationButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = sheetDims(newSheetSize, btn.dataset.sheet as SheetOrientation);
    scene = newScene(preset.w, preset.h);
    seedIdCounter(scene);
    vb = new ViewBox(scene.sheet.w, scene.sheet.h);
    // New Sheet is an undoable document boundary, not a hard reset — Ctrl+Z
    // brings back the drawing that was open before New was clicked.
    history.push(scene);
    autosave(scene);
    renderer.renderScene(scene);
    doFit();
    syncPaletteSelect();
    syncSelectionAfterSceneReplace();
    refreshChrome();
    newDialog.close();
  });
});
```

(The orientation handler body is the existing one verbatim — only the `preset` line changes.)

- [ ] **Step 3: Fix the e2e helper (existing tests assume L portrait)**

`e2e/helpers.ts` — `newPortraitSheet` must explicitly select L now that S is the default:

```ts
export async function newPortraitSheet(page: Page): Promise<void> {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#new-dialog button[data-size="l"]');
  await page.click('[data-sheet="portrait"]');
}
```

- [ ] **Step 4: Write the e2e test**

Append to `e2e/chrome.spec.ts`:

```ts
test("size picker: S is default, dims land in the scene, S renders half of L on screen", async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // S is the default size; labels show S dims
  await expect(page.locator('#new-dialog button[data-size="s"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('#new-dialog button[data-sheet="square"] small')).toHaveText("800 × 800");

  await page.click('[data-sheet="square"]');
  expect((await getScene(page)).sheet).toEqual({ w: 800, h: 800 });
  const sBox = (await page.locator("svg#sheet rect.paper").boundingBox())!;

  // New -> L square: on-screen paper should be ~2x wider (constant scale)
  await page.click("#btn-new");
  await page.click('#new-dialog button[data-size="l"]');
  await expect(page.locator('#new-dialog button[data-sheet="square"] small')).toHaveText("1600 × 1600");
  await page.click('[data-sheet="square"]');
  expect((await getScene(page)).sheet).toEqual({ w: 1600, h: 1600 });
  const lBox = (await page.locator("svg#sheet rect.paper").boundingBox())!;
  expect(lBox.width / sBox.width).toBeGreaterThan(1.9);
  expect(lBox.width / sBox.width).toBeLessThan(2.1);
});
```

- [ ] **Step 5: Verify everything**

Run: `npm test -- --run && npm run build && npm run e2e`
Expected: all green — including the pre-existing e2e tests, now pinned to L via the helper.

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles.css src/main.ts e2e/helpers.ts e2e/chrome.spec.ts
git commit -m "$(cat <<'EOF'
Add S/M/L size picker to the new-sheet dialog

Default is Small — marks are fixed-size, so small sheets read bolder.
Reset Zoom shows each size at constant scale (S is half of L on screen).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentation + final verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-08-09-quick-wins-design.md` (status line)

**Interfaces:** none — docs only.

- [ ] **Step 1: Update the README**

Three edits, matching the README's existing tone (short, playful):

1. In **Features**, extend the palettes bullet: `* Opinionated color pallettes (six of them, from Ballpoint to Neon-on-black). Limitations are inspiring!`
2. After the Features list (before "Vibe Coded"), add:

```markdown
## Sheets & dials

- **Sheet sizes**: New Sheet offers S / M / L in square, portrait, and landscape. Marks are fixed-size, so a Small sheet reads bold and chunky — and it renders true-to-size on screen (a Small sheet really is half a Large one; your PNG matches what you see).
- **hand** (global dial): 0 = ruler-clean, 1 = notebook tremor.
- **grain** (global dial): paper tooth, from smooth to speckled. Baked into SVG/PNG exports.
```

3. No shortcuts-table changes (dials are pointer-only).

- [ ] **Step 2: Mark the spec implemented**

In `docs/superpowers/specs/2026-08-09-quick-wins-design.md`, change the `**Status:**` line to: `**Status:** implemented (see docs/superpowers/plans/2026-08-09-quick-wins.md)`.

- [ ] **Step 3: Full verification sweep**

Run: `npm test -- --run && npm run build && npm run e2e`
Expected: everything green. Then a manual smoke in `npm run dev`: new S square sheet → draw zigzags (bold marks, half-size sheet with matte) → grain dial up on neon palette (light speckle) → Export PNG full sheet → open it: must match the Reset Zoom view exactly (WYSIWYG gate).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-09-quick-wins-design.md
git commit -m "$(cat <<'EOF'
Document round-2 quick wins: palettes, grain, sheet sizes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
