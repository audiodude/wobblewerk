export class ViewBox {
  x = 0; y = 0; w: number; h: number;
  private refW: number;
  private refH: number;
  constructor(private sheetW: number, private sheetH: number) {
    this.w = sheetW; this.h = sheetH;
    // WYSIWYG constant scale: fit() converges to the sheet's L-equivalent
    // (short side scaled up to 1600), so S/M sheets render proportionally
    // smaller on screen while marks keep their on-screen size. k = 1 for
    // every L sheet (legacy behavior untouched); clamped so oversized
    // custom sheets still just fit rather than overflowing.
    const k = Math.max(1, 1600 / Math.min(sheetW, sheetH));
    this.refW = sheetW * k;
    this.refH = sheetH * k;
  }
  fit(containerW: number, containerH: number, margin = 40): void {
    const scale = Math.min((containerW - margin * 2) / this.refW, (containerH - margin * 2) / this.refH);
    this.w = containerW / scale;
    this.h = containerH / scale;
    this.x = (this.sheetW - this.w) / 2;
    this.y = (this.sheetH - this.h) / 2;
  }
  zoomAt(px: number, py: number, factor: number): void {
    // Clamp off the L-equivalent (refW), not the raw sheet width: fit()
    // can converge to vb.w > sheetW * 4 for S/M sheets in wide stages, so
    // clamping against sheetW would snap the view tighter on the first
    // wheel tick instead of stepping. No-op for L sheets (refW === sheetW).
    const minW = this.refW / 8, maxW = this.refW * 4;
    const clamped = Math.min(maxW, Math.max(minW, this.w * factor)) / this.w;
    this.x = px - (px - this.x) * clamped;
    this.y = py - (py - this.y) * clamped;
    this.w *= clamped;
    this.h *= clamped;
  }
  panBy(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  toString(): string { return `${this.x} ${this.y} ${this.w} ${this.h}`; }
}
