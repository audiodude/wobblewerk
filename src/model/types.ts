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
