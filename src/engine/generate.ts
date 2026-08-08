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
