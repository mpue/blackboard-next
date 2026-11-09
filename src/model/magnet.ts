// Magnetic mode (ToggleMagneticCommand in 1.x): wire ends that touch a pin or a
// wire junction of something being edited follow it like rubber bands, so
// moving, rotating or flipping parts never breaks a connection.
//
// Attachments are recorded on the document before an edit and re-applied to
// the edited document, so every kind of edit works the same way.

import type { Doc, Item, LineItem, TrackItem } from './types.ts';
import { isTwoPoint } from './types.ts';
import { distToSegment, itemPins, type Pt } from '../geometry/geom.ts';
import { partLookup } from './ops.ts';

/** A point on an item that wire ends can hang on. */
export type Anchor =
  | { itemId: string; kind: 'pin'; index: number }
  | { itemId: string; kind: 'end'; end: 1 | 2 }
  /** somewhere along a wire (T junction), as a fraction of its length */
  | { itemId: string; kind: 'seg'; t: number };

export interface Attachment {
  lineId: string;
  end: 1 | 2;
  anchor: Anchor;
}

const TOL = 3;

const endPt = (l: { x1: number; y1: number; x2: number; y2: number }, end: 1 | 2): Pt => (end === 1 ? { x: l.x1, y: l.y1 } : { x: l.x2, y: l.y2 });

function anchorsOf(doc: Doc, it: Item): { anchor: Anchor; at: Pt }[] {
  if (it.kind === 'line' || it.kind === 'track') {
    return [
      { anchor: { itemId: it.id, kind: 'end', end: 1 }, at: endPt(it, 1) },
      { anchor: { itemId: it.id, kind: 'end', end: 2 }, at: endPt(it, 2) },
    ];
  }
  return itemPins(it, partLookup(doc)).map((p, index) => ({ anchor: { itemId: it.id, kind: 'pin', index }, at: p }));
}

export function anchorPosition(doc: Doc, a: Anchor): Pt | undefined {
  const it = doc.items.find((i) => i.id === a.itemId);
  if (!it) return undefined;
  if (a.kind === 'pin') return itemPins(it, partLookup(doc))[a.index];
  if (!isTwoPoint(it)) return undefined;
  if (a.kind === 'end') return endPt(it, a.end);
  return { x: it.x1 + (it.x2 - it.x1) * a.t, y: it.y1 + (it.y2 - it.y1) * a.t };
}

/**
 * Wire ends (of wires that are not edited themselves) touching the pins and
 * wires of `editing`. With `onlyAnchors` just those anchors are considered,
 * e.g. the one wire end that is being dragged.
 */
export function collectAttachments(doc: Doc, editing: Set<string>, onlyAnchors?: Anchor[]): Attachment[] {
  const editable = new Set(doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  const points: { anchor: Anchor; at: Pt }[] = [];
  const segments: (LineItem | TrackItem)[] = [];
  if (onlyAnchors) {
    for (const a of onlyAnchors) {
      const at = anchorPosition(doc, a);
      if (at) points.push({ anchor: a, at });
    }
  } else {
    for (const it of doc.items) {
      if (!editing.has(it.id)) continue;
      points.push(...anchorsOf(doc, it));
      if (it.kind === 'line' || it.kind === 'track') segments.push(it);
    }
  }
  const result: Attachment[] = [];
  for (const w of doc.items) {
    if ((w.kind !== 'line' && w.kind !== 'track') || editing.has(w.id) || !editable.has(w.layer)) continue;
    for (const end of [1, 2] as const) {
      const p = endPt(w, end);
      const hit = points.find((pt) => Math.hypot(pt.at.x - p.x, pt.at.y - p.y) <= TOL);
      if (hit) {
        result.push({ lineId: w.id, end, anchor: hit.anchor });
        continue;
      }
      // a wire ending somewhere along an edited wire stays on it
      const seg = segments.find((s) => distToSegment(p, endPt(s, 1), endPt(s, 2)) <= TOL);
      if (seg) {
        const len2 = (seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2;
        const t = len2 ? ((p.x - seg.x1) * (seg.x2 - seg.x1) + (p.y - seg.y1) * (seg.y2 - seg.y1)) / len2 : 0;
        result.push({ lineId: w.id, end, anchor: { itemId: seg.id, kind: 'seg', t: Math.max(0, Math.min(1, t)) } });
      }
    }
  }
  return result;
}

/** Moves the attached wire ends to where their anchors are now. */
export function applyAttachments(doc: Doc, attachments: Attachment[]): void {
  for (const a of attachments) {
    const at = anchorPosition(doc, a.anchor);
    const w = doc.items.find((i) => i.id === a.lineId);
    if (!at || !w || (w.kind !== 'line' && w.kind !== 'track')) continue;
    if (a.end === 1) {
      w.x1 = at.x;
      w.y1 = at.y;
    } else {
      w.x2 = at.x;
      w.y2 = at.y;
    }
  }
}
