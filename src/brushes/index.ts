import type { BrushDef } from "../model/types";
import { zigzag } from "./zigzag";
import { hexpack } from "./hexpack";

export const BRUSHES: Record<string, BrushDef> = { zigzag, hexpack };

export function getBrush(id: string): BrushDef {
  const b = BRUSHES[id];
  if (!b) throw new Error(`unknown brush: ${id}`);
  return b;
}
