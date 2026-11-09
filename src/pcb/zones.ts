// Copper zone (pour) filling. A fill is the zone outline clipped to the board
// (edge clearance, rounded corners) minus other net copper, NPTH holes and the
// fills of higher priority zones of other nets, with thermal relief spokes or
// solid connections to pads of the zone net and dead copper removed.
// Output rings are simple and closed implicitly; outer rings have a positive
// polygonArea and holes a negative one (counter clockwise in a y-up frame, i.e.
// clockwise on screen). Render with fill-rule evenodd.

import type { CopperSide, DesignRules, Doc, ZoneItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { defaultRules } from './defaults.ts';
import {
  circleShape,
  copperShapeBounds,
  copperSideOfLayer,
  footprintToWorld,
  padShapeWorld,
  padSides,
  padWorldRotation,
  pointGap,
  polygonDistance,
  trackShape,
  viaShape,
  type CopperShape,
} from './geometry.ts';
import { mm } from './units.ts';
import {
  boxesTouch,
  difference,
  inflateMulti,
  intersection,
  multiBox,
  pointInPolygon,
  polyArea,
  ringBox,
  roundedConvex,
  type Box,
  type Geom,
  type PMulti,
  type PPolygon,
  type PRing,
} from './polygon.ts';

export type Ring = { x: number; y: number }[];
/** [outer, ...holes] */
export type PolygonWithHoles = Ring[];
export type MultiPolygon = PolygonWithHoles[];

export interface ZoneFillOptions {
  /** gap between a thermal relief pad and the fill; default: zone clearance */
  thermalGap?: number;
  /** default: max(rules.trackWidth, 0.3 mm) */
  spokeWidth?: number;
  /** islands with a smaller area (board units²) are dropped; default 0.25 mm² */
  minIsland?: number;
}

/** maximum polygonization error of arcs */
const CHORD = mm(0.01);
const DEFAULT_MIN_ISLAND = mm(0.5) ** 2;
const EPS = 1e-9;

interface Copper {
  shape: CopperShape;
  net?: string;
  box: Box;
  /** pads only: centre, world rotation and half size for the spokes */
  pad?: { c: Pt; rot: number; hw: number; hh: number };
}

interface SideCopper {
  copper: Copper[];
  /** NPTH holes */
  holes: CopperShape[];
}

interface ZoneFill {
  start: PMulti;
  box?: Box;
  clearance: number;
  /** other net copper and holes the fill keeps `clearance` from */
  obstacles: CopperShape[];
  fill: PMulti;
}

interface Ctx {
  doc: Doc;
  rules: DesignRules;
  opts: ZoneFillOptions;
  zones: ZoneItem[];
  index: Map<string, number>;
  sides: Map<CopperSide, SideCopper>;
  fills: Map<string, ZoneFill>;
  avoid: Map<string, PMulti>;
}

// ---- public API -----------------------------------------------------------------------------

export function fillZone(doc: Doc, zone: ZoneItem, opts: ZoneFillOptions = {}): MultiPolygon {
  return toOutput(computeZone(context(doc, opts), zone).fill);
}

/** Fills of all zones by id, computed in priority order. */
export function fillAllZones(doc: Doc, opts: ZoneFillOptions = {}): Map<string, MultiPolygon> {
  const ctx = context(doc, opts);
  const res = new Map<string, MultiPolygon>();
  for (const z of [...ctx.zones].sort((a, b) => (outranks(ctx, a, b) ? -1 : outranks(ctx, b, a) ? 1 : 0))) {
    res.set(z.id, toOutput(computeZone(ctx, z).fill));
  }
  return res;
}

/** SVG path data, one "M … Z" subpath per ring; draw with fill-rule evenodd. */
export function zoneFillPath(mp: MultiPolygon): string {
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  let d = '';
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      d += `M${f(ring[0].x)} ${f(ring[0].y)}`;
      for (let i = 1; i < ring.length; i++) d += `L${f(ring[i].x)} ${f(ring[i].y)}`;
      d += 'Z';
    }
  }
  return d;
}

/** Signed shoelace area: positive for outer rings of fills, negative for holes. */
export function polygonArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// ---- context --------------------------------------------------------------------------------

function context(doc: Doc, opts: ZoneFillOptions): Ctx {
  const zones = doc.items.filter((i): i is ZoneItem => i.kind === 'zone');
  const index = new Map<string, number>();
  doc.items.forEach((it, i) => index.set(it.id, i));
  return { doc, rules: doc.pcb?.rules ?? defaultRules(), opts, zones, index, sides: new Map(), fills: new Map(), avoid: new Map() };
}

