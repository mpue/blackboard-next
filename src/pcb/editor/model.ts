// Footprint editor model: pure functions on FootprintDef (board units) for pad
// arrays, numbering, courtyard, silkscreen clipping, validation, origin moves
// and the selection based edits of the footprint editor.

import type { FootprintDef, FootprintGraphic, PadDef, PadShape } from '../../model/types.ts';
import { distToSegment, rotatePt, type Pt, type Rect } from '../../geometry/geom.ts';
import { copperShapeBounds, padShapeLocal, pointGap, shapeGap, type CopperShape } from '../geometry.ts';
import { COURTYARD_MARGIN, SILK_CLEARANCE, SILK_W } from '../footprints/helpers.ts';
import { mm, toMm } from '../units.ts';

export const USER_CATEGORY = 'User';
/** float noise removed, like the library builder */
export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** pad properties without number and position */
export type PadTemplate = Omit<PadDef, 'num' | 'name' | 'x' | 'y'>;

export function emptyFootprint(kind: 'tht' | 'smd'): FootprintDef {
  return { id: '', name: '', description: '', category: USER_CATEGORY, pads: [], silk: [], courtyard: { x: 0, y: 0, w: 0, h: 0 }, tags: [kind] };
}

export function defaultPadTemplate(kind: 'tht' | 'smd'): PadTemplate {
  return kind === 'tht' ? { shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) } : { shape: 'roundrect', w: mm(1.5), h: mm(0.6), roundness: 0.25 };
}

export const DEFAULT_SILK_WIDTH = mm(SILK_W);

// ---- pad arrays ------------------------------------------------------------------------

export type ArrayPattern = 'single' | 'dip' | 'zigzag' | 'quad' | 'grid';

export interface PadArrayOptions {
  pattern: ArrayPattern;
  /** pads in total (single, dip, zigzag, quad) */
  count: number;
  /** grid size */
  cols?: number;
  rows?: number;
  /** pad to pad distance within a row */
  pitch: number;
  /** dip/zigzag: distance of the two rows; quad: distance of opposite pad rows (centres); grid: row pitch (default pitch) */
  rowSpacing?: number;
  /** single row direction */
  direction?: 'down' | 'right';
  pad: PadTemplate;
  /** shape of the first pad, e.g. 'rect' to mark pad 1 */
  firstShape?: PadShape;
  /** first pad number (grid: first column) */
  start?: number;
  /** grid: rows lettered A, B … with columns numbered (BGA), or numbered row by row */
  naming?: 'alpha' | 'numeric';
  /** position of the anchor */
  at?: Pt;
  /** default: pad 1 for single, dip and zigzag, the centre for quad and grid */
  anchor?: 'first' | 'center';
}

/** BGA row letters (JEDEC: no I, O, Q, S, X, Z) */
const ROW_LETTERS = 'ABCDEFGHJKLMNPRTUVWY';

export function bgaRowName(i: number): string {
  const n = ROW_LETTERS.length;
  return i < n ? ROW_LETTERS[i] : ROW_LETTERS[Math.floor(i / n) - 1] + ROW_LETTERS[i % n];
}

