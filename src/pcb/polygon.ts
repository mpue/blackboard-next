// Planar polygon helpers for copper zones: rounded convex shapes as polygons,
// boolean operations (polygon-clipping) and point / area queries. Polygons use
// polygon-clipping's [x, y] pair format; rings may or may not repeat the first point.

import polygonClipping from 'polygon-clipping';
import type { Pt } from '../geometry/geom.ts';

export type Pair = [number, number];
export type PRing = Pair[];
export type PPolygon = PRing[];
export type PMulti = PPolygon[];
export type Geom = PPolygon | PMulti;

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EPS = 1e-9;

// ---- rounded convex shapes ------------------------------------------------------------------

const tables = new Map<number, { c: number[]; s: number[] }>();

function trig(n: number) {
  let t = tables.get(n);
  if (!t) {
    t = { c: [], s: [] };
    for (let k = 0; k < n; k++) {
      t.c.push(Math.cos((2 * Math.PI * k) / n));
      t.s.push(Math.sin((2 * Math.PI * k) / n));
    }
    tables.set(n, t);
  }
  return t;
}

/** Segments of a full circle of radius r with a chord error below tol (multiple of 4, 8..64). */
export function circleSegments(r: number, tol: number): number {
  if (r <= tol) return 8;
  const n = Math.ceil(Math.PI / Math.acos(1 - tol / r));
  return Math.min(64, Math.max(8, Math.ceil(n / 4) * 4));
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull with positive shoelace area; 1 or 2 points for degenerate input. */
export function convexHull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const u: Pt[] = [];
  for (const p of s) {
    const q = u[u.length - 1];
    if (!q || Math.abs(p.x - q.x) > 1e-7 || Math.abs(p.y - q.y) > 1e-7) u.push(p);
  }
  if (u.length < 3) return u;
  const lower: Pt[] = [];
  for (const p of u) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= EPS) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = u.length - 1; i >= 0; i--) {
    const p = u[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= EPS) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const h = lower.concat(upper);
  return h.length >= 2 ? h : [u[0], u[u.length - 1]];
}

/**
 * Polygon of a convex point set inflated by r (Minkowski sum with a regular
 * polygon). outer: the circle is circumscribed (result contains the exact
 * shape), otherwise inscribed (result lies inside the exact shape).
 * Returns fewer than 3 points only for a degenerate shape with r = 0.
 */
export function roundedConvex(core: Pt[], r: number, outer: boolean, tol: number): PRing {
  const hull = convexHull(core);
  if (r <= EPS) return hull.map((p) => [p.x, p.y]);
  const n = circleSegments(r, tol);
  const rr = outer ? r / Math.cos(Math.PI / n) : r;
  const { c, s } = trig(n);
  const out: PRing = [];
  if (hull.length === 1) {
    for (let k = 0; k < n; k++) out.push([hull[0].x + rr * c[k], hull[0].y + rr * s[k]]);
    return out;
  }
  const m = hull.length;
  const step = (2 * Math.PI) / n;
  // vertex of the regular polygon supporting the outward normal of edge i
  const kOf = (i: number) => {
    const a = hull[i];
    const b = hull[(i + 1) % m];
    const k = Math.round(Math.atan2(-(b.x - a.x), b.y - a.y) / step) % n;
    return k < 0 ? k + n : k;
  };
  let kIn = kOf(m - 1);
  for (let i = 0; i < m; i++) {
    const kOut = kOf(i);
    let steps = (kOut - kIn + n) % n;
    if (steps > n / 2 + 1) steps = 0;
    const p = hull[i];
    for (let j = 0; j <= steps; j++) {
      const k = (kIn + j) % n;
      out.push([p.x + rr * c[k], p.y + rr * s[k]]);
    }
    kIn = kOut;
  }
  return out;
}

/** Polygon outline of a segment a-b inflated by r (outer approximation). */
export function capsule(a: Pt, b: Pt, r: number, tol: number): PRing {
  return roundedConvex([a, b], r, true, tol);
}

