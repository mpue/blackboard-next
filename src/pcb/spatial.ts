// Spatial helpers for connectivity and DRC: bounding box sweep, a uniform grid
// for polygon edges, closest points between copper shapes and tests against
// zone fill polygons (outer ring + hole rings, even-odd).

import type { Pt, Rect } from '../geometry/geom.ts';
import { insideConvex, segmentsIntersect, type CopperShape } from './geometry.ts';

/** Calls visit(i, j) for every pair of boxes that overlap when grown by margin. */
export function sweepPairs(boxes: Rect[], margin: number, visit: (i: number, j: number) => void): void {
  const order = Array.from(boxes.keys()).sort((a, b) => boxes[a].x - boxes[b].x);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const a = boxes[i];
    const maxX = a.x + a.w + margin;
    const minY = a.y - margin;
    const maxY = a.y + a.h + margin;
    for (let m = k + 1; m < order.length; m++) {
      const j = order[m];
      const b = boxes[j];
      if (b.x > maxX) break;
      if (b.y > maxY || b.y + b.h < minY) continue;
      visit(i, j);
    }
  }
}

const MAX_CELLS_PER_ITEM = 256;

/** Uniform grid over rectangles; queries report every id once. */
export class GridIndex {
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();
  private readonly big: number[] = [];
  private stamps: number[] = [];
  private query = 0;

  constructor(cell: number) {
    this.cell = cell > 0 && Number.isFinite(cell) ? cell : 1;
  }

  insert(id: number, r: Rect): void {
    const c = this.cell;
    const x1 = Math.floor(r.x / c), x2 = Math.floor((r.x + r.w) / c);
    const y1 = Math.floor(r.y / c), y2 = Math.floor((r.y + r.h) / c);
    this.stamps[id] = 0;
    if ((x2 - x1 + 1) * (y2 - y1 + 1) > MAX_CELLS_PER_ITEM) {
      this.big.push(id);
      return;
    }
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = x * 4194304 + y;
        const list = this.cells.get(key);
        if (list) list.push(id);
        else this.cells.set(key, [id]);
      }
    }
  }

  forEach(r: Rect, visit: (id: number) => void): void {
    const q = ++this.query;
    const c = this.cell;
    const x1 = Math.floor(r.x / c), x2 = Math.floor((r.x + r.w) / c);
    const y1 = Math.floor(r.y / c), y2 = Math.floor((r.y + r.h) / c);
    for (const id of this.big) {
      this.stamps[id] = q;
      visit(id);
    }
    if ((x2 - x1 + 1) * (y2 - y1 + 1) > this.cells.size) {
      for (const list of this.cells.values()) for (const id of list) this.hit(id, q, visit);
      return;
    }
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const list = this.cells.get(x * 4194304 + y);
        if (list) for (const id of list) this.hit(id, q, visit);
      }
    }
  }

  private hit(id: number, q: number, visit: (id: number) => void): void {
    if (this.stamps[id] === q) return;
    this.stamps[id] = q;
    visit(id);
  }
}

// ---- closest points --------------------------------------------------------------------

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.x <= b.x + b.w + margin && b.x <= a.x + a.w + margin && a.y <= b.y + b.h + margin && b.y <= a.y + a.h + margin;
}

function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export interface ClosestPair {
  pa: Pt;
  pb: Pt;
  d: number;
}

/** Closest points between the segments ab and cd. */
export function closestOnSegments(a: Pt, b: Pt, c: Pt, d: Pt): ClosestPair {
  if (segmentsIntersect(a, b, c, d)) {
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) > 1e-12) {
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * sy - (c.y - a.y) * sx) / den));
      const p = { x: a.x + t * rx, y: a.y + t * ry };
      return { pa: p, pb: p, d: 0 };
    }
  }
  let best: ClosestPair = { pa: a, pb: a, d: Infinity };
  const cand = (pa: Pt, pb: Pt) => {
    const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (dist < best.d) best = { pa, pb, d: dist };
  };
  cand(a, projectOnSegment(a, c, d));
  cand(b, projectOnSegment(b, c, d));
  cand(projectOnSegment(c, a, b), c);
  cand(projectOnSegment(d, a, b), d);
  return best;
}

function edgeList(pts: Pt[]): [Pt, Pt][] {
  if (pts.length === 1) return [[pts[0], pts[0]]];
  if (pts.length === 2) return [[pts[0], pts[1]]];
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}

/** Closest points between the bare polygons of two shapes (d = 0 when they overlap). */
export function closestPoints(a: CopperShape, b: CopperShape): ClosestPair {
  if (a.pts.length >= 3 && insideConvex(b.pts[0], a.pts)) return { pa: b.pts[0], pb: b.pts[0], d: 0 };
  if (b.pts.length >= 3 && insideConvex(a.pts[0], b.pts)) return { pa: a.pts[0], pb: a.pts[0], d: 0 };
  let best: ClosestPair = { pa: a.pts[0], pb: b.pts[0], d: Infinity };
  for (const [p, q] of edgeList(a.pts)) {
    for (const [r, s] of edgeList(b.pts)) {
      const c = closestOnSegments(p, q, r, s);
      if (c.d < best.d) best = c;
      if (best.d === 0) return best;
    }
  }
  return best;
}

