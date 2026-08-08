export class ViewBox {
  x = 0; y = 0; w: number; h: number;
  constructor(private sheetW: number, private sheetH: number) {
    this.w = sheetW; this.h = sheetH;
  }
  fit(containerW: number, containerH: number, margin = 40): void {
    const scale = Math.min((containerW - margin * 2) / this.sheetW, (containerH - margin * 2) / this.sheetH);
    this.w = containerW / scale;
    this.h = containerH / scale;
    this.x = (this.sheetW - this.w) / 2;
    this.y = (this.sheetH - this.h) / 2;
  }
  zoomAt(px: number, py: number, factor: number): void {
    const minW = this.sheetW / 8, maxW = this.sheetW * 4;
    const clamped = Math.min(maxW, Math.max(minW, this.w * factor)) / this.w;
    this.x = px - (px - this.x) * clamped;
    this.y = py - (py - this.y) * clamped;
    this.w *= clamped;
    this.h *= clamped;
  }
  panBy(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  toString(): string { return `${this.x} ${this.y} ${this.w} ${this.h}`; }
}
