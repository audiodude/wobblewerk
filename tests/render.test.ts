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

  // WYSIWYG covenant: off-sheet ink is visible on the stage matte but absent
  // from exports (viewBox crops it). Clipping strokes/live/overlay to the
  // sheet keeps screen and export in agreement.
  test("ink layers are clipped to the sheet; clipPath survives updateGrain", () => {
    r.renderScene(scene);
    const clipRect = svg.querySelector<SVGRectElement>("clipPath#ww-sheet-clip rect")!;
    expect(clipRect.getAttribute("width")).toBe(String(scene.sheet.w));
    expect(clipRect.getAttribute("height")).toBe(String(scene.sheet.h));
    for (const cls of ["strokes", "live", "overlay"]) {
      expect(svg.querySelector(`g.${cls}`)!.getAttribute("clip-path")).toBe("url(#ww-sheet-clip)");
    }
    r.updateGrain(scene); // replaces g.grain-layer wholesale — must not take the clipPath with it
    expect(svg.querySelector("clipPath#ww-sheet-clip")).toBeTruthy();
  });
});

describe("grain layer", () => {
  function grainScene(grain: number, paletteId = "notebook") {
    const scene = newScene(400, 400, paletteId);
    scene.grain = grain;
    return scene;
  }

  test("renderScene emits grain layer between paper and strokes", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(svg).renderScene(grainScene(0.5));
    const kids = Array.from(svg.children).map((c) => c.getAttribute("class"));
    expect(kids).toEqual([null, "paper", "grain-layer", "strokes", "live", "overlay"]); // null: top-level <defs> (sheet clipPath)
    const rect = svg.querySelector("g.grain-layer rect.grain")!;
    expect(rect.getAttribute("opacity")).toBe("0.18"); // 0.5 * 0.35 rounded to 2dp
    expect(rect.getAttribute("filter")).toBe("url(#ww-grain)");
    const turb = svg.querySelector("g.grain-layer feTurbulence")!;
    expect(turb.getAttribute("seed")).toBe("7"); // fixed: deterministic grain
    expect(turb.getAttribute("type")).toBe("fractalNoise");
  });

  test("grain 0 renders the layer at opacity 0", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(svg).renderScene(grainScene(0));
    expect(svg.querySelector("rect.grain")!.getAttribute("opacity")).toBe("0");
  });

  test("speckle tone follows paper luminance: dark on light paper, light on dark", () => {
    const light = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(light).renderScene(grainScene(0.5, "notebook"));
    const dark = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    new SheetRenderer(dark).renderScene(grainScene(0.5, "neon"));
    const values = (s: SVGSVGElement) => s.querySelector("feColorMatrix")!.getAttribute("values")!;
    expect(values(light)).toContain("0 0 0 0 0 "); // black speckle rows
    expect(values(dark)).toContain("0 0 0 0 1 "); // white speckle rows
  });

  test("updateGrain swaps opacity in place without touching strokes DOM", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    const r = new SheetRenderer(svg);
    const scene = grainScene(0);
    r.renderScene(scene);
    const strokesG = svg.querySelector("g.strokes");
    scene.grain = 1;
    r.updateGrain(scene);
    expect(svg.querySelector("rect.grain")!.getAttribute("opacity")).toBe("0.35");
    expect(svg.querySelector("g.strokes")).toBe(strokesG); // same node, untouched
  });
});
