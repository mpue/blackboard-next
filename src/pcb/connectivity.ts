// Copper connectivity of a PCB: which pads, tracks, vias and zone fills touch,
// the nets that result from it, the ratsnest of missing connections and the
// net under a point. Pads define nets; tracks, vias and zones only inherit.

import type { CopperSide, Doc, FootprintItem } from '../model/types.ts';
import type { Pt, Rect } from '../geometry/geom.ts';
import { copperShapeBounds, copperSideOfLayer, padShapeWorld, padSides, pointGap, shapeGap, trackShape, viaShape, type CopperShape } from './geometry.ts';
import { gapMidpoint, indexPolygon, pointInPoly, polyGap, rectsOverlap, shapeCentroid, shapeTouchesPoly, sweepPairs, type PolyIndex } from './spatial.ts';

/** zone id -> MultiPolygon (polygons of [outerRing, ...holeRings]) */
export type ZoneFills = Map<string, Pt[][][]>;

const TOUCH = 1e-6;

export interface CopperObject {
  /** `${itemId}` for tracks/vias/zones, `${itemId}:${padIndex}` for pads; further fill polygons of a zone: `${itemId}#${n}` */
  key: string;
  kind: 'pad' | 'track' | 'via' | 'zone';
  itemId: string;
  padIndex?: number;
  /** undefined for zones (use fill polygons) */
  shape?: CopperShape;
  sides: CopperSide[];
  /** declared net: pad -> footprint.nets[pad.num], track/via/zone -> item.net */
  net?: string;
  /** zones: one fill polygon, [outerRing, ...holeRings]; a zone without fill has none */
  fill?: Pt[][];
}

export function copperObjects(doc: Doc, zoneFills?: ZoneFills): CopperObject[] {
  const out: CopperObject[] = [];
  for (const it of doc.items) {
    switch (it.kind) {
      case 'footprint':
        it.footprint.pads.forEach((pad, i) => {
          const sides = padSides(it, pad);
          if (!sides.length || pad.w <= 0 || pad.h <= 0) return;
          out.push({ key: `${it.id}:${i}`, kind: 'pad', itemId: it.id, padIndex: i, shape: padShapeWorld(it, pad), sides, net: it.nets[pad.num] || undefined });
        });
        break;
      case 'track': {
        const side = copperSideOfLayer(doc, it.layer);
        if (side) out.push({ key: it.id, kind: 'track', itemId: it.id, shape: trackShape(it), sides: [side], net: it.net || undefined });
        break;
      }
      case 'via':
        out.push({ key: it.id, kind: 'via', itemId: it.id, shape: viaShape(it), sides: ['top', 'bottom'], net: it.net || undefined });
        break;
      case 'zone': {
        const side = copperSideOfLayer(doc, it.layer);
        if (!side) break;
        const polys = (zoneFills?.get(it.id) ?? []).filter((p) => p.length && p[0].length >= 3);
        const base = { kind: 'zone' as const, itemId: it.id, sides: [side], net: it.net || undefined };
        if (!polys.length) out.push({ key: it.id, ...base });
        polys.forEach((fill, n) => out.push({ key: n ? `${it.id}#${n}` : it.id, ...base, fill }));
        break;
      }
    }
  }
  return out;
}

export interface PcbConnectivity {
  objects: CopperObject[];
  /** island id per object index (objects touching on a common side are one island) */
  island: number[];
  /** nets of the pads in each island (pads define nets; tracks only inherit); every island has an entry */
  islandNets: Map<number, Set<string>>;
  /** net per item id for tracks/vias/zones, derived: the single pad net of its island, else its declared net */
  netOfItem: Map<string, string>;
  /** object index pairs that touch (a spanning forest of the islands) */
  contacts: [number, number][];
  /** world bounds per object (zones: fill bounds, empty zones: undefined) */
  bounds: (Rect | undefined)[];
  /** indexed fill polygon per zone object */
  fills: (PolyIndex | undefined)[];
}

const shareSide = (a: CopperObject, b: CopperObject) => a.sides.some((s) => b.sides.includes(s));

