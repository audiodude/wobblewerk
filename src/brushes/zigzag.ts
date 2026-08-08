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
      const seen = spine.slice(0, idx + LOOKSTEPS + 1);
      let run = Math.max(4, p.runLength! * (1 + (rng() * 2 - 1) * p.jaggedness!));
      let dir = horizontal ? Math.sign(target.x - pos.x) || 1 : Math.sign(target.y - pos.y) || 1;
      if (rng() < p.reversals! * 0.5) { dir = -dir; run *= 0.5; }
      let next: XY = horizontal ? { x: pos.x + dir * run, y: pos.y } : { x: pos.x, y: pos.y + dir * run };
      if (nearestPointOnPolyline(next, seen).dist > corridor) {
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
