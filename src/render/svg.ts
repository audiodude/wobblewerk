import { getPalette, resolveInk, type Palette } from "../model/palettes";
import { getStroke } from "../engine/scene";
import type { Scene, Stroke } from "../model/types";
import type { XY } from "../model/geometry";

const NS = "http://www.w3.org/2000/svg";
const r2 = (n: number) => Math.round(n * 100) / 100;

function inkAttrs(stroke: Stroke, palette: Palette) {
  const d = stroke.baked.map((b) => b.d).join(" ");
  const width = stroke.baked[0]?.width ?? 2;
  const ink = resolveInk(palette, stroke.colorSlot);
  const fillFlag = stroke.baked.some((b) => b.fill);
  return { d, width, ink, fillFlag };
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
}

export class SheetRenderer {
  constructor(private svg: SVGSVGElement) {}

  private layer(cls: string): SVGGElement {
    const g = this.svg.querySelector<SVGGElement>(`g.${cls}`);
    if (!g) throw new Error(`SheetRenderer: g.${cls} missing — call renderScene() first`);
    return g;
  }

  private buildStrokeGroup(scene: Scene, stroke: Stroke): SVGGElement {
    const palette = getPalette(scene.paletteId);
    const { d, width, ink, fillFlag } = inkAttrs(stroke, palette);

    const g = el("g");
    g.setAttribute("data-stroke-id", stroke.id);

    const ink_ = el("path");
    ink_.setAttribute("class", "ink");
    ink_.setAttribute("d", d);
    ink_.setAttribute("fill", fillFlag ? ink : "none");
    ink_.setAttribute("stroke", ink);
    ink_.setAttribute("stroke-width", String(width));
    ink_.setAttribute("stroke-linecap", "round");
    ink_.setAttribute("stroke-linejoin", "round");
    g.appendChild(ink_);

    const hit = el("path");
    hit.setAttribute("class", "hit");
    hit.setAttribute("d", d);
    hit.setAttribute("fill", "none");
    hit.setAttribute("stroke", "#000");
    hit.setAttribute("stroke-opacity", "0");
    hit.setAttribute("stroke-width", String(Math.max(width + 10, 14)));
    hit.style.pointerEvents = "stroke";
    g.appendChild(hit);

    return g;
  }

  renderScene(scene: Scene): void {
    this.svg.setAttribute("viewBox", `0 0 ${scene.sheet.w} ${scene.sheet.h}`);
    this.svg.replaceChildren();

    const palette = getPalette(scene.paletteId);
    const paper = el("rect");
    paper.setAttribute("class", "paper");
    paper.setAttribute("x", "0");
    paper.setAttribute("y", "0");
    paper.setAttribute("width", String(scene.sheet.w));
    paper.setAttribute("height", String(scene.sheet.h));
    paper.setAttribute("fill", palette.paper);
    this.svg.appendChild(paper);

    const strokesG = el("g");
    strokesG.setAttribute("class", "strokes");
    for (const stroke of scene.strokes) strokesG.appendChild(this.buildStrokeGroup(scene, stroke));
    this.svg.appendChild(strokesG);

    const liveG = el("g");
    liveG.setAttribute("class", "live");
    this.svg.appendChild(liveG);

    const overlayG = el("g");
    overlayG.setAttribute("class", "overlay");
    this.svg.appendChild(overlayG);
  }

  updateStroke(scene: Scene, id: string): void {
    const stroke = getStroke(scene, id);
    if (!stroke) return;
    const strokesG = this.layer("strokes");
    const newG = this.buildStrokeGroup(scene, stroke);
    const oldG = strokesG.querySelector(`g[data-stroke-id="${id}"]`);
    if (oldG) oldG.replaceWith(newG);
    else strokesG.appendChild(newG);
  }

  removeStroke(id: string): void {
    const strokesG = this.layer("strokes");
    strokesG.querySelector(`g[data-stroke-id="${id}"]`)?.remove();
  }

  renderLive(scene: Scene, stroke: Stroke): void {
    const live = this.layer("live");
    const palette = getPalette(scene.paletteId);
    const { d, width, ink, fillFlag } = inkAttrs(stroke, palette);

    let path = live.querySelector<SVGPathElement>("path.live-ink");
    if (!path) {
      path = el("path");
      path.setAttribute("class", "live-ink");
      live.appendChild(path);
    }
    path.setAttribute("data-live-id", stroke.id);
    path.setAttribute("d", d);
    path.setAttribute("fill", fillFlag ? ink : "none");
    path.setAttribute("stroke", ink);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  }

  renderGhost(points: XY[]): void {
    const live = this.layer("live");
    let poly = live.querySelector<SVGPolylineElement>("polyline.ghost");
    if (!poly) {
      poly = el("polyline");
      poly.setAttribute("class", "ghost");
      poly.setAttribute("stroke", "#999");
      poly.setAttribute("stroke-dasharray", "4 4");
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke-width", "1.5");
      live.appendChild(poly);
    }
    poly.setAttribute("points", points.map((p) => `${r2(p.x)},${r2(p.y)}`).join(" "));
  }

  clearLive(): void {
    this.layer("live").replaceChildren();
  }

  setSelection(scene: Scene, id: string | null): void {
    const overlay = this.layer("overlay");
    overlay.querySelector("path.halo")?.remove();
    if (id === null) return;
    const stroke = getStroke(scene, id);
    if (!stroke) return;
    const palette = getPalette(scene.paletteId);
    const { d, width } = inkAttrs(stroke, palette);

    const halo = el("path");
    halo.setAttribute("class", "halo");
    halo.setAttribute("d", d);
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", "#4a90d9");
    halo.setAttribute("stroke-opacity", "0.5");
    halo.setAttribute("stroke-width", String(width + 8));
    halo.style.pointerEvents = "none";
    overlay.appendChild(halo);
  }
}
