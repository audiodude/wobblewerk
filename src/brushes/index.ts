import type { BrushDef } from "../model/types";
import { zigzag } from "./zigzag";
import { hexpack } from "./hexpack";
import { squarecluster } from "./squarecluster";
import { sunstamp } from "./sunstamp";

export const BRUSHES: Record<string, BrushDef> = { zigzag, hexpack, squarecluster, sunstamp };

export function getBrush(id: string): BrushDef {
  const b = BRUSHES[id];
  if (!b) throw new Error(`unknown brush: ${id}`);
  return b;
}
