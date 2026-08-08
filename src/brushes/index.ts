import type { BrushDef } from "../model/types";
import { zigzag } from "./zigzag";

export const BRUSHES: Record<string, BrushDef> = { zigzag };

export function getBrush(id: string): BrushDef {
  const b = BRUSHES[id];
  if (!b) throw new Error(`unknown brush: ${id}`);
  return b;
}
