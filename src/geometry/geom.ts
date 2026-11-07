import type { Item, PartDef, Pin, SymbolItem, SymbolShape, TextGeom } from '../model/types.ts';

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const snapTo = (v: number, raster: number) => Math.round(v / raster) * raster;

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function rectOfPoints(pts: Pt[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function unionRect(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  return rectOfPoints([
    { x: a.x, y: a.y },
    { x: a.x + a.w, y: a.y + a.h },
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
  ]);
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

export const rectContainsPt = (r: Rect, p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const rectContainsRect = (outer: Rect, r: Rect) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
export const rectsIntersect = (a: Rect, b: Rect) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** Rotation in screen coordinates (y down): positive degrees turn clockwise. */
export function rotatePt(p: Pt, origin: Pt, deg: number): Pt {
  if (!deg) return p;
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ---- symbol / part placement transforms ---------------------------------------------

type Placed = Pick<SymbolItem, 'x' | 'y' | 'rotation' | 'mirrorH' | 'mirrorV' | 'width' | 'height'>;

export function symbolToWorld(s: Placed, p: Pt): Pt {
  const lx = s.mirrorH ? s.width - p.x : p.x;
  const ly = s.mirrorV ? s.height - p.y : p.y;
  return rotatePt({ x: s.x + lx, y: s.y + ly }, s, s.rotation);
}

export function worldToSymbol(s: Placed, p: Pt): Pt {
  const r = rotatePt(p, s, -s.rotation);
  const lx = r.x - s.x;
  const ly = r.y - s.y;
  return { x: s.mirrorH ? s.width - lx : lx, y: s.mirrorV ? s.height - ly : ly };
}

/** SVG transform equivalent to symbolToWorld. */
export function symbolTransform(s: Placed): string {
  let t = `translate(${s.x} ${s.y})`;
  if (s.rotation) t += ` rotate(${s.rotation})`;
  if (s.mirrorH) t += ` translate(${s.width} 0) scale(-1 1)`;
  if (s.mirrorV) t += ` translate(0 ${s.height}) scale(1 -1)`;
  return t;
}

export function partToWorld(part: { x: number; y: number; rotation: number }, p: Pt): Pt {
  return rotatePt({ x: part.x + p.x, y: part.y + p.y }, part, part.rotation);
}

// ---- shape bounds --------------------------------------------------------------------

export function estimateTextWidth(t: string, fontSize: number): number {
  return stripMarkup(t).length * fontSize * 0.58;
}

export function stripMarkup(t: string): string {
  return t.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

export function textLocalRect(t: Pick<TextGeom, 'text' | 'fontSize'>, display = t.text): Rect {
  const w = Math.max(estimateTextWidth(display, t.fontSize), t.fontSize * 0.6);
  return { x: 0, y: -t.fontSize * 0.85, w, h: t.fontSize * 1.1 };
}

export function textWorldCorners(t: TextGeom, display = t.text): Pt[] {
  const r = textLocalRect(t, display);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ].map((p) => rotatePt({ x: t.x + p.x, y: t.y + p.y }, t, t.rotation));
}

export function shapeBounds(s: SymbolShape): Rect {
  switch (s.kind) {
    case 'line':
      return inflate(normRect(s.x1, s.y1, s.x2, s.y2), s.thickness / 2 + 1);
    case 'box':
    case 'ellipse':
      return normRect(s.x, s.y, s.x + s.w, s.y + s.h);
    case 'text':
      return rectOfPoints(textWorldCorners(s));
  }
}

const symbolLocalCache = new WeakMap<SymbolShape[], Rect>();

export function symbolLocalBounds(s: SymbolItem): Rect {
  let r = symbolLocalCache.get(s.shapes);
  if (!r) {
    r = { x: 0, y: 0, w: s.width, h: s.height };
    for (const sh of s.shapes) r = unionRect(r, shapeBounds(sh));
    symbolLocalCache.set(s.shapes, r);
  }
  return r;
}

function cornersOf(r: Rect): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export type PartLookup = (ref: string) => PartDef | undefined;

export function itemBounds(item: Item, part: PartLookup): Rect {
  switch (item.kind) {
    case 'line':
      return inflate(normRect(item.x1, item.y1, item.x2, item.y2), item.thickness / 2 + 2);
    case 'resistor':
    case 'diode':
      return inflate(normRect(item.x1, item.y1, item.x2, item.y2), 8);
    case 'box':
    case 'ellipse':
      return normRect(item.x, item.y, item.x + item.w, item.y + item.h);
    case 'text':
      return rectOfPoints(textWorldCorners(item));
    case 'part': {
      const def = part(item.ref);
      const w = def?.width ?? 16;
      const h = def?.height ?? 16;
      return rectOfPoints(cornersOf({ x: 0, y: 0, w, h }).map((p) => partToWorld(item, p)));
    }
    case 'symbol':
      return rectOfPoints(cornersOf(symbolLocalBounds(item)).map((p) => symbolToWorld(item, p)));
  }
}

/** Precise hit test; `tol` is in board units. */
export function hitItem(item: Item, p: Pt, part: PartLookup, tol: number): boolean {
  switch (item.kind) {
    case 'line':
      return distToSegment(p, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }) <= item.thickness / 2 + tol;
    case 'resistor':
    case 'diode':
      return distToSegment(p, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }) <= 6 + tol;
    case 'box': {
      const r = normRect(item.x, item.y, item.x + item.w, item.y + item.h);
      if (item.style !== 'OUTLINED') return rectContainsPt(inflate(r, tol), p);
      return rectContainsPt(inflate(r, tol + item.thickness / 2), p) && !rectContainsPt(inflate(r, -(tol + item.thickness / 2)), p);
    }
    case 'ellipse': {
      const r = normRect(item.x, item.y, item.x + item.w, item.y + item.h);
      const rx = r.w / 2 || 1;
      const ry = r.h / 2 || 1;
      const d = Math.hypot((p.x - r.x - rx) / rx, (p.y - r.y - ry) / ry);
      if (item.style !== 'OUTLINED') return d <= 1 + tol / Math.min(rx, ry);
      return Math.abs(d - 1) * Math.min(rx, ry) <= tol + item.thickness / 2;
    }
    case 'text':
      return rectContainsPt(inflate(rectOfPoints(textWorldCorners(item)), tol), p);
    case 'part': {
      const def = part(item.ref);
      const l = rotatePt(p, item, -item.rotation);
      return rectContainsPt(inflate({ x: item.x, y: item.y, w: def?.width ?? 16, h: def?.height ?? 16 }, tol), l);
    }
    case 'symbol': {
      const l = worldToSymbol(item, p);
      return rectContainsPt(inflate({ x: 0, y: 0, w: item.width, h: item.height }, tol + 2), l);
    }
  }
}

// ---- pins ------------------------------------------------------------------------------

export interface WorldPin extends Pt {
  itemId: string;
  pin: Pin;
}

export function itemPins(item: Item, part: PartLookup): WorldPin[] {
  switch (item.kind) {
    case 'part':
      return (part(item.ref)?.pins ?? []).map((pin) => ({ ...partToWorld(item, pin), itemId: item.id, pin }));
    case 'symbol':
      return item.pins.map((pin) => ({ ...symbolToWorld(item, pin), itemId: item.id, pin }));
    case 'resistor':
    case 'diode':
      return [
        { x: item.x1, y: item.y1, itemId: item.id, pin: { num: 1, x: 0, y: 0, name: item.kind === 'diode' ? 'A' : '1' } },
        { x: item.x2, y: item.y2, itemId: item.id, pin: { num: 2, x: 0, y: 0, name: item.kind === 'diode' ? 'K' : '2' } },
      ];
    default:
      return [];
  }
}

export function itemCenter(item: Item, part: PartLookup): Pt {
  const r = itemBounds(item, part);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