/** Higher priority first, ties by document order. */
function outranks(ctx: Ctx, a: ZoneItem, b: ZoneItem): boolean {
  const pa = a.priority ?? 0;
  const pb = b.priority ?? 0;
  if (pa !== pb) return pa > pb;
  return (ctx.index.get(a.id) ?? Infinity) < (ctx.index.get(b.id) ?? Infinity);
}

const toBox = (s: CopperShape): Box => {
  const r = copperShapeBounds(s);
  return { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h };
};

function sideCopper(ctx: Ctx, side: CopperSide): SideCopper {
  let sc = ctx.sides.get(side);
  if (sc) return sc;
  sc = { copper: [], holes: [] };
  const { doc } = ctx;
  for (const it of doc.items) {
    if (it.kind === 'footprint') {
      for (const pad of it.footprint.pads) {
        const c = footprintToWorld(it, { x: pad.x, y: pad.y });
        if (pad.npth) {
          sc.holes.push(pad.drill ? circleShape(c, pad.drill / 2) : padShapeWorld(it, pad));
          continue;
        }
        if (!padSides(it, pad).includes(side)) continue;
        const shape = padShapeWorld(it, pad);
        const round = pad.shape === 'circle';
        const hw = round ? shape.r : pad.w / 2;
        const hh = round ? shape.r : pad.h / 2;
        sc.copper.push({ shape, net: it.nets[pad.num] || undefined, box: toBox(shape), pad: { c, rot: padWorldRotation(it, pad), hw, hh } });
      }
    } else if (it.kind === 'track') {
      if (copperSideOfLayer(doc, it.layer) !== side) continue;
      const shape = trackShape(it);
      sc.copper.push({ shape, net: it.net || undefined, box: toBox(shape) });
    } else if (it.kind === 'via') {
      const shape = viaShape(it);
      sc.copper.push({ shape, net: it.net || undefined, box: toBox(shape) });
    }
  }
  ctx.sides.set(side, sc);
  return sc;
}

// ---- filling --------------------------------------------------------------------------------

const ptsOf = (r: PRing): Pt[] => r.map(([x, y]) => ({ x, y }));

/** Board rectangle inset by the edge clearance, with the inset corner radius. */
function boardRing(doc: Doc, rules: DesignRules): PRing {
  const e = rules.edgeClearance;
  const w = doc.width - 2 * e;
  const h = doc.height - 2 * e;
  if (w <= 0 || h <= 0) return [];
  const rho = Math.min(Math.max(0, (doc.pcb?.cornerRadius ?? 0) - e), w / 2, h / 2);
  const x1 = e + rho;
  const y1 = e + rho;
  const x2 = doc.width - e - rho;
  const y2 = doc.height - e - rho;
  return roundedConvex([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], rho, false, CHORD);
}

/** Rounded convex shape inflated by d (d may be negative down to -r). */
function shapePoly(s: CopperShape, d: number, outer: boolean): PPolygon | undefined {
  const r = s.r + d;
  if (r < -EPS) return undefined;
  const ring = roundedConvex(s.pts, Math.max(0, r), outer, CHORD);
  return ring.length >= 3 ? [ring] : undefined;
}

