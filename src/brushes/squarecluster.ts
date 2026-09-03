import { bbox, pointInPolygon, resample } from "../model/geometry";
import type { XY } from "../model/geometry";
import type { BrushDef, BrushInput, IdealPath } from "../model/types";
import type { Rng } from "../model/rng";

const MEAN_CHAIN = 10;
const INNER_RATIO = 0.55;
// Emitted paths (outer + inner) never exceed this, regardless of params —
// keeps a worst-case stroke well under the 10k-path guard in tests/generate.test.ts.
const HARD_CAP = 4000;

function square(c: XY, edge: number): IdealPath {
  const h = edge / 2;
  return {
    points: [
      { x: c.x - h, y: c.y - h },
      { x: c.x + h, y: c.y - h },
      { x: c.x + h, y: c.y + h },
      { x: c.x - h, y: c.y + h },
    ],
    closed: true,
    stroke: true,
    fill: false,
  };
}

// Shoelace: signed area and area centroid of a closed polygon (last point == first is fine).
function polygonAreaCentroid(poly: XY[]): { area: number; centroid: XY } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j]!, q = poly[i]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { area: 0, centroid: { x: NaN, y: NaN } };
  return { area: Math.abs(a), centroid: { x: cx / (6 * a), y: cy / (6 * a) } };
}

export const squarecluster: BrushDef = {
  id: "squarecluster",
  version: 1,
  inputKind: "region",
  handDamping: 1,
  strokeWidth: 3,
  params: [
    { key: "size", label: "size", min: 8, max: 60, default: 22 },
    { key: "density", label: "density", min: 0.1, max: 3, default: 1 },
    { key: "variance", label: "variance", min: 0, max: 1, default: 0.4 },
    { key: "nesting", label: "nesting", min: 0, max: 1, default: 0.3 },
    { key: "overlap", label: "overlap", min: 0, max: 1, default: 0.5 },
  ],
  generate(input: BrushInput, p: Record<string, number>, rng: Rng): IdealPath[] {
    if (input.kind !== "region" || input.points.length < 3) return [];
    // The loop is only ever used for containment and area — never drawn.
    const loop = resample([...input.points, input.points[0]!], 6);
    const { area, centroid } = polygonAreaCentroid(loop);
    const size = p.size!;
    const total = Math.min(HARD_CAP, Math.max(1, Math.round((p.density! * area) / (size * size))));
    const maxChains = Math.max(4, Math.ceil(total / 5));
    // Step between consecutive squares as a fraction of the current edge:
    // 1.3 (small gaps) at overlap 0 → 0.35 (heavy stacking) at overlap 1.
    const stepFrac = 1.3 + (0.35 - 1.3) * p.overlap!;
    const bb = bbox(loop);

    const randomInterior = (): XY | null => {
      for (let i = 0; i < 50; i++) {
        const pt = { x: bb.minX + rng() * (bb.maxX - bb.minX), y: bb.minY + rng() * (bb.maxY - bb.minY) };
        if (pointInPolygon(pt, loop)) return pt;
      }
      return null;
    };

    const paths: IdealPath[] = [];
    let placed = 0;
    for (let chains = 0; placed < total && chains < maxChains && paths.length < HARD_CAP; chains++) {
      let at: XY | null = chains === 0 && pointInPolygon(centroid, loop) ? centroid : randomInterior();
      if (!at) break;
      const target = Math.min(total - placed, Math.round(MEAN_CHAIN * (1 + (rng() * 2 - 1) * 0.5)));
      for (let i = 0; i < target && paths.length < HARD_CAP; i++) {
        // Fixed draw order per square so output is stable when a later square is dropped.
        const edgeRoll = rng(), nestRoll = rng(), nest2Roll = rng(), innerRoll = rng(), angleRoll = rng();
        const edge = size * (1 + (edgeRoll * 2 - 1) * 0.5 * p.variance!);
        paths.push(square(at, edge));
        placed++;
        if (nestRoll < p.nesting! && paths.length < HARD_CAP) {
          const ratio = INNER_RATIO + (innerRoll * 2 - 1) * 0.05;
          paths.push(square(at, edge * ratio));
          if (nest2Roll < p.nesting! && paths.length < HARD_CAP) paths.push(square(at, edge * ratio * ratio));
        }
        const theta = angleRoll * Math.PI * 2;
        const step = edge * stepFrac;
        at = { x: at.x + Math.cos(theta) * step, y: at.y + Math.sin(theta) * step };
        if (!pointInPolygon(at, loop)) break; // stepped out: chain ends, budget carries to the next
      }
    }
    return paths;
  },
};