export function padArray(o: PadArrayOptions): PadDef[] {
  const start = o.start ?? 1;
  const p = o.pitch;
  const rs = o.rowSpacing ?? p;
  const raw: { num: string; x: number; y: number; swap?: boolean }[] = [];
  const count = Math.max(0, Math.floor(o.count));
  switch (o.pattern) {
    case 'single':
      for (let i = 0; i < count; i++) raw.push({ num: String(start + i), x: o.direction === 'right' ? i * p : 0, y: o.direction === 'right' ? 0 : i * p });
      break;
    case 'dip': {
      // counter clockwise: 1..n down the left column, then up the right one
      const n = Math.floor(count / 2);
      for (let i = 0; i < n; i++) raw.push({ num: String(start + i), x: 0, y: i * p });
      for (let i = 0; i < n; i++) raw.push({ num: String(start + n + i), x: rs, y: (n - 1 - i) * p });
      break;
    }
    case 'zigzag': {
      // headers / IDC: 1 2 / 3 4 / …
      const n = Math.floor(count / 2);
      for (let i = 0; i < n; i++) raw.push({ num: String(start + 2 * i), x: 0, y: i * p }, { num: String(start + 2 * i + 1), x: rs, y: i * p });
      break;
    }
    case 'quad': {
      // counter clockwise from the top of the left side; top/bottom pads turned
      const n = Math.floor(count / 4);
      const c = rs / 2;
      const off = (i: number) => (i - (n - 1) / 2) * p;
      for (let i = 0; i < n; i++) raw.push({ num: String(start + i), x: -c, y: off(i) });
      for (let i = 0; i < n; i++) raw.push({ num: String(start + n + i), x: off(i), y: c, swap: true });
      for (let i = 0; i < n; i++) raw.push({ num: String(start + 2 * n + i), x: c, y: -off(i) });
      for (let i = 0; i < n; i++) raw.push({ num: String(start + 3 * n + i), x: -off(i), y: -c, swap: true });
      break;
    }
    case 'grid': {
      const cols = Math.max(0, Math.floor(o.cols ?? 1));
      const rows = Math.max(0, Math.floor(o.rows ?? 1));
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          raw.push({
            num: o.naming === 'numeric' ? String(start + r * cols + c) : `${bgaRowName(r)}${start + c}`,
            x: (c - (cols - 1) / 2) * p,
            y: (r - (rows - 1) / 2) * rs,
          });
      break;
    }
  }
  if (!raw.length) return [];
  const centred = o.pattern === 'quad' || o.pattern === 'grid';
  const anchor = o.anchor ?? (centred ? 'center' : 'first');
  let ox = 0;
  let oy = 0;
  if (anchor === 'first' && centred) {
    ox = -raw[0].x;
    oy = -raw[0].y;
  } else if (anchor === 'center' && !centred) {
    const b = boundsOfPoints(raw);
    ox = -(b.x + b.w / 2);
    oy = -(b.y + b.h / 2);
  }
  ox += o.at?.x ?? 0;
  oy += o.at?.y ?? 0;
  return raw.map((r, i) => {
    const pad: PadDef = { ...o.pad, num: r.num, x: round6(r.x + ox), y: round6(r.y + oy), shape: i === 0 && o.firstShape ? o.firstShape : o.pad.shape };
    if (r.swap) {
      pad.w = o.pad.h;
      pad.h = o.pad.w;
    }
    return pad;
  });
}

