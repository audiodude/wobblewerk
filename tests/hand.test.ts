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
  test("output is sheet-size independent (no sheetW parameter)", () => {
    // Regression: amplitude/step used to scale with sheetW/1600, which made
    // marks cleaner on small sheets while their size stayed fixed.
    expect(handPass.length).toBe(3); // (paths, amount, rng) — no 4th param
  });
});

describe("handPass degenerate resample (finding 1)", () => {
  test("tiny closed octagon (perimeter < step) never throws and yields finite points", () => {
    // Mirrors sunstamp's dash-ring satellite dot: an 8-gon with radius 1.0,
    // whose perimeter (~6.12) is shorter than the constant resample step (8).
    const octagon: IdealPath = {
      points: Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return { x: 50 + Math.cos(a) * 1.0, y: 50 + Math.sin(a) * 1.0 };
      }),
      closed: true, stroke: true, fill: false,
    };
    let result: IdealPath[] = [];
    expect(() => {
      result = handPass([octagon], 0.9, rngFromSeed(1));
    }).not.toThrow();
    const pts = result[0]!.points;
    expect(pts.length).toBeGreaterThanOrEqual(1);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  test("tiny open 2-point segment (shorter than spacing/4) yields >= 2 finite points", () => {
    const tinyDash: IdealPath = {
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }],
      closed: false, stroke: true, fill: false,
    };
    let result: IdealPath[] = [];
    expect(() => {
      result = handPass([tinyDash], 0.9, rngFromSeed(1));
    }).not.toThrow();
    const pts = result[0]!.points;
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

test("valueNoise1D deterministic and bounded", () => {
  expect(valueNoise1D(3.7)).toBe(valueNoise1D(3.7));
  for (let t = 0; t < 50; t += 0.13) {
    const v = valueNoise1D(t);
    expect(Math.abs(v)).toBeLessThanOrEqual(1);
  }
});
