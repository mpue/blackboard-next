// Board outline: the rectangle 0..width × 0..height with rounded corners, or a
// free polygon drawn by the user (pcb.outline). Signed distances, inside tests
// and the inset area for copper pours work for both.

import type { Doc } from '../model/types.ts';
import { distToSegment, type Pt } from '../geometry/geom.ts';

/** The custom outline polygon, if the board has one. */
export function customOutline(doc: Doc): Pt[] | undefined {
  const o = doc.pcb?.outline;
  return o && o.length >= 3 ? o : undefined;
}

export const cornerRadiusOf = (doc: Doc) => Math.max(0, Math.min(doc.pcb?.cornerRadius ?? 0, doc.width / 2, doc.height / 2));

/** Even-odd point in polygon. */
export function insidePolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function edgeDist(p: Pt, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}

/**
 * Signed distance from the board edge, negative inside: returns a fast
 * function for the board of `doc` (rounded rectangle or polygon).
 */
export function boardSdf(doc: Doc): (x: number, y: number) => number {
  const poly = customOutline(doc);
  if (poly) {
    return (x, y) => {
      const p = { x, y };
      const d = edgeDist(p, poly);
      return insidePolygon(p, poly) ? -d : d;
    };
  }
  const w = doc.width;
  const h = doc.height;
  const r = cornerRadiusOf(doc);
  return (x, y) => {
    const qx = Math.abs(x - w / 2) - (w / 2 - r);
    const qy = Math.abs(y - h / 2) - (h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

/** Closest point of the polygon edges to p. */
export function nearestOutlinePoint(p: Pt, poly: Pt[]): Pt {
  let best = poly[0];
  let bd = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Outline as a polygon (rounded corners approximated) — for drawing and exports. */
export function outlinePolygon(doc: Doc, segmentsPerCorner = 8): Pt[] {
  const poly = customOutline(doc);
  if (poly) return poly;
  const w = doc.width;
  const h = doc.height;
  const r = cornerRadiusOf(doc);
  if (r <= 0) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let k = 0; k <= segmentsPerCorner; k++) {
      const a = ((a0 + (90 * k) / segmentsPerCorner) * Math.PI) / 180;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  corner(w - r, r, -90);
  corner(w - r, h - r, 0);
  corner(r, h - r, 90);
  corner(r, r, 180);
  return out;
}

/** SVG path of the board outline. */
export function outlinePath(doc: Doc): string {
  const poly = customOutline(doc);
  if (poly) return `M${poly.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
  const w = doc.width;
  const h = doc.height;
  const r = cornerRadiusOf(doc);
  if (r <= 0) return `M0 0H${w}V${h}H0Z`;
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

/** Bounding box of the outline. */
export function outlineBounds(points: Pt[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
