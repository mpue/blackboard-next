// Content of the physical layers as plain primitives in board units and document
// orientation (y down). The Gerber and SVG writers only serialise them.

import type { BoxItem, CopperSide, Doc, EllipseItem, FootprintGraphic, FootprintItem, Item, Layer, LineItem, PadDef, TextItem } from '../../model/types.ts';
import { isBoardLayer } from '../../model/types.ts';
import type { Pt } from '../../geometry/geom.ts';
import { copperSideOfLayer, footprintToWorld, padSides, padWorldRotation } from '../geometry.ts';
import { mm } from '../units.ts';
import { strokeText } from './strokeFont.ts';
import type { PolygonWithHoles, Ring, Segment, ZoneFills } from './types.ts';

/** Flashed pad shape; `rot` in degrees clockwise. */
export type PadGeom =
  | { kind: 'circle'; c: Pt; d: number }
  | { kind: 'rect' | 'oval'; c: Pt; w: number; h: number; rot: number }
  | { kind: 'roundrect'; c: Pt; w: number; h: number; r: number; rot: number };

/** `fn` is the Gerber X2 aperture function. Arcs: `cw` = clockwise as seen on screen. */
export type Prim =
  | { kind: 'flash'; shape: PadGeom; fn?: string }
  | { kind: 'path'; width: number; pts: Pt[]; closed?: boolean; fn?: string }
  | { kind: 'arc'; width: number; c: Pt; a: Pt; b: Pt; cw: boolean; fn?: string }
  | { kind: 'circle'; width: number; c: Pt; r: number; fn?: string }
  | { kind: 'region'; outer: Ring; holes: Ring[]; fn?: string };

export const SILK_WIDTH = mm(0.15);
export const EDGE_WIDTH = mm(0.1);
export const DESIGNATOR_HEIGHT = mm(1);

const EPS = 1e-6;

// ---- pads ------------------------------------------------------------------------------

/** Pad copper in world coordinates, every side grown by `grow` (solder mask). */
export function padGeom(fp: FootprintItem, pad: PadDef, grow = 0): PadGeom | undefined {
  const c = footprintToWorld(fp, pad);
  const rot = padWorldRotation(fp, pad);
  const w = pad.w + 2 * grow;
  const h = pad.h + 2 * grow;
  if (w <= EPS || h <= EPS) return undefined;
  const oval = (): PadGeom => (Math.abs(w - h) < EPS ? { kind: 'circle', c, d: w } : { kind: 'oval', c, w, h, rot });
  switch (pad.shape) {
    case 'circle':
      return { kind: 'circle', c, d: Math.min(w, h) };
    case 'oval':
      return oval();
    case 'rect':
      return { kind: 'rect', c, w, h, rot };
    case 'roundrect': {
      const r0 = Math.min(0.5, Math.max(0, pad.roundness ?? 0.25)) * Math.min(pad.w, pad.h);
      if (r0 <= EPS) return { kind: 'rect', c, w, h, rot };
      const r = r0 + grow;
      if (r >= Math.min(w, h) / 2 - EPS) return oval();
      return { kind: 'roundrect', c, w, h, r, rot };
    }
  }
}

export const footprintsOf = (doc: Doc) => doc.items.filter((i): i is FootprintItem => i.kind === 'footprint');

export interface Hole {
  x: number;
  y: number;
  d: number;
  plated: boolean;
  via: boolean;
}

export function holes(doc: Doc): Hole[] {
  const out: Hole[] = [];
  for (const fp of footprintsOf(doc)) {
    for (const pad of fp.footprint.pads) {
      if (!pad.drill || pad.drill <= 0) continue;
      const c = footprintToWorld(fp, pad);
      out.push({ x: c.x, y: c.y, d: pad.drill, plated: !pad.npth, via: false });
    }
  }
  for (const v of doc.items) if (v.kind === 'via' && v.drill > 0) out.push({ x: v.x, y: v.y, d: v.drill, plated: true, via: true });
  return out;
}

// ---- drawings (legacy items) -------------------------------------------------------------

type Drawing = LineItem | BoxItem | EllipseItem | TextItem;

const isDrawing = (i: Item): i is Drawing => i.kind === 'line' || i.kind === 'box' || i.kind === 'ellipse' || i.kind === 'text';