/** Marker between two shapes: the middle of their gap (or overlap) on the line of closest approach. */
export function gapMidpoint(a: CopperShape, b: CopperShape): Pt {
  const { pa, pb, d } = closestPoints(a, b);
  if (d < 1e-12) return pa;
  const t = Math.max(0, Math.min(d, (d + a.r - b.r) / 2)) / d;
  return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
}

export function shapeCentroid(s: CopperShape): Pt {
  let x = 0, y = 0;
  for (const p of s.pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / s.pts.length, y: y / s.pts.length };
}

// ---- fill polygons ----------------------------------------------------------------------

/** Indexed fill polygon: rings[0] is the outer ring, the rest are holes. */
export interface PolyIndex {
  rings: Pt[][];
  bounds: Rect;
  /** flat edge list: a = from, b = to */
  ea: Pt[];
  eb: Pt[];
  grid: GridIndex;
}

export function indexPolygon(rings: Pt[][]): PolyIndex {
  const ea: Pt[] = [];
  const eb: Pt[] = [];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  let len = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a.x === b.x && a.y === b.y) continue;
      ea.push(a);
      eb.push(b);
      len += Math.hypot(b.x - a.x, b.y - a.y);
      x1 = Math.min(x1, a.x);
      y1 = Math.min(y1, a.y);
      x2 = Math.max(x2, a.x);
      y2 = Math.max(y2, a.y);
    }
  }
  const n = ea.length;
  const bounds = n ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : { x: 0, y: 0, w: 0, h: 0 };
  const grid = new GridIndex(n ? Math.max(len / n, Math.sqrt((bounds.w * bounds.h) / n), 1e-3) : 1);
  for (let i = 0; i < n; i++) grid.insert(i, edgeRect(ea[i], eb[i]));
  return { rings, bounds, ea, eb, grid };
}

function edgeRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Even-odd point in polygon with holes. */
export function pointInPoly(ix: PolyIndex, p: Pt): boolean {
  const b = ix.bounds;
  if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) return false;
  let inside = false;
  ix.grid.forEach({ x: p.x, y: p.y, w: b.x + b.w - p.x, h: 0 }, (i) => {
    const a = ix.ea[i];
    const c = ix.eb[i];
    if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
  });
  return inside;
}

/** Point where a copper shape touches the filled area (within tol), or undefined. */
export function shapeTouchesPoly(ix: PolyIndex, s: CopperShape, sb: Rect, tol: number): Pt | undefined {
  if (!rectsOverlap(sb, ix.bounds, tol)) return undefined;
  let hit: Pt | undefined;
  const reach = s.r + tol;
  const q = { x: sb.x - tol, y: sb.y - tol, w: sb.w + 2 * tol, h: sb.h + 2 * tol };
  ix.grid.forEach(q, (i) => {
    if (hit) return;
    const seg = { pts: [ix.ea[i], ix.eb[i]], r: 0 };
    const c = closestPoints(s, seg);
    if (c.d <= reach) hit = c.pb;
  });
  if (hit) return hit;
  return pointInPoly(ix, s.pts[0]) ? s.pts[0] : undefined;
}

/** Gap between two filled areas when it is <= maxGap (0 when they overlap). */
export function polyGap(a: PolyIndex, b: PolyIndex, maxGap: number): { gap: number; at: Pt } | undefined {
  if (!a.ea.length || !b.ea.length || !rectsOverlap(a.bounds, b.bounds, maxGap)) return undefined;
  let best: ClosestPair | undefined;
  for (let i = 0; i < a.ea.length && !(best && best.d === 0); i++) {
    const p = a.ea[i];
    const q = a.eb[i];
    const r = edgeRect(p, q);
    if (!rectsOverlap(r, b.bounds, maxGap)) continue;
    b.grid.forEach({ x: r.x - maxGap, y: r.y - maxGap, w: r.w + 2 * maxGap, h: r.h + 2 * maxGap }, (j) => {
      if (best && best.d === 0) return;
      const c = closestOnSegments(p, q, b.ea[j], b.eb[j]);
      if (!best || c.d < best.d) best = c;
    });
  }
  const found = best as ClosestPair | undefined;
  if (found && found.d === 0) return { gap: 0, at: found.pa };
  const pa = a.rings[0][0];
  const pb = b.rings[0][0];
  if (pointInPoly(b, pa)) return { gap: 0, at: pa };
  if (pointInPoly(a, pb)) return { gap: 0, at: pb };
  if (!found || found.d > maxGap) return undefined;
  return { gap: found.d, at: { x: (found.pa.x + found.pb.x) / 2, y: (found.pa.y + found.pb.y) / 2 } };
}
