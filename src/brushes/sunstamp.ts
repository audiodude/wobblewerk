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
