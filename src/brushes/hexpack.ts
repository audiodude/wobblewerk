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
