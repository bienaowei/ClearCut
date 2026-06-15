import type { Point, PolygonRegion } from '../types';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 计算多边形顶点的包围盒 */
export function getBBox(points: Point[]): BBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 多个多边形的并集包围盒 */
export function getUnionBBox(polygons: PolygonRegion[]): BBox {
  const all: Point[] = [];
  for (const poly of polygons) all.push(...poly.points);
  return getBBox(all);
}

/** 射线法判断点是否在多边形内 */
export function pointInPolygon(pt: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 返回每条边的中点（用于双击插入顶点）*/
export function edgeMidpoints(points: Point[]): Point[] {
  const mids: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return mids;
}

/** 找到距离点 pt 最近的边索引（返回该边起点的索引） */
export function nearestEdgeIndex(pt: Point, points: Point[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = pointToSegmentDistance(pt, a, b);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Douglas-Peucker 路径简化：将套索采集的密集点抽稀为可编辑的顶点序列。
 * tolerance 为最大允许偏差（原图像素），越大顶点越少。
 */
export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const sqTol = tolerance * tolerance;

  const simplify = (start: number, end: number, out: Point[]) => {
    let maxSq = 0;
    let index = -1;
    const a = points[start];
    const b = points[end];
    for (let i = start + 1; i < end; i++) {
      const sq = sqSegmentDistance(points[i], a, b);
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (maxSq > sqTol && index !== -1) {
      simplify(start, index, out);
      out.push(points[index]);
      simplify(index, end, out);
    }
  };

  const result: Point[] = [points[0]];
  simplify(0, points.length - 1, result);
  result.push(points[points.length - 1]);
  return result;
}

/** 点到线段的平方距离（避免开方，供简化算法使用） */
function sqSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return ddx * ddx + ddy * ddy;
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ddx = p.x - cx;
  const ddy = p.y - cy;
  return ddx * ddx + ddy * ddy;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