function boundsOfPoints(pts: Pt[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Number for the next pad: highest numeric number + 1, else the last "A7" style number counted up. */
export function nextPadNumber(def: Pick<FootprintDef, 'pads'>): string {
  let max = 0;
  let numeric = false;
  for (const p of def.pads) {
    if (/^\d+$/.test(p.num)) {
      numeric = true;
      max = Math.max(max, parseInt(p.num, 10));
    }
  }
  if (numeric) return String(max + 1);
  for (let i = def.pads.length - 1; i >= 0; i--) {
    const m = /^(.*?)(\d+)$/.exec(def.pads[i].num);
    if (m) return `${m[1]}${parseInt(m[2], 10) + 1}`;
  }
  return '1';
}

// ---- bounds, courtyard, designator ------------------------------------------------------

export function padBounds(p: PadDef): Rect {
  return copperShapeBounds(padShapeLocal(p));
}

function arcPoints(cx: number, cy: number, r: number, start: number, sweep: number, n = 48): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((start + (sweep * i) / n) * Math.PI) / 180;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Outline of a silk graphic incl. half the line width. */
export function graphicBounds(g: FootprintGraphic): Rect {
  let r: Rect;
  switch (g.kind) {
    case 'line':
      r = boundsOfPoints([{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]);
      break;
    case 'rect':
      r = { x: Math.min(g.x, g.x + g.w), y: Math.min(g.y, g.y + g.h), w: Math.abs(g.w), h: Math.abs(g.h) };
      break;
    case 'circle':
      r = { x: g.cx - g.r, y: g.cy - g.r, w: 2 * g.r, h: 2 * g.r };
      break;
    case 'arc':
      r = boundsOfPoints(arcPoints(g.cx, g.cy, g.r, g.start, g.sweep));
      break;
    case 'poly':
      r = g.pts.length ? boundsOfPoints(g.pts) : { x: 0, y: 0, w: 0, h: 0 };
      break;
  }
  const d = g.width / 2;
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

function union(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  return { x: x1, y: y1, w: Math.max(a.x + a.w, b.x + b.w) - x1, h: Math.max(a.y + a.h, b.y + b.h) - y1 };
}

/** Pad copper and silkscreen extent; undefined for an empty footprint. */
export function contentBounds(def: Pick<FootprintDef, 'pads' | 'silk'>, silk = true): Rect | undefined {
  let r: Rect | undefined;
  for (const p of def.pads) r = union(r, padBounds(p));
  if (silk) for (const g of def.silk) r = union(r, graphicBounds(g));
  return r;
}

const floorTo = (v: number, g: number) => Math.floor(v / g + 1e-6) * g;
const ceilTo = (v: number, g: number) => Math.ceil(v / g - 1e-6) * g;

export const hasCourtyard = (def: Pick<FootprintDef, 'courtyard'>) => !!def.courtyard && def.courtyard.w > 0 && def.courtyard.h > 0;

/** Pads + silk + 0.25 mm, on a 0.05 mm grid like the library. */
export function autoCourtyard(def: Pick<FootprintDef, 'pads' | 'silk'>): FootprintDef['courtyard'] {
  const b = contentBounds(def);
  if (!b) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = floorTo(toMm(b.x) - COURTYARD_MARGIN, 0.05);
  const y1 = floorTo(toMm(b.y) - COURTYARD_MARGIN, 0.05);
  const x2 = ceilTo(toMm(b.x + b.w) + COURTYARD_MARGIN, 0.05);
  const y2 = ceilTo(toMm(b.y + b.h) + COURTYARD_MARGIN, 0.05);
  return { x: round6(mm(x1)), y: round6(mm(y1)), w: round6(mm(x2 - x1)), h: round6(mm(y2 - y1)) };
}

/** Designator above the courtyard, centred (like the library). */
export function autoRefPos(def: Pick<FootprintDef, 'pads' | 'silk' | 'courtyard'>): Pt {
  const c = hasCourtyard(def) ? def.courtyard : autoCourtyard(def);
  return { x: round6(c.x + c.w / 2), y: round6(c.y - mm(0.8)) };
}

// ---- silkscreen clipping ----------------------------------------------------------------

const MIN_SILK = mm(0.2);
const STEP = mm(0.02);
/** run ends this close (along the graphic) to its ends are snapped to them: keeps clipSilk idempotent despite rounding */
const SNAP_END = 0.01;

export interface Copper {
  s: CopperShape;
  b: Rect;
}

export function copperOf(def: Pick<FootprintDef, 'pads'>): Copper[] {
  return def.pads.map((p) => {
    const s = padShapeLocal(p);
    return { s, b: copperShapeBounds(s) };
  });
}

const near = (a: Rect, b: Rect, d: number) => a.x - d <= b.x + b.w && b.x - d <= a.x + a.w && a.y - d <= b.y + b.h && b.y - d <= a.y + a.h;

/** Free parameter runs of [0, 1]: sampled, the run ends refined by bisection; len = length of the graphic. */
function freeRuns(n: number, free: (t: number) => boolean, len: number): [number, number][] {
  const out: [number, number][] = [];
  const edge = (a: number, b: number, aFree: boolean) => {
    for (let k = 0; k < 30; k++) {
      const m = (a + b) / 2;
      if (free(m) === aFree) a = m;
      else b = m;
    }
    return aFree ? a : b;
  };
  let prevT = 0;
  let prevFree = free(0);
  let start = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const f = free(t);
    if (f !== prevFree) {
      const e = edge(prevT, t, prevFree);
      if (f) start = e;
      else out.push([start, e]);
    }
    prevT = t;
    prevFree = f;
  }
  if (prevFree) out.push([start, 1]);
  const tol = len > 0 ? SNAP_END / len : 0;
  return out.map(([a, b]) => [a < tol ? 0 : a, b > 1 - tol ? 1 : b]);
}

type Line = Extract<FootprintGraphic, { kind: 'line' }>;

function clipLine(g: Line, copper: Copper[], clearance: number): FootprintGraphic[] {
  const reach = clearance + g.width / 2;
  const close = copper.filter((c) => near(graphicBounds(g), c.b, reach));
  if (!close.length) return [g];
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const len = Math.hypot(dx, dy);
  const free = (t: number) => {
    const p = { x: g.x1 + dx * t, y: g.y1 + dy * t };
    return close.every((c) => pointGap(p, c.s) >= reach);
  };
  const runs = freeRuns(Math.max(1, Math.ceil(len / STEP)), free, len);
  if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === 1) return [g];
  return runs
    .filter(([a, b]) => (b - a) * len >= MIN_SILK)
    .map(([a, b]) => ({ ...g, x1: round6(g.x1 + dx * a), y1: round6(g.y1 + dy * a), x2: round6(g.x1 + dx * b), y2: round6(g.y1 + dy * b) }));
}

/** Outline of a rectangle or an open polygon as lines. */
function outlineLines(g: FootprintGraphic): Line[] {
  const pts =
    g.kind === 'rect'
      ? [
          { x: g.x, y: g.y },
          { x: g.x + g.w, y: g.y },
          { x: g.x + g.w, y: g.y + g.h },
          { x: g.x, y: g.y + g.h },
        ]
      : g.kind === 'poly'
        ? g.pts
        : [];
  const out: Line[] = [];
  for (let i = 0; i < pts.length && pts.length > 1; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (pts.length === 2 && i === 1) break;
    out.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: g.width });
  }
  return out;
}