function drawingsOn(doc: Doc, test: (layer: Layer) => boolean): Drawing[] {
  const layers = new Map(doc.layers.map((l) => [l.id, l]));
  return doc.items.filter(isDrawing).filter((i) => {
    const l = layers.get(i.layer);
    return !!l && test(l);
  });
}

/** Swing HTML of legacy texts -> plain lines. */
function plainText(src: string): string {
  return src
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Consecutive segments sharing end points -> polylines. */
export function chainSegments(segs: Segment[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] | undefined;
  for (const s of segs) {
    const last = cur?.[cur.length - 1];
    if (cur && last && Math.abs(last.x - s.x1) < EPS && Math.abs(last.y - s.y1) < EPS) cur.push({ x: s.x2, y: s.y2 });
    else out.push((cur = [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]));
  }
  return out;
}

const textPrims = (segs: Segment[], width: number, fn?: string): Prim[] => chainSegments(segs).map((pts) => ({ kind: 'path', width, pts, fn }));

function ellipsePts(g: EllipseItem): { pts: Pt[]; full: boolean; c: Pt; rx: number; ry: number } {
  const rx = Math.abs(g.w) / 2;
  const ry = Math.abs(g.h) / 2;
  const c = { x: Math.min(g.x, g.x + g.w) + rx, y: Math.min(g.y, g.y + g.h) + ry };
  const full = Math.abs(g.arcAngle) >= 360;
  const sweep = full ? 360 : g.arcAngle;
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / 360) * 72));
  const pts: Pt[] = [];
  // java.awt arcs: counter clockwise from 3 o'clock
  for (let i = 0; i < (full ? n : n + 1); i++) {
    const a = ((g.startAngle + (sweep * i) / n) * Math.PI) / 180;
    pts.push({ x: c.x + rx * Math.cos(a), y: c.y - ry * Math.sin(a) });
  }
  return { pts, full, c, rx, ry };
}

/** `outline`: board edge drawings are always thin centre lines without fill. */
function drawingPrims(it: Drawing, outline: boolean, fn?: string): Prim[] {
  const width = (t: number) => (outline ? EDGE_WIDTH : t > 0 ? t : SILK_WIDTH);
  switch (it.kind) {
    case 'line':
      return [{ kind: 'path', width: width(it.thickness), pts: [{ x: it.x1, y: it.y1 }, { x: it.x2, y: it.y2 }], fn }];
    case 'box': {
      const x = Math.min(it.x, it.x + it.w);
      const y = Math.min(it.y, it.y + it.h);
      const pts = [
        { x, y },
        { x: x + Math.abs(it.w), y },
        { x: x + Math.abs(it.w), y: y + Math.abs(it.h) },
        { x, y: y + Math.abs(it.h) },
      ];
      const out: Prim[] = [];
      if (!outline && it.style !== 'OUTLINED') out.push({ kind: 'region', outer: pts, holes: [], fn });
      if (outline || it.style !== 'FILLED') out.push({ kind: 'path', width: width(it.thickness), pts, closed: true, fn });
      return out;
    }
    case 'ellipse': {
      const e = ellipsePts(it);
      if (e.rx < EPS || e.ry < EPS) return [];
      const out: Prim[] = [];
      if (!outline && it.style !== 'OUTLINED') out.push({ kind: 'region', outer: e.full ? e.pts : [e.c, ...e.pts], holes: [], fn });
      if (outline || it.style !== 'FILLED') {
        if (e.full && Math.abs(e.rx - e.ry) < EPS) out.push({ kind: 'circle', width: width(it.thickness), c: e.c, r: e.rx, fn });
        else out.push({ kind: 'path', width: width(it.thickness), pts: e.pts, closed: e.full, fn });
      }
      return out;
    }
    case 'text': {
      if (outline) return [];
      const text = plainText(it.text);
      const cap = it.fontSize * 0.7;
      if (!text.trim() || cap <= 0) return [];
      const segs = strokeText(text, it.x, it.y, cap, { rotation: it.rotation, lineSpacing: (it.fontSize * 1.2) / cap });
      return textPrims(segs, Math.max(cap * 0.15, mm(0.1)), fn);
    }
  }
}

