// @vitest-environment jsdom
import { expect, test } from "vitest";
import { exportSvgString } from "../src/export/svg";
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
