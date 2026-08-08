import { describe, expect, test } from "vitest";
import { handPass, valueNoise1D } from "../src/hand/hand";
import { rngFromSeed } from "../src/model/rng";
import type { IdealPath } from "../src/model/types";

const straight: IdealPath = {
  points: Array.from({ length: 2 }, (_, i) => ({ x: i * 200, y: 100 })),
  closed: false, stroke: true, fill: false,
};
const square: IdealPath = {
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  closed: true, stroke: true, fill: false,
};

describe("handPass", () => {
  test("amount 0 is identity (same reference)", () => {
    const input = [straight];
    expect(handPass(input, 0, rngFromSeed(1))).toBe(input);
  });
  test("deterministic for same rng seed", () => {
    const a = handPass([straight], 0.6, rngFromSeed(5));
    const b = handPass([straight], 0.6, rngFromSeed(5));
    expect(a).toEqual(b);
  });
  test("displacement grows with amount", () => {
    const dev = (amt: number) =>
      Math.max(...handPass([straight], amt, rngFromSeed(9))[0]!.points.map((p) => Math.abs(p.y - 100)));
    expect(dev(0.9)).toBeGreaterThan(dev(0.2));
    expect(dev(0.2)).toBeGreaterThan(0);
  });
  test("same shape, scaled: tremor character stable across amounts", () => {
    const a = handPass([straight], 0.4, rngFromSeed(3))[0]!.points;
    const b = handPass([straight], 0.8, rngFromSeed(3))[0]!.points;
    // sign of displacement matches pointwise (same noise, bigger amplitude)
    for (let i = 1; i < Math.min(a.length, b.length) - 1; i++) {
      const da = a[i]!.y - 100, db = b[i]!.y - 100;
      if (Math.abs(da) > 0.05) expect(Math.sign(da)).toBe(Math.sign(db));
    }
  });
  test("closed path becomes explicit ring, under-closed at high amount", () => {
    const low = handPass([square], 0.3, rngFromSeed(2))[0]!;
    const high = handPass([square], 0.9, rngFromSeed(2))[0]!;
    expect(low.closed).toBe(false);
    expect(high.closed).toBe(false);
    expect(high.points.length).toBeLessThan(low.points.length); // gap trimmed
  });
});

test("valueNoise1D deterministic and bounded", () => {
  expect(valueNoise1D(3.7)).toBe(valueNoise1D(3.7));
  for (let t = 0; t < 50; t += 0.13) {
    const v = valueNoise1D(t);
    expect(Math.abs(v)).toBeLessThanOrEqual(1);
  }
});
