import { expect, test } from "vitest";
import { PALETTES, getPalette, resolveInk } from "../src/model/palettes";

test("four presets exist with paper + inks", () => {
  expect(PALETTES.map((p) => p.id).sort()).toEqual(["ballpoint", "bauhaus", "blackwork", "notebook"]);
  for (const p of PALETTES) {
    expect(p.paper).toMatch(/^#/);
    expect(p.inks.length).toBeGreaterThanOrEqual(1);
  }
});
test("getPalette falls back to notebook", () => {
  expect(getPalette("nope").id).toBe("notebook");
});
test("resolveInk wraps modulo ink count", () => {
  const p = getPalette("notebook");
  expect(resolveInk(p, 1)).toBe(p.inks[0]);
  expect(resolveInk(p, p.inks.length + 1)).toBe(p.inks[0]);
});
