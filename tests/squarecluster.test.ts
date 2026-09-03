import { describe, expect, test } from "vitest";
import { squarecluster } from "../src/brushes/squarecluster";
import { runPipeline } from "../src/engine/generate";
import { rngFromSeed } from "../src/model/rng";
import { defaultParams } from "../src/model/types";
import { pointInPolygon, resample } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";
import type { IdealPath } from "../src/model/types";

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 80): XY[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

const loop = ellipse(400, 400, 300, 260);
const P = defaultParams(squarecluster);
const gen = (params = P, seed = 5, points = loop) =>
  squarecluster.generate({ kind: "region", points }, params, rngFromSeed(seed));

const center = (path: IdealPath): XY => {
  const [a, , c] = path.points as [XY, XY, XY, XY];
  return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
};
const edge = (path: IdealPath): number => path.points[1]!.x - path.points[0]!.x;
const dist = (a: IdealPath, b: IdealPath): number => {
  const ca = center(a), cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

describe("squarecluster", () => {
  test("deterministic", () => {
    expect(gen()).toEqual(gen());
  });

  test("every path is a closed 4-point square; no boundary path; outer centers inside the loop", () => {
    const paths = gen();
    expect(paths.length).toBeGreaterThan(10);
    const closedLoop = resample([...loop, loop[0]!], 6);
    for (const path of paths) {
      expect(path.closed).toBe(true);
      expect(path.stroke).toBe(true);
      expect(path.fill).toBe(false);
      expect(path.points).toHaveLength(4);
    }
    // first path is a square (edge within the variance envelope), not the ~300-vertex loop
    expect(edge(paths[0]!)).toBeGreaterThan(0);
    expect(edge(paths[0]!)).toBeLessThan(P.size! * 2);
    // outer squares are those not concentric with the previous path
    const outers = paths.filter((p, i) => i === 0 || dist(p, paths[i - 1]!) > 1e-6);
    for (const o of outers) expect(pointInPolygon(center(o), closedLoop)).toBe(true);
  });

  test("density: 4x the loop area yields ~4x the squares", () => {
    const params = { ...P, nesting: 0 };
    const small = gen(params, 3, ellipse(400, 400, 150, 130)).length;
    const big = gen(params, 3, ellipse(400, 400, 300, 260)).length;
    const ratio = big / small;
    expect(ratio).toBeGreaterThanOrEqual(2.5);
    expect(ratio).toBeLessThanOrEqual(5.5);
  });

  test("nesting=0 emits no inner squares; nesting=1 emits exactly 3 paths per placed square", () => {
    const none = gen({ ...P, nesting: 0 });
    for (let i = 1; i < none.length; i++) expect(dist(none[i]!, none[i - 1]!)).toBeGreaterThan(1e-6);
    const all = gen({ ...P, nesting: 1 });
    expect(all.length % 3).toBe(0);
    for (let i = 0; i < all.length; i += 3) {
      const [o, a, b] = [all[i]!, all[i + 1]!, all[i + 2]!];
      expect(dist(a, o)).toBeLessThan(1e-6);
      expect(dist(b, o)).toBeLessThan(1e-6);
      expect(edge(a)).toBeLessThan(edge(o));
      expect(edge(b)).toBeLessThan(edge(a));
    }
  });

  test("overlap=1 packs consecutive squares closer than overlap=0", () => {
    const meanStep = (paths: IdealPath[]) => {
      let sum = 0, n = 0;
      for (let i = 1; i < paths.length; i++) {
        const c = center(paths[i]!), prev = center(paths[i - 1]!);
        sum += Math.hypot(c.x - prev.x, c.y - prev.y);
        n++;
      }
      return sum / n;
    };
    const tight = meanStep(gen({ ...P, nesting: 0, overlap: 1 }, 9));
    const loose = meanStep(gen({ ...P, nesting: 0, overlap: 0 }, 9));
    expect(tight).toBeLessThan(loose);
  });

  test("degenerate input returns no paths", () => {
    expect(gen(P, 1, loop.slice(0, 2))).toEqual([]);
  });

  test("hard cap: pathological params on a sheet-sized loop stay bounded and fast", () => {
    const sheet: XY[] = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1600 }, { x: 0, y: 1600 }];
    const start = Date.now();
    const baked = runPipeline(squarecluster, { kind: "region", points: sheet }, { ...P, size: 8, density: 3 }, 1, 0.5);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(baked.length).toBeGreaterThan(0);
    expect(baked.length).toBeLessThan(10000);
  });
});
