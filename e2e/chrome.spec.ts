import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { drag, getScene, newPortraitSheet, stageCenter, strokeFirstPointOnScreen, URL } from "./helpers";

// Focused coverage for the chrome/wiring layer (main.ts, ui/chrome.ts,
// ui/panel.ts) — the flows the smoke test doesn't touch: palette
// swap/pin/reslot, the hand dial, save→open through the real file input,
// re-roll, and the pendingEdit/undo boundary edges.

// The global Ctrl+Z handler ignores keys while a form control has focus
// (so inputs keep their own shortcuts) — drop focus after clicking
// swatches/selects before driving keyboard-level undo.
async function blurActive(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}

test("palette: swatch reslots selection, pins future strokes, swap re-skins, all undoable", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);

  // stroke 1 lands auto-rotated on slot 1 and auto-selected — a swatch click
  // while selected means "re-slot this stroke", not "pin"
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);
  await page.click('#palette-strip .swatch[data-slot="3"]');
  let scene = await getScene(page);
  expect(scene.strokes[0].colorSlot).toBe(3);
  const stroke1 = page.locator(`g[data-stroke-id="${scene.strokes[0].id}"] path.ink`);
  await expect(stroke1).toHaveAttribute("stroke", "#8338ec"); // notebook ink 3

  // deselected, the same click becomes a pin; the pinned slot colors the next stroke
  await page.keyboard.press("Escape");
  await page.click('#palette-strip .swatch[data-slot="2"]');
  await expect(page.locator('#palette-strip .swatch[data-slot="2"]')).toHaveAttribute("data-pinned", "true");
  await expect(page.locator(".swatch-auto")).toHaveAttribute("data-active", "false");
  await drag(page, [cx - 150, cy + 150], [cx + 150, cy + 90]);
  scene = await getScene(page);
  expect(scene.strokes[1].colorSlot).toBe(2);

  // clicking the pinned swatch again (with nothing selected) unpins back to auto
  await page.keyboard.press("Escape");
  await page.click('#palette-strip .swatch[data-slot="2"]');
  await expect(page.locator(".swatch-auto")).toHaveAttribute("data-active", "true");

  // palette swap re-skins in place: slot 3 now resolves through bauhaus inks
  await page.selectOption("#palette-select", "bauhaus");
  scene = await getScene(page);
  expect(scene.paletteId).toBe("bauhaus");
  await expect(stroke1).toHaveAttribute("stroke", "#e9a820"); // bauhaus ink 3
  await expect(page.locator("#palette-strip .swatch[data-slot]")).toHaveCount(4);

  // the swap is one undoable step
  await blurActive(page);
  await page.keyboard.press("Control+z");
  expect((await getScene(page)).paletteId).toBe("notebook");
  await expect(stroke1).toHaveAttribute("stroke", "#8338ec");
});

test("hand dial re-renders live and commits exactly one history entry", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);

  const ink = page.locator("g.strokes path.ink").first();
  const dBefore = await ink.getAttribute("d");

  await page.locator("#hand-range").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await getScene(page)).hand).toBe(0);
  expect(await ink.getAttribute("d")).not.toBe(dBefore); // strokes re-baked clean

  // one Ctrl+Z restores both the dial value and the exact original bake
  await blurActive(page);
  await page.keyboard.press("Control+z");
  expect((await getScene(page)).hand).toBeCloseTo(0.6);
  expect(await ink.getAttribute("d")).toBe(dBefore);
  await expect(page.locator("#hand-range")).toHaveValue("0.6");
});