/** Removes the parts of a silk graphic closer than `clearance` to pad copper; untouched graphics come back as [g]. */
export function clipGraphic(g: FootprintGraphic, copper: Copper[], clearance = mm(SILK_CLEARANCE)): FootprintGraphic[] {
  if ((g.kind === 'circle' || g.kind === 'poly') && g.fill) return [g];
  if (g.width <= 0) return [g];
  const reach = clearance + g.width / 2;
  if (!copper.some((c) => near(graphicBounds(g), c.b, reach))) return [g];
  if (g.kind === 'line') return clipLine(g, copper, clearance);
  if (g.kind === 'rect' || g.kind === 'poly') {
    const lines = outlineLines(g);
    const parts = lines.map((l) => clipLine(l, copper, clearance));
    if (parts.every((p, i) => p.length === 1 && p[0] === lines[i])) return [g];
    return parts.flat();
  }
  const at = (deg: number): Pt => ({ x: g.cx + g.r * Math.cos((deg * Math.PI) / 180), y: g.cy + g.r * Math.sin((deg * Math.PI) / 180) });
  const free = (p: Pt) => copper.every((c) => pointGap(p, c.s) >= reach);
  let start = 0;
  let sweep = 360;
  if (g.kind === 'arc') {
    start = g.sweep < 0 ? g.start + g.sweep : g.start;
    sweep = Math.min(360, Math.abs(g.sweep));
  }
  const n = Math.max(8, Math.ceil(((sweep / 180) * Math.PI * g.r) / STEP));
  if (sweep >= 360) {
    // start the scan on blocked silk so that no free run wraps around
    let blocked = -1;
    for (let i = 0; i < n && blocked < 0; i++) if (!free(at((360 * i) / n))) blocked = (360 * i) / n;
    if (blocked < 0) return [g];
    start = blocked;
  }
  const runs = freeRuns(n, (t) => free(at(start + sweep * t)), (sweep / 180) * Math.PI * g.r);
  if (g.kind === 'arc' && runs.length === 1 && runs[0][0] === 0 && runs[0][1] === 1) return [g];
  return runs
    .filter(([a, b]) => (((b - a) * sweep) / 180) * Math.PI * g.r >= MIN_SILK)
    .map(([a, b]): FootprintGraphic => ({ kind: 'arc', cx: g.cx, cy: g.cy, r: g.r, start: Math.round((start + sweep * a) * 1e4) / 1e4, sweep: Math.round(sweep * (b - a) * 1e4) / 1e4, width: g.width }));
}

/** Silkscreen kept 0.2 mm away from pad copper (edge to edge). */
export function clipSilk(def: FootprintDef): FootprintDef {
  const copper = copperOf(def);
  return { ...def, silk: def.silk.flatMap((g) => clipGraphic(g, copper)) };
}

