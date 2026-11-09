// Copper geometry kernel. Every copper primitive is a convex polygon inflated by
// a radius ("rounded polygon"): a circle is one point + r, an oval or a track is
// a segment + r, a rectangle is four corners + 0 and a rounded rectangle is a
// smaller rectangle + its corner radius. Distances between such shapes are exact.

import type { CopperSide, Doc, FootprintItem, PadDef, TrackItem, ViaItem } from '../model/types.ts';
import { distToSegment, rotatePt, type Pt, type Rect } from '../geometry/geom.ts';

export interface CopperShape {
  /** convex polygon: 1 point (circle), 2 points (capsule) or >= 3 points */
  pts: Pt[];
  /** inflation radius */
  r: number;
}

// ---- footprint transform ---------------------------------------------------------------

/** Footprint coordinates -> world: mirror (bottom side), rotate, translate. */
export function footprintToWorld(fp: Pick<FootprintItem, 'x' | 'y' | 'rotation' | 'side'>, p: Pt): Pt {
  const lx = fp.side === 'bottom' ? -p.x : p.x;
  return rotatePt({ x: fp.x + lx, y: fp.y + p.y }, fp, fp.rotation);
}

export function worldToFootprint(fp: Pick<FootprintItem, 'x' | 'y' | 'rotation' | 'side'>, p: Pt): Pt {
  const r = rotatePt(p, fp, -fp.rotation);
  const lx = r.x - fp.x;
  return { x: fp.side === 'bottom' ? -lx : lx, y: r.y - fp.y };
}

/** SVG transform equivalent to footprintToWorld. */
export function footprintTransform(fp: Pick<FootprintItem, 'x' | 'y' | 'rotation' | 'side'>): string {
  let t = `translate(${fp.x} ${fp.y})`;
  if (fp.rotation) t += ` rotate(${fp.rotation})`;
  if (fp.side === 'bottom') t += ' scale(-1 1)';
  return t;
}

/** Pad rotation in world coordinates. */
export function padWorldRotation(fp: Pick<FootprintItem, 'rotation' | 'side'>, pad: PadDef): number {
  const r = pad.rotation ?? 0;
  return (fp.side === 'bottom' ? -r : r) + fp.rotation;
}

// ---- shapes ------------------------------------------------------------------------------

/** Copper outline of a pad in footprint coordinates. */
export function padShapeLocal(pad: PadDef): CopperShape {
  const c = { x: pad.x, y: pad.y };
  const rot = pad.rotation ?? 0;
  const turn = (p: Pt) => rotatePt(p, c, rot);
  const hw = pad.w / 2;
  const hh = pad.h / 2;
  switch (pad.shape) {
    case 'circle':
      return { pts: [c], r: Math.min(hw, hh) };
    case 'oval': {
      if (Math.abs(hw - hh) < 1e-9) return { pts: [c], r: hw };
      if (hw > hh) return { pts: [turn({ x: c.x - (hw - hh), y: c.y }), turn({ x: c.x + (hw - hh), y: c.y })], r: hh };
      return { pts: [turn({ x: c.x, y: c.y - (hh - hw) }), turn({ x: c.x, y: c.y + (hh - hw) })], r: hw };
    }
    case 'rect':
    case 'roundrect': {
      const rad = pad.shape === 'roundrect' ? Math.min(0.5, Math.max(0, pad.roundness ?? 0.25)) * Math.min(pad.w, pad.h) : 0;
      const ix = hw - rad;
      const iy = hh - rad;
      return {
        pts: [
          { x: c.x - ix, y: c.y - iy },
          { x: c.x + ix, y: c.y - iy },
          { x: c.x + ix, y: c.y + iy },
          { x: c.x - ix, y: c.y + iy },
        ].map(turn),
        r: rad,
      };
    }
  }
}

export function padShapeWorld(fp: Pick<FootprintItem, 'x' | 'y' | 'rotation' | 'side'>, pad: PadDef): CopperShape {
  const s = padShapeLocal(pad);
  return { pts: s.pts.map((p) => footprintToWorld(fp, p)), r: s.r };
}

export function trackShape(t: Pick<TrackItem, 'x1' | 'y1' | 'x2' | 'y2' | 'width'>): CopperShape {
  return { pts: [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }], r: t.width / 2 };
}

export function viaShape(v: Pick<ViaItem, 'x' | 'y' | 'diameter'>): CopperShape {
  return { pts: [{ x: v.x, y: v.y }], r: v.diameter / 2 };
}

export function circleShape(c: Pt, r: number): CopperShape {
  return { pts: [c], r };
}

export function copperShapeBounds(s: CopperShape): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of s.pts) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x: x1 - s.r, y: y1 - s.r, w: x2 - x1 + 2 * s.r, h: y2 - y1 + 2 * s.r };
}

// ---- distances --------------------------------------------------------------------------

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  return Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;
}

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (Math.abs(d1) < 1e-9 && onSegment(a, c, d)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(b, c, d)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(c, a, b)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(d, a, b)) return true;
  return false;
}

export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

/** Point inside (or on) a convex polygon with >= 3 points, any winding. */
export function insideConvex(p: Pt, poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = cross(poly[i], poly[(i + 1) % poly.length], p);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function edges(pts: Pt[]): [Pt, Pt][] {
  if (pts.length === 1) return [[pts[0], pts[0]]];
  if (pts.length === 2) return [[pts[0], pts[1]]];
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}

/** Distance between the bare polygons (0 when they overlap). */
export function polygonDistance(a: Pt[], b: Pt[]): number {
  if (a.length >= 3 && insideConvex(b[0], a)) return 0;
  if (b.length >= 3 && insideConvex(a[0], b)) return 0;
  let best = Infinity;
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      best = Math.min(best, segmentDistance(p, q, r, s));
      if (best === 0) return 0;
    }
  }
  return best;
}

/** Gap between two copper shapes; negative when they overlap. */
export function shapeGap(a: CopperShape, b: CopperShape): number {
  return polygonDistance(a.pts, b.pts) - a.r - b.r;
}

/** Gap between a point and a copper shape; negative inside. */
export function pointGap(p: Pt, s: CopperShape): number {
  return polygonDistance([p], s.pts) - s.r;
}

// ---- layers --------------------------------------------------------------------------------

/** Copper side of a layer, undefined for non copper layers. */
export function copperSideOfLayer(doc: Doc, layerId: string): CopperSide | undefined {
  const role = doc.layers.find((l) => l.id === layerId)?.role;
  return role === 'top-copper' ? 'top' : role === 'bottom-copper' ? 'bottom' : undefined;
}

export function layerOfRole(doc: Doc, role: NonNullable<Doc['layers'][number]['role']>): string | undefined {
  return doc.layers.find((l) => l.role === role)?.id;
}

/** Copper sides a pad exists on. */
export function padSides(fp: Pick<FootprintItem, 'side'>, pad: PadDef): CopperSide[] {
  if (pad.npth) return [];
  if (pad.drill) return ['top', 'bottom'];
  return [fp.side];
}

/** Supply nets get wider tracks and are drawn as planes. */
export function isPowerNet(net: string | undefined): boolean {
  return !!net && /^(gnd|agnd|dgnd|pgnd|vcc|vdd|vss|vee|vin|vbat|v\+|v-|[+-]?\d+(\.\d+)?v\d*)$/i.test(net.trim());
}
