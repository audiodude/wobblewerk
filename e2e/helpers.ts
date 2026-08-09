import { type Page } from "@playwright/test";

export const URL = "http://localhost:5199";

export async function newPortraitSheet(page: Page): Promise<void> {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#new-dialog button[data-size="l"]');
  await page.click('[data-sheet="portrait"]');
}

export async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
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
export async function dragArc(page: Page, center: [number, number], radius: number, startDeg: number, endDeg: number): Promise<void> {
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
export async function strokeFirstPointOnScreen(page: Page, strokeId: string): Promise<[number, number]> {
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

/** Screen-space center of the stage, where most test strokes get drawn. */
export async function stageCenter(page: Page): Promise<[number, number]> {
  const box = (await page.locator("#stage svg").boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** Read the live scene via the app's debug hook. */
export function getScene(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ww.getScene());
}