/** Indices of silk graphics that come too close to copper. */
export function silkViolations(def: FootprintDef): number[] {
  const copper = copperOf(def);
  const out: number[] = [];
  def.silk.forEach((g, i) => {
    const r = clipGraphic(g, copper);
    if (r.length !== 1 || r[0] !== g) out.push(i);
  });
  return out;
}

// ---- validation ---------------------------------------------------------------------------

export type IssueCode =
  | 'emptyId'
  | 'idChars'
  | 'emptyName'
  | 'noPads'
  | 'emptyNumber'
  | 'duplicateNumber'
  | 'overlap'
  | 'tightGap'
  | 'badSize'
  | 'drillTooLarge'
  | 'annularRing'
  | 'npthNoDrill'
  | 'silkClearance'
  | 'noCourtyard'
  | 'courtyardSmall';

export interface FootprintIssue {
  severity: 'error' | 'warning';
  code: IssueCode;
  /** affected pads / silk graphics (indices) */
  pads?: number[];
  silk?: number[];
  /** e.g. the pad numbers concerned */
  detail?: string;
}

/** copper to copper of different pads below this is reported */
export const MIN_PAD_GAP = mm(0.1);
export const MIN_ANNULAR_RING = mm(0.15);

const padLabel = (def: FootprintDef, i: number) => def.pads[i].num || `#${i + 1}`;

export function validateFootprint(def: FootprintDef): FootprintIssue[] {
  const out: FootprintIssue[] = [];
  const id = def.id.trim();
  if (!id) out.push({ severity: 'error', code: 'emptyId' });
  else if (/[^A-Za-z0-9._+:\-]/.test(id)) out.push({ severity: 'warning', code: 'idChars', detail: id });
  if (!def.name.trim()) out.push({ severity: 'warning', code: 'emptyName' });
  if (!def.pads.length) out.push({ severity: 'error', code: 'noPads' });

  const byNum = new Map<string, number[]>();
  def.pads.forEach((p, i) => {
    if (!(p.w > 0) || !(p.h > 0) || (p.drill !== undefined && !(p.drill > 0))) out.push({ severity: 'error', code: 'badSize', pads: [i], detail: padLabel(def, i) });
    if (p.npth) {
      if (!p.drill) out.push({ severity: 'error', code: 'npthNoDrill', pads: [i], detail: padLabel(def, i) });
      return;
    }
    if (!p.num.trim()) out.push({ severity: 'warning', code: 'emptyNumber', pads: [i], detail: `#${i + 1}` });
    else byNum.set(p.num, [...(byNum.get(p.num) ?? []), i]);
    if (p.drill && p.drill >= Math.min(p.w, p.h)) out.push({ severity: 'error', code: 'drillTooLarge', pads: [i], detail: padLabel(def, i) });
    else if (p.drill && (Math.min(p.w, p.h) - p.drill) / 2 < MIN_ANNULAR_RING - 1e-9) out.push({ severity: 'warning', code: 'annularRing', pads: [i], detail: padLabel(def, i) });
  });
  for (const [num, idx] of byNum) if (idx.length > 1) out.push({ severity: 'warning', code: 'duplicateNumber', pads: idx, detail: num });

  // copper of different pads (same number = one pad made of several shapes)
  const copper = copperOf(def);
  for (let i = 0; i < copper.length; i++) {
    for (let j = i + 1; j < copper.length; j++) {
      const a = def.pads[i];
      const b = def.pads[j];
      if (a.num && a.num === b.num && !a.npth && !b.npth) continue;
      if (!near(copper[i].b, copper[j].b, MIN_PAD_GAP)) continue;
      const gap = shapeGap(copper[i].s, copper[j].s);
      if (gap < -1e-6) out.push({ severity: 'error', code: 'overlap', pads: [i, j], detail: `${padLabel(def, i)} / ${padLabel(def, j)}` });
      else if (gap < MIN_PAD_GAP - 1e-6) out.push({ severity: 'warning', code: 'tightGap', pads: [i, j], detail: `${padLabel(def, i)} / ${padLabel(def, j)}` });
    }
  }

  const silk = silkViolations(def);
  if (silk.length) out.push({ severity: 'warning', code: 'silkClearance', silk, detail: String(silk.length) });

  if (def.pads.length) {
    if (!hasCourtyard(def)) out.push({ severity: 'warning', code: 'noCourtyard' });
    else {
      const c = def.courtyard;
      const outside = def.pads
        .map((p, i) => ({ b: padBounds(p), i }))
        .filter(({ b }) => b.x < c.x - 1e-6 || b.y < c.y - 1e-6 || b.x + b.w > c.x + c.w + 1e-6 || b.y + b.h > c.y + c.h + 1e-6)
        .map(({ i }) => i);
      if (outside.length) out.push({ severity: 'warning', code: 'courtyardSmall', pads: outside });
    }
  }
  return out;
}

