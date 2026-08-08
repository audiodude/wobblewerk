// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { SheetRenderer } from "../src/render/svg";
import { addStroke, newScene } from "../src/engine/scene";
import { getPalette, resolveInk } from "../src/model/palettes";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";
import type { Scene } from "../src/model/types";

const input = { kind: "path" as const, points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) };

let svg: SVGSVGElement, r: SheetRenderer, scene: Scene;
beforeEach(() => {
  document.body.innerHTML = "<svg></svg>";
  svg = document.querySelector("svg")!;
  r = new SheetRenderer(svg);
  scene = newScene(1600, 2000);
});

describe("SheetRenderer", () => {
  test("renderScene builds paper, strokes, live, overlay", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 3, params: defaultParams(zigzag), colorSlot: 2 });
    r.renderScene(scene);
    expect(svg.getAttribute("viewBox")).toBe("0 0 1600 2000");
    expect(svg.querySelector("rect.paper")!.getAttribute("fill")).toBe(getPalette("notebook").paper);
    const g = svg.querySelector(`g[data-stroke-id="${s.id}"]`)!;
    const ink = g.querySelector("path.ink")!;
    expect(ink.getAttribute("stroke")).toBe(resolveInk(getPalette("notebook"), 2));
    expect(ink.getAttribute("fill")).toBe("none");
    expect(g.querySelector("path.hit")).toBeTruthy();
    expect(svg.querySelector("g.live")).toBeTruthy();
    expect(svg.querySelector("g.overlay")).toBeTruthy();
  });
  test("palette swap re-render recolors existing bake", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 3, params: defaultParams(zigzag), colorSlot: 1 });
    r.renderScene(scene);
    scene.paletteId = "bauhaus";
    r.renderScene(scene);
    const ink = svg.querySelector(`g[data-stroke-id="${s.id}"] path.ink`)!;
    expect(ink.getAttribute("stroke")).toBe(resolveInk(getPalette("bauhaus"), 1));
  });
  test("updateStroke keeps z-position; removeStroke removes group", () => {
    const a = addStroke(scene, { brush: "zigzag", input, seed: 1, params: defaultParams(zigzag), colorSlot: 1 });
    const b = addStroke(scene, { brush: "zigzag", input, seed: 2, params: defaultParams(zigzag), colorSlot: 2 });
    r.renderScene(scene);
    a.colorSlot = 4;
    r.updateStroke(scene, a.id);
    const ids = [...svg.querySelectorAll("g.strokes > g")].map((g) => g.getAttribute("data-stroke-id"));
    expect(ids).toEqual([a.id, b.id]);
    r.removeStroke(b.id);
    expect(svg.querySelector(`g[data-stroke-id="${b.id}"]`)).toBeNull();
  });
  test("live layer upsert and clear; selection halo", () => {
    const s = addStroke(scene, { brush: "zigzag", input, seed: 1, params: defaultParams(zigzag), colorSlot: 1 });
    r.renderScene(scene);
    r.renderGhost([{ x: 0, y: 0 }, { x: 50, y: 50 }]);
    expect(svg.querySelectorAll("g.live > *").length).toBe(1);
    r.clearLive();
    expect(svg.querySelectorAll("g.live > *").length).toBe(0);
    r.setSelection(scene, s.id);
    expect(svg.querySelector("g.overlay path.halo")).toBeTruthy();
    r.setSelection(scene, null);
    expect(svg.querySelector("g.overlay path.halo")).toBeNull();
  });
});