/** Minkowski sum of a multipolygon with a disk of radius d (outer approximation). */
export function inflateMulti(mp: PMulti, d: number, tol: number): PMulti {
  if (d <= EPS || !mp.length) return mp;
  const parts: Geom[] = [mp];
  for (const poly of mp) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        parts.push([capsule({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, d, tol)]);
      }
    }
  }
  return union(parts);
}

// ---- boolean operations ---------------------------------------------------------------------

const isPoly = (g: Geom): g is PPolygon => g.length > 0 && typeof (g as PPolygon)[0][0]?.[0] === 'number';

function cleanPoly(p: PPolygon): PPolygon | undefined {
  return p[0] && p[0].length >= 3 ? p.filter((r) => r.length >= 3) : undefined;
}

function clean(g: Geom): Geom | undefined {
  if (isPoly(g)) return cleanPoly(g);
  const m = (g as PMulti).map(cleanPoly).filter((p): p is PPolygon => !!p);
  return m.length ? m : undefined;
}

function snapAll(g: Geom, grid: number): Geom {
  const snapRing = (r: PRing): PRing => r.map(([x, y]) => [Math.round(x * grid) / grid, Math.round(y * grid) / grid]);
  return isPoly(g) ? g.map(snapRing) : (g as PMulti).map((p) => p.map(snapRing));
}

/** Runs a polygon-clipping operation; on a numerical failure retries on snapped input. */
function guarded(op: (gs: Geom[]) => PMulti, gs: Geom[]): PMulti {
  try {
    return op(gs);
  } catch {
    try {
      return op(gs.map((g) => snapAll(g, 4096)));
    } catch {
      return op(gs.map((g) => snapAll(g, 256)));
    }
  }
}

export function union(geoms: Geom[]): PMulti {
  const gs = geoms.map(clean).filter((g): g is Geom => !!g);
  if (!gs.length) return [];
  return guarded((g) => polygonClipping.union(g[0], ...g.slice(1)), gs);
}

export function intersection(a: Geom, b: Geom): PMulti {
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return [];
  return guarded((g) => polygonClipping.intersection(g[0], g[1]), [ca, cb]);
}

/** subject minus the union of clips */
export function difference(subject: Geom, clips: Geom[]): PMulti {
  const s = clean(subject);
  if (!s) return [];
  const cs = clips.map(clean).filter((g): g is Geom => !!g);
  return guarded((g) => polygonClipping.difference(g[0], ...g.slice(1)), [s, ...cs]);
}

// ---- queries --------------------------------------------------------------------------------

/** Signed shoelace area; polygon-clipping outputs outer rings positive, holes negative. */
export function ringArea(r: PRing): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Copper area of a polygon with holes. */
export function polyArea(p: PPolygon): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += i === 0 ? Math.abs(ringArea(p[i])) : -Math.abs(ringArea(p[i]));
  return a;
}

export function pointInRing(x: number, y: number, r: PRing): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, y: number, p: PPolygon): boolean {
  if (!p.length || !pointInRing(x, y, p[0])) return false;
  for (let i = 1; i < p.length; i++) if (pointInRing(x, y, p[i])) return false;
  return true;
}

export function ringBox(r: PRing): Box {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of r) {
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

export function multiBox(mp: PMulti): Box | undefined {
  let b: Box | undefined;
  for (const p of mp) {
    const r = ringBox(p[0]);
    b = b ? { x1: Math.min(b.x1, r.x1), y1: Math.min(b.y1, r.y1), x2: Math.max(b.x2, r.x2), y2: Math.max(b.y2, r.y2) } : r;
  }
  return b;
}

export const boxesTouch = (a: Box, b: Box, d = 0) => a.x1 - d <= b.x2 && b.x1 - d <= a.x2 && a.y1 - d <= b.y2 && b.y1 - d <= a.y2;