export function computePcbConnectivity(doc: Doc, zoneFills?: ZoneFills): PcbConnectivity {
  const objects = copperObjects(doc, zoneFills);
  const n = objects.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const contacts: [number, number][] = [];
  const link = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    parent[a] = b;
    contacts.push([i, j]);
  };

  // pads with equal numbers in one footprint are one conductor
  const fps = new Map<string, FootprintItem>();
  for (const it of doc.items) if (it.kind === 'footprint') fps.set(it.id, it);
  const padNum = new Map<string, number>();
  objects.forEach((o, i) => {
    if (o.kind !== 'pad') return;
    const k = `${o.itemId}\u0000${fps.get(o.itemId)!.footprint.pads[o.padIndex!].num}`;
    const first = padNum.get(k);
    if (first === undefined) padNum.set(k, i);
    else link(first, i);
  });

  const fills = objects.map((o) => (o.fill ? indexPolygon(o.fill) : undefined));
  const bounds = objects.map((o, i) => (o.shape ? copperShapeBounds(o.shape) : fills[i]?.bounds));

  // pads, tracks and vias
  const solid: number[] = [];
  objects.forEach((o, i) => o.shape && solid.push(i));
  sweepPairs(solid.map((i) => bounds[i]!), TOUCH, (p, q) => {
    const i = solid[p];
    const j = solid[q];
    const a = objects[i];
    const b = objects[j];
    if (find(i) === find(j) || !shareSide(a, b)) return;
    if (shapeGap(a.shape!, b.shape!) <= TOUCH) link(i, j);
  });

  // zone fills against everything else on their side
  const zones = objects.flatMap((_, i) => (fills[i] ? [i] : []));
  for (const z of zones) {
    const zo = objects[z];
    const fill = fills[z]!;
    for (const i of solid) {
      const o = objects[i];
      if (!o.sides.includes(zo.sides[0]) || !rectsOverlap(bounds[i]!, fill.bounds, TOUCH) || find(i) === find(z)) continue;
      if (shapeTouchesPoly(fill, o.shape!, bounds[i]!, TOUCH)) link(i, z);
    }
  }
  for (let p = 0; p < zones.length; p++) {
    for (let q = p + 1; q < zones.length; q++) {
      const a = zones[p];
      const b = zones[q];
      if (objects[a].sides[0] !== objects[b].sides[0] || find(a) === find(b)) continue;
      if (polyGap(fills[a]!, fills[b]!, TOUCH)) link(a, b);
    }
  }

  const island: number[] = new Array(n);
  const ids = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let id = ids.get(r);
    if (id === undefined) ids.set(r, (id = ids.size));
    island[i] = id;
  }
  const islandNets = new Map<number, Set<string>>();
  for (let k = 0; k < ids.size; k++) islandNets.set(k, new Set());
  objects.forEach((o, i) => o.kind === 'pad' && o.net && islandNets.get(island[i])!.add(o.net));

  const derived = new Map<string, Set<string>>();
  const declared = new Map<string, string>();
  objects.forEach((o, i) => {
    if (o.kind === 'pad') return;
    if (o.net) declared.set(o.itemId, o.net);
    let set = derived.get(o.itemId);
    if (!set) derived.set(o.itemId, (set = new Set()));
    const nets = islandNets.get(island[i])!;
    if (nets.size === 1) set.add([...nets][0]);
  });
  const netOfItem = new Map<string, string>();
  for (const [id, set] of derived) {
    const net = set.size === 1 ? [...set][0] : declared.get(id);
    if (net) netOfItem.set(id, net);
  }
  return { objects, island, islandNets, netOfItem, contacts, bounds, fills };
}

// ---- ratsnest -----------------------------------------------------------------------------

export interface RatsLine {
  net: string;
  a: Pt;
  b: Pt;
}

/** net -> islands holding pads of that net (ascending) */
function netIslands(conn: PcbConnectivity): Map<string, number[]> {
  const sets = new Map<string, Set<number>>();
  conn.objects.forEach((o, i) => {
    if (o.kind !== 'pad' || !o.net) return;
    let s = sets.get(o.net);
    if (!s) sets.set(o.net, (s = new Set()));
    s.add(conn.island[i]);
  });
  const out = new Map<string, number[]>();
  for (const net of [...sets.keys()].sort()) out.set(net, [...sets.get(net)!].sort((a, b) => a - b));
  return out;
}

