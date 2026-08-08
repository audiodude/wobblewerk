import { expect, test } from "vitest";
import { AppState } from "../src/ui/app-state";

test("auto-rotation cycles ink slots 1..n", () => {
  const s = new AppState();
  expect([s.nextColorSlot(3), s.nextColorSlot(3), s.nextColorSlot(3), s.nextColorSlot(3)]).toEqual([1, 2, 3, 1]);
});
test("pin overrides rotation and resumes where it left off", () => {
  const s = new AppState();
  s.nextColorSlot(5);
  s.pinnedSlot = 4;
  expect(s.nextColorSlot(5)).toBe(4);
  expect(s.nextColorSlot(5)).toBe(4);
  s.pinnedSlot = null;
  expect(s.nextColorSlot(5)).toBe(2);
});
