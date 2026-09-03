import { describe, expect, test } from "vitest";
import { sunstamp } from "../src/brushes/sunstamp";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { BRUSHES } from "../src/brushes/index";

const P = defaultParams(sunstamp);
const gen = (params = P, seed = 8) => sunstamp.generate({ kind: "point", at: { x: 200, y: 200 } }, params, rngFromSeed(seed));

describe("sunstamp", () => {
  test("deterministic", () => { expect(gen()).toEqual(gen()); });
  test("core circle first: closed, 40 points, radius size/2", () => {
    const [core] = gen();
    expect(core!.closed).toBe(true);
    expect(core!.points).toHaveLength(40);
    const r = Math.hypot(core!.points[0]!.x - 200, core!.points[0]!.y - 200);
    expect(r).toBeCloseTo(P.size! / 2, 6);
  });
  test("satellite count follows ringDensity", () => {
    expect(gen({ ...P, ringDensity: 0 }).length - 1).toBe(6);
    expect(gen({ ...P, ringDensity: 1 }).length - 1).toBe(22);
  });
  test("dashMix 1 → all satellites are 2-point dashes; 0 → all 8-point dots", () => {
    const dashes = gen({ ...P, dashMix: 1 }).slice(1);
    const dots = gen({ ...P, dashMix: 0 }).slice(1);
    expect(dashes.every((s) => s.points.length === 2 && !s.closed)).toBe(true);
    expect(dots.every((s) => s.points.length === 8 && s.closed)).toBe(true);
  });
});

test("registry has all four brushes", () => {
  expect(Object.keys(BRUSHES).sort()).toEqual(["hexpack", "squarecluster", "sunstamp", "zigzag"]);
});