/** Points a ratsnest line may end on: pad centres, track ends and via centres. */
function islandAnchors(conn: PcbConnectivity): Map<number, Pt[]> {
  const out = new Map<number, Pt[]>();
  conn.objects.forEach((o, i) => {
    if (!o.shape) return;
    const pts = o.kind === 'pad' ? [shapeCentroid(o.shape)] : o.shape.pts;
    const list = out.get(conn.island[i]);
    if (list) list.push(...pts);
    else out.set(conn.island[i], [...pts]);
  });
  return out;
}

/** Per net a minimum spanning tree between the islands holding its pads (Prim). */
export function ratsnest(doc: Doc, conn: PcbConnectivity = computePcbConnectivity(doc)): RatsLine[] {
  const lines: RatsLine[] = [];
  const anchors = islandAnchors(conn);
  for (const [net, isl] of netIslands(conn)) {
    const m = isl.length;
    if (m < 2) continue;
    const pts = isl.map((k) => anchors.get(k) ?? []);
    const done = new Uint8Array(m);
    const best = new Float64Array(m).fill(Infinity);
    const from: (Pt | undefined)[] = new Array(m);
    const to: (Pt | undefined)[] = new Array(m);
    let cur = 0;
    for (let step = 1; step < m; step++) {
      done[cur] = 1;
      for (let j = 0; j < m; j++) {
        if (done[j]) continue;
        for (const p of pts[cur]) {
          for (const q of pts[j]) {
            const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
            if (d < best[j]) {
              best[j] = d;
              from[j] = p;
              to[j] = q;
            }
          }
        }
      }
      let next = -1;
      for (let j = 0; j < m; j++) if (!done[j] && (next < 0 || best[j] < best[next])) next = j;
      if (from[next] && to[next]) lines.push({ net, a: from[next]!, b: to[next]! });
      cur = next;
    }
  }
  return lines;
}

/** Nets whose pads are not all connected; missing = number of connections still to route. */
export function unroutedNets(doc: Doc, conn: PcbConnectivity = computePcbConnectivity(doc)): { net: string; missing: number }[] {
  const out: { net: string; missing: number }[] = [];
  for (const [net, isl] of netIslands(conn)) if (isl.length > 1) out.push({ net, missing: isl.length - 1 });
  return out;
}

// ---- picking ----------------------------------------------------------------------------------

const PICK_ORDER = { pad: 0, via: 1, track: 2, zone: 3 } as const;

/** Net of the copper under a point: pads first, then vias, tracks and zone fills (topmost first). */
export function netAt(doc: Doc, p: Pt, side?: CopperSide, conn: PcbConnectivity = computePcbConnectivity(doc)): string | undefined {
  let best: { rank: number; net: string } | undefined;
  for (let i = conn.objects.length - 1; i >= 0; i--) {
    const o = conn.objects[i];
    if (side && !o.sides.includes(side)) continue;
    const rank = PICK_ORDER[o.kind];
    if (best && best.rank <= rank) continue;
    const b = conn.bounds[i];
    if (!b || p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
    const hit = o.shape ? pointGap(p, o.shape) <= TOUCH : pointInPoly(conn.fills[i]!, p);
    if (!hit) continue;
    const net = o.kind === 'pad' ? o.net : conn.netOfItem.get(o.itemId);
    if (net) best = { rank, net };
  }
  return best?.net;
}

/** Marker where two touching objects meet. */
export function contactPoint(conn: PcbConnectivity, i: number, j: number): Pt {
  const a = conn.objects[i];
  const b = conn.objects[j];
  if (a.shape && b.shape) return gapMidpoint(a.shape, b.shape);
  if (a.shape || b.shape) {
    const s = (a.shape ?? b.shape)!;
    const z = conn.fills[a.shape ? j : i]!;
    return shapeTouchesPoly(z, s, copperShapeBounds(s), TOUCH) ?? shapeCentroid(s);
  }
  return polyGap(conn.fills[i]!, conn.fills[j]!, TOUCH)?.at ?? conn.fills[i]!.rings[0][0];
}
