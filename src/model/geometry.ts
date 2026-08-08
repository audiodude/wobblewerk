export interface XY { x: number; y: number }

export function pathLength(points: XY[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return len;
}

export function resample(points: XY[], spacing: number, keepEnd = true): XY[] {
  if (points.length === 0) return [];
  const out: XY[] = [{ ...points[0]! }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]!, b = points[i]!;
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (carry + seg >= spacing) {
      const t = (spacing - carry) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p;
      seg = Math.hypot(b.x - a.x, b.y - a.y);
      carry = 0;
    }
    carry += seg;
  }
  const last = points.at(-1)!;
  const tail = out.at(-1)!;
  if (keepEnd && Math.hypot(last.x - tail.x, last.y - tail.y) > spacing / 4) out.push({ ...last });
  return out;
}

function perpDist(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

export function rdp(points: XY[], epsilon: number): XY[] {
  if (points.length < 3) return points.slice();
  let maxD = 0, idx = 0;
  const a = points[0]!, b = points.at(-1)!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i]!, a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= epsilon) return [a, b];
  const left = rdp(points.slice(0, idx + 1), epsilon);
  const right = rdp(points.slice(idx), epsilon);
  return [...left.slice(0, -1), ...right];
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function nearestPointOnPolyline(p: XY, points: XY[]): { point: XY; dist: number } {
  let best = { point: { ...points[0]! }, dist: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.dist) best = { point: q, dist: d };
  }
  return best;
}

export function bbox(points: XY[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
