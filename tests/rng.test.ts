import { describe, expect, test } from "vitest";
import { rngFromSeed, strokeStreams, randomSeed } from "../src/model/rng";

describe("rng", () => {
  test("deterministic: same seed, same sequence", () => {
    const a = rngFromSeed(42), b = rngFromSeed(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  test("different seeds differ", () => {
    expect(rngFromSeed(1)()).not.toBe(rngFromSeed(2)());
  });
  test("range [0,1)", () => {
    const r = rngFromSeed(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  test("strokeStreams: gen and hand are independent and deterministic", () => {
    const s1 = strokeStreams(99), s2 = strokeStreams(99);
    expect(s1.gen()).toBe(s2.gen());
    expect(s1.hand()).toBe(s2.hand());
    const s3 = strokeStreams(99);
    expect(s3.hand()).not.toBe(s3.gen()); // near-certain for sfc32
  });
  test("randomSeed returns uint32", () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
