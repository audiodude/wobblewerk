import { describe, expect, test } from "vitest";
import { pathToD, runPipeline } from "../src/engine/generate";
import { zigzag } from "../src/brushes/zigzag";
import { hexpack } from "../src/brushes/hexpack";
import { sunstamp } from "../src/brushes/sunstamp";
import { defaultParams } from "../src/model/types";
import type { BrushInput } from "../src/model/types";

const input: BrushInput = {
  kind: "path",
  points: Array.from({ length: 150 }, (_, i) => ({ x: 100 + i * 3, y: 400 + Math.sin(i / 10) * 50 })),
};
const P = defaultParams(zigzag);

describe("pathToD", () => {
  test("open path", () => {
    expect(pathToD([{ x: 1.234, y: 2 }, { x: 3, y: 4.5678 }], false)).toBe("M 1.23 2 L 3 4.57");
  });
  test("closed path appends Z", () => {
    expect(pathToD([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], true)).toBe("M 0 0 L 1 0 L 0 1 Z");
  });
});

describe("runPipeline", () => {
  test("deterministic end-to-end", () => {
    const a = runPipeline(zigzag, input, P, 33, 0.5);
    expect(a).toEqual(runPipeline(zigzag, input, P, 33, 0.5));
  });
  test("hand=0 equals raw generate geometry (no wobble)", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0);
    expect(baked[0]!.d).toMatch(/^M /);
    // axis-aligned segments survive: every L shares x or y with predecessor
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    for (let i = 1; i < coords.length; i++) {
      const same = coords[i]![0] === coords[i - 1]![0] || coords[i]![1] === coords[i - 1]![1];
      expect(same).toBe(true);
    }
    expect(baked[0]!.width).toBe(zigzag.strokeWidth); // constant, not sheet-scaled
  });
  test("hand>0 breaks perfect axis alignment", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0.8);
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    const bent = coords.some((c, i) => i > 0 && c[0] !== coords[i - 1]![0] && c[1] !== coords[i - 1]![1]);
    expect(bent).toBe(true);
  });
});

describe("runPipeline degenerate-resample regression (finding 1)", () => {
  const sunstampInput: BrushInput = { kind: "point", at: { x: 100, y: 100 } };
  const SP = defaultParams(sunstamp);

  test("sunstamp at hand 0.6 never throws and always yields parseable path data", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let baked: ReturnType<typeof runPipeline> = [];
      expect(() => {
        baked = runPipeline(sunstamp, sunstampInput, SP, seed, 0.6);
      }).not.toThrow();
      expect(baked.length).toBeGreaterThan(0);
      for (const b of baked) {
        expect(b.d.length).toBeGreaterThan(0);
        expect(b.d).not.toContain("undefined");
        expect(b.d).not.toContain("NaN");
      }
    }
  });
});

describe("runPipeline param sanitization (finding 2)", () => {
  const region: BrushInput = {
    kind: "region",
    points: Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return { x: 400 + Math.cos(a) * 300, y: 400 + Math.sin(a) * 300 };
    }),
  };
  const HP = defaultParams(hexpack);

  test("negative cellSize is clamped, not left to drive an infinite packing loop", () => {
    const start = Date.now();
    const baked = runPipeline(hexpack, region, { cellSize: -5, looseness: 0.4, nucleus: 0.3, simplify: 0.5 }, 1, 0);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(baked.length).toBeGreaterThan(0);
    expect(baked.length).toBeLessThan(10000);
  });

  test("tiny cellSize (0.5) is clamped to a bounded output", () => {
    const baked = runPipeline(hexpack, region, { ...HP, cellSize: 0.5 }, 1, 0);
    expect(baked.length).toBeGreaterThan(0);
    expect(baked.length).toBeLessThan(10000);
  });

  test("NaN or missing param falls back to the brush default", () => {
    const withNaN = runPipeline(hexpack, region, { ...HP, cellSize: NaN }, 7, 0);
    const { cellSize: _drop, ...withoutKey } = HP;
    void _drop;
    const withMissing = runPipeline(hexpack, region, withoutKey, 7, 0);
    const withExplicitDefault = runPipeline(hexpack, region, HP, 7, 0);
    expect(withNaN).toEqual(withExplicitDefault);
    expect(withMissing).toEqual(withExplicitDefault);
  });
});
