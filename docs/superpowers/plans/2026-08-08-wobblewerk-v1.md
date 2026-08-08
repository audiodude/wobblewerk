# Wobblewerk v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build wobblewerk v1 — a web-based procedural sketch instrument (zigzag/hexpack/sunstamp brushes, hand-wobble dial, palette slots, snapshot undo, autosave + .json files with baked-geometry vintage policy, SVG/PNG export) per the approved spec.

**Architecture:** Pure deterministic engine (brush generate → hand pass → bake to SVG path data) with a mutable `Scene` + string-snapshot history; SVG-DOM renderer (one `<g>` per stroke); thin vanilla-TS UI glue. Spec: `docs/superpowers/specs/2026-08-08-wobblewerk-design.md` — read it before starting any task.

**Tech Stack:** Vanilla TypeScript + Vite. Vitest (unit; jsdom for DOM tests). Playwright (one smoke e2e). Zero runtime dependencies.

## Global Constraints

- **No runtime npm dependencies.** Dev deps only: `vite`, `typescript`, `vitest`, `jsdom`, `@playwright/test`.
- TypeScript `strict: true`. All engine code must run in Node (no DOM imports outside `render/`, `export/`, `ui/`, `main.ts`).
- **Determinism:** `brush.generate` and `handPass` are pure functions of their arguments. Never call `Math.random`, `Date.now`, or read globals inside them.
- **Param cap:** every brush exposes ≤ 4 params.
- Path data coords rounded to 2 decimals.
- Sheet-relative sizing: brush `strokeWidth` and hand amplitudes are defined at 1600px sheet width and scale by `sheetW / 1600`.
- Brush versions start at 1. `Scene.version` (file format) is `1`.
- Commit after every task (each task's last step). Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Working directory: `/home/tmoney/code/vibes/wobblewerk` (git repo, branch `main`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `.gitignore`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: working `npm run dev`, `npm test`, `npm run build` for all later tasks.

- [ ] **Step 1: Scaffold files**

`package.json` (then `npm install`):

```json
{
  "name": "wobblewerk",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

Run: `npm install -D vite typescript vitest jsdom @playwright/test`

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
export default defineConfig({});
```

`index.html` (minimal shell; Task 16 replaces the body):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>wobblewerk</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`: `console.log("wobblewerk");` (placeholder). `src/styles.css`: empty file.

`.gitignore`:

```
node_modules/
dist/
test-results/
playwright-report/
```

`tests/smoke.test.ts`:

```ts
import { expect, test } from "vitest";
test("scaffold", () => { expect(1 + 1).toBe(2); });
```

- [ ] **Step 2: Verify** — Run `npm test` (1 pass), `npm run build` (clean), `npm run dev` briefly serves.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: scaffold vite+ts+vitest project"`

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/model/rng.ts`, `tests/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number` (uniform [0,1))
  - `sfc32(a: number, b: number, c: number, d: number): Rng`
  - `rngFromSeed(seed: number): Rng`
  - `strokeStreams(seed: number): { gen: Rng; hand: Rng }` — two independent streams
  - `randomSeed(): number` — uint32 via `crypto.getRandomValues` (fallback `Math.random` if no crypto)

- [ ] **Step 1: Write failing tests** (`tests/rng.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { rngFromSeed, strokeStreams, randomSeed } from "../src/model/rng";

describe("rng", () => {
  test("deterministic: same seed, same sequence", () => {
    const a = rngFromSeed(42), b = rngFromSeed(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  test("different seeds differ", () => {
    expect(rngFromSeed(1)()).not.toBe(rngFromSeed(2)());
  });
  test("range [0,1)", () => {
    const r = rngFromSeed(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  test("strokeStreams: gen and hand are independent and deterministic", () => {
    const s1 = strokeStreams(99), s2 = strokeStreams(99);
    expect(s1.gen()).toBe(s2.gen());
    expect(s1.hand()).toBe(s2.hand());
    const s3 = strokeStreams(99);
    expect(s3.hand()).not.toBe(s3.gen()); // near-certain for sfc32
  });
  test("randomSeed returns uint32", () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/rng.test.ts` fails (module missing).
- [ ] **Step 3: Implement** (`src/model/rng.ts`):

```ts
export type Rng = () => number;

export function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: number): Rng {
  const r = sfc32(seed >>> 0, (seed ^ 0x9e3779b9) >>> 0, (seed ^ 0x85ebca6b) >>> 0, (seed ^ 0xc2b2ae35) >>> 0);
  for (let i = 0; i < 12; i++) r(); // warm up
  return r;
}

export function strokeStreams(seed: number): { gen: Rng; hand: Rng } {
  return { gen: rngFromSeed(seed), hand: rngFromSeed((seed ^ 0x6a09e667) >>> 0) };
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }
  return Math.floor(Math.random() * 0x100000000);
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/rng.test.ts`
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: seeded rng (sfc32) with per-stroke streams"`

---

### Task 3: Geometry utilities

**Files:**
- Create: `src/model/geometry.ts`, `tests/geometry.test.ts`

**Interfaces:**
- Produces:
  - `interface XY { x: number; y: number }`
  - `resample(points: XY[], spacing: number, keepEnd?: boolean): XY[]` — points at exact arc-length multiples of `spacing` from the start; `keepEnd` (default `true`) appends the final input point if not already within `spacing/4` of the last sample. **With `keepEnd: false`, resampling a polyline that is an arc-length prefix of a longer one yields an exact prefix of the longer resample** (zigzag live-ink relies on this).
  - `rdp(points: XY[], epsilon: number): XY[]` — Ramer–Douglas–Peucker, keeps endpoints.
  - `pointInPolygon(p: XY, poly: XY[]): boolean` — ray cast; `poly` implicitly closed.
  - `pathLength(points: XY[]): number`
  - `nearestPointOnPolyline(p: XY, points: XY[]): { point: XY; dist: number }`
  - `bbox(points: XY[]): { minX: number; minY: number; maxX: number; maxY: number }`

- [ ] **Step 1: Write failing tests** (`tests/geometry.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { resample, rdp, pointInPolygon, pathLength, nearestPointOnPolyline, bbox } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";

const line = (n: number, step = 1): XY[] => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));

describe("resample", () => {
  test("even spacing along a straight line", () => {
    const out = resample(line(101), 10); // 0..100
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]!.x).toBeCloseTo(10, 6);
    expect(out.at(-1)!.x).toBeCloseTo(100, 6);
  });
  test("keepEnd:false gives exact prefix property", () => {
    const long = line(101), short = line(61); // short is arc-length prefix of long
    const a = resample(short, 7, false), b = resample(long, 7, false);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 9);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 9);
    }
  });
});

describe("rdp", () => {
  test("collapses collinear points", () => {
    expect(rdp(line(50), 0.5)).toHaveLength(2);
  });
  test("keeps a real corner", () => {
    const pts: XY[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
    const out = rdp([...line(51), ...Array.from({ length: 50 }, (_, i) => ({ x: 50, y: i + 1 }))], 1);
    expect(out.length).toBe(3);
    expect(out[1]).toEqual({ x: 50, y: 0 });
    void pts;
  });
  test("higher epsilon, fewer points", () => {
    const wob: XY[] = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 3) * 4 }));
    expect(rdp(wob, 8).length).toBeLessThan(rdp(wob, 1).length);
  });
});

describe("pointInPolygon", () => {
  const sq: XY[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  test("inside", () => { expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true); });
  test("outside", () => { expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false); });
});

test("pathLength", () => { expect(pathLength(line(11))).toBeCloseTo(10, 9); });

test("nearestPointOnPolyline", () => {
  const near = nearestPointOnPolyline({ x: 5, y: 3 }, line(11));
  expect(near.dist).toBeCloseTo(3, 9);
  expect(near.point.x).toBeCloseTo(5, 9);
});

test("bbox", () => {
  expect(bbox([{ x: 1, y: 2 }, { x: -3, y: 7 }])).toEqual({ minX: -3, minY: 2, maxX: 1, maxY: 7 });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/model/geometry.ts`):

```ts
export interface XY { x: number; y: number }

export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return len;
}

export function resample(points: XY[], spacing: number, keepEnd = true): XY[] {
  if (points.length === 0) return [];
  const out: XY[] = [{ ...points[0]! }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]!, b = points[i]!;
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (carry + seg >= spacing) {
      const t = (spacing - carry) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p;
      seg = Math.hypot(b.x - a.x, b.y - a.y);
      carry = 0;
    }
    carry += seg;
  }
  const last = points.at(-1)!;
  const tail = out.at(-1)!;
  if (keepEnd && Math.hypot(last.x - tail.x, last.y - tail.y) > spacing / 4) out.push({ ...last });
  return out;
}

function perpDist(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

export function rdp(points: XY[], epsilon: number): XY[] {
  if (points.length < 3) return points.slice();
  let maxD = 0, idx = 0;
  const a = points[0]!, b = points.at(-1)!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i]!, a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= epsilon) return [a, b];
  const left = rdp(points.slice(0, idx + 1), epsilon);
  const right = rdp(points.slice(idx), epsilon);
  return [...left.slice(0, -1), ...right];
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function nearestPointOnPolyline(p: XY, points: XY[]): { point: XY; dist: number } {
  let best = { point: { ...points[0]! }, dist: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.dist) best = { point: q, dist: d };
  }
  return best;
}

export function bbox(points: XY[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: geometry utils (resample, rdp, point-in-polygon, nearest, bbox)"`

---

### Task 4: Core types + palettes

**Files:**
- Create: `src/model/types.ts`, `src/model/palettes.ts`, `tests/palettes.test.ts`

**Interfaces:**
- Produces (`src/model/types.ts`) — copy exactly:

```ts
import type { XY } from "./geometry";
import type { Rng } from "./rng";

export type BrushInput =
  | { kind: "point"; at: XY }
  | { kind: "path"; points: XY[] }
  | { kind: "region"; points: XY[] };

export interface IdealPath { points: XY[]; closed: boolean; stroke: boolean; fill: boolean }
export interface BakedPath { d: string; stroke: boolean; fill: boolean; width: number }

export interface Stroke {
  id: string;
  brush: string;
  brushVersion: number;
  input: BrushInput;
  seed: number;
  params: Record<string, number>;
  colorSlot: number;
  baked: BakedPath[];
}

export interface Scene {
  version: 1;
  sheet: { w: number; h: number };
  paletteId: string;
  hand: number;
  strokes: Stroke[];
}

export interface ParamDef { key: string; label: string; min: number; max: number; default: number }

export interface BrushDef {
  id: string;
  version: number;
  inputKind: "point" | "path" | "region";
  handDamping: number;
  strokeWidth: number;
  params: ParamDef[];
  generate(input: BrushInput, params: Record<string, number>, rng: Rng): IdealPath[];
}

export function defaultParams(brush: BrushDef): Record<string, number> {
  return Object.fromEntries(brush.params.map((p) => [p.key, p.default]));
}
```

- Produces (`src/model/palettes.ts`):
  - `interface Palette { id: string; label: string; paper: string; inks: string[] }`
  - `const PALETTES: Palette[]` — ids `notebook`, `ballpoint`, `blackwork`, `bauhaus`
  - `getPalette(id: string): Palette` (unknown id → notebook)
  - `resolveInk(palette: Palette, colorSlot: number): string` — 1-based, wraps: `inks[(colorSlot - 1) % inks.length]`

- [ ] **Step 1: Write failing tests** (`tests/palettes.test.ts`):

```ts
import { expect, test } from "vitest";
import { PALETTES, getPalette, resolveInk } from "../src/model/palettes";

test("four presets exist with paper + inks", () => {
  expect(PALETTES.map((p) => p.id).sort()).toEqual(["ballpoint", "bauhaus", "blackwork", "notebook"]);
  for (const p of PALETTES) {
    expect(p.paper).toMatch(/^#/);
    expect(p.inks.length).toBeGreaterThanOrEqual(1);
  }
});
test("getPalette falls back to notebook", () => {
  expect(getPalette("nope").id).toBe("notebook");
});
test("resolveInk wraps modulo ink count", () => {
  const p = getPalette("notebook");
  expect(resolveInk(p, 1)).toBe(p.inks[0]);
  expect(resolveInk(p, p.inks.length + 1)).toBe(p.inks[0]);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/model/palettes.ts`):

```ts
export interface Palette { id: string; label: string; paper: string; inks: string[] }

export const PALETTES: Palette[] = [
  { id: "notebook", label: "Notebook", paper: "#faf8f2",
    inks: ["#2a9d8f", "#f4743b", "#8338ec", "#d81159", "#9ac026"] },
  { id: "ballpoint", label: "Ballpoint", paper: "#faf8f2", inks: ["#3a3aa8"] },
  { id: "blackwork", label: "Blackwork", paper: "#f7f5ef", inks: ["#1a1a1a"] },
  { id: "bauhaus", label: "Bauhaus", paper: "#f2e9d8",
    inks: ["#d62828", "#1d1d1b", "#e9a820", "#1d3557"] },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function resolveInk(palette: Palette, colorSlot: number): string {
  const i = ((colorSlot - 1) % palette.inks.length + palette.inks.length) % palette.inks.length;
  return palette.inks[i]!;
}
```

Create `src/model/types.ts` with the exact contents from the Interfaces block above.

- [ ] **Step 4: Run to verify pass** (and `npm run build` to type-check types.ts).
- [ ] **Step 5: Commit** — `git commit -m "feat: core types and preset palettes"`

---

### Task 5: Hand pass

**Files:**
- Create: `src/hand/hand.ts`, `tests/hand.test.ts`

**Interfaces:**
- Consumes: `resample` (geometry), `IdealPath` (types), `Rng` (rng).
- Produces:
  - `valueNoise1D(t: number): number` — deterministic, range ~[-1,1]
  - `handPass(paths: IdealPath[], amount: number, rng: Rng, sheetW?: number): IdealPath[]` — `amount <= 0` returns the input array unchanged (same reference). Closed input paths come back as open explicit rings (`closed: false`, first point re-appended), under-closed by a gap when `amount > 0.5`.

- [ ] **Step 1: Write failing tests** (`tests/hand.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { handPass, valueNoise1D } from "../src/hand/hand";
import { rngFromSeed } from "../src/model/rng";
import type { IdealPath } from "../src/model/types";

const straight: IdealPath = {
  points: Array.from({ length: 2 }, (_, i) => ({ x: i * 200, y: 100 })),
  closed: false, stroke: true, fill: false,
};
const square: IdealPath = {
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  closed: true, stroke: true, fill: false,
};

describe("handPass", () => {
  test("amount 0 is identity (same reference)", () => {
    const input = [straight];
    expect(handPass(input, 0, rngFromSeed(1))).toBe(input);
  });
  test("deterministic for same rng seed", () => {
    const a = handPass([straight], 0.6, rngFromSeed(5));
    const b = handPass([straight], 0.6, rngFromSeed(5));
    expect(a).toEqual(b);
  });
  test("displacement grows with amount", () => {
    const dev = (amt: number) =>
      Math.max(...handPass([straight], amt, rngFromSeed(9))[0]!.points.map((p) => Math.abs(p.y - 100)));
    expect(dev(0.9)).toBeGreaterThan(dev(0.2));
    expect(dev(0.2)).toBeGreaterThan(0);
  });
  test("same shape, scaled: tremor character stable across amounts", () => {
    const a = handPass([straight], 0.4, rngFromSeed(3))[0]!.points;
    const b = handPass([straight], 0.8, rngFromSeed(3))[0]!.points;
    // sign of displacement matches pointwise (same noise, bigger amplitude)
    for (let i = 1; i < Math.min(a.length, b.length) - 1; i++) {
      const da = a[i]!.y - 100, db = b[i]!.y - 100;
      if (Math.abs(da) > 0.05) expect(Math.sign(da)).toBe(Math.sign(db));
    }
  });
  test("closed path becomes explicit ring, under-closed at high amount", () => {
    const low = handPass([square], 0.3, rngFromSeed(2))[0]!;
    const high = handPass([square], 0.9, rngFromSeed(2))[0]!;
    expect(low.closed).toBe(false);
    expect(high.closed).toBe(false);
    expect(high.points.length).toBeLessThan(low.points.length); // gap trimmed
  });
});

test("valueNoise1D deterministic and bounded", () => {
  expect(valueNoise1D(3.7)).toBe(valueNoise1D(3.7));
  for (let t = 0; t < 50; t += 0.13) {
    const v = valueNoise1D(t);
    expect(Math.abs(v)).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/hand/hand.ts`):

```ts
import { resample } from "../model/geometry";
import type { XY } from "../model/geometry";
import type { IdealPath } from "../model/types";
import type { Rng } from "../model/rng";

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function valueNoise1D(t: number): number {
  const i = Math.floor(t), f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash01(i) * (1 - u) + hash01(i + 1) * u) * 2 - 1;
}

function normalAt(pts: XY[], i: number): XY {
  const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

export function handPass(paths: IdealPath[], amount: number, rng: Rng, sheetW = 1600): IdealPath[] {
  if (amount <= 0) return paths;
  const scale = sheetW / 1600;
  const step = 8 * scale;
  return paths.map((path) => {
    const phase = rng() * 1000;
    const drift = rng() * 1000;
    let pts = path.closed ? [...path.points, path.points[0]!] : path.points;
    pts = resample(pts, step);
    const out = pts.map((pt, i) => {
      const n = valueNoise1D(phase + (i * step) / 40);
      const m = valueNoise1D(drift + (i * step) / 90);
      const nor = normalAt(pts, i);
      const disp = (n * 4 + m * 2.5) * amount * scale;
      return { x: pt.x + nor.x * disp, y: pt.y + nor.y * disp };
    });
    if (path.closed && amount > 0.5) {
      const gapPts = Math.ceil(((amount - 0.5) * 12 * scale) / step);
      out.length = Math.max(2, out.length - gapPts);
    }
    return { points: out, closed: false, stroke: path.stroke, fill: path.fill };
  });
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: hand-wobble pass with deterministic value noise"`

---

### Task 6: Zigzag brush

**Files:**
- Create: `src/brushes/zigzag.ts`, `src/brushes/index.ts`, `tests/zigzag.test.ts`

**Interfaces:**
- Consumes: `resample`, `nearestPointOnPolyline` (geometry); `BrushDef`, `BrushInput`, `IdealPath`, `defaultParams` (types); `Rng`.
- Produces: `export const zigzag: BrushDef` (id `"zigzag"`, version 1, inputKind `"path"`, handDamping 1, strokeWidth 3, params exactly `runLength(8–80, 28)`, `jaggedness(0–1, 0.5)`, `hug(0–1, 0.6)`, `reversals(0–1, 0.15)`).
- Produces (`src/brushes/index.ts`): `export const BRUSHES: Record<string, BrushDef>` and `getBrush(id: string): BrushDef` (throws on unknown). Registry contains only `zigzag` for now; Tasks 7–8 add the rest.

**Algorithm (implement exactly):** resample spine at 4px with `keepEnd: false`. Constant `LOOKSTEPS = 6` (24px lookahead). Walk alternates horizontal/vertical axis-aligned runs; each iteration reads `target = spine[idx + LOOKSTEPS]` and only loops **while `idx + LOOKSTEPS <= spine.length - 1`** — the walk never consumes spine it can't look past, which is what makes live ink prefix-exact. Run length `max(4, runLength * (1 + (rng()*2-1)*jaggedness))`. Direction = sign toward target on the current axis (`|| 1`). With probability `reversals * 0.5`, flip direction and halve the run (the stutter). Corridor `8 + (1-hug)*72`: if the candidate corner ends up farther than that from the spine (use `nearestPointOnPolyline`), replace the run with a clamped move toward the target coordinate on the current axis. Advance `idx += max(1, round(run/4))`. Guard: max 2000 corners. First axis = dominant axis of `spine[0] → spine[min(4, len-1)]`.

- [ ] **Step 1: Write failing tests** (`tests/zigzag.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { zigzag } from "../src/brushes/zigzag";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { nearestPointOnPolyline } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";

const gesture = (n: number): XY[] =>
  Array.from({ length: n }, (_, i) => ({ x: 100 + i * 3, y: 300 + Math.sin(i / 12) * 60 }));
const P = defaultParams(zigzag);

describe("zigzag", () => {
  test("deterministic", () => {
    const a = zigzag.generate({ kind: "path", points: gesture(120) }, P, rngFromSeed(11));
    const b = zigzag.generate({ kind: "path", points: gesture(120) }, P, rngFromSeed(11));
    expect(a).toEqual(b);
  });
  test("all segments axis-aligned", () => {
    const [path] = zigzag.generate({ kind: "path", points: gesture(120) }, P, rngFromSeed(4));
    const pts = path!.points;
    expect(pts.length).toBeGreaterThan(5);
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i]!.x - pts[i - 1]!.x), dy = Math.abs(pts[i]!.y - pts[i - 1]!.y);
      expect(Math.min(dx, dy)).toBeLessThan(1e-9); // exactly horizontal or vertical
    }
  });
  test("prefix stability: shorter gesture output is exact prefix of longer", () => {
    const long = gesture(200), short = long.slice(0, 120);
    const a = zigzag.generate({ kind: "path", points: short }, P, rngFromSeed(7))[0]!.points;
    const b = zigzag.generate({ kind: "path", points: long }, P, rngFromSeed(7))[0]!.points;
    expect(b.length).toBeGreaterThan(a.length);
    for (let i = 0; i < a.length; i++) expect(a[i]).toEqual(b[i]);
  });
  test("high hug stays nearer the spine than low hug", () => {
    const spine = gesture(200);
    const maxDist = (hug: number) => {
      const [p] = zigzag.generate({ kind: "path", points: spine }, { ...P, hug }, rngFromSeed(21));
      return Math.max(...p!.points.map((pt) => nearestPointOnPolyline(pt, spine).dist));
    };
    expect(maxDist(1)).toBeLessThan(maxDist(0) + 1e-9);
    expect(maxDist(1)).toBeLessThan(40);
  });
  test("degenerate input returns no paths", () => {
    expect(zigzag.generate({ kind: "path", points: [{ x: 0, y: 0 }] }, P, rngFromSeed(1))).toEqual([]);
    expect(zigzag.generate({ kind: "point", at: { x: 0, y: 0 } }, P, rngFromSeed(1))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/brushes/zigzag.ts`) per the algorithm block:

```ts
import { nearestPointOnPolyline, resample } from "../model/geometry";
import type { XY } from "../model/geometry";
import type { BrushDef, BrushInput, IdealPath } from "../model/types";
import type { Rng } from "../model/rng";

const STEP = 4;
const LOOKSTEPS = 6;

export const zigzag: BrushDef = {
  id: "zigzag",
  version: 1,
  inputKind: "path",
  handDamping: 1,
  strokeWidth: 3,
  params: [
    { key: "runLength", label: "run length", min: 8, max: 80, default: 28 },
    { key: "jaggedness", label: "jaggedness", min: 0, max: 1, default: 0.5 },
    { key: "hug", label: "hug spine", min: 0, max: 1, default: 0.6 },
    { key: "reversals", label: "reversals", min: 0, max: 1, default: 0.15 },
  ],
  generate(input: BrushInput, p: Record<string, number>, rng: Rng): IdealPath[] {
    if (input.kind !== "path" || input.points.length < 2) return [];
    const spine = resample(input.points, STEP, false);
    if (spine.length - 1 < LOOKSTEPS) return [];
    const corridor = 8 + (1 - p.hug!) * 72;
    const pts: XY[] = [{ ...spine[0]! }];
    let pos = { ...spine[0]! };
    const probe = spine[Math.min(4, spine.length - 1)]!;
    let horizontal = Math.abs(probe.x - spine[0]!.x) >= Math.abs(probe.y - spine[0]!.y);
    let idx = 0;
    let guard = 0;
    while (idx + LOOKSTEPS <= spine.length - 1 && guard++ < 2000) {
      const target = spine[idx + LOOKSTEPS]!;
      let run = Math.max(4, p.runLength! * (1 + (rng() * 2 - 1) * p.jaggedness!));
      let dir = horizontal ? Math.sign(target.x - pos.x) || 1 : Math.sign(target.y - pos.y) || 1;
      if (rng() < p.reversals! * 0.5) { dir = -dir; run *= 0.5; }
      let next: XY = horizontal ? { x: pos.x + dir * run, y: pos.y } : { x: pos.x, y: pos.y + dir * run };
      if (nearestPointOnPolyline(next, spine).dist > corridor) {
        next = horizontal
          ? { x: pos.x + (Math.sign(target.x - pos.x) || 1) * Math.min(run, Math.abs(target.x - pos.x)), y: pos.y }
          : { x: pos.x, y: pos.y + (Math.sign(target.y - pos.y) || 1) * Math.min(run, Math.abs(target.y - pos.y)) };
      }
      pos = next;
      pts.push({ ...pos });
      horizontal = !horizontal;
      idx += Math.max(1, Math.round(run / STEP));
    }
    if (pts.length < 2) return [];
    return [{ points: pts, closed: false, stroke: true, fill: false }];
  },
};
```

`src/brushes/index.ts`:

```ts
import type { BrushDef } from "../model/types";
import { zigzag } from "./zigzag";

export const BRUSHES: Record<string, BrushDef> = { zigzag };

export function getBrush(id: string): BrushDef {
  const b = BRUSHES[id];
  if (!b) throw new Error(`unknown brush: ${id}`);
  return b;
}
```

- [ ] **Step 4: Run to verify pass.** If the corridor test is flaky for a specific seed, adjust the seed, never the assertion direction.
- [ ] **Step 5: Commit** — `git commit -m "feat: zigzag staircase brush with prefix-stable live generation"`

---

### Task 7: Hexpack brush

**Files:**
- Create: `src/brushes/hexpack.ts`, `tests/hexpack.test.ts`
- Modify: `src/brushes/index.ts` (register `hexpack`)

**Interfaces:**
- Produces: `export const hexpack: BrushDef` (id `"hexpack"`, version 1, inputKind `"region"`, handDamping 1, strokeWidth 2.5, params exactly `cellSize(20–120, 55)`, `looseness(0–1, 0.4)`, `nucleus(0–1, 0.3)`, `simplify(0–1, 0.5)`).
- Output path order: `paths[0]` = the closed simplified boundary; then hexagons (closed, 6 points) each optionally followed by its nucleus oval (closed, 16 points). All `stroke: true, fill: false`.

**Algorithm:** close the raw loop (append first point), `resample` at 6px, `rdp` with `epsilon = 2 + simplify * 58`. Boundary = that result (closed IdealPath; drop the duplicated last point if rdp kept it identical to the first). Hex grid over the boundary bbox: row height `cellSize * 0.87`, odd rows offset `cellSize/2`. Per candidate cell draw **exactly six rng values in this order**: `jx, jy, skipRoll, sizeRoll, rotRoll, nucleusRoll` (fixed draw count keeps the sequence deterministic and independent of decisions). Center = grid point + `(jx*2-1) * looseness * cellSize*0.3` per axis. Skip if `skipRoll < looseness * 0.35`. Radius `cellSize/2 * 0.92 * (1 + (sizeRoll*2-1) * 0.25 * (0.4 + looseness))`. Rotation `(rotRoll*2-1) * 0.35` rad. Hexagon = 6 vertices at that radius/rotation. Keep only if center **and all 6 vertices** are `pointInPolygon` the boundary. If kept and `nucleusRoll < nucleus`: add oval (16-point polyline, rx `radius*0.22`, ry `radius*0.32`, rotated `rotation + 0.6`) at the center.

- [ ] **Step 1: Write failing tests** (`tests/hexpack.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { hexpack } from "../src/brushes/hexpack";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { pointInPolygon } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";

const loop: XY[] = Array.from({ length: 80 }, (_, i) => {
  const a = (i / 80) * Math.PI * 2;
  return { x: 400 + Math.cos(a) * 300, y: 400 + Math.sin(a) * 260 };
});
const P = defaultParams(hexpack);
const gen = (params = P, seed = 5) => hexpack.generate({ kind: "region", points: loop }, params, rngFromSeed(seed));

describe("hexpack", () => {
  test("deterministic", () => { expect(gen()).toEqual(gen()); });
  test("first path is the closed boundary", () => {
    const [b] = gen();
    expect(b!.closed).toBe(true);
    expect(b!.points.length).toBeGreaterThanOrEqual(3);
  });
  test("packs multiple hexagons, all inside the boundary", () => {
    const paths = gen();
    const boundary = paths[0]!.points;
    const hexes = paths.slice(1).filter((p) => p.points.length === 6);
    expect(hexes.length).toBeGreaterThan(5);
    for (const h of hexes) for (const v of h.points) expect(pointInPolygon(v, boundary)).toBe(true);
  });
  test("nucleus=1 gives every hexagon an oval; nucleus=0 gives none", () => {
    const withN = gen({ ...P, nucleus: 1 });
    const without = gen({ ...P, nucleus: 0 });
    const hexCount = (ps: typeof withN) => ps.slice(1).filter((p) => p.points.length === 6).length;
    const ovalCount = (ps: typeof withN) => ps.slice(1).filter((p) => p.points.length === 16).length;
    expect(ovalCount(withN)).toBe(hexCount(withN));
    expect(ovalCount(without)).toBe(0);
  });
  test("simplify reduces boundary vertex count", () => {
    const lo = gen({ ...P, simplify: 0 })[0]!.points.length;
    const hi = gen({ ...P, simplify: 1 })[0]!.points.length;
    expect(hi).toBeLessThan(lo);
  });
  test("degenerate input returns no paths", () => {
    expect(hexpack.generate({ kind: "region", points: loop.slice(0, 2) }, P, rngFromSeed(1))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/brushes/hexpack.ts`) per the algorithm block:

```ts
import { bbox, pointInPolygon, rdp, resample } from "../model/geometry";
import type { XY } from "../model/geometry";
import type { BrushDef, BrushInput, IdealPath } from "../model/types";
import type { Rng } from "../model/rng";

function ring(cx: number, cy: number, n: number, rx: number, ry: number, rot: number): XY[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rot;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

export const hexpack: BrushDef = {
  id: "hexpack",
  version: 1,
  inputKind: "region",
  handDamping: 1,
  strokeWidth: 2.5,
  params: [
    { key: "cellSize", label: "cell size", min: 20, max: 120, default: 55 },
    { key: "looseness", label: "looseness", min: 0, max: 1, default: 0.4 },
    { key: "nucleus", label: "nucleus", min: 0, max: 1, default: 0.3 },
    { key: "simplify", label: "simplify", min: 0, max: 1, default: 0.5 },
  ],
  generate(input: BrushInput, p: Record<string, number>, rng: Rng): IdealPath[] {
    if (input.kind !== "region" || input.points.length < 3) return [];
    const closedRaw = [...input.points, input.points[0]!];
    const loop = resample(closedRaw, 6);
    let boundary = rdp(loop, 2 + p.simplify! * 58);
    const first = boundary[0]!, last = boundary.at(-1)!;
    if (boundary.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) boundary = boundary.slice(0, -1);
    if (boundary.length < 3) return [];
    const paths: IdealPath[] = [{ points: boundary, closed: true, stroke: true, fill: false }];
    const bb = bbox(boundary);
    const s = p.cellSize!;
    const rowH = s * 0.87;
    let row = 0;
    for (let cy = bb.minY + s / 2; cy < bb.maxY; cy += rowH, row++) {
      const offset = row % 2 === 1 ? s / 2 : 0;
      for (let cx = bb.minX + s / 2 + offset; cx < bb.maxX; cx += s) {
        const jx = rng(), jy = rng(), skipRoll = rng(), sizeRoll = rng(), rotRoll = rng(), nucleusRoll = rng();
        if (skipRoll < p.looseness! * 0.35) continue;
        const x = cx + (jx * 2 - 1) * p.looseness! * s * 0.3;
        const y = cy + (jy * 2 - 1) * p.looseness! * s * 0.3;
        const radius = (s / 2) * 0.92 * (1 + (sizeRoll * 2 - 1) * 0.25 * (0.4 + p.looseness!));
        const rot = (rotRoll * 2 - 1) * 0.35;
        const hex = ring(x, y, 6, radius, radius, rot);
        if (!pointInPolygon({ x, y }, boundary) || !hex.every((v) => pointInPolygon(v, boundary))) continue;
        paths.push({ points: hex, closed: true, stroke: true, fill: false });
        if (nucleusRoll < p.nucleus!) {
          paths.push({ points: ring(x, y, 16, radius * 0.22, radius * 0.32, rot + 0.6), closed: true, stroke: true, fill: false });
        }
      }
    }
    return paths;
  },
};
```

Register in `src/brushes/index.ts`: import `hexpack`, add to `BRUSHES`.

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: hexpack region brush"`

---

### Task 8: Sunstamp brush + complete registry

**Files:**
- Create: `src/brushes/sunstamp.ts`, `tests/sunstamp.test.ts`
- Modify: `src/brushes/index.ts` (register `sunstamp`)

**Interfaces:**
- Produces: `export const sunstamp: BrushDef` (id `"sunstamp"`, version 1, inputKind `"point"`, handDamping 1, strokeWidth 2.5, params exactly `size(12–120, 40)`, `ringDensity(0–1, 0.6)`, `ringDistance(0–1, 0.4)`, `dashMix(0–1, 0.2)`).
- Output: `paths[0]` = core circle (closed, 40 points, radius `size/2`). Then `count = round(6 + ringDensity*16)` satellites at ring radius `size/2 * (1.25 + ringDistance*0.65)`; per satellite draw rng in order `angleJitter, kindRoll`; angle `= (i/count)*2π + (angleJitter*2-1)*0.15`; if `kindRoll < dashMix` → dash: open 2-point radial segment of length `size*0.12` centered on the ring radius; else → dot: closed 8-point circle radius `max(1.5, size*0.035)`.

- [ ] **Step 1: Write failing tests** (`tests/sunstamp.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { sunstamp } from "../src/brushes/sunstamp";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { BRUSHES } from "../src/brushes/index";

const P = defaultParams(sunstamp);
const gen = (params = P, seed = 8) => sunstamp.generate({ kind: "point", at: { x: 200, y: 200 } }, params, rngFromSeed(seed));

describe("sunstamp", () => {
  test("deterministic", () => { expect(gen()).toEqual(gen()); });
  test("core circle first: closed, 40 points, radius size/2", () => {
    const [core] = gen();
    expect(core!.closed).toBe(true);
    expect(core!.points).toHaveLength(40);
    const r = Math.hypot(core!.points[0]!.x - 200, core!.points[0]!.y - 200);
    expect(r).toBeCloseTo(P.size! / 2, 6);
  });
  test("satellite count follows ringDensity", () => {
    expect(gen({ ...P, ringDensity: 0 }).length - 1).toBe(6);
    expect(gen({ ...P, ringDensity: 1 }).length - 1).toBe(22);
  });
  test("dashMix 1 → all satellites are 2-point dashes; 0 → all 8-point dots", () => {
    const dashes = gen({ ...P, dashMix: 1 }).slice(1);
    const dots = gen({ ...P, dashMix: 0 }).slice(1);
    expect(dashes.every((s) => s.points.length === 2 && !s.closed)).toBe(true);
    expect(dots.every((s) => s.points.length === 8 && s.closed)).toBe(true);
  });
});

test("registry has all three brushes", () => {
  expect(Object.keys(BRUSHES).sort()).toEqual(["hexpack", "sunstamp", "zigzag"]);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/brushes/sunstamp.ts`):

```ts
import type { XY } from "../model/geometry";
import type { BrushDef, BrushInput, IdealPath } from "../model/types";
import type { Rng } from "../model/rng";

function circle(cx: number, cy: number, r: number, n: number): XY[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export const sunstamp: BrushDef = {
  id: "sunstamp",
  version: 1,
  inputKind: "point",
  handDamping: 1,
  strokeWidth: 2.5,
  params: [
    { key: "size", label: "size", min: 12, max: 120, default: 40 },
    { key: "ringDensity", label: "ring density", min: 0, max: 1, default: 0.6 },
    { key: "ringDistance", label: "ring distance", min: 0, max: 1, default: 0.4 },
    { key: "dashMix", label: "dash mix", min: 0, max: 1, default: 0.2 },
  ],
  generate(input: BrushInput, p: Record<string, number>, rng: Rng): IdealPath[] {
    if (input.kind !== "point") return [];
    const { x, y } = input.at;
    const paths: IdealPath[] = [{ points: circle(x, y, p.size! / 2, 40), closed: true, stroke: true, fill: false }];
    const count = Math.round(6 + p.ringDensity! * 16);
    const ringR = (p.size! / 2) * (1.25 + p.ringDistance! * 0.65);
    for (let i = 0; i < count; i++) {
      const angleJitter = rng(), kindRoll = rng();
      const a = (i / count) * Math.PI * 2 + (angleJitter * 2 - 1) * 0.15;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      if (kindRoll < p.dashMix!) {
        const half = p.size! * 0.06;
        paths.push({
          points: [
            { x: x + dir.x * (ringR - half), y: y + dir.y * (ringR - half) },
            { x: x + dir.x * (ringR + half), y: y + dir.y * (ringR + half) },
          ],
          closed: false, stroke: true, fill: false,
        });
      } else {
        paths.push({
          points: circle(x + dir.x * ringR, y + dir.y * ringR, Math.max(1.5, p.size! * 0.035), 8),
          closed: true, stroke: true, fill: false,
        });
      }
    }
    return paths;
  },
};
```

Register in `src/brushes/index.ts`.

- [ ] **Step 4: Run to verify pass** (full `npm test` — all suites).
- [ ] **Step 5: Commit** — `git commit -m "feat: sunstamp point brush; brush registry complete"`

---

### Task 9: Generation pipeline (bake)

**Files:**
- Create: `src/engine/generate.ts`, `tests/generate.test.ts`

**Interfaces:**
- Consumes: `strokeStreams` (rng), `handPass` (hand), `getBrush` (registry), types.
- Produces:
  - `pathToD(points: XY[], closed: boolean): string` — `M x y L x y …` (+ ` Z` when closed), coords rounded to 2 decimals.
  - `runPipeline(brush: BrushDef, input: BrushInput, params: Record<string, number>, seed: number, hand: number, sheetW: number): BakedPath[]` — generate with `gen` stream → `handPass(ideal, hand * brush.handDamping, handStream, sheetW)` → one `BakedPath` per ideal path, `width = brush.strokeWidth * sheetW / 1600`.
  - `bakeStroke(scene: Scene, stroke: Stroke): void` — looks up the brush by `stroke.brush` and sets `stroke.baked` via `runPipeline` (uses `scene.hand`, `scene.sheet.w`).

- [ ] **Step 1: Write failing tests** (`tests/generate.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { pathToD, runPipeline } from "../src/engine/generate";
import { zigzag } from "../src/brushes/zigzag";
import { defaultParams } from "../src/model/types";
import type { BrushInput } from "../src/model/types";

const input: BrushInput = {
  kind: "path",
  points: Array.from({ length: 150 }, (_, i) => ({ x: 100 + i * 3, y: 400 + Math.sin(i / 10) * 50 })),
};
const P = defaultParams(zigzag);

describe("pathToD", () => {
  test("open path", () => {
    expect(pathToD([{ x: 1.234, y: 2 }, { x: 3, y: 4.5678 }], false)).toBe("M 1.23 2 L 3 4.57");
  });
  test("closed path appends Z", () => {
    expect(pathToD([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], true)).toBe("M 0 0 L 1 0 L 0 1 Z");
  });
});

describe("runPipeline", () => {
  test("deterministic end-to-end", () => {
    const a = runPipeline(zigzag, input, P, 33, 0.5, 1600);
    expect(a).toEqual(runPipeline(zigzag, input, P, 33, 0.5, 1600));
  });
  test("hand=0 equals raw generate geometry (no wobble)", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0, 1600);
    expect(baked[0]!.d).toMatch(/^M /);
    // axis-aligned segments survive: every L shares x or y with predecessor
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    for (let i = 1; i < coords.length; i++) {
      const same = coords[i]![0] === coords[i - 1]![0] || coords[i]![1] === coords[i - 1]![1];
      expect(same).toBe(true);
    }
  });
  test("hand>0 breaks perfect axis alignment", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0.8, 1600);
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    const bent = coords.some((c, i) => i > 0 && c[0] !== coords[i - 1]![0] && c[1] !== coords[i - 1]![1]);
    expect(bent).toBe(true);
  });
  test("width scales with sheet size", () => {
    expect(runPipeline(zigzag, input, P, 1, 0, 3200)[0]!.width).toBeCloseTo(zigzag.strokeWidth * 2, 9);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/engine/generate.ts`):

```ts
import { strokeStreams } from "../model/rng";
import { handPass } from "../hand/hand";
import { getBrush } from "../brushes/index";
import type { XY } from "../model/geometry";
import type { BakedPath, BrushDef, BrushInput, Scene, Stroke } from "../model/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pathToD(points: XY[], closed: boolean): string {
  const [head, ...rest] = points;
  if (!head) return "";
  let d = `M ${r2(head.x)} ${r2(head.y)}`;
  for (const p of rest) d += ` L ${r2(p.x)} ${r2(p.y)}`;
  return closed ? d + " Z" : d;
}

export function runPipeline(
  brush: BrushDef, input: BrushInput, params: Record<string, number>,
  seed: number, hand: number, sheetW: number,
): BakedPath[] {
  const { gen, hand: handRng } = strokeStreams(seed);
  const ideal = brush.generate(input, params, gen);
  const wobbled = handPass(ideal, hand * brush.handDamping, handRng, sheetW);
  const width = (brush.strokeWidth * sheetW) / 1600;
  return wobbled.map((p) => ({ d: pathToD(p.points, p.closed), stroke: p.stroke, fill: p.fill, width: p.stroke ? width : 0 }));
}

export function bakeStroke(scene: Scene, stroke: Stroke): void {
  const brush = getBrush(stroke.brush);
  stroke.baked = runPipeline(brush, stroke.input, stroke.params, stroke.seed, scene.hand, scene.sheet.w);
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: generation pipeline and path baking"`

---

### Task 10: Scene mutations + vintage logic

**Files:**
- Create: `src/engine/scene.ts`, `tests/scene.test.ts`

**Interfaces:**
- Consumes: `bakeStroke`, `getBrush`, `BRUSHES`, `randomSeed`, types.
- Produces (all mutate `scene` in place):
  - `newScene(w: number, h: number, paletteId?: string): Scene` (defaults: paletteId `"notebook"`, hand `0.6`, strokes `[]`)
  - `addStroke(scene, args: { brush: string; input: BrushInput; seed: number; params: Record<string, number>; colorSlot: number }): Stroke` — id = `s${counter}` monotonic per session (module-level counter is fine; ids only need uniqueness within a scene — on scene load, re-seed the counter above the max existing), `brushVersion` = current brush version, bakes, appends, returns the stroke.
  - `getStroke(scene, id): Stroke | undefined`
  - `deleteStroke(scene, id): void`
  - `isVintage(stroke: Stroke): boolean` — brush missing from registry OR `brushVersion !== getBrush(...).version`
  - `vintageCount(scene): number`
  - `rerollStroke(scene, id): void` — new `randomSeed()`; **migrates** (sets `brushVersion` to current) and rebakes.
  - `reparamStroke(scene, id, params: Record<string, number>): void` — replaces params; migrates + rebakes.
  - `reslotStroke(scene, id, colorSlot: number): void` — **no** migration, no rebake (color is render-side).
  - `migrateStroke(scene, id): void` — same seed/params, current version, rebake.
  - `regenerateAllVintage(scene): void`
  - `setHand(scene, hand: number): void` — sets and rebakes **non-vintage strokes only**.
  - `setPalette(scene, paletteId: string): void` — sets only (no rebake).

- [ ] **Step 1: Write failing tests** (`tests/scene.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { addStroke, deleteStroke, isVintage, newScene, regenerateAllVintage, reparamStroke, rerollStroke, reslotStroke, setHand, setPalette, vintageCount } from "../src/engine/scene";
import { zigzag } from "../src/brushes/zigzag";
import { defaultParams } from "../src/model/types";
import type { BrushInput, Scene, Stroke } from "../src/model/types";

const input: BrushInput = {
  kind: "path",
  points: Array.from({ length: 150 }, (_, i) => ({ x: 100 + i * 3, y: 400 + Math.sin(i / 10) * 50 })),
};
const mk = (): { scene: Scene; s: Stroke } => {
  const scene = newScene(1600, 2000);
  const s = addStroke(scene, { brush: "zigzag", input, seed: 42, params: defaultParams(zigzag), colorSlot: 1 });
  return { scene, s };
};

describe("scene", () => {
  test("addStroke bakes and appends", () => {
    const { scene, s } = mk();
    expect(scene.strokes).toHaveLength(1);
    expect(s.baked.length).toBeGreaterThan(0);
    expect(s.brushVersion).toBe(zigzag.version);
    expect(isVintage(s)).toBe(false);
  });
  test("deleteStroke removes by id", () => {
    const { scene, s } = mk();
    deleteStroke(scene, s.id);
    expect(scene.strokes).toHaveLength(0);
  });
  test("reroll changes seed and geometry, keeps input/params", () => {
    const { scene, s } = mk();
    const before = s.baked[0]!.d, seed = s.seed;
    rerollStroke(scene, s.id);
    expect(s.seed).not.toBe(seed);
    expect(s.baked[0]!.d).not.toBe(before);
    expect(s.input).toBe(input);
  });
  test("reparam rebakes; reslot does not rebake", () => {
    const { scene, s } = mk();
    const before = s.baked[0]!.d;
    reparamStroke(scene, s.id, { ...s.params, runLength: 60 });
    expect(s.baked[0]!.d).not.toBe(before);
    const after = s.baked[0]!.d;
    reslotStroke(scene, s.id, 3);
    expect(s.colorSlot).toBe(3);
    expect(s.baked[0]!.d).toBe(after);
  });
  test("setHand rebakes non-vintage, skips vintage; regenerateAllVintage migrates", () => {
    const { scene, s } = mk();
    const s2 = addStroke(scene, { brush: "zigzag", input, seed: 7, params: defaultParams(zigzag), colorSlot: 2 });
    s.brushVersion = 999; // simulate vintage
    const frozen = s.baked[0]!.d, live = s2.baked[0]!.d;
    expect(vintageCount(scene)).toBe(1);
    setHand(scene, 0.1);
    expect(s.baked[0]!.d).toBe(frozen);      // vintage untouched
    expect(s2.baked[0]!.d).not.toBe(live);   // live rebaked
    regenerateAllVintage(scene);
    expect(vintageCount(scene)).toBe(0);
    expect(s.brushVersion).toBe(zigzag.version);
    expect(s.baked[0]!.d).not.toBe(frozen);
  });
  test("setPalette never touches bake", () => {
    const { scene, s } = mk();
    s.brushVersion = 999;
    const frozen = s.baked[0]!.d;
    setPalette(scene, "bauhaus");
    expect(scene.paletteId).toBe("bauhaus");
    expect(s.baked[0]!.d).toBe(frozen);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/engine/scene.ts`):

```ts
import { bakeStroke } from "./generate";
import { BRUSHES, getBrush } from "../brushes/index";
import { randomSeed } from "../model/rng";
import type { BrushInput, Scene, Stroke } from "../model/types";

let idCounter = 1;
export function seedIdCounter(scene: Scene): void {
  const max = scene.strokes.map((s) => parseInt(s.id.slice(1), 10) || 0).reduce((a, b) => Math.max(a, b), 0);
  idCounter = Math.max(idCounter, max + 1);
}

export function newScene(w: number, h: number, paletteId = "notebook"): Scene {
  return { version: 1, sheet: { w, h }, paletteId, hand: 0.6, strokes: [] };
}

export function addStroke(
  scene: Scene,
  args: { brush: string; input: BrushInput; seed: number; params: Record<string, number>; colorSlot: number },
): Stroke {
  const stroke: Stroke = {
    id: `s${idCounter++}`,
    brush: args.brush,
    brushVersion: getBrush(args.brush).version,
    input: args.input,
    seed: args.seed,
    params: args.params,
    colorSlot: args.colorSlot,
    baked: [],
  };
  bakeStroke(scene, stroke);
  scene.strokes.push(stroke);
  return stroke;
}

export function getStroke(scene: Scene, id: string): Stroke | undefined {
  return scene.strokes.find((s) => s.id === id);
}

export function deleteStroke(scene: Scene, id: string): void {
  scene.strokes = scene.strokes.filter((s) => s.id !== id);
}

export function isVintage(stroke: Stroke): boolean {
  const brush = BRUSHES[stroke.brush];
  return !brush || brush.version !== stroke.brushVersion;
}

export function vintageCount(scene: Scene): number {
  return scene.strokes.filter(isVintage).length;
}

function migrate(scene: Scene, stroke: Stroke): void {
  stroke.brushVersion = getBrush(stroke.brush).version;
  bakeStroke(scene, stroke);
}

export function rerollStroke(scene: Scene, id: string): void {
  const s = getStroke(scene, id);
  if (!s) return;
  s.seed = randomSeed();
  migrate(scene, s);
}

export function reparamStroke(scene: Scene, id: string, params: Record<string, number>): void {
  const s = getStroke(scene, id);
  if (!s) return;
  s.params = params;
  migrate(scene, s);
}

export function reslotStroke(scene: Scene, id: string, colorSlot: number): void {
  const s = getStroke(scene, id);
  if (s) s.colorSlot = colorSlot;
}

export function migrateStroke(scene: Scene, id: string): void {
  const s = getStroke(scene, id);
  if (s) migrate(scene, s);
}

export function regenerateAllVintage(scene: Scene): void {
  for (const s of scene.strokes) if (isVintage(s)) migrate(scene, s);
}

export function setHand(scene: Scene, hand: number): void {
  scene.hand = hand;
  for (const s of scene.strokes) if (!isVintage(s)) bakeStroke(scene, s);
}

export function setPalette(scene: Scene, paletteId: string): void {
  scene.paletteId = paletteId;
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: scene mutations with vintage freeze policy"`

---

### Task 11: Snapshot history

**Files:**
- Create: `src/engine/history.ts`, `tests/history.test.ts`

**Interfaces:**
- Produces:

```ts
export class History {
  constructor(cap?: number);            // default 100
  reset(scene: Scene): void;            // clear and push initial snapshot
  push(scene: Scene): void;             // snapshot AFTER a mutation; truncates redo tail; drops oldest beyond cap
  undo(): Scene | null;                 // previous snapshot or null
  redo(): Scene | null;
  get canUndo(): boolean;
  get canRedo(): boolean;
}
```

Snapshots are `JSON.stringify(scene)` strings; `undo`/`redo` return `JSON.parse` copies (callers replace their scene reference and re-seed the id counter via `seedIdCounter`).

- [ ] **Step 1: Write failing tests** (`tests/history.test.ts`):

```ts
import { expect, test } from "vitest";
import { History } from "../src/engine/history";
import { newScene } from "../src/engine/scene";

test("undo/redo walk snapshots", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  expect(h.canUndo).toBe(false);
  scene.hand = 0.1; h.push(scene);
  scene.hand = 0.2; h.push(scene);
  expect(h.undo()!.hand).toBe(0.1);
  expect(h.undo()!.hand).toBe(0.6); // newScene default
  expect(h.undo()).toBeNull();
  expect(h.redo()!.hand).toBe(0.1);
  expect(h.redo()!.hand).toBe(0.2);
  expect(h.redo()).toBeNull();
});

test("push after undo truncates redo tail", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  scene.hand = 0.1; h.push(scene);
  h.undo();
  scene.hand = 0.9; h.push(scene);
  expect(h.canRedo).toBe(false);
  expect(h.undo()!.hand).toBe(0.6);
});

test("cap drops oldest", () => {
  const h = new History(3);
  const scene = newScene(100, 100);
  h.reset(scene);
  for (let i = 1; i <= 5; i++) { scene.hand = i / 10; h.push(scene); }
  let last = null, steps = 0;
  for (let s = h.undo(); s; s = h.undo()) { last = s; steps++; }
  expect(steps).toBe(2); // cap 3 = current + 2 older
  expect(last!.hand).toBe(0.3);
});

test("snapshots are deep copies", () => {
  const h = new History();
  const scene = newScene(100, 100);
  h.reset(scene);
  scene.hand = 0.5; h.push(scene);
  const restored = h.undo()!;
  restored.hand = 0.99;
  expect(h.redo()!.hand).toBe(0.5);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/engine/history.ts`):

```ts
import type { Scene } from "../model/types";

export class History {
  private snaps: string[] = [];
  private idx = -1;
  constructor(private cap = 100) {}

  reset(scene: Scene): void {
    this.snaps = [JSON.stringify(scene)];
    this.idx = 0;
  }
  push(scene: Scene): void {
    this.snaps = this.snaps.slice(0, this.idx + 1);
    this.snaps.push(JSON.stringify(scene));
    if (this.snaps.length > this.cap) this.snaps.shift();
    this.idx = this.snaps.length - 1;
  }
  undo(): Scene | null {
    if (!this.canUndo) return null;
    this.idx--;
    return JSON.parse(this.snaps[this.idx]!) as Scene;
  }
  redo(): Scene | null {
    if (!this.canRedo) return null;
    this.idx++;
    return JSON.parse(this.snaps[this.idx]!) as Scene;
  }
  get canUndo(): boolean { return this.idx > 0; }
  get canRedo(): boolean { return this.idx < this.snaps.length - 1; }
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: snapshot undo/redo history"`

---

### Task 12: Persistence

**Files:**
- Create: `src/engine/persist.ts`, `tests/persist.test.ts`

**Interfaces:**
- Produces:
  - `const AUTOSAVE_KEY = "wobblewerk:autosave"`
  - `serializeScene(scene: Scene): string`
  - `deserializeScene(json: string): Scene` — throws `Error("unsupported file")` unless parsed `version === 1` and `strokes` is an array.
  - `autosave(scene: Scene, storage?: Pick<Storage, "setItem">): void` — debounced 300ms (module-level timer, `setTimeout`).
  - `flushAutosave(): void` — fire pending save immediately (for tests/unload).
  - `loadAutosave(storage?: Pick<Storage, "getItem">): Scene | null` — null on missing or corrupt.

- [ ] **Step 1: Write failing tests** (`tests/persist.test.ts`):

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AUTOSAVE_KEY, autosave, deserializeScene, flushAutosave, loadAutosave, serializeScene } from "../src/engine/persist";
import { addStroke, newScene } from "../src/engine/scene";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";

const mkScene = () => {
  const scene = newScene(1600, 2000);
  addStroke(scene, {
    brush: "zigzag",
    input: { kind: "path", points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) },
    seed: 5, params: defaultParams(zigzag), colorSlot: 2,
  });
  return scene;
};

test("round-trip preserves everything including bake, byte-exact", () => {
  const scene = mkScene();
  const restored = deserializeScene(serializeScene(scene));
  expect(restored).toEqual(scene);
  expect(serializeScene(restored)).toBe(serializeScene(scene)); // bake fidelity
});

test("deserialize rejects garbage and wrong versions", () => {
  expect(() => deserializeScene("{}")).toThrow("unsupported file");
  expect(() => deserializeScene('{"version":2,"strokes":[]}')).toThrow("unsupported file");
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("autosave debounces 300ms", () => {
  const store = new Map<string, string>();
  const storage = { setItem: (k: string, v: string) => void store.set(k, v) };
  const scene = mkScene();
  autosave(scene, storage);
  autosave(scene, storage);
  expect(store.size).toBe(0);
  vi.advanceTimersByTime(299);
  expect(store.size).toBe(0);
  vi.advanceTimersByTime(2);
  expect(store.get(AUTOSAVE_KEY)).toBe(serializeScene(scene));
});

test("loadAutosave returns scene or null", () => {
  const scene = mkScene();
  const good = { getItem: () => serializeScene(scene) };
  const bad = { getItem: () => "not json" };
  const empty = { getItem: () => null };
  expect(loadAutosave(good)).toEqual(scene);
  expect(loadAutosave(bad)).toBeNull();
  expect(loadAutosave(empty)).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/engine/persist.ts`):

```ts
import type { Scene } from "../model/types";

export const AUTOSAVE_KEY = "wobblewerk:autosave";

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

export function deserializeScene(json: string): Scene {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("unsupported file"); }
  const s = parsed as Scene;
  if (!s || s.version !== 1 || !Array.isArray(s.strokes)) throw new Error("unsupported file");
  return s;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: (() => void) | undefined;

export function autosave(scene: Scene, storage: Pick<Storage, "setItem"> = localStorage): void {
  clearTimeout(timer);
  pending = () => storage.setItem(AUTOSAVE_KEY, serializeScene(scene));
  timer = setTimeout(() => { pending?.(); pending = undefined; }, 300);
}

export function flushAutosave(): void {
  clearTimeout(timer);
  pending?.();
  pending = undefined;
}

export function loadAutosave(storage: Pick<Storage, "getItem"> = localStorage): Scene | null {
  const raw = storage.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try { return deserializeScene(raw); } catch { return null; }
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: scene serialization, debounced autosave, file round-trip"`

---

### Task 13: SVG renderer

**Files:**
- Create: `src/render/svg.ts`, `tests/render.test.ts` (jsdom)

**Interfaces:**
- Consumes: `getPalette`, `resolveInk`, `isVintage`-free (renderer never checks vintage — it renders whatever bake exists), types.
- Produces:

```ts
export class SheetRenderer {
  constructor(svg: SVGSVGElement);
  renderScene(scene: Scene): void;              // full rebuild: paper rect + all strokes + empty live/overlay groups
  updateStroke(scene: Scene, id: string): void; // re-render one stroke's group in place (same z-position)
  removeStroke(id: string): void;
  renderLive(scene: Scene, stroke: Stroke): void; // upsert into the live layer (stroke not in scene.strokes)
  renderGhost(points: XY[]): void;              // thin dashed polyline in live layer (region trail)
  clearLive(): void;
  setSelection(scene: Scene, id: string | null): void; // halo path in overlay layer
}
```

**DOM contract (tests assert this):** inside the `<svg>`: `<rect class="paper">` (sheet size, fill = palette paper), `<g class="strokes">` containing per stroke `<g data-stroke-id="{id}">` with (1) `<path class="ink">` — `d` = all baked `d` joined with `" "`, `fill="none"`, `stroke` = resolved ink, `stroke-width` = baked width, `stroke-linecap/linejoin="round"`; (2) `<path class="hit">` — same `d`, `fill="none"`, `stroke="#000"`, `stroke-opacity="0"`, `stroke-width = max(width + 10, 14)`, `pointer-events: stroke`. Then `<g class="live">`, `<g class="overlay">`. viewBox = `0 0 w h` on renderScene. Selection halo: `<path class="halo">` in overlay (joined `d`, `fill="none"`, wider stroke, `pointer-events: none`). v1 bakes are stroke-only; if a baked path has `fill: true`, render it with `fill` = ink (still one path element — mixed flags may share the element).

- [ ] **Step 1: Write failing tests** (`tests/render.test.ts`) — start file with `// @vitest-environment jsdom`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { SheetRenderer } from "../src/render/svg";
import { addStroke, newScene } from "../src/engine/scene";
import { getPalette, resolveInk } from "../src/model/palettes";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";
import type { Scene } from "../src/model/types";

const input = { kind: "path" as const, points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) };

let svg: SVGSVGElement, r: SheetRenderer, scene: Scene;
beforeEach(() => {
  document.body.innerHTML = "<svg></svg>";
  svg = document.querySelector("svg")!;
  r = new SheetRenderer(svg);
  scene = newScene(1600, 2000);
});

describe("SheetRenderer", () => {
  test("renderScene builds paper, strokes, live, overlay", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 3, params: defaultParams(zigzag), colorSlot: 2 });
    r.renderScene(scene);
    expect(svg.getAttribute("viewBox")).toBe("0 0 1600 2000");
    expect(svg.querySelector("rect.paper")!.getAttribute("fill")).toBe(getPalette("notebook").paper);
    const g = svg.querySelector(`g[data-stroke-id="${s.id}"]`)!;
    const ink = g.querySelector("path.ink")!;
    expect(ink.getAttribute("stroke")).toBe(resolveInk(getPalette("notebook"), 2));
    expect(ink.getAttribute("fill")).toBe("none");
    expect(g.querySelector("path.hit")).toBeTruthy();
    expect(svg.querySelector("g.live")).toBeTruthy();
    expect(svg.querySelector("g.overlay")).toBeTruthy();
  });
  test("palette swap re-render recolors existing bake", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 3, params: defaultParams(zigzag), colorSlot: 1 });
    r.renderScene(scene);
    scene.paletteId = "bauhaus";
    r.renderScene(scene);
    const ink = svg.querySelector(`g[data-stroke-id="${s.id}"] path.ink`)!;
    expect(ink.getAttribute("stroke")).toBe(resolveInk(getPalette("bauhaus"), 1));
  });
  test("updateStroke keeps z-position; removeStroke removes group", () => {
    const a = addStroke(scene, { brush: "zigzag", input, seed: 1, params: defaultParams(zigzag), colorSlot: 1 });
    const b = addStroke(scene, { brush: "zigzag", input, seed: 2, params: defaultParams(zigzag), colorSlot: 2 });
    r.renderScene(scene);
    a.colorSlot = 4;
    r.updateStroke(scene, a.id);
    const ids = [...svg.querySelectorAll("g.strokes > g")].map((g) => g.getAttribute("data-stroke-id"));
    expect(ids).toEqual([a.id, b.id]);
    r.removeStroke(b.id);
    expect(svg.querySelector(`g[data-stroke-id="${b.id}"]`)).toBeNull();
  });
  test("live layer upsert and clear; selection halo", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 1, params: defaultParams(zigzag), colorSlot: 1 });
    r.renderScene(scene);
    r.renderGhost([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    expect(svg.querySelectorAll("g.live > *").length).toBe(1);
    r.clearLive();
    expect(svg.querySelectorAll("g.live > *").length).toBe(0);
    r.setSelection(scene, s.id);
    expect(svg.querySelector("g.overlay path.halo")).toBeTruthy();
    r.setSelection(scene, null);
    expect(svg.querySelector("g.overlay path.halo")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/render/svg.ts`). Key notes: `const NS = "http://www.w3.org/2000/svg"`; `document.createElementNS(NS, "path")`; joined d = `stroke.baked.map(b => b.d).join(" ")`; width from `stroke.baked[0]?.width ?? 2`; `renderLive` upserts a `<path data-live-id>` with same ink attrs; `renderGhost` renders `<polyline>` with `stroke="#999" stroke-dasharray="4 4" fill="none" stroke-width="1.5"` (points attr from XY list); halo = path with `stroke="#4a90d9" stroke-opacity="0.5"`, width `+8`, `pointer-events:none`, inserted in overlay. Full implementation left to the task worker — the DOM contract above and the tests are the specification; every attribute asserted in tests is required.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: SVG DOM sheet renderer"`

---

### Task 14: Viewport math

**Files:**
- Create: `src/render/viewport.ts`, `tests/viewport.test.ts`

**Interfaces:**
- Produces:

```ts
export class ViewBox {
  x: number; y: number; w: number; h: number;
  constructor(sheetW: number, sheetH: number);
  fit(containerW: number, containerH: number, margin?: number): void; // default margin 40: center sheet, contain-fit
  zoomAt(px: number, py: number, factor: number): void; // px,py in sheet coords; clamp total zoom 0.25x–8x of fit scale... simpler: clamp resulting w to [sheetW/8, sheetW*4]
  panBy(dx: number, dy: number): void;                  // dx,dy in sheet coords
  toString(): string;                                    // "x y w h"
}
```

`zoomAt` keeps `(px, py)` fixed: `x' = px - (px - x) * factor; w' = w * factor` (same for y/h), where `factor < 1` zooms in. Clamp `w` to `[sheetW / 8, sheetW * 4]` (recompute consistently if clamped).

- [ ] **Step 1: Write failing tests** (`tests/viewport.test.ts`):

```ts
import { expect, test } from "vitest";
import { ViewBox } from "../src/render/viewport";

test("fit contains sheet with margin and centers", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800, 40);
  // scale = (800-80)/2000 = 0.36 → visible sheet-units: 800/0.36 ≈ 2222
  expect(v.h).toBeCloseTo(2222.22, 1);
  expect(v.w).toBeCloseTo(2222.22, 1);
  expect(v.x).toBeCloseTo((1600 - v.w) / 2, 6);
  expect(v.y).toBeCloseTo((2000 - v.h) / 2, 6);
});

test("zoomAt keeps the anchor point fixed", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800);
  const before = { ...v };
  const anchor = { x: 400, y: 500 };
  const relX = (anchor.x - before.x) / before.w;
  v.zoomAt(anchor.x, anchor.y, 0.5);
  expect((anchor.x - v.x) / v.w).toBeCloseTo(relX, 9);
  expect(v.w).toBeCloseTo(before.w * 0.5, 9);
});

test("zoom clamps", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800);
  for (let i = 0; i < 30; i++) v.zoomAt(800, 1000, 0.5);
  expect(v.w).toBeGreaterThanOrEqual(1600 / 8 - 1e-6);
  for (let i = 0; i < 30; i++) v.zoomAt(800, 1000, 2);
  expect(v.w).toBeLessThanOrEqual(1600 * 4 + 1e-6);
});

test("panBy shifts origin; toString formats", () => {
  const v = new ViewBox(100, 100);
  v.fit(100, 100, 0);
  v.panBy(10, -5);
  expect(v.toString()).toBe(`${v.x} ${v.y} ${v.w} ${v.h}`);
  expect(v.x).toBeCloseTo(10, 9);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** (`src/render/viewport.ts`):

```ts
export class ViewBox {
  x = 0; y = 0; w: number; h: number;
  constructor(private sheetW: number, private sheetH: number) {
    this.w = sheetW; this.h = sheetH;
  }
  fit(containerW: number, containerH: number, margin = 40): void {
    const scale = Math.min((containerW - margin * 2) / this.sheetW, (containerH - margin * 2) / this.sheetH);
    this.w = containerW / scale;
    this.h = containerH / scale;
    this.x = (this.sheetW - this.w) / 2;
    this.y = (this.sheetH - this.h) / 2;
  }
  zoomAt(px: number, py: number, factor: number): void {
    const minW = this.sheetW / 8, maxW = this.sheetW * 4;
    const clamped = Math.min(maxW, Math.max(minW, this.w * factor)) / this.w;
    this.x = px - (px - this.x) * clamped;
    this.y = py - (py - this.y) * clamped;
    this.w *= clamped;
    this.h *= clamped;
  }
  panBy(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  toString(): string { return `${this.x} ${this.y} ${this.w} ${this.h}`; }
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: viewport viewbox math (fit, anchored zoom, pan)"`

---

### Task 15: Export (SVG + PNG)

**Files:**
- Create: `src/export/svg.ts`, `src/export/png.ts`, `tests/export.test.ts` (jsdom)

**Interfaces:**
- Produces:
  - `exportSvgString(svg: SVGSVGElement, scene: Scene): string` — clone the live svg; remove `g.live`, `g.overlay`, and every `path.hit`; set `xmlns="http://www.w3.org/2000/svg"`, `width`/`height` = sheet px, `viewBox="0 0 w h"`; serialize with `XMLSerializer`.
  - `exportPngBlob(svg: SVGSVGElement, scene: Scene): Promise<Blob>` — data-URI the SVG string into an `Image`, draw onto a canvas at **2×** sheet resolution, `canvas.toBlob` PNG. (Browser-only; verified in e2e, not unit tests.)
  - `download(filename: string, blob: Blob): void` — anchor + object URL + revoke.

- [ ] **Step 1: Write failing tests** (`tests/export.test.ts`):

```ts
// @vitest-environment jsdom
import { expect, test } from "vitest";
import { exportSvgString } from "../src/export/svg";
import { SheetRenderer } from "../src/render/svg";
import { addStroke, newScene } from "../src/engine/scene";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";

test("exportSvgString: standalone, stripped of live/overlay/hit, sheet-sized", () => {
  document.body.innerHTML = "<svg></svg>";
  const svg = document.querySelector("svg")!;
  const r = new SheetRenderer(svg);
  const scene = newScene(1600, 2000);
  addStroke(scene, {
    brush: "zigzag",
    input: { kind: "path", points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) },
    seed: 3, params: defaultParams(zigzag), colorSlot: 1,
  });
  r.renderScene(scene);
  r.renderGhost([{ x: 0, y: 0 }, { x: 9, y: 9 }]);
  r.setSelection(scene, scene.strokes[0]!.id);
  const out = exportSvgString(svg, scene);
  expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(out).toContain('width="1600"');
  expect(out).toContain('height="2000"');
  expect(out).toContain('viewBox="0 0 1600 2000"');
  expect(out).toContain("path");
  expect(out).not.toContain("hit");
  expect(out).not.toContain("halo");
  expect(out).not.toContain("live");
  // original svg untouched
  expect(svg.querySelector("path.hit")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** both files:

`src/export/svg.ts`:

```ts
import type { Scene } from "../model/types";

export function exportSvgString(svg: SVGSVGElement, scene: Scene): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("g.live, g.overlay, path.hit").forEach((el) => el.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(scene.sheet.w));
  clone.setAttribute("height", String(scene.sheet.h));
  clone.setAttribute("viewBox", `0 0 ${scene.sheet.w} ${scene.sheet.h}`);
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  return new XMLSerializer().serializeToString(clone);
}
```

`src/export/png.ts`:

```ts
import { exportSvgString } from "./svg";
import type { Scene } from "../model/types";

export function exportPngBlob(svg: SVGSVGElement, scene: Scene): Promise<Blob> {
  const str = exportSvgString(svg, scene);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = scene.sheet.w * 2;
      canvas.height = scene.sheet.h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png encode failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg rasterize failed"));
    img.src = url;
  });
}

export function download(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: SVG and PNG export"`

---

### Task 16: UI shell + app state

**Files:**
- Create: `src/ui/app-state.ts`, `tests/app-state.test.ts`
- Modify: `index.html`, `src/styles.css`, `src/main.ts`

**Interfaces:**
- Produces (`src/ui/app-state.ts`):

```ts
export type Tool = "zigzag" | "hexpack" | "sunstamp" | "select";
export class AppState {
  tool: Tool = "zigzag";
  pinnedSlot: number | null = null;   // null = auto-rotate
  selection: string | null = null;
  private rotation = 0;
  nextColorSlot(inkCount: number): number {
    if (this.pinnedSlot !== null) return this.pinnedSlot;
    return 1 + (this.rotation++ % inkCount);
  }
}
```

- Produces (DOM, `index.html`): app layout later tasks hang handlers on — top bar `#topbar` containing `#palette-strip`, `#palette-select` (a `<select>`), buttons `#btn-undo #btn-redo #btn-fit #btn-new #btn-open #btn-save #btn-export-svg #btn-export-png`, hidden `<input type="file" id="file-open" accept=".json">`; left rail `#rail` containing `#tools` (four buttons `data-tool="zigzag|hexpack|sunstamp|select"` labeled Zigzag/Hexpack/Sunstamp/Select), `#param-panel`, `#hand-dial` (`<input type="range" min="0" max="1" step="0.01">` + label); center `#stage` containing `<svg id="sheet">`; `#vintage-banner` (hidden: text span `#vintage-count` + button `#btn-regen-vintage`); `#new-dialog` (`<dialog>` with three buttons `data-sheet="square|portrait|landscape"`).
- Produces (`src/main.ts`): boots the app — loads autosave else opens `#new-dialog`; creates `SheetRenderer`, `ViewBox` (fit on boot + on resize), `History` (reset with scene), `AppState`; exposes `window.__ww = { getScene: () => scene, exportSvgString: () => exportSvgString(svgEl, scene) }` (always; harmless) — **the e2e suite and later tasks depend on `window.__ww`**. Central helper later tasks call:

```ts
function commit(): void {   // after any mutation
  history.push(scene);
  autosave(scene);
  refreshChrome();          // undo/redo disabled state, vintage banner visibility
}
```

Sheet presets: square 1600×1600, portrait 1600×2000, landscape 2000×1600. New button → shows dialog; choosing a preset replaces the scene (`newScene`), `history.reset`, autosave, full render, fit.

- [ ] **Step 1: Write failing test** (`tests/app-state.test.ts`):

```ts
import { expect, test } from "vitest";
import { AppState } from "../src/ui/app-state";

test("auto-rotation cycles ink slots 1..n", () => {
  const s = new AppState();
  expect([s.nextColorSlot(3), s.nextColorSlot(3), s.nextColorSlot(3), s.nextColorSlot(3)]).toEqual([1, 2, 3, 1]);
});
test("pin overrides rotation and resumes where it left off", () => {
  const s = new AppState();
  s.nextColorSlot(5);
  s.pinnedSlot = 4;
  expect(s.nextColorSlot(5)).toBe(4);
  expect(s.nextColorSlot(5)).toBe(4);
  s.pinnedSlot = null;
  expect(s.nextColorSlot(5)).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure; implement `app-state.ts` (code above); verify pass.**
- [ ] **Step 3: Build the shell** — `index.html` layout per the DOM contract; `src/styles.css`: calm warm off-white chrome (`#efece5` background, subtle borders, system-ui font), `#stage` fills remaining space (flex layout: topbar fixed height, rail fixed width ~220px), sheet svg 100%/100% with `display:block`, paper drop-shadow via CSS `filter` on `rect.paper`, `.tool-select g.strokes { pointer-events: auto }` / `g.strokes { pointer-events: none }` (tool class set on the svg root), active tool button highlighted via `[data-active="true"]`, `#vintage-banner` positioned over the stage top, hidden with `[hidden]`. `src/main.ts` boots per the Interfaces block (wire: New dialog, Fit button, undo/redo buttons calling `history.undo/redo` → replace scene ref, `seedIdCounter`, re-render, autosave, refreshChrome; palette `<select>` of `PALETTES` → `setPalette` + re-render + commit; wheel zoom + space-drag pan on `#stage` via `ViewBox` — convert client deltas to sheet units with `svg.getBoundingClientRect()`; window `beforeunload` → `flushAutosave()`).
- [ ] **Step 4: Manual verify** — `npm run dev`; confirm: new-sheet dialog on first load, choosing portrait shows the paper centered, wheel zooms, space-drag pans, palette select changes paper color, `npm test` and `npm run build` stay green.
- [ ] **Step 5: Commit** — `git commit -m "feat: app shell, layout, viewport wiring, new-sheet flow"`

---

### Task 17: Drawing interactions (live ink)

**Files:**
- Create: `src/ui/draw.ts`
- Modify: `src/main.ts` (wire it)

**Interfaces:**
- Consumes: everything prior. Produces `installDrawing(deps)`:

```ts
export interface DrawDeps {
  svg: SVGSVGElement;
  getScene(): Scene;
  state: AppState;
  renderer: SheetRenderer;
  clientToSheet(e: PointerEvent): XY;   // main.ts provides via viewBox + getBoundingClientRect
  commit(): void;                        // push history + autosave + chrome refresh
}
export function installDrawing(deps: DrawDeps): void;
```

**Behavior (from spec §Interaction Model):**
- Only when `state.tool` is a brush tool (not `select`, not while space-panning).
- **Path (zigzag):** pointerdown → `seed = randomSeed()`, `colorSlot = state.nextColorSlot(inkCount)`, start spine. pointermove (throttle to rAF) → append sheet-coords point, build a transient `Stroke` object (not in scene) with `baked = runPipeline(brush, {kind:"path",points:spine}, params, seed, scene.hand, sheet.w)` and `renderer.renderLive(scene, stroke)`. pointerup → `clearLive()`; if spine length ≥ 2, `addStroke(...)` with the same seed/slot/params, `commit()`.
- **Region (hexpack):** pointermove → `renderer.renderGhost(spine)`. pointerup → `clearLive()`, `addStroke` with `{kind:"region", points: spine}` (brush closes/simplifies), `commit()`.
- **Stamp (sunstamp):** pointermove (no button) → transient preview stroke at cursor via `renderLive` using a **fixed preview seed chosen at tool activation**; pointerdown commits `addStroke` at that point with that seed, then picks a fresh preview seed. Tool switch → `clearLive()`.
- Current brush params come from a `paramsFor(brushId)` map owned by main.ts (Task 18 binds the panel to the same map); pass `getParams(brushId: string): Record<string, number>` in deps (add to `DrawDeps`).
- Use `setPointerCapture`; ignore non-primary buttons; `pointercancel` = discard.

- [ ] **Step 1: Implement `installDrawing`** per behavior above (single file, a small state machine over `pointerdown/move/up/cancel` + `pointermove` hover for stamp preview).
- [ ] **Step 2: Wire in `main.ts`** — provide `clientToSheet` (viewBox math), `getParams` backed by `const brushParams: Record<string, Record<string, number>>` initialized from `defaultParams` of each brush.
- [ ] **Step 3: Manual verify** — `npm run dev`: drag draws a growing staircase live with cycling colors; hexpack drag shows dashed ghost then packs on release; sunstamp previews under cursor and stamps on click; wheel/space still work; refresh restores the drawing (autosave).
- [ ] **Step 4: Run `npm test` + `npm run build`** (still green).
- [ ] **Step 5: Commit** — `git commit -m "feat: drawing interactions with live ink, region ghost, stamp preview"`

---

### Task 18: Select & edit (param panel, re-roll, delete, re-slot, keyboard)

**Files:**
- Create: `src/ui/panel.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces (`src/ui/panel.ts`):

```ts
export interface PanelDeps {
  container: HTMLElement;               // #param-panel
  getScene(): Scene;
  state: AppState;
  renderer: SheetRenderer;
  commit(): void;
  liveUpdate(): void;                   // re-render selected stroke without history push
}
export function renderPanel(deps: PanelDeps, brushParams: Record<string, Record<string, number>>): void;
```

**Behavior:**
- No selection: panel shows current tool's brush name + its 4 sliders bound to `brushParams[brushId]` (affects future strokes only; no history entries).
- Selection: panel shows `{brush.id}` + `re-roll` and `delete` buttons + the stroke's params as sliders. Slider `input` → `reparamStroke` + `renderer.updateStroke` + `renderer.setSelection` (live, no push); slider `change` → `commit()`. Re-roll button → `rerollStroke` + update + `commit()`. Delete → `deleteStroke` + `removeStroke` + deselect + `commit()`.
- **Vintage selection:** if `isVintage(stroke)`, sliders `disabled`, note "vintage (brush v{n}) — regenerate to edit" + `Regenerate` button → `migrateStroke` + update + `commit()` (panel re-renders enabled).
- Selection wiring (main.ts): svg `click` when `tool === "select"` → nearest ancestor `[data-stroke-id]` of `event.target` → `state.selection = id` + `renderer.setSelection` + `renderPanel`; click empty space or `Esc` → deselect. Clicking a palette swatch with a selection → `reslotStroke` + `updateStroke` + `commit()` (Task 19 wires the strip; expose `onSwatchClick(slot)` callback from main.ts).
- Keyboard (main.ts, ignore when focus is in an input): `1/2/3/v` set tool (update svg class `tool-select`, clear live, re-render panel), `r` re-roll selection, `Delete`/`Backspace` delete selection, `Escape` deselect, `Ctrl+z` undo / `Ctrl+Shift+z` redo, `Ctrl+0` fit.

- [ ] **Step 1: Implement `panel.ts` + selection + keyboard wiring.**
- [ ] **Step 2: Manual verify** — select a zigzag, drag `run length`: it re-renders live and one undo undoes the whole drag; `r` re-rolls (undoable); delete works; keyboard tools switch; vintage path can't be tested yet (no v2 brush) — simulate by editing `brushVersion` in devtools console via `__ww.getScene()` and confirm the disabled panel + Regenerate.
- [ ] **Step 3: `npm test` + `npm run build`** green.
- [ ] **Step 4: Commit** — `git commit -m "feat: selection, param panel, re-roll/delete/re-slot, keyboard"`

---

### Task 19: Palette strip, hand dial, vintage banner

**Files:**
- Create: `src/ui/chrome.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces (`src/ui/chrome.ts`):

```ts
export interface ChromeDeps {
  paletteStrip: HTMLElement;            // #palette-strip
  paletteSelect: HTMLSelectElement;     // #palette-select
  handDial: HTMLInputElement;           // #hand-dial input
  banner: HTMLElement;                  // #vintage-banner
  bannerCount: HTMLElement;             // #vintage-count
  bannerRegen: HTMLButtonElement;       // #btn-regen-vintage
  getScene(): Scene;
  state: AppState;
  onSwatchClick(slot: number): void;    // pin/unpin or re-slot selection (main.ts decides)
  onPaletteChange(id: string): void;
  onHandInput(v: number): void;         // live: setHand + full re-render (no push)
  onHandCommit(): void;                 // change event: commit()
  onRegenVintage(): void;
}
export function installChrome(deps: ChromeDeps): void;
export function refreshChrome(deps: ChromeDeps): void; // rebuild swatches for current palette, auto chip state, banner visibility
```

**Behavior:**
- Strip: one swatch button per ink slot of the current palette (background = ink color) + an `auto` chip. Swatch click → if a stroke is selected: re-slot it; else toggle pin (`state.pinnedSlot = slot`, chip shows unpinned). Auto chip click → `pinnedSlot = null`. Pinned swatch gets a ring (`data-pinned="true"`).
- Hand dial: `input` → `onHandInput` (live `setHand` + `renderer.renderScene`; **also** if `vintageCount > 0`, show banner). `change` → `onHandCommit`.
- Banner: hidden by default; shown when dial moved while vintage strokes exist; `bannerCount` text = `${n} vintage stroke(s) unaffected`; Regenerate button → `regenerateAllVintage` + full re-render + commit + hide banner.
- `refreshChrome` is called from main's `commit()` and after palette/scene swaps (undo/open/new).

- [ ] **Step 1: Implement + wire.** Palette change: `setPalette` + `renderer.renderScene` + `commit()`. Undo/redo path in main.ts must also call `refreshChrome`.
- [ ] **Step 2: Manual verify** — swatches rotate stroke colors automatically while drawing; pinning fixes the color; palette select re-skins the whole sheet instantly (including hand-dial test at 0 → Bauhaus-clean look with bauhaus palette); dial drag re-renders everything live and lands one undo entry; vintage banner appears when dial moves with a devtools-forged vintage stroke and Regenerate clears it.
- [ ] **Step 3: `npm test` + `npm run build`** green.
- [ ] **Step 4: Commit** — `git commit -m "feat: palette strip, hand dial, vintage banner"`

---

### Task 20: Save/Open + Export wiring

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `serializeScene`, `deserializeScene`, `download`, `exportSvgString`, `exportPngBlob`, `flushAutosave`, `seedIdCounter`.

**Behavior:**
- `#btn-save` → `download("wobblewerk.json", new Blob([serializeScene(scene)], { type: "application/json" }))`.
- `#btn-open` → click hidden `#file-open`; on file: `deserializeScene(await file.text())` → replace scene, `seedIdCounter`, `history.reset`, autosave, full render, fit, refreshChrome. On parse error: `alert("Not a wobblewerk file")`, keep current scene. **Opened files render from their stored bake verbatim — do not rebake on load.**
- `#btn-export-svg` → `download("wobblewerk.svg", new Blob([exportSvgString(svgEl, scene)], { type: "image/svg+xml" }))`.
- `#btn-export-png` → `exportPngBlob(...)` then `download("wobblewerk.png", blob)`.
- `#btn-new` already opens the dialog (Task 16); confirm New pushes a history entry so it's undoable.

- [ ] **Step 1: Wire all four buttons + file input.**
- [ ] **Step 2: Manual verify** — save a drawing, hard-refresh, open the file: identical sheet (bake fidelity); export SVG and open the file in a browser tab (renders identically); export PNG downloads a 2× raster; garbage .json alerts and preserves current sheet.
- [ ] **Step 3: `npm test` + `npm run build`** green.
- [ ] **Step 4: Commit** — `git commit -m "feat: save/open json, export svg/png wiring"`

---

### Task 21: Playwright e2e smoke

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Install browser** — `npx playwright install chromium`
- [ ] **Step 2: Config** (`playwright.config.ts`):

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: { headless: true },
  webServer: { command: "npm run dev -- --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: true },
});
```

- [ ] **Step 3: Write the spec** (`e2e/smoke.spec.ts`):

```ts
import { expect, test } from "@playwright/test";

const URL = "http://localhost:5199";

async function newPortraitSheet(page: import("@playwright/test").Page) {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-sheet="portrait"]');
}

async function drag(page: import("@playwright/test").Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  const steps = 25;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  }
  await page.mouse.up();
}

test("draw, undo, redo, autosave, export", async ({ page }) => {
  await newPortraitSheet(page);
  const stage = page.locator("#stage svg");
  const box = (await stage.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);
  const strokes = page.locator("g.strokes > g");
  await expect(strokes).toHaveCount(1);

  await page.keyboard.press("Control+z");
  await expect(strokes).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(strokes).toHaveCount(1);

  // autosave survives reload
  await page.waitForTimeout(500); // > debounce
  await page.reload();
  await expect(page.locator("g.strokes > g")).toHaveCount(1);

  // export SVG contains the stroke path
  const svgStr = await page.evaluate(() => (window as any).__ww.exportSvgString());
  expect(svgStr).toContain("<path");
  expect(svgStr).not.toContain("hit");

  // hexpack: switch tool, drag a loop
  await page.keyboard.press("2");
  await drag(page, [cx - 100, cy + 60], [cx + 100, cy + 200]); // open arc; brush auto-closes
  await expect(page.locator("g.strokes > g")).toHaveCount(2);

  // sunstamp: click
  await page.keyboard.press("3");
  await page.mouse.click(cx, cy - 150);
  await expect(page.locator("g.strokes > g")).toHaveCount(3);

  // select + delete
  await page.keyboard.press("v");
  await page.mouse.click(cx, cy - 150);
  await page.keyboard.press("Delete");
  await expect(page.locator("g.strokes > g")).toHaveCount(2);

  // png export produces a download
  const dl = page.waitForEvent("download");
  await page.click("#btn-export-png");
  expect((await dl).suggestedFilename()).toBe("wobblewerk.png");
});
```

- [ ] **Step 4: Run** — `npm run e2e`; fix any wiring bugs it exposes (this is the integration gate).
- [ ] **Step 5: Commit** — `git commit -m "test: playwright e2e smoke"`

---

### Task 22: README + gate-1 sweep

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README** — what wobblewerk is (procedural sketch instrument; instrument-not-editor covenant, Inkscape escape hatch), screenshots placeholder, dev commands (`npm run dev/test/e2e/build`), keyboard map (1/2/3/v, r, Delete, Esc, Ctrl+Z/Ctrl+Shift+Z, Ctrl+0, wheel zoom, space-pan), file format note (.json = recipe + bake; vintage policy one-liner), palette/brush list, "not yet deployed; will live at wobble.audiodude.xyz".
- [ ] **Step 2: Full gate sweep** — `npm test` && `npm run build` && `npm run e2e` all green in one run.
- [ ] **Step 3: Commit** — `git commit -m "docs: README"`

---

## Plan Self-Review (done at write time)

- **Spec coverage:** all spec sections map to tasks — types/palettes (4), hand (5), brushes (6–8), pipeline (9), scene+vintage (10), history (11), persistence (12), renderer (13), viewport (14), export (15), UI/interactions (16–20), e2e (21), docs (22). Deploy is explicitly out of v1 scope per spec.
- **Type consistency:** interfaces are quoted verbatim in Consumes/Produces blocks; later tasks reference only names defined in earlier tasks.
- **Known judgment calls left to workers:** exact CSS styling (Task 16), renderer internals (Task 13 — the DOM contract + tests are the spec), draw-state-machine internals (Task 17 — behavior block is the spec).