/** Two crossing bars along the pad axes, from beyond the gap on one side to beyond it on the other. */
function spokeBars(p: NonNullable<Copper['pad']>, gap: number, width: number): PPolygon[] {
  const a = (p.rot * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const v = { x: -u.y, y: u.x };
  const half = Math.min(width / 2, p.hw, p.hh);
  const ext = 2 * CHORD + 1e-3;
  const bar = (d: Pt, n: Pt, len: number): PPolygon => [
    [
      [p.c.x - d.x * len - n.x * half, p.c.y - d.y * len - n.y * half],
      [p.c.x + d.x * len - n.x * half, p.c.y + d.y * len - n.y * half],
      [p.c.x + d.x * len + n.x * half, p.c.y + d.y * len + n.y * half],
      [p.c.x - d.x * len + n.x * half, p.c.y - d.y * len + n.y * half],
    ],
  ];
  return [bar(u, v, p.hw + gap + ext), bar(v, u, p.hh + gap + ext)];
}

function emptyFill(clearance: number): ZoneFill {
  return { start: [], clearance, obstacles: [], fill: [] };
}

function computeZone(ctx: Ctx, zone: ZoneItem): ZoneFill {
  const cached = ctx.fills.get(zone.id);
  if (cached) return cached;
  const clearance = zone.clearance ?? ctx.rules.clearance;
  let res = emptyFill(clearance);
  try {
    res = fill(ctx, zone, clearance);
  } catch (err) {
    console.warn(`zone ${zone.id}: fill failed`, err);
  }
  ctx.fills.set(zone.id, res);
  return res;
}

function fill(ctx: Ctx, zone: ZoneItem, c: number): ZoneFill {
  const { doc, rules, opts } = ctx;
  const side = copperSideOfLayer(doc, zone.layer);
  if (!side || zone.points.length < 3) return emptyFill(c);
  const gap = opts.thermalGap ?? c;
  const spokeW = opts.spokeWidth ?? Math.max(rules.trackWidth, mm(0.3));
  const minIsland = opts.minIsland ?? DEFAULT_MIN_ISLAND;
  const net = zone.net || undefined;
  const thermal = zone.connect !== 'solid';

  const start = intersection([zone.points.map((p): [number, number] => [p.x, p.y])], [boardRing(doc, rules)]);
  const box = multiBox(start);
  if (!box) return emptyFill(c);

  const sc = sideCopper(ctx, side);
  const obstacles: CopperShape[] = [];
  const clips: Geom[] = [];
  const gaps: PPolygon[] = [];
  const spokes: PPolygon[] = [];
  for (const cu of sc.copper) {
    if (net !== undefined && cu.net === net) {
      if (thermal && cu.pad && boxesTouch(cu.box, box, gap + EPS)) {
        const g = shapePoly(cu.shape, gap, true);
        if (g) gaps.push(g);
        spokes.push(...spokeBars(cu.pad, gap, spokeW));
      }
      continue;
    }
    if (!boxesTouch(cu.box, box, c + EPS)) continue;
    const p = shapePoly(cu.shape, c, true);
    if (p) clips.push(p);
    obstacles.push(cu.shape);
  }
  for (const h of sc.holes) {
    if (!boxesTouch(toBox(h), box, c + EPS)) continue;
    const p = shapePoly(h, c, true);
    if (p) clips.push(p);
    obstacles.push(h);
  }
  if (gaps.length) clips.push(difference(gaps, spokes));

  for (const other of ctx.zones) {
    if (other.id === zone.id || copperSideOfLayer(doc, other.layer) !== side) continue;
    if (net !== undefined && other.net === net) continue;
    if (!outranks(ctx, other, zone)) continue;
    const hz = computeZone(ctx, other);
    if (!hz.fill.length || !hz.box || !boxesTouch(hz.box, box, c + EPS)) continue;
    clips.push(avoidRegion(ctx, other.id, hz, c));
  }

  const raw = difference(start, clips);
  const kept = raw.filter((poly) => polyArea(poly) >= minIsland && (net === undefined || isLive(poly, sc, net, thermal ? gap : 0)));
  return { start, box, clearance: c, obstacles, fill: kept };
}

/**
 * Region a zone of another net with clearance c must keep out of: the higher
 * zone's fill grown by c. Approximated (conservatively) as its start region
 * grown by c minus its obstacles shrunk by c, restricted to the components that
 * hold surviving fill.
 */
function avoidRegion(ctx: Ctx, id: string, hz: ZoneFill, c: number): PMulti {
  const key = `${id}:${c}`;
  const cached = ctx.avoid.get(key);
  if (cached) return cached;
  const grown = inflateMulti(hz.start, c, CHORD);
  const shrunk: Geom[] = [];
  for (const s of hz.obstacles) {
    const p = shapePoly(s, hz.clearance - c, false);
    if (p) shrunk.push(p);
  }
  const region = difference(grown, shrunk).filter((comp) => hz.fill.some((f) => pointInPolygon(f[0][0][0], f[0][0][1], comp)));
  ctx.avoid.set(key, region);
  return region;
}

/** Island touches copper of the zone net and is more than spokes inside a relief gap. */
function isLive(poly: PPolygon, sc: SideCopper, net: string, relief: number): boolean {
  const pb = ringBox(poly[0]);
  const mine = sc.copper.filter((cu) => cu.net === net && boxesTouch(cu.box, pb, EPS));
  if (!mine.some((cu) => touches(poly, cu))) return false;
  const pads = mine.filter((cu) => cu.pad);
  if (!pads.length) return true;
  const tol = 3 * CHORD + 1e-6;
  return poly[0].some(([x, y]) => !pads.some((cu) => pointGap({ x, y }, cu.shape) <= relief + tol));
}

function touches(poly: PPolygon, cu: Copper): boolean {
  const s = cu.shape;
  if (pointInPolygon(s.pts[0].x, s.pts[0].y, poly)) return true;
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.max(a[0], b[0]) < cu.box.x1 || Math.min(a[0], b[0]) > cu.box.x2) continue;
      if (Math.max(a[1], b[1]) < cu.box.y1 || Math.min(a[1], b[1]) > cu.box.y2) continue;
      if (polygonDistance(ptsOf([a, b]), s.pts) <= s.r + EPS) return true;
    }
  }
  return false;
}

function toOutput(mp: PMulti): MultiPolygon {
  return mp.map((poly) =>
    poly.map((ring) => {
      const n = ring.length;
      const closed = n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
      return ptsOf(closed ? ring.slice(0, -1) : ring);
    }),
  );
}

