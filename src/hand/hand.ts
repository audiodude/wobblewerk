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

export function handPass(paths: IdealPath[], amount: number, rng: Rng): IdealPath[] {
  if (amount <= 0) return paths;
  const step = 8;
  return paths.map((path) => {
    const phase = rng() * 1000;
    const drift = rng() * 1000;
    const original = path.closed ? [...path.points, path.points[0]!] : path.points;
    let pts = resample(original, step);
    // Degenerate resample (path length shorter than `step`, e.g. a tiny
    // closed shape or a short open dash): fall back to the pre-resample
    // points rather than manufacturing array holes downstream.
    if (pts.length < 2 && original.length >= 2) pts = original.map((p) => ({ ...p }));
    if (pts.length < 2) {
      // Nothing sane to wobble (0 or 1 point in, even before resample) —
      // pass it through unchanged.
      return { points: pts.map((p) => ({ ...p })), closed: false, stroke: path.stroke, fill: path.fill };
    }
    const out = pts.map((pt, i) => {
      const n = valueNoise1D(phase + (i * step) / 40);
      const m = valueNoise1D(drift + (i * step) / 90);
      const nor = normalAt(pts, i);
      const disp = (n * 4 + m * 2.5) * amount;
      return { x: pt.x + nor.x * disp, y: pt.y + nor.y * disp };
    });
    if (path.closed && amount > 0.5) {
      const gapPts = Math.ceil(((amount - 0.5) * 12) / step);
      // Shrink-only: never grow the array (that manufactures an empty slot
      // that later throws in pathToD). If trimming would go below 2 points,
      // skip the trim rather than clamping up.
      if (gapPts > 0 && out.length - gapPts >= 2) out.length -= gapPts;
    }
    return { points: out, closed: false, stroke: path.stroke, fill: path.fill };
  });
}