// ---- footprint silkscreen --------------------------------------------------------------------

function graphicPrims(fp: FootprintItem, g: FootprintGraphic): Prim[] {
  const T = (p: Pt) => footprintToWorld(fp, p);
  const w = g.width > 0 ? g.width : SILK_WIDTH;
  switch (g.kind) {
    case 'line':
      return [{ kind: 'path', width: w, pts: [T({ x: g.x1, y: g.y1 }), T({ x: g.x2, y: g.y2 })] }];
    case 'rect':
      return [
        {
          kind: 'path',
          width: w,
          closed: true,
          pts: [
            { x: g.x, y: g.y },
            { x: g.x + g.w, y: g.y },
            { x: g.x + g.w, y: g.y + g.h },
            { x: g.x, y: g.y + g.h },
          ].map(T),
        },
      ];
    case 'circle': {
      const c = T({ x: g.cx, y: g.cy });
      if (g.fill) return [{ kind: 'flash', shape: { kind: 'circle', c, d: 2 * g.r + Math.max(0, g.width) } }];
      return [{ kind: 'circle', width: w, c, r: g.r }];
    }
    case 'arc': {
      const c = T({ x: g.cx, y: g.cy });
      if (Math.abs(g.sweep) >= 360) return [{ kind: 'circle', width: w, c, r: g.r }];
      if (Math.abs(g.sweep) < EPS || g.r <= 0) return [];
      const at = (deg: number) => T({ x: g.cx + g.r * Math.cos((deg * Math.PI) / 180), y: g.cy + g.r * Math.sin((deg * Math.PI) / 180) });
      // mirroring (bottom side) reverses the direction
      return [{ kind: 'arc', width: w, c, a: at(g.start), b: at(g.start + g.sweep), cw: g.sweep > 0 !== (fp.side === 'bottom') }];
    }
    case 'poly': {
      const pts = g.pts.map(T);
      if (pts.length < 2) return [];
      const out: Prim[] = [];
      if (g.fill && pts.length >= 3) out.push({ kind: 'region', outer: pts, holes: [] });
      if (!g.fill || g.width > 0) out.push({ kind: 'path', width: w, pts, closed: true });
      return out;
    }
  }
}

/** Readable text, same rule as the editor: rotations in (90°, 270°] are turned by 180°. */
export function uprightAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 90 + EPS && a <= 270 + EPS ? a - 180 : a;
}

function designatorPrims(fp: FootprintItem): Prim[] {
  if (!fp.name.trim()) return [];
  const off = fp.refOffset ?? fp.footprint.refPos ?? { x: 0, y: fp.footprint.courtyard.y - mm(0.8) };
  const at = footprintToWorld(fp, off);
  const segs = strokeText(fp.name, at.x, at.y, DESIGNATOR_HEIGHT, {
    rotation: uprightAngle(fp.rotation),
    mirror: fp.side === 'bottom',
    anchor: 'middle',
    valign: 'middle',
  });
  return textPrims(segs, SILK_WIDTH);
}

// ---- layers ----------------------------------------------------------------------------------

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function copperPrims(doc: Doc, side: CopperSide, fills?: ZoneFills): Prim[] {
  const out: Prim[] = [];
  const onSide = (layer: string) => copperSideOfLayer(doc, layer) === side;
  // zone fills first; larger polygons first so that the clear holes of a
  // polygon never erase a smaller island drawn before (islands lie in holes)
  const polys: PolygonWithHoles[] = [];
  for (const z of doc.items) {
    if (z.kind !== 'zone' || !onSide(z.layer)) continue;
    for (const p of fills?.get(z.id) ?? []) if (p.length && p[0].length >= 3) polys.push(p);
  }
  polys.sort((a, b) => ringArea(b[0]) - ringArea(a[0]));
  for (const [outer, ...hs] of polys) out.push({ kind: 'region', outer, holes: hs.filter((h) => h.length >= 3), fn: 'Conductor' });

  for (const fp of footprintsOf(doc)) {
    for (const pad of fp.footprint.pads) {
      if (!padSides(fp, pad).includes(side)) continue;
      const shape = padGeom(fp, pad);
      if (shape) out.push({ kind: 'flash', shape, fn: pad.drill ? 'ComponentPad' : 'SMDPad,CuDef' });
    }
  }
  for (const t of doc.items) {
    if (t.kind !== 'track' || !onSide(t.layer)) continue;
    out.push({ kind: 'path', width: t.width, pts: [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }], fn: 'Conductor' });
  }
  for (const d of drawingsOn(doc, (l) => onSide(l.id))) out.push(...drawingPrims(d, false, 'Conductor'));
  for (const v of doc.items) {
    if (v.kind !== 'via') continue;
    out.push({ kind: 'flash', shape: { kind: 'circle', c: { x: v.x, y: v.y }, d: v.diameter }, fn: 'ViaPad' });
  }
  return out;
}

