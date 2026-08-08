import type { Scene } from "../model/types";

export function exportSvgString(svg: SVGSVGElement, scene: Scene): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("g.live, g.overlay, path.hit").forEach((el) => el.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(scene.sheet.w));
  clone.setAttribute("height", String(scene.sheet.h));
  clone.setAttribute("viewBox", `0 0 ${scene.sheet.w} ${scene.sheet.h}`);
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  return new XMLSerializer().serializeToString(clone);
}