test("save → open roundtrip through the real file input; open and new-sheet are undoable boundaries", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  const strokes = page.locator("g.strokes > g");

  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);
  await page.keyboard.press("3");
  await page.mouse.click(cx, cy - 150);
  await expect(strokes).toHaveCount(2);

  const dl = page.waitForEvent("download");
  await page.click("#btn-save");
  const savedPath = await (await dl).path();

  // fresh square sheet wipes the canvas...
  await page.click("#btn-new");
  await page.click('[data-sheet="square"]');
  await expect(strokes).toHaveCount(0);

  // ...and opening the saved file brings the drawing back through #file-open
  await page.setInputFiles("#file-open", savedPath);
  await expect(strokes).toHaveCount(2);
  const scene = await getScene(page);
  expect(scene.sheet).toEqual({ w: 1600, h: 2000 });

  // both document boundaries are plain history entries: undo lands on the
  // empty square sheet, a second undo lands back on the pre-New drawing
  await blurActive(page);
  await page.keyboard.press("Control+z");
  await expect(strokes).toHaveCount(0);
  expect((await getScene(page)).sheet).toEqual({ w: 1600, h: 1600 });
  await page.keyboard.press("Control+z");
  await expect(strokes).toHaveCount(2);
  expect((await getScene(page)).sheet).toEqual({ w: 1600, h: 2000 });
});

test("re-roll (key and panel button) changes the seed, keeps params and color", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]); // auto-selected

  const before = (await getScene(page)).strokes[0];
  const ink = page.locator("g.strokes path.ink").first();
  const dBefore = await ink.getAttribute("d");

  await page.keyboard.press("r");
  let after = (await getScene(page)).strokes[0];
  expect(after.seed).not.toBe(before.seed);
  expect(after.params).toEqual(before.params);
  expect(after.colorSlot).toBe(before.colorSlot);
  expect(await ink.getAttribute("d")).not.toBe(dBefore);

  const seedAfterKey = after.seed;
  await page.click("#param-panel .panel-actions button:has-text('re-roll')");
  after = (await getScene(page)).strokes[0];
  expect(after.seed).not.toBe(seedAfterKey);
});

test("hexpack is hidden from the toolbar but saved hexpack strokes still open, render, and edit", async ({ page }) => {
  await newPortraitSheet(page);
  await expect(page.locator('#tools button[data-tool="hexpack"]')).toHaveCount(0);
  await blurActive(page); // the New-sheet dialog button still has focus; tool keys ignore focused form controls
  await page.keyboard.press("2");
  await expect(page.locator('#tools button[data-tool="squarecluster"]')).toHaveAttribute("data-active", "true");

  const strokes = page.locator("g.strokes > g");
  await page.setInputFiles("#file-open", fileURLToPath(new globalThis.URL("./fixtures/hexpack-sheet.json", import.meta.url)));
  await expect(strokes).toHaveCount(1);
  const scene = await getScene(page);
  expect(scene.strokes[0].brush).toBe("hexpack");
  expect(await page.locator("g.strokes path.ink").first().getAttribute("d")).toMatch(/^M /);

  // select it: the hexpack param panel (from the still-registered brush) comes up, editable
  await page.keyboard.press("v");
  const [selX, selY] = await strokeFirstPointOnScreen(page, scene.strokes[0].id);
  await page.mouse.click(selX, selY);
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1);
  await expect(page.locator("#param-panel label", { hasText: "cell size" })).toHaveCount(1);
  await expect(page.locator('#param-panel input[type="range"]').first()).toBeEnabled();
});

test("Escape mid-slider-drag commits the partial edit as exactly one history entry", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]); // auto-selected, runLength 28

  // 'input' without 'change' = a drag still in flight when Escape tears the
  // panel down — flushPendingEdit must fold it into one commit, not zero, not two
  await page.locator('#param-panel input[type="range"]').first().evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = input.max;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("g.overlay path.halo")).toHaveCount(0);
  expect((await getScene(page)).strokes[0].params.runLength).toBe(80);

  // exactly one entry: first undo restores the param, second removes the stroke
  await blurActive(page);
  await page.keyboard.press("Control+z");
  expect((await getScene(page)).strokes[0].params.runLength).toBe(28);
  await page.keyboard.press("Control+z");
  await expect(page.locator("g.strokes > g")).toHaveCount(0);
});

