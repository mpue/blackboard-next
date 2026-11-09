// Interactive routing helpers: what copper is under the cursor, 45° track
// postures and the track width for a net.

import type { CopperSide, Doc, FootprintItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { copperSideOfLayer, footprintToWorld, isPowerNet, padShapeWorld, padSides, pointGap, trackShape, viaShape } from './geometry.ts';
import { defaultRules } from './defaults.ts';

export interface CopperHit {
  kind: 'pad' | 'track' | 'via';
  itemId: string;
  net?: string;
  /** sides the copper exists on */
  sides: CopperSide[];
  /** where a track should start/end: pad or via centre, or the point on the track */
  anchor: Pt;
}

/** Topmost copper under `p` (pads before vias before tracks), optionally on one side only. */
export function copperAt(doc: Doc, p: Pt, tol: number, side?: CopperSide, netOf?: (itemId: string) => string | undefined): CopperHit | undefined {
  const onSide = (sides: CopperSide[]) => !side || sides.includes(side);
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const it = doc.items[i];
    if (it.kind !== 'footprint') continue;
    const fp = it as FootprintItem;
    for (const pad of fp.footprint.pads) {
      const sides = padSides(fp, pad);
      if (!sides.length || !onSide(sides)) continue;
      if (pointGap(p, padShapeWorld(fp, pad)) <= tol) return { kind: 'pad', itemId: fp.id, net: fp.nets[pad.num], sides, anchor: footprintToWorld(fp, pad) };
    }
  }
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const it = doc.items[i];
    if (it.kind === 'via' && pointGap(p, viaShape(it)) <= tol) return { kind: 'via', itemId: it.id, net: it.net ?? netOf?.(it.id), sides: ['top', 'bottom'], anchor: { x: it.x, y: it.y } };
  }
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const it = doc.items[i];
    if (it.kind !== 'track') continue;
    const s = copperSideOfLayer(doc, it.layer);
    if (!s || !onSide([s]) || pointGap(p, trackShape(it)) > tol) continue;
    // snap to an end point when close, else onto the centre line
    const ends = [
      { x: it.x1, y: it.y1 },
      { x: it.x2, y: it.y2 },
    ];
    const end = ends.find((e) => Math.hypot(e.x - p.x, e.y - p.y) <= it.width);
    return { kind: 'track', itemId: it.id, net: it.net ?? netOf?.(it.id), sides: [s], anchor: end ?? projectOnSegment(p, ends[0], ends[1]) };
  }
  return undefined;
}

function projectOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * Two segment route from `a` to `b` using only 0/45/90° directions: a diagonal
 * and a straight part. `diagonalFirst` chooses where the bend goes.
 */
export function posture(a: Pt, b: Pt, diagonalFirst: boolean): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  if (d < 1e-6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6) return [a, b];
  const step = { x: Math.sign(dx) * d, y: Math.sign(dy) * d };
  const mid = diagonalFirst ? { x: a.x + step.x, y: a.y + step.y } : { x: b.x - step.x, y: b.y - step.y };
  return [a, mid, b];
}

export function trackWidthFor(doc: Doc, net: string | undefined): number {
  const rules = doc.pcb?.rules ?? defaultRules();
  return isPowerNet(net) ? rules.powerTrackWidth : rules.trackWidth;
}

/** Copper layer ids by side. */
export function copperLayers(doc: Doc): Partial<Record<CopperSide, string>> {
  const top = doc.layers.find((l) => l.role === 'top-copper')?.id;
  const bottom = doc.layers.find((l) => l.role === 'bottom-copper')?.id;
  return { top, bottom };
}

/** Copper layer to route on: the current layer if it is copper, else the side's default. */
export function routingLayer(doc: Doc, current: string): string | undefined {
  if (copperSideOfLayer(doc, current)) return current;
  const { top, bottom } = copperLayers(doc);
  const single = doc.pcb?.rules.copperLayers === 1;
  const role = doc.layers.find((l) => l.id === current)?.role;
  if (role === 'bottom-silk' || single) return bottom ?? top;
  return top ?? bottom;
}
