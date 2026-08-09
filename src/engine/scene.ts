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
  return { version: 1, sheet: { w, h }, paletteId, hand: 0.6, grain: 0, strokes: [] };
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
  if (!BRUSHES[stroke.brush]) return; // brush gone: stroke stays vintage, bake preserved
  stroke.brushVersion = getBrush(stroke.brush).version;
  bakeStroke(scene, stroke);
}

export function rerollStroke(scene: Scene, id: string): void {
  const s = getStroke(scene, id);
  if (!s) return;
  if (s && !BRUSHES[s.brush]) return; // brush gone: stroke stays vintage, don't burn seed
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

// Paper-level only: grain never touches strokes, so no re-bake and no
// vintage interaction (unlike setHand above).
export function setGrain(scene: Scene, grain: number): void {
  scene.grain = Math.min(1, Math.max(0, grain));
}

export function setPalette(scene: Scene, paletteId: string): void {
  scene.paletteId = paletteId;
}