test("grain dial: live render, export coverage, exactly one history entry", async ({ page }) => {
  await newPortraitSheet(page);
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);

  const grainRect = page.locator("svg#sheet rect.grain");
  await expect(grainRect).toHaveAttribute("opacity", "0");

  await page.locator("#grain-range").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await getScene(page)).grain).toBe(1);
  await expect(grainRect).toHaveAttribute("opacity", "0.35");

  // WYSIWYG: the exported SVG carries the grain layer
  const svgStr = await page.evaluate(() => (window as any).__ww.exportSvgString());
  expect(svgStr).toContain("feTurbulence");

  // exactly one history entry: one undo restores 0 (and the dial follows)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("Control+z");
  expect((await getScene(page)).grain).toBe(0);
  await expect(grainRect).toHaveAttribute("opacity", "0");
  await expect(page.locator("#grain-range")).toHaveValue("0");

  // neon (first dark paper): paper re-skins, speckle flips to white, and the
  // selection halo survives the palette swap
  await page.selectOption("#palette-select", "neon");
  await expect(page.locator("svg#sheet rect.paper")).toHaveAttribute("fill", "#1b1b1e");
  expect(await page.locator("svg#sheet feColorMatrix").getAttribute("values")).toContain("0 0 0 0 1 ");
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1);
});

test("grain dial: survives reload via autosave", async ({ page }) => {
  await newPortraitSheet(page);
  await page.locator("#grain-range").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await getScene(page)).grain).toBe(1);

  await page.waitForTimeout(500); // > autosave debounce
  await page.reload();
  expect((await getScene(page)).grain).toBe(1);
  await expect(page.locator("svg#sheet rect.grain")).toHaveAttribute("opacity", "0.35");
  await expect(page.locator("#grain-range")).toHaveValue("1");
});

test("size picker: S is default, dims land in the scene, S renders half of L on screen", async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // S is the default size; labels show S dims
  await expect(page.locator('#new-dialog button[data-size="s"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('#new-dialog button[data-sheet="square"] small')).toHaveText("800 × 800");

  await page.click('[data-sheet="square"]');
  expect((await getScene(page)).sheet).toEqual({ w: 800, h: 800 });
  const sBox = (await page.locator("svg#sheet rect.paper").boundingBox())!;

  // New -> L square: on-screen paper should be ~2x wider (constant scale)
  await page.click("#btn-new");
  await page.click('#new-dialog button[data-size="l"]');
  await expect(page.locator('#new-dialog button[data-sheet="square"] small')).toHaveText("1600 × 1600");
  await page.click('[data-sheet="square"]');
  expect((await getScene(page)).sheet).toEqual({ w: 1600, h: 1600 });
  const lBox = (await page.locator("svg#sheet rect.paper").boundingBox())!;
  expect(lBox.width / sBox.width).toBeGreaterThan(1.9);
  expect(lBox.width / sBox.width).toBeLessThan(2.1);
});

test("WYSIWYG: clicks on the stage matte are ignored, not committed as invisible strokes", async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-sheet="square"]'); // S is default -> 800x800, matte fills most of the stage

  const strokes = page.locator("g.strokes > g");
  const stageBox = (await page.locator("#stage svg").boundingBox())!;
  const matteX = stageBox.x + 30; // well outside the S sheet's centered ~45%-width paper
  const matteY = stageBox.y + stageBox.height / 2;

  // default zigzag tool: a click (degenerate drag) on the matte commits nothing
  await page.mouse.click(matteX, matteY);
  await expect(strokes).toHaveCount(0);

  // sunstamp: a matte click would otherwise commit an invisible off-sheet stamp
  await page.keyboard.press("3");
  await page.mouse.click(matteX, matteY);
  await expect(strokes).toHaveCount(0);

  // sanity: drawing on the actual sheet still works
  await page.keyboard.press("1");
  const [cx, cy] = await stageCenter(page);
  await drag(page, [cx - 100, cy], [cx + 100, cy - 50]);
  await expect(strokes).toHaveCount(1);
});
