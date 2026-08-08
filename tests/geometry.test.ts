import { describe, expect, test } from "vitest";
import { resample, rdp, pointInPolygon, pathLength, nearestPointOnPolyline, bbox } from "../src/model/geometry";
import type { XY } from "../src/model/geometry";

const line = (n: number, step = 1): XY[] => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));

describe("resample", () => {
  test("even spacing along a straight line", () => {
    const out = resample(line(101), 10); // 0..100
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]!.x).toBeCloseTo(10, 6);
    expect(out.at(-1)!.x).toBeCloseTo(100, 6);
  });
  test("keepEnd:false gives exact prefix property", () => {
    const long = line(101), short = line(61); // short is arc-length prefix of long
    const a = resample(short, 7, false), b = resample(long, 7, false);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 9);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 9);
    }
  });
});

describe("rdp", () => {
  test("collapses collinear points", () => {
    expect(rdp(line(50), 0.5)).toHaveLength(2);
  });
  test("keeps a real corner", () => {
    const pts: XY[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
    const out = rdp([...line(51), ...Array.from({ length: 50 }, (_, i) => ({ x: 50, y: i + 1 }))], 1);
    expect(out.length).toBe(3);
    expect(out[1]).toEqual({ x: 50, y: 0 });
    void pts;
  });
  test("higher epsilon, fewer points", () => {
    const wob: XY[] = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 3) * 4 }));
    expect(rdp(wob, 8).length).toBeLessThan(rdp(wob, 1).length);
  });
});

describe("pointInPolygon", () => {
  const sq: XY[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  test("inside", () => { expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true); });
  test("outside", () => { expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false); });
});

test("pathLength", () => { expect(pathLength(line(11))).toBeCloseTo(10, 9); });

test("nearestPointOnPolyline", () => {
  const near = nearestPointOnPolyline({ x: 5, y: 3 }, line(11));
  expect(near.dist).toBeCloseTo(3, 9);
  expect(near.point.x).toBeCloseTo(5, 9);
});

test("bbox", () => {
  expect(bbox([{ x: 1, y: 2 }, { x: -3, y: 7 }])).toEqual({ minX: -3, minY: 2, maxX: 1, maxY: 7 });
});