/** Solder mask openings; vias are tented. */
export function maskPrims(doc: Doc, side: CopperSide, expansion: number): Prim[] {
  const out: Prim[] = [];
  for (const fp of footprintsOf(doc)) {
    for (const pad of fp.footprint.pads) {
      if (pad.npth) {
        const d = Math.max(Math.min(pad.w, pad.h), pad.drill ?? 0) + 2 * expansion;
        if (d > EPS) out.push({ kind: 'flash', shape: { kind: 'circle', c: footprintToWorld(fp, pad), d } });
        continue;
      }
      if (!padSides(fp, pad).includes(side)) continue;
      const shape = padGeom(fp, pad, expansion);
      if (shape) out.push({ kind: 'flash', shape, fn: pad.drill ? 'ComponentPad' : 'SMDPad,CuDef' });
    }
  }
  return out;
}

/** Solder paste (stencil apertures): SMD pads of one side, at pad size. */
export function pastePrims(doc: Doc, side: CopperSide): Prim[] {
  const out: Prim[] = [];
  for (const fp of footprintsOf(doc)) {
    if (fp.side !== side) continue;
    for (const pad of fp.footprint.pads) {
      if (pad.drill || pad.npth) continue;
      const shape = padGeom(fp, pad, 0);
      if (shape) out.push({ kind: 'flash', shape, fn: 'SMDPad,CuDef' });
    }
  }
  return out;
}

export function silkPrims(doc: Doc, side: CopperSide): Prim[] {
  const out: Prim[] = [];
  for (const fp of footprintsOf(doc)) {
    if (fp.side !== side) continue;
    for (const g of fp.footprint.silk) out.push(...graphicPrims(fp, g));
    out.push(...designatorPrims(fp));
  }
  for (const d of drawingsOn(doc, (l) => l.role === `${side}-silk`)) out.push(...drawingPrims(d, false));
  return out;
}

/** Corner radius of the rectangular board outline. */
export const cornerRadius = (doc: Doc) => Math.max(0, Math.min(doc.pcb?.cornerRadius ?? 0, doc.width / 2, doc.height / 2));

export function edgePrims(doc: Doc): Prim[] {
  const W = doc.width;
  const H = doc.height;
  const r = cornerRadius(doc);
  const fn = 'Profile';
  const out: Prim[] = [];
  if (r <= EPS) {
    out.push({ kind: 'path', width: EDGE_WIDTH, closed: true, fn, pts: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }] });
  } else {
    // clockwise on screen: top edge, right edge, bottom edge, left edge
    const corners = [
      { c: { x: W - r, y: r }, a: { x: W - r, y: 0 }, b: { x: W, y: r } },
      { c: { x: W - r, y: H - r }, a: { x: W, y: H - r }, b: { x: W - r, y: H } },
      { c: { x: r, y: H - r }, a: { x: r, y: H }, b: { x: 0, y: H - r } },
      { c: { x: r, y: r }, a: { x: 0, y: r }, b: { x: r, y: 0 } },
    ];
    corners.forEach((k, i) => {
      const prev = corners[(i + 3) % 4].b;
      if (Math.hypot(prev.x - k.a.x, prev.y - k.a.y) > EPS) out.push({ kind: 'path', width: EDGE_WIDTH, pts: [prev, k.a], fn });
      out.push({ kind: 'arc', width: EDGE_WIDTH, c: k.c, a: k.a, b: k.b, cw: true, fn });
    });
  }
  for (const d of drawingsOn(doc, isBoardLayer)) out.push(...drawingPrims(d, true, fn));
  return out;
}