// ---- origin ----------------------------------------------------------------------------------

function translateGraphic(g: FootprintGraphic, dx: number, dy: number): FootprintGraphic {
  switch (g.kind) {
    case 'line':
      return { ...g, x1: round6(g.x1 + dx), y1: round6(g.y1 + dy), x2: round6(g.x2 + dx), y2: round6(g.y2 + dy) };
    case 'rect':
      return { ...g, x: round6(g.x + dx), y: round6(g.y + dy) };
    case 'circle':
    case 'arc':
      return { ...g, cx: round6(g.cx + dx), cy: round6(g.cy + dy) };
    case 'poly':
      return { ...g, pts: g.pts.map((p) => ({ x: round6(p.x + dx), y: round6(p.y + dy) })) };
  }
}

const translatePad = (p: PadDef, dx: number, dy: number): PadDef => ({ ...p, x: round6(p.x + dx), y: round6(p.y + dy) });

/** Moves everything (pads, silk, courtyard, designator) by dx, dy. */
export function translateFootprint(def: FootprintDef, dx: number, dy: number): FootprintDef {
  const out: FootprintDef = {
    ...def,
    pads: def.pads.map((p) => translatePad(p, dx, dy)),
    silk: def.silk.map((g) => translateGraphic(g, dx, dy)),
    courtyard: hasCourtyard(def) ? { ...def.courtyard, x: round6(def.courtyard.x + dx), y: round6(def.courtyard.y + dy) } : def.courtyard,
  };
  if (def.refPos) out.refPos = { x: round6(def.refPos.x + dx), y: round6(def.refPos.y + dy) };
  return out;
}

/** Pad 1 (or A1, or the first pad). */
export function firstPadIndex(def: Pick<FootprintDef, 'pads'>): number {
  const pads = def.pads;
  let i = pads.findIndex((p) => p.num === '1' && !p.npth);
  if (i < 0) i = pads.findIndex((p) => p.num.toUpperCase() === 'A1' && !p.npth);
  if (i < 0) i = pads.findIndex((p) => !p.npth);
  return i < 0 ? (pads.length ? 0 : -1) : i;
}

/** THT convention: origin on pad 1; SMD: origin in the centre of the pads. */
export function normalizeOrigin(def: FootprintDef, mode: 'pad1' | 'center'): FootprintDef {
  let at: Pt | undefined;
  if (mode === 'pad1') {
    const i = firstPadIndex(def);
    if (i >= 0) at = def.pads[i];
  } else {
    const b = contentBounds(def, false) ?? contentBounds(def);
    if (b) at = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  if (!at || (Math.abs(at.x) < 1e-9 && Math.abs(at.y) < 1e-9)) return def;
  return translateFootprint(def, -at.x, -at.y);
}

// ---- selection based editing ------------------------------------------------------------------

/** "p3" = pad 3, "s2" = silk graphic 2 */
export type SelKey = `p${number}` | `s${number}`;

export const padKey = (i: number): SelKey => `p${i}`;
export const silkKey = (i: number): SelKey => `s${i}`;

export function splitSelection(sel: readonly SelKey[]): { pads: Set<number>; silk: Set<number> } {
  const pads = new Set<number>();
  const silk = new Set<number>();
  for (const k of sel) (k[0] === 'p' ? pads : silk).add(Number(k.slice(1)));
  return { pads, silk };
}

/** Distance from a point to the centre line of a silk graphic (0 inside filled shapes). */
export function graphicDistance(g: FootprintGraphic, p: Pt): number {
  switch (g.kind) {
    case 'line':
      return distToSegment(p, { x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 });
    case 'rect':
    case 'poly': {
      const lines = outlineLines(g);
      if (!lines.length) return g.kind === 'poly' && g.pts.length ? Math.hypot(p.x - g.pts[0].x, p.y - g.pts[0].y) : Infinity;
      if (g.kind === 'poly' && g.fill && insidePolygon(p, g.pts)) return 0;
      return Math.min(...lines.map((l) => distToSegment(p, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 })));
    }
    case 'circle': {
      const d = Math.hypot(p.x - g.cx, p.y - g.cy);
      return g.fill ? Math.max(0, d - g.r) : Math.abs(d - g.r);
    }
    case 'arc': {
      const ang = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI;
      const s = g.sweep < 0 ? g.start + g.sweep : g.start;
      const rel = (((ang - s) % 360) + 360) % 360;
      if (rel <= Math.abs(g.sweep)) return Math.abs(Math.hypot(p.x - g.cx, p.y - g.cy) - g.r);
      const ends = [g.start, g.start + g.sweep].map((a) => ({ x: g.cx + g.r * Math.cos((a * Math.PI) / 180), y: g.cy + g.r * Math.sin((a * Math.PI) / 180) }));
      return Math.min(...ends.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));
    }
  }
}

function insidePolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Topmost item under p: pads before silk. */
export function hitTest(def: FootprintDef, p: Pt, tol: number): SelKey | null {
  for (let i = def.pads.length - 1; i >= 0; i--) if (pointGap(p, padShapeLocal(def.pads[i])) <= tol) return padKey(i);
  for (let i = def.silk.length - 1; i >= 0; i--) if (graphicDistance(def.silk[i], p) <= tol + def.silk[i].width / 2) return silkKey(i);
  return null;
}

/** Items lying completely inside r. */
export function itemsInRect(def: FootprintDef, r: Rect): SelKey[] {
  const inside = (b: Rect) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
  const out: SelKey[] = [];
  def.pads.forEach((p, i) => inside(padBounds(p)) && out.push(padKey(i)));
  def.silk.forEach((g, i) => inside(graphicBounds(g)) && out.push(silkKey(i)));
  return out;
}

export function selectionBounds(def: FootprintDef, sel: readonly SelKey[]): Rect | undefined {
  const { pads, silk } = splitSelection(sel);
  let r: Rect | undefined;
  for (const i of pads) if (def.pads[i]) r = union(r, padBounds(def.pads[i]));
  for (const i of silk) if (def.silk[i]) r = union(r, graphicBounds(def.silk[i]));
  return r;
}

export function moveSelection(def: FootprintDef, sel: readonly SelKey[], dx: number, dy: number): FootprintDef {
  if (!sel.length || (!dx && !dy)) return def;
  const { pads, silk } = splitSelection(sel);
  return {
    ...def,
    pads: def.pads.map((p, i) => (pads.has(i) ? translatePad(p, dx, dy) : p)),
    silk: def.silk.map((g, i) => (silk.has(i) ? translateGraphic(g, dx, dy) : g)),
  };
}

export function deleteSelection(def: FootprintDef, sel: readonly SelKey[]): FootprintDef {
  if (!sel.length) return def;
  const { pads, silk } = splitSelection(sel);
  return { ...def, pads: def.pads.filter((_, i) => !pads.has(i)), silk: def.silk.filter((_, i) => !silk.has(i)) };
}

