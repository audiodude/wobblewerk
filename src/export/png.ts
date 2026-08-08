import { exportSvgString } from "./svg";
import type { Scene } from "../model/types";

export interface ClipRect { x: number; y: number; w: number; h: number }

/**
 * Bounding box of all baked ink (plus stroke half-widths and a margin),
 * clamped to the sheet. Null when the sheet is empty. Margin is defined at
 * 1600px sheet width and scales with the sheet.
 */
export function artworkClip(scene: Scene, margin = 20): ClipRect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of scene.strokes) {
    for (const baked of stroke.baked) {
      const pad = (baked.width || 0) / 2;
      const nums = baked.d.match(/-?\d+(?:\.\d+)?/g);
      if (!nums) continue;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]), y = Number(nums[i + 1]);
        if (x - pad < minX) minX = x - pad;
        if (y - pad < minY) minY = y - pad;
        if (x + pad > maxX) maxX = x + pad;
        if (y + pad > maxY) maxY = y + pad;
      }
    }
  }
  if (minX === Infinity) return null;
  const m = margin * (scene.sheet.w / 1600);
  const x = Math.max(0, minX - m);
  const y = Math.max(0, minY - m);
  const x2 = Math.min(scene.sheet.w, maxX + m);
  const y2 = Math.min(scene.sheet.h, maxY + m);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

export function exportPngBlob(svg: SVGSVGElement, scene: Scene, clip?: ClipRect): Promise<Blob> {
  const str = exportSvgString(svg, scene);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = clip ?? { x: 0, y: 0, w: scene.sheet.w, h: scene.sheet.h };
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(c.w * 2);
      canvas.height = Math.round(c.h * 2);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png encode failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg rasterize failed"));
    img.src = url;
  });
}

/** "wobblewerk 2026-08-08 14-32.json" — yyyy-mm-dd hh-mm, local time.
 * Dash between hours and minutes: a colon gets sanitized to "_" by the
 * browser's download machinery. */
export function timestampName(prefix: string, ext: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}-${p(now.getMinutes())}.${ext}`;
}

export function download(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
