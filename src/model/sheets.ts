export type SheetSize = "s" | "m" | "l";
export type SheetOrientation = "square" | "portrait" | "landscape";

// Base = short side. L equals the v1 presets exactly; marks are fixed-size
// in sheet units, so smaller sheets read bolder, not zoomed.
export const SHEET_BASES: Record<SheetSize, number> = { s: 800, m: 1200, l: 1600 };

export function sheetDims(size: SheetSize, orientation: SheetOrientation): { w: number; h: number } {
  const b = SHEET_BASES[size];
  if (orientation === "portrait") return { w: b, h: b * 1.25 };
  if (orientation === "landscape") return { w: b * 1.25, h: b };
  return { w: b, h: b };
}