function rotateGraphic(g: FootprintGraphic, c: Pt, deg: number): FootprintGraphic {
  const t = (x: number, y: number) => {
    const r = rotatePt({ x, y }, c, deg);
    return { x: round6(r.x), y: round6(r.y) };
  };
  switch (g.kind) {
    case 'line': {
      const a = t(g.x1, g.y1);
      const b = t(g.x2, g.y2);
      return { ...g, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case 'rect': {
      const a = t(g.x, g.y);
      const b = t(g.x + g.w, g.y + g.h);
      return { ...g, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: round6(Math.abs(b.x - a.x)), h: round6(Math.abs(b.y - a.y)) };
    }
    case 'circle': {
      const m = t(g.cx, g.cy);
      return { ...g, cx: m.x, cy: m.y };
    }
    case 'arc': {
      const m = t(g.cx, g.cy);
      return { ...g, cx: m.x, cy: m.y, start: (((g.start + deg) % 360) + 360) % 360 };
    }
    case 'poly':
      return { ...g, pts: g.pts.map((p) => t(p.x, p.y)) };
  }
}

/** Turns the selection by a multiple of 90° (clockwise) around the centre of its bounds. */
export function rotateSelection(def: FootprintDef, sel: readonly SelKey[], deg = 90, centre?: Pt): FootprintDef {
  const b = selectionBounds(def, sel);
  if (!b) return def;
  const c = centre ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const quarter = ((Math.round(deg / 90) % 4) + 4) % 4;
  const { pads, silk } = splitSelection(sel);
  return {
    ...def,
    pads: def.pads.map((p, i) => {
      if (!pads.has(i)) return p;
      const at = rotatePt(p, c, quarter * 90);
      // a w x h pad turned by 90° is a h x w pad: exact for every pad shape
      const out: PadDef = { ...p, x: round6(at.x), y: round6(at.y) };
      if (quarter % 2) {
        out.w = p.h;
        out.h = p.w;
      }
      return out;
    }),
    silk: def.silk.map((g, i) => (silk.has(i) ? rotateGraphic(g, c, quarter * 90) : g)),
  };
}

/** Copies of the selection, moved by dx, dy; copied pads get new numbers. */
export function duplicateSelection(def: FootprintDef, sel: readonly SelKey[], dx: number, dy: number): { def: FootprintDef; sel: SelKey[] } {
  const { pads, silk } = splitSelection(sel);
  const out: FootprintDef = { ...def, pads: def.pads.slice(), silk: def.silk.slice() };
  const keys: SelKey[] = [];
  for (const i of [...pads].sort((a, b) => a - b)) {
    const p = def.pads[i];
    if (!p) continue;
    const copy = translatePad(p, dx, dy);
    if (!p.npth) copy.num = nextPadNumber(out);
    delete copy.name;
    out.pads.push(copy);
    keys.push(padKey(out.pads.length - 1));
  }
  for (const i of [...silk].sort((a, b) => a - b)) {
    if (!def.silk[i]) continue;
    out.silk.push(translateGraphic(def.silk[i], dx, dy));
    keys.push(silkKey(out.silk.length - 1));
  }
  return { def: out, sel: keys };
}

// ---- saving -------------------------------------------------------------------------------------

function cleanPad(p: PadDef): PadDef {
  const out: PadDef = { num: p.num.trim(), x: round6(p.x), y: round6(p.y), shape: p.shape, w: round6(p.w), h: round6(p.h) };
  if (p.name?.trim()) out.name = p.name.trim();
  if (p.rotation && ((p.rotation % 360) + 360) % 360) out.rotation = ((p.rotation % 360) + 360) % 360;
  if (p.shape === 'roundrect') out.roundness = Math.min(0.5, Math.max(0, p.roundness ?? 0.25));
  if (p.drill !== undefined && p.drill > 0) out.drill = round6(p.drill);
  if (p.npth) out.npth = true;
  return out;
}

/** The definition handed out on save: trimmed, courtyard and designator position derived when missing. */
export function finalizeFootprint(def: FootprintDef): FootprintDef {
  const id = def.id.trim();
  const out: FootprintDef = {
    id,
    name: def.name.trim() || id,
    description: def.description.trim(),
    category: def.category.trim() || USER_CATEGORY,
    pads: def.pads.map(cleanPad),
    silk: def.silk.filter((g) => g.kind !== 'poly' || g.pts.length > 1),
    courtyard: def.courtyard,
  };
  if (!hasCourtyard(out)) out.courtyard = autoCourtyard(out);
  out.refPos = def.refPos ?? autoRefPos(out);
  let tags = [...new Set((def.tags ?? []).map((t) => t.trim()).filter(Boolean))];
  // the "tht" / "smd" tag of a new footprint follows the pads drawn
  const copper = out.pads.filter((p) => !p.npth);
  if (copper.length && copper.every((p) => !p.drill)) tags = tags.map((t) => (t === 'tht' && !tags.includes('smd') ? 'smd' : t));
  if (copper.length && copper.every((p) => p.drill)) tags = tags.map((t) => (t === 'smd' && !tags.includes('tht') ? 'tht' : t));
  if (tags.length) out.tags = tags;
  return out;
}

/** "a, b c" -> ["a", "b c"] */
export const parseTags = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);
