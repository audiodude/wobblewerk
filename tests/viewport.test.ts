import { expect, test } from "vitest";
import { ViewBox } from "../src/render/viewport";

test("fit contains sheet with margin and centers", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800, 40);
  // scale = (800-80)/2000 = 0.36 → visible sheet-units: 800/0.36 ≈ 2222
  expect(v.h).toBeCloseTo(2222.22, 1);
  expect(v.w).toBeCloseTo(2222.22, 1);
  expect(v.x).toBeCloseTo((1600 - v.w) / 2, 6);
  expect(v.y).toBeCloseTo((2000 - v.h) / 2, 6);
});

test("zoomAt keeps the anchor point fixed", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800);
  const before = { ...v };
  const anchor = { x: 400, y: 500 };
  const relX = (anchor.x - before.x) / before.w;
  v.zoomAt(anchor.x, anchor.y, 0.5);
  expect((anchor.x - v.x) / v.w).toBeCloseTo(relX, 9);
  expect(v.w).toBeCloseTo(before.w * 0.5, 9);
});

test("zoom clamps", () => {
  const v = new ViewBox(1600, 2000);
  v.fit(800, 800);
  for (let i = 0; i < 30; i++) v.zoomAt(800, 1000, 0.5);
  expect(v.w).toBeGreaterThanOrEqual(1600 / 8 - 1e-6);
  for (let i = 0; i < 30; i++) v.zoomAt(800, 1000, 2);
  expect(v.w).toBeLessThanOrEqual(1600 * 4 + 1e-6);
});

test("panBy shifts origin; toString formats", () => {
  const v = new ViewBox(1600, 1600);
  v.fit(1600, 1600, 0);
  v.panBy(10, -5);
  expect(v.toString()).toBe(`${v.x} ${v.y} ${v.w} ${v.h}`);
  expect(v.x).toBeCloseTo(10, 9);
});

test("fit is unchanged for L sheets (k = 1)", () => {
  const v = new ViewBox(1600, 2000); // L portrait: min side 1600
  v.fit(800, 800, 40);
  expect(v.h).toBeCloseTo(2222.22, 1); // same numbers as the legacy fit test
  expect(v.w).toBeCloseTo(2222.22, 1);
});

test("fit shows an S sheet at exactly half the on-screen size of L (constant scale)", () => {
  const small = new ViewBox(800, 800); // k = 2 -> L-equivalent 1600x1600
  small.fit(800, 800, 40);
  const large = new ViewBox(1600, 1600); // k = 1
  large.fit(800, 800, 40);
  // Same view scale: identical visible sheet-units for the same container...
  expect(small.w).toBeCloseTo(large.w, 6);
  expect(small.h).toBeCloseTo(large.h, 6);
  // ...so the 800-unit sheet occupies half the view the 1600-unit sheet does,
  // centered (matte on all sides).
  expect(small.x).toBeCloseTo((800 - small.w) / 2, 6);
  expect(small.y).toBeCloseTo((800 - small.h) / 2, 6);
});

test("oversized custom sheets never scale down (k clamps at 1)", () => {
  const big = new ViewBox(3200, 3200); // min side > 1600: plain fit
  big.fit(800, 800, 40);
  expect(big.w).toBeCloseTo(800 / ((800 - 80) / 3200), 1); // legacy fit math
});
