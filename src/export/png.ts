import { exportSvgString } from "./svg";
import type { Scene } from "../model/types";

export function exportPngBlob(svg: SVGSVGElement, scene: Scene): Promise<Blob> {
  const str = exportSvgString(svg, scene);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = scene.sheet.w * 2;
      canvas.height = scene.sheet.h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png encode failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("svg rasterize failed"));
    img.src = url;
  });
}

export function download(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
