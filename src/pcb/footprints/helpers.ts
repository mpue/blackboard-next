// Building blocks of the footprint library. Footprints are authored in mm and
// converted to board units once by build(), which also clips the silkscreen
// where it comes too close to pad copper and derives courtyard and refPos.

import type { FootprintDef, FootprintGraphic, PadDef, PadShape } from '../../model/types.ts';
import { distToSegment, type Pt } from '../../geometry/geom.ts';
import { copperShapeBounds, insideConvex, padShapeLocal, type CopperShape } from '../geometry.ts';
import { mm } from '../units.ts';

export const SILK_W = 0.15;
/** silkscreen to pad copper, edge to edge */
export const SILK_CLEARANCE = 0.2;
export const COURTYARD_MARGIN = 0.25;
/** silk offset from the body outline */
export const SILK_OFFSET = 0.12;
/** distance from a pad edge to the centre line of silk placed next to it (clearance + half width + margin) */
export const SILK_GAP = SILK_CLEARANCE + SILK_W / 2 + 0.02;
/** clipped silk pieces shorter than this are dropped */
const MIN_SILK = 0.2;
const STEP = 0.02;

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** footprint source, geometry in mm */
export interface Spec {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  pads: PadDef[];
  silk: FootprintGraphic[];
  /** component body; the courtyard encloses body and pads */
  body?: Box;
}

// ---- pads (mm) -------------------------------------------------------------------------

export function tht(num: string, x: number, y: number, shape: PadShape, w: number, h: number, drill: number, name?: string): PadDef {
  const pad: PadDef = { num, x, y, shape, w, h, drill };
  if (name) pad.name = name;
  return pad;
}

/** pads other than pad 1: round when square */
export const roundShape = (w: number, h: number): PadShape => (Math.abs(w - h) < 1e-9 ? 'circle' : 'oval');

/** KiCad rule: corner radius 25 % of the smaller side, at most 0.25 mm */
export const kicadRoundness = (w: number, h: number) => Math.min(0.25, 0.25 / Math.min(w, h));

export function smd(num: string, x: number, y: number, w: number, h: number, roundness = kicadRoundness(w, h)): PadDef {
  return { num, x, y, shape: 'roundrect', w, h, roundness };
}

/** non plated hole without copper */
export function hole(x: number, y: number, d: number): PadDef {
  return { num: '', x, y, shape: 'circle', w: d, h: d, drill: d, npth: true };
}

// ---- silkscreen (mm) -------------------------------------------------------------------

export const line = (x1: number, y1: number, x2: number, y2: number): FootprintGraphic => ({ kind: 'line', x1, y1, x2, y2, width: SILK_W });

