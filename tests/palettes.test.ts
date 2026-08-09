import { describe, expect, test } from "vitest";
import { PALETTES, getPalette, resolveInk } from "../src/model/palettes";

test("four presets exist with paper + inks", () => {
  expect(PALETTES.map((p) => p.id).sort()).toEqual(["ballpoint", "bauhaus", "blackwork", "constructivist", "neon", "notebook"]);
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

describe("round-2 palettes", () => {
  test("constructivist: cream paper, 3 inks, slot wraps past 3", () => {
    const p = getPalette("constructivist");
    expect(p.label).toBe("Constructivist");
    expect(p.paper).toBe("#f2e6d0");
    expect(p.inks).toEqual(["#d33f2e", "#211d1a", "#8a7f72"]);
    expect(resolveInk(p, 4)).toBe("#d33f2e"); // 1-based modulo wrap
  });

  test("neon: dark paper, 4 inks", () => {
    const p = getPalette("neon");
    expect(p.label).toBe("Neon on black");
    expect(p.paper).toBe("#1b1b1e");
    expect(p.inks).toEqual(["#2de1fc", "#ff3d9e", "#b8f533", "#ffb52e"]);
  });

  test("PALETTES has 6 entries, ids unique", () => {
    expect(PALETTES).toHaveLength(6);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(6);
  });
});
