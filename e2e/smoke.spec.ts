import { expect, test, type Page } from "@playwright/test";

const URL = "http://localhost:5199";

async function newPortraitSheet(page: Page): Promise<void> {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-sheet="portrait"]');
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...from);
  await page.mouse.down();
  const steps = 25;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  }
  await page.mouse.up();
}

// hexpack's region input is closed by the brush itself (first point
// re-appended) — a straight there-and-back drag would enclose ~zero area
// and only ever emit the trivial boundary contour (or nothing, if RDP
// simplification collapses it below 3 points). Sweep a real arc instead so
// the closed region has non-trivial area and reliably packs geometry.
async function dragArc(page: Page, center: [number, number], radius: number, startDeg: number, endDeg: number): Promise<void> {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number): [number, number] => [center[0] + radius * Math.cos(toRad(deg)), center[1] + radius * Math.sin(toRad(deg))];
  const [sx, sy] = pt(startDeg);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const [x, y] = pt(startDeg + ((endDeg - startDeg) * i) / steps);
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
}

// Selecting a stroke has to click ON its rendered outline: stroke hit-testing
// has no fill (pointer-events: stroke), so the *center* point used to place a
// sunstamp sits inside the ring, not on it, and won't register a hit. Read
// the stroke's actual baked `d` back off the DOM (post hand-wobble) and
// convert its leading point from sheet space to screen space via the live
// viewBox, so the click lands on real, currently-rendered geometry.
async function strokeFirstPointOnScreen(page: Page, strokeId: string): Promise<[number, number]> {
  const svg = page.locator("#stage svg");
  const d = await page.locator(`g[data-stroke-id="${strokeId}"] path.ink`).getAttribute("d");
  const m = d?.match(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
  if (!m) throw new Error(`could not parse leading M point from d="${d}"`);
  const sheetX = parseFloat(m[1]!);
  const sheetY = parseFloat(m[2]!);
  const viewBox = (await svg.getAttribute("viewBox"))!;
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number) as [number, number, number, number];
  const rect = (await svg.boundingBox())!;
  return [rect.x + ((sheetX - vx) / vw) * rect.width, rect.y + ((sheetY - vy) / vh) * rect.height];
}

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
