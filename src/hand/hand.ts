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
