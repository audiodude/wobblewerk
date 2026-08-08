import { describe, expect, test } from "vitest";
import { pathToD, runPipeline } from "../src/engine/generate";
import { zigzag } from "../src/brushes/zigzag";
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
    const a = runPipeline(zigzag, input, P, 33, 0.5, 1600);
    expect(a).toEqual(runPipeline(zigzag, input, P, 33, 0.5, 1600));
  });
  test("hand=0 equals raw generate geometry (no wobble)", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0, 1600);
    expect(baked[0]!.d).toMatch(/^M /);
    // axis-aligned segments survive: every L shares x or y with predecessor
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    for (let i = 1; i < coords.length; i++) {
      const same = coords[i]![0] === coords[i - 1]![0] || coords[i]![1] === coords[i - 1]![1];
      expect(same).toBe(true);
    }
  });
  test("hand>0 breaks perfect axis alignment", () => {
    const baked = runPipeline(zigzag, input, P, 33, 0.8, 1600);
    const coords = baked[0]!.d.replace(/^M /, "").split(" L ").map((s) => s.split(" ").map(Number));
    const bent = coords.some((c, i) => i > 0 && c[0] !== coords[i - 1]![0] && c[1] !== coords[i - 1]![1]);
    expect(bent).toBe(true);
  });
  test("width scales with sheet size", () => {
    expect(runPipeline(zigzag, input, P, 1, 0, 3200)[0]!.width).toBeCloseTo(zigzag.strokeWidth * 2, 9);
  });
});
