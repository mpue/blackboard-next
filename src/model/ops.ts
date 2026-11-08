import { uid } from './id.ts';
import type { Doc, Item, PartDef } from './types.ts';
import { RASTER } from './types.ts';
import { itemBounds, itemPins, rotatePt, snapTo, unionRect, type Pt, type Rect } from '../geometry/geom.ts';

export function partLookup(doc: Doc) {
  return (ref: string): PartDef | undefined => doc.parts[ref];
}

export function translateItem(it: Item, dx: number, dy: number): void {
  switch (it.kind) {
    case 'line':
    case 'resistor':
    case 'diode':
      it.x1 += dx;
      it.y1 += dy;
      it.x2 += dx;
      it.y2 += dy;
      break;
    default:
      it.x += dx;
      it.y += dy;
  }
}

export function selectionBounds(doc: Doc, items: Item[]): Rect | undefined {
  let r: Rect | undefined;
  const lookup = partLookup(doc);
  for (const it of items) r = unionRect(r, itemBounds(it, lookup));
  return r;
}

const normDeg = (d: number) => ((Math.round(d) % 360) + 360) % 360;

/**
 * Rotates items around `center`. Parts and symbols keep their own rotation
 * attribute (which turns around their origin), so their origin is moved along.
 */
export function rotateItem(doc: Doc, it: Item, deg: number, center: Pt, snap: boolean): void {
  const rot = (p: Pt) => rotatePt(p, center, deg);
  switch (it.kind) {
    case 'line':
    case 'resistor':
    case 'diode': {
      const a = rot({ x: it.x1, y: it.y1 });
      const b = rot({ x: it.x2, y: it.y2 });
      it.x1 = a.x;
      it.y1 = a.y;
      it.x2 = b.x;
      it.y2 = b.y;
      break;
    }
    case 'box':
    case 'ellipse': {
      const c = rot({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
      if (normDeg(deg) % 180 !== 0) [it.w, it.h] = [it.h, it.w];
      it.x = c.x - it.w / 2;
      it.y = c.y - it.h / 2;
      break;
    }
    case 'text':
    case 'part':
    case 'symbol': {
      const o = rot({ x: it.x, y: it.y });
      it.x = o.x;
      it.y = o.y;
      const r = normDeg(it.rotation + deg);
      it.rotation = r > 180 ? r - 360 : r;
      break;
    }
  }
  if (snap) snapItem(doc, it);
}

/** Moves an item so its first pin (or reference point) lies on the raster. */
export function snapItem(doc: Doc, it: Item): void {
  const pins = itemPins(it, partLookup(doc));
  let ref: Pt;
  if (pins.length) ref = pins[0];
  else if (it.kind === 'line') ref = { x: it.x1, y: it.y1 };
  else if (it.kind === 'resistor' || it.kind === 'diode') ref = { x: it.x1, y: it.y1 };
  else ref = { x: it.x, y: it.y };
  const dx = snapTo(ref.x, RASTER / 2) - ref.x;
  const dy = snapTo(ref.y, RASTER / 2) - ref.y;
  if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) translateItem(it, dx, dy);
  if (it.kind === 'line' || it.kind === 'resistor' || it.kind === 'diode') {
    it.x2 = snapTo(it.x2, RASTER / 2);
    it.y2 = snapTo(it.y2, RASTER / 2);
  }
}

export function flipItem(it: Item, horizontal: boolean, center: Pt): void {
  const fx = (x: number) => (horizontal ? 2 * center.x - x : x);
  const fy = (y: number) => (horizontal ? y : 2 * center.y - y);
  switch (it.kind) {
    case 'line':
    case 'resistor':
    case 'diode':
      it.x1 = fx(it.x1);
      it.x2 = fx(it.x2);
      it.y1 = fy(it.y1);
      it.y2 = fy(it.y2);
      break;
    case 'box':
    case 'ellipse':
      if (horizontal) it.x = 2 * center.x - it.x - it.w;
      else it.y = 2 * center.y - it.y - it.h;
      if (it.kind === 'ellipse' && it.arcAngle < 360) {
        it.startAngle = horizontal ? 180 - it.startAngle - it.arcAngle : -it.startAngle - it.arcAngle;
      }
      break;
    case 'symbol': {
      // mirror the symbol in place, then mirror its position around the center
      const before = itemBoundsCenter(it);
      if (horizontal === (normDeg(it.rotation) % 180 === 0)) it.mirrorH = !it.mirrorH;
      else it.mirrorV = !it.mirrorV;
      const target = { x: fx(before.x), y: fy(before.y) };
      const after = itemBoundsCenter(it);
      it.x += target.x - after.x;
      it.y += target.y - after.y;
      break;
    }
    case 'text':
    case 'part': {
      // images and text can not be mirrored; only their position follows
      if (horizontal) it.x = fx(it.x);
      else it.y = fy(it.y);
      break;
    }
  }
}

function itemBoundsCenter(it: Item & { kind: 'symbol' }): Pt {
  const r = itemBounds(it, () => undefined);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

const DESIGNATOR_RE = /^([A-Za-z]+)(\d+)$/;

export function nextDesignator(doc: Doc, prefix: string): string {
  let max = 0;
  for (const it of doc.items) {
    if (!('name' in it) || typeof it.name !== 'string') continue;
    const m = DESIGNATOR_RE.exec(it.name);
    if (m && m[1].toUpperCase() === prefix.toUpperCase()) max = Math.max(max, parseInt(m[2], 10));
  }
  return `${prefix}${max + 1}`;
}

export function designatorPrefix(name: string): string {
  return DESIGNATOR_RE.exec(name)?.[1] ?? name.replace(/\d+$/, '');
}

/** Deep copies items with fresh ids; designators are renumbered when `renumber`. */
export function cloneItems(doc: Doc, items: Item[], dx: number, dy: number, renumber: boolean): Item[] {
  const working: Doc = { ...doc, items: [...doc.items] };
  return items.map((src) => {
    const it = structuredClone(src);
    it.id = uid();
    translateItem(it, dx, dy);
    if (renumber && (it.kind === 'part' || it.kind === 'resistor' || it.kind === 'diode' || it.kind === 'symbol') && DESIGNATOR_RE.test(it.name)) {
      it.name = nextDesignator(working, designatorPrefix(it.name));
    }
    working.items.push(it);
    return it;
  });
}

// ---- values --------------------------------------------------------------------------

const SUFFIX: [string, number][] = [
  ['meg', 1e6],
  ['f', 1e-15],
  ['p', 1e-12],
  ['n', 1e-9],
  ['u', 1e-6],
  ['µ', 1e-6],
  ['m', 1e-3],
  ['k', 1e3],
  ['g', 1e9],
  ['t', 1e12],
];

/** Parses engineering notation ("4.7k", "4k7", "100n", "1meg"). */
export function parseEng(input: string): number | undefined {
  // trailing units; "f" is kept because it is also the femto prefix
  const s = input.trim().toLowerCase().replace(',', '.').replace(/\s*(ohm|ω|v|a|h)$/, '');
  const rkm = /^(\d+)([rk])(\d+)$/.exec(s);
  if (rkm) return parseFloat(`${rkm[1]}.${rkm[3]}`) * (rkm[2] === 'k' ? 1e3 : 1);
  const m = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([a-zµ]*)$/.exec(s);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  if (!m[2]) return v;
  const suf = SUFFIX.find(([k]) => m[2].startsWith(k));
  return suf ? v * suf[1] : v;
}

export function formatEng(v: number, unit = ''): string {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return `0${unit}`;
  const steps: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  // round first, so 999.99 becomes "1k" instead of "1000"
  const a = Math.abs(parseFloat(v.toPrecision(3)));
  const [f, s] = steps.find(([f]) => a >= f) ?? steps[steps.length - 1];
  return `${parseFloat((v / f).toPrecision(3))}${s}${unit}`;
}

export function formatOhm(v: number): string {
  return formatEng(v, 'Ω');
}
