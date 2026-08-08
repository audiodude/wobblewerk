import { describe, expect, test } from "vitest";
import { hexpack } from "../src/brushes/hexpack";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { pointInPolygon } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";

const loop: XY[] = Array.from({ length: 80 }, (_, i) => {
  const a = (i / 80) * Math.PI * 2;
  return { x: 400 + Math.cos(a) * 300, y: 400 + Math.sin(a) * 260 };
});
const P = defaultParams(hexpack);
const gen = (params = P, seed = 5) => hexpack.generate({ kind: "region", points: loop }, params, rngFromSeed(seed));

describe("hexpack", () => {
  test("deterministic", () => { expect(gen()).toEqual(gen()); });
  test("first path is the closed boundary", () => {
    const [b] = gen();
    expect(b!.closed).toBe(true);
    expect(b!.points.length).toBeGreaterThanOrEqual(3);
  });
  test("packs multiple hexagons, all inside the boundary", () => {
    const paths = gen();
    const boundary = paths[0]!.points;
    const hexes = paths.slice(1).filter((p) => p.points.length === 6);
    expect(hexes.length).toBeGreaterThan(5);
    for (const h of hexes) for (const v of h.points) expect(pointInPolygon(v, boundary)).toBe(true);
  });
  test("nucleus=1 gives every hexagon an oval; nucleus=0 gives none", () => {
    const withN = gen({ ...P, nucleus: 1 });
    const without = gen({ ...P, nucleus: 0 });
    const hexCount = (ps: typeof withN) => ps.slice(1).filter((p) => p.points.length === 6).length;
    const ovalCount = (ps: typeof withN) => ps.slice(1).filter((p) => p.points.length === 16).length;
    expect(ovalCount(withN)).toBe(hexCount(withN));
    expect(ovalCount(without)).toBe(0);
  });
  test("simplify reduces boundary vertex count", () => {
    const lo = gen({ ...P, simplify: 0 })[0]!.points.length;
    const hi = gen({ ...P, simplify: 1 })[0]!.points.length;
    expect(hi).toBeLessThan(lo);
  });
  test("degenerate input returns no paths", () => {
    expect(hexpack.generate({ kind: "region", points: loop.slice(0, 2) }, P, rngFromSeed(1))).toEqual([]);
  });
});
