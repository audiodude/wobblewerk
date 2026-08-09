import { expect, test } from "@playwright/test";
import { drag, dragArc, newPortraitSheet, strokeFirstPointOnScreen } from "./helpers";

test("draw, undo, redo, autosave, export", async ({ page }) => {
  await newPortraitSheet(page);
  const stage = page.locator("#stage svg");
  const box = (await stage.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const strokes = page.locator("g.strokes > g");

  // draw: zigzag is the default active tool; drag well past the >24px-of-
  // spine floor the brush's lookahead needs to emit any geometry at all.
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);
  await expect(strokes).toHaveCount(1);

  await page.keyboard.press("Control+z");
  await expect(strokes).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(strokes).toHaveCount(1);

  // autosave survives reload
  await page.waitForTimeout(500); // > debounce
  await page.reload();
  await expect(page.locator("g.strokes > g")).toHaveCount(1);

  // export SVG contains the stroke path
  const svgStr = await page.evaluate(() => (window as any).__ww.exportSvgString());
  expect(svgStr).toContain("<path");
  expect(svgStr).not.toContain("hit");

  // hexpack: switch tool, drag an arc (the brush closes the loop itself)
  await page.keyboard.press("2");
  await dragArc(page, [cx - 20, cy + 260], 130, 200, 340);
  await expect(strokes).toHaveCount(2);

  // sunstamp: click
  await page.keyboard.press("3");
  await page.mouse.click(cx, cy - 150);
  await expect(strokes).toHaveCount(3);

  // select + delete: click ON the just-stamped stroke's rendered outline,
  // not its (unstroked) center — see strokeFirstPointOnScreen above.
  await page.keyboard.press("v");
  const stampId = await strokes.last().getAttribute("data-stroke-id");
  const [selX, selY] = await strokeFirstPointOnScreen(page, stampId!);
  await page.mouse.click(selX, selY);
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(strokes).toHaveCount(2);

  // png export: dialog asks about clipping, then produces a timestamped download
  await page.click("#btn-export-png");
  await expect(page.locator("#png-dialog")).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.click("#png-clip-no");
  expect((await dl).suggestedFilename()).toMatch(/^wobblewerk \d{4}-\d\d-\d\d \d\d-\d\d\.png$/);

  // trimmed export also downloads (dialog "yes" path)
  await page.click("#btn-export-png");
  const dl2 = page.waitForEvent("download");
  await page.click("#png-clip-yes");
  expect((await dl2).suggestedFilename()).toMatch(/\.png$/);
});

test("finishing a stroke auto-selects it; param tweaks update the stroke AND the brush defaults", async ({ page }) => {
  await newPortraitSheet(page);
  const stage = page.locator("#stage svg");
  const box = (await stage.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // draw a zigzag — it should come out selected (halo + selection panel with
  // a re-roll button) while the zigzag tool stays active
  await drag(page, [cx - 150, cy], [cx + 150, cy - 80]);
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1);
  await expect(page.locator('#tools button[data-tool="zigzag"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator("#param-panel .panel-actions")).toHaveCount(1); // selection panel, not tool defaults

  // dial the first param on the just-drawn stroke; because the matching brush
  // tool is still active this must also become the default for the next stroke
  const firstStrokeId = await page.evaluate(() => (window as any).__ww.getScene().strokes[0].id);
  const slider = page.locator('#param-panel input[type="range"]').first();
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const editedValue = await page.evaluate(
    (id) => (window as any).__ww.getScene().strokes.find((s: any) => s.id === id).params.runLength,
    firstStrokeId,
  );
  expect(editedValue).toBe(80); // slider max carried into the stroke

  // next zigzag inherits the tweaked default and steals the selection
  await drag(page, [cx - 150, cy + 150], [cx + 150, cy + 220]);
  const strokes = page.locator("g.strokes > g");
  await expect(strokes).toHaveCount(2);
  const secondParams = await page.evaluate(() => (window as any).__ww.getScene().strokes[1].params);
  expect(secondParams.runLength).toBe(80);
  await expect(page.locator("g.overlay path.halo")).toHaveCount(1); // selection moved, still exactly one halo

  // Esc returns to the tool-defaults panel without switching tools
  await page.keyboard.press("Escape");
  await expect(page.locator("g.overlay path.halo")).toHaveCount(0);
  await expect(page.locator('#tools button[data-tool="zigzag"]')).toHaveAttribute("data-active", "true");
});
