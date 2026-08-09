// @vitest-environment jsdom
import { expect, test } from "vitest";
import { exportSvgString } from "../src/export/svg";
import { artworkClip, timestampName } from "../src/export/png";
import type { Scene, Stroke } from "../src/model/types";
import { SheetRenderer } from "../src/render/svg";
import { addStroke, newScene } from "../src/engine/scene";
import { defaultParams } from "../src/model/types";
import { zigzag } from "../src/brushes/zigzag";

test("exportSvgString: standalone, stripped of live/overlay/hit, sheet-sized", () => {
  document.body.innerHTML = "<svg></svg>";
  const svg = document.querySelector("svg")!;
  const r = new SheetRenderer(svg);
  const scene = newScene(1600, 2000);
  addStroke(scene, {
    brush: "zigzag",
    input: { kind: "path", points: Array.from({ length: 120 }, (_, i) => ({ x: i * 4, y: 300 + Math.sin(i / 9) * 40 })) },
    seed: 3, params: defaultParams(zigzag), colorSlot: 1,
  });
  r.renderScene(scene);
  r.renderGhost([{ x: 0, y: 0 }, { x: 9, y: 9 }]);
  r.setSelection(scene, scene.strokes[0]!.id);
  const out = exportSvgString(svg, scene);
  expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(out).toContain('width="1600"');
  expect(out).toContain('height="2000"');
  expect(out).toContain('viewBox="0 0 1600 2000"');
  expect(out).toContain("path");
  expect(out).not.toContain("hit");
  expect(out).not.toContain("halo");
  expect(out).not.toContain("live");
  // original svg untouched
  expect(svg.querySelector("path.hit")).toBeTruthy();
});

const mkStroke = (d: string, width: number): Stroke => ({
  id: "s1", brush: "zigzag", brushVersion: 1,
  input: { kind: "path", points: [] }, seed: 1, params: {}, colorSlot: 1,
  baked: [{ d, stroke: true, fill: false, width }],
});

test("artworkClip: ink bbox + half-width + margin, sheet-relative", () => {
  const scene: Scene = { version: 1, sheet: { w: 1600, h: 2000 }, paletteId: "notebook", hand: 0, grain: 0, strokes: [] };
  scene.strokes.push(mkStroke("M 100 200 L 300 400", 4));
  // pad 2 (width/2) + margin 20 (sheetW 1600 → scale 1)
  expect(artworkClip(scene)).toEqual({ x: 78, y: 178, w: 244, h: 244 });
});

test("artworkClip: clamps to sheet and handles empty scene", () => {
  const scene: Scene = { version: 1, sheet: { w: 1600, h: 2000 }, paletteId: "notebook", hand: 0, grain: 0, strokes: [] };
  expect(artworkClip(scene)).toBeNull();
  scene.strokes.push(mkStroke("M 5 5 L 1595 1995", 4));
  const clip = artworkClip(scene)!;
  expect(clip.x).toBe(0);
  expect(clip.y).toBe(0);
  expect(clip.w).toBe(1600);
  expect(clip.h).toBe(2000);
});

test("artworkClip: negative coords clamp to 0 and margin scales with sheet", () => {
  const scene: Scene = { version: 1, sheet: { w: 3200, h: 3200 }, paletteId: "notebook", hand: 0, grain: 0, strokes: [] };
  scene.strokes.push(mkStroke("M -50 100 L 200 300", 0));
  const clip = artworkClip(scene)!; // margin 40 at sheetW 3200
  expect(clip.x).toBe(0);
  expect(clip.y).toBe(60);
  expect(clip.w).toBe(240);
  expect(clip.h).toBe(280);
});

test("timestampName formats yyyy-mm-dd hh-mm with padding", () => {
  const now = new Date(2026, 7, 8, 9, 5); // Aug 8 2026, 09:05 local
  expect(timestampName("wobblewerk", "json", now)).toBe("wobblewerk 2026-08-08 09-05.json");
});

test("exported SVG carries the sheet clipPath (harmless and correct in Inkscape)", () => {
  document.body.innerHTML = "<svg></svg>";
  const svg = document.querySelector("svg")!;
  const scene = newScene(400, 400);
  new SheetRenderer(svg).renderScene(scene);
  const out = exportSvgString(svg, scene);
  expect(out).toContain('clipPath id="ww-sheet-clip"');
});

test("exported SVG carries the grain layer (WYSIWYG covenant)", () => {
  document.body.innerHTML = "<svg></svg>";
  const svg = document.querySelector("svg")!;
  const scene = newScene(400, 400);
  scene.grain = 0.6;
  new SheetRenderer(svg).renderScene(scene);
  const out = exportSvgString(svg, scene);
  expect(out).toContain("feTurbulence");
  expect(out).toContain('class="grain"');
});