export function polyline(pts: Pt[], closed = false): FootprintGraphic[] {
  const out: FootprintGraphic[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push(line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  if (closed && pts.length > 2) out.push(line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y));
  return out;
}

export const box = (x1: number, y1: number, x2: number, y2: number) =>
  polyline(
    [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
    true,
  );

export const circle = (cx: number, cy: number, r: number): FootprintGraphic => ({ kind: 'circle', cx, cy, r, width: SILK_W });

/** start and sweep in degrees, clockwise from +x (y points down) */
export const arc = (cx: number, cy: number, r: number, start: number, sweep: number): FootprintGraphic => ({ kind: 'arc', cx, cy, r, start, sweep, width: SILK_W });

/** filled marker, never clipped */
export const dot = (cx: number, cy: number, r: number): FootprintGraphic => ({ kind: 'circle', cx, cy, r, width: 0, fill: true });

/** "+" polarity mark with arm length a */
export const plus = (cx: number, cy: number, a: number) => [line(cx - a, cy, cx + a, cy), line(cx, cy - a, cx, cy + a)];

/** stadium outline (crystals): straight sides at y = ±r around the centres x1, x2 */
export const racetrack = (x1: number, x2: number, r: number) => [line(x1, -r, x2, -r), line(x1, r, x2, r), arc(x2, 0, r, -90, 180), arc(x1, 0, r, 90, 180)];

// ---- build -----------------------------------------------------------------------------

const box2 = (x: number, y: number, w: number, h: number): Box => ({ x1: x, y1: y, x2: x + w, y2: y + h });

function union(a: Box | undefined, b: Box): Box {
  if (!a) return b;
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

const overlaps = (a: Box, b: Box, d: number) => a.x1 - d <= b.x2 && b.x1 - d <= a.x2 && a.y1 - d <= b.y2 && b.y1 - d <= a.y2;

/** distance from a point to a convex polygon (1 point, segment or >= 3 points), 0 inside */
function distToPolygon(p: Pt, pts: Pt[]): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  if (pts.length === 2) return distToSegment(p, pts[0], pts[1]);
  if (insideConvex(p, pts)) return 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return d;
}

/** Free parameter runs of [0, 1]: sampled, the run ends refined by bisection. */
function freeRuns(n: number, free: (t: number) => boolean): [number, number][] {
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
  return out;
}

/** Removes the parts of a silk graphic closer than SILK_CLEARANCE to pad copper. */
function clipGraphic(g: FootprintGraphic, shapes: { s: CopperShape; b: Box }[]): FootprintGraphic[] {
  if (g.kind !== 'line' && g.kind !== 'arc' && (g.kind !== 'circle' || g.fill)) return [g];
  const reach = SILK_CLEARANCE + g.width / 2;
  const gb: Box =
    g.kind === 'line'
      ? { x1: Math.min(g.x1, g.x2), y1: Math.min(g.y1, g.y2), x2: Math.max(g.x1, g.x2), y2: Math.max(g.y1, g.y2) }
      : { x1: g.cx - g.r, y1: g.cy - g.r, x2: g.cx + g.r, y2: g.cy + g.r };
  const near = shapes.filter((x) => overlaps(gb, x.b, reach));
  if (!near.length) return [g];
  const free = (p: Pt) => near.every(({ s, b }) => p.x < b.x1 - reach || p.x > b.x2 + reach || p.y < b.y1 - reach || p.y > b.y2 + reach || distToPolygon(p, s.pts) - s.r >= reach);
  if (g.kind === 'line') {
    const dx = g.x2 - g.x1;
    const dy = g.y2 - g.y1;
    const len = Math.hypot(dx, dy);
    const runs = freeRuns(Math.max(1, Math.ceil(len / STEP)), (t) => free({ x: g.x1 + dx * t, y: g.y1 + dy * t }));
    if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === 1) return [g];
    return runs.filter(([a, b]) => (b - a) * len >= MIN_SILK).map(([a, b]) => ({ ...g, x1: g.x1 + dx * a, y1: g.y1 + dy * a, x2: g.x1 + dx * b, y2: g.y1 + dy * b }));
  }
  const at = (deg: number): Pt => ({ x: g.cx + g.r * Math.cos((deg * Math.PI) / 180), y: g.cy + g.r * Math.sin((deg * Math.PI) / 180) });
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
  const runs = freeRuns(n, (t) => free(at(start + sweep * t)));
  if (g.kind === 'arc' && runs.length === 1 && runs[0][0] === 0 && runs[0][1] === 1) return [g];
  return runs
    .filter(([a, b]) => (((b - a) * sweep) / 180) * Math.PI * g.r >= MIN_SILK)
    .map(([a, b]): FootprintGraphic => ({ kind: 'arc', cx: g.cx, cy: g.cy, r: g.r, start: start + sweep * a, sweep: sweep * (b - a), width: g.width }));
}

/** mm -> board units, float noise removed */
const u = (v: number) => Math.round(mm(v) * 1e6) / 1e6;

function graphicToUnits(g: FootprintGraphic): FootprintGraphic {
  switch (g.kind) {
    case 'line':
      return { ...g, x1: u(g.x1), y1: u(g.y1), x2: u(g.x2), y2: u(g.y2), width: u(g.width) };
    case 'rect':
      return { ...g, x: u(g.x), y: u(g.y), w: u(g.w), h: u(g.h), width: u(g.width) };
    case 'circle':
      return { ...g, cx: u(g.cx), cy: u(g.cy), r: u(g.r), width: u(g.width) };
    case 'arc':
      return { ...g, cx: u(g.cx), cy: u(g.cy), r: u(g.r), width: u(g.width), start: Math.round(g.start * 1e4) / 1e4, sweep: Math.round(g.sweep * 1e4) / 1e4 };
    case 'poly':
      return { ...g, pts: g.pts.map((p) => ({ x: u(p.x), y: u(p.y) })), width: u(g.width) };
  }
}

function padToUnits(p: PadDef): PadDef {
  const out: PadDef = { ...p, x: u(p.x), y: u(p.y), w: u(p.w), h: u(p.h) };
  if (p.drill !== undefined) out.drill = u(p.drill);
  return out;
}

const floorTo = (v: number, g: number) => Math.floor(v / g + 1e-6) * g;
const ceilTo = (v: number, g: number) => Math.ceil(v / g - 1e-6) * g;

/** Final footprint in board units: silk clipped, courtyard and designator position derived. */
export function build(spec: Spec): FootprintDef {
  const shapes = spec.pads.map((p) => {
    const s = padShapeLocal(p);
    const r = copperShapeBounds(s);
    return { s, b: box2(r.x, r.y, r.w, r.h) };
  });
  const silk = spec.silk.flatMap((g) => clipGraphic(g, shapes));
  let ext = spec.body;
  for (const { b } of shapes) ext = union(ext, b);
  const e = ext ?? { x1: 0, y1: 0, x2: 0, y2: 0 };
  // courtyard on a 0.05 mm grid like KiCad
  const cx1 = floorTo(e.x1 - COURTYARD_MARGIN, 0.05);
  const cy1 = floorTo(e.y1 - COURTYARD_MARGIN, 0.05);
  const cx2 = ceilTo(e.x2 + COURTYARD_MARGIN, 0.05);
  const cy2 = ceilTo(e.y2 + COURTYARD_MARGIN, 0.05);
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    pads: spec.pads.map(padToUnits),
    silk: silk.map(graphicToUnits),
    courtyard: { x: u(cx1), y: u(cy1), w: u(cx2 - cx1), h: u(cy2 - cy1) },
    refPos: { x: u((cx1 + cx2) / 2), y: u(cy1 - 0.8) },
    tags: spec.tags,
  };
}

/** "7.62" style number for ids and descriptions */
export const fmt = (v: number) => v.toFixed(2);
/** "01" style pin count */
export const pad2 = (n: number) => String(n).padStart(2, '0');
