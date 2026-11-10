// Design rule check: clearance, shorts, unrouted nets, track widths, drills,
// annular rings, board edge, courtyard overlaps and dangling copper.

import type { DesignRules, Doc, FootprintItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { copperShapeBounds, footprintToWorld, polygonDistance, shapeGap, type CopperShape } from './geometry.ts';
import { defaultRules } from './defaults.ts';
import { computePcbConnectivity, contactPoint, ratsnest, unroutedNets, type PcbConnectivity, type ZoneFills } from './connectivity.ts';
import { gapMidpoint, polyGap, shapeCentroid, sweepPairs } from './spatial.ts';
import { customOutline, insidePolygon, nearestOutlinePoint } from './outline.ts';

export type DrcKind =
  | 'clearance'
  | 'short'
  | 'unrouted'
  | 'trackWidth'
  | 'drill'
  | 'annularRing'
  | 'edgeClearance'
  | 'outsideBoard'
  | 'courtyardOverlap'
  | 'unconnectedItem';

export interface DrcViolation {
  /** stable: kind + sorted item keys */
  id: string;
  kind: DrcKind;
  severity: 'error' | 'warning';
  /** marker position (board units) */
  at: Pt;
  /** item ids involved */
  items: string[];
  nets?: string[];
  /** measured and required value in board units where meaningful */
  actual?: number;
  required?: number;
}

const EPS = 1e-6;
/** zone fills are polygon approximations made by the filler */
const FILL_EPS = 1e-3;

export function runDrc(doc: Doc, opts: { zoneFills?: ZoneFills; rules?: DesignRules } = {}): DrcViolation[] {
  const rules = opts.rules ?? doc.pcb?.rules ?? defaultRules();
  const conn = computePcbConnectivity(doc, opts.zoneFills);
  const { objects } = conn;
  const out: DrcViolation[] = [];
  const add = (v: Omit<DrcViolation, 'id' | 'items'>, keys: string[], itemIds: string[]) =>
    out.push({ id: `${v.kind}:${[...new Set(keys)].sort().join('+')}`, ...v, items: [...new Set(itemIds)] });
  const netOf = (i: number) => (objects[i].kind === 'pad' ? objects[i].net : conn.netOfItem.get(objects[i].itemId));

  // clearance between pads, tracks and vias that are not connected
  const solid: number[] = [];
  objects.forEach((o, i) => o.shape && solid.push(i));
  sweepPairs(solid.map((i) => conn.bounds[i]!), rules.clearance, (p, q) => {
    const i = Math.min(solid[p], solid[q]);
    const j = Math.max(solid[p], solid[q]);
    const a = objects[i];
    const b = objects[j];
    if (conn.island[i] === conn.island[j] || !a.sides.some((s) => b.sides.includes(s))) return;
    const na = netOf(i);
    const nb = netOf(j);
    if (na && na === nb) return;
    const gap = shapeGap(a.shape!, b.shape!);
    if (gap >= rules.clearance - EPS) return;
    add(
      { kind: 'clearance', severity: 'error', at: gapMidpoint(a.shape!, b.shape!), nets: netList(na, nb), actual: Math.max(0, gap), required: rules.clearance },
      [a.key, b.key],
      [a.itemId, b.itemId],
    );
  });

  // zone fills against zone fills of other nets
  const zones = objects.flatMap((_, i) => (conn.fills[i] ? [i] : []));
  for (let p = 0; p < zones.length; p++) {
    for (let q = p + 1; q < zones.length; q++) {
      const a = objects[zones[p]];
      const b = objects[zones[q]];
      if (a.sides[0] !== b.sides[0] || a.itemId === b.itemId || a.net === b.net) continue;
      const g = polyGap(conn.fills[zones[p]]!, conn.fills[zones[q]]!, rules.clearance);
      if (!g || g.gap >= rules.clearance - FILL_EPS) continue;
      add({ kind: 'clearance', severity: 'error', at: g.at, nets: netList(a.net, b.net), actual: g.gap, required: rules.clearance }, [a.key, b.key], [a.itemId, b.itemId]);
    }
  }

  shorts(conn, add);

  // unrouted nets
  const rats = ratsnest(doc, conn);
  const netPads = new Map<string, typeof objects>();
  for (const o of objects) if (o.kind === 'pad' && o.net) (netPads.get(o.net) ?? netPads.set(o.net, []).get(o.net)!).push(o);
  for (const { net } of unroutedNets(doc, conn)) {
    const pads = netPads.get(net)!;
    let at = shapeCentroid(pads[0].shape!);
    let best = Infinity;
    for (const l of rats) {
      const d = Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y);
      if (l.net === net && d < best) {
        best = d;
        at = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
      }
    }
    add({ kind: 'unrouted', severity: 'warning', at, nets: [net] }, pads.map((o) => o.key), pads.map((o) => o.itemId));
  }

  // per item rules
  const footprints: FootprintItem[] = [];
  const onCopper = new Set(objects.map((o) => o.itemId));
  for (const it of doc.items) {
    if (it.kind === 'track' && onCopper.has(it.id) && it.width < rules.minTrackWidth - EPS) {
      add({ kind: 'trackWidth', severity: 'error', at: { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 }, nets: netList(conn.netOfItem.get(it.id)), actual: it.width, required: rules.minTrackWidth }, [it.id], [it.id]);
    } else if (it.kind === 'via') {
      const at = { x: it.x, y: it.y };
      if (it.drill < rules.minDrill - EPS) add({ kind: 'drill', severity: 'error', at, actual: it.drill, required: rules.minDrill }, [it.id], [it.id]);
      const ring = (it.diameter - it.drill) / 2;
      if (ring < rules.minAnnularRing - EPS) add({ kind: 'annularRing', severity: 'error', at, actual: ring, required: rules.minAnnularRing }, [it.id], [it.id]);
    } else if (it.kind === 'footprint') {
      footprints.push(it);
      it.footprint.pads.forEach((pad, i) => {
        if (!pad.drill) return;
        const key = `${it.id}:${i}`;
        const at = footprintToWorld(it, pad);
        if (pad.drill < rules.minDrill - EPS) add({ kind: 'drill', severity: 'error', at, actual: pad.drill, required: rules.minDrill }, [key], [it.id]);
        const ring = (Math.min(pad.w, pad.h) - pad.drill) / 2;
        if (!pad.npth && ring < rules.minAnnularRing - EPS) add({ kind: 'annularRing', severity: 'error', at, actual: ring, required: rules.minAnnularRing }, [key], [it.id]);
      });
    }
  }

  // board edge
  const custom = customOutline(doc);
  if (custom) customEdgeChecks(custom);
  else rectEdgeChecks();

  function customEdgeChecks(poly: Pt[]) {
    const edges = poly.map((p, i) => [poly[(i + poly.length - 1) % poly.length], p]);
    const edgeGap = (pts: Pt[]) => Math.min(...edges.map((e) => polygonDistance(pts, e)));
    objects.forEach((o, i) => {
      if (o.shape) {
        const c = shapeCentroid(o.shape);
        const inside = insidePolygon(c, poly);
        const gap = edgeGap(o.shape.pts) - o.shape.r;
        if (!inside && gap > EPS) {
          add({ kind: 'outsideBoard', severity: 'error', at: c, nets: netList(netOf(i)) }, [o.key], [o.itemId]);
          return;
        }
        if (!inside || gap < rules.edgeClearance - EPS) {
          add({ kind: 'edgeClearance', severity: 'error', at: nearestOutlinePoint(c, poly), nets: netList(netOf(i)), actual: inside ? Math.max(0, gap) : 0, required: rules.edgeClearance }, [o.key], [o.itemId]);
        }
      } else if (o.fill) {
        const ring = o.fill[0];
        const out = ring.some((p) => !insidePolygon(p, poly));
        const gap = Math.min(...ring.map((p) => edgeGap([p])));
        if (out || gap < rules.edgeClearance - FILL_EPS) {
          add({ kind: 'edgeClearance', severity: 'error', at: nearestOutlinePoint(ring[0], poly), nets: netList(o.net), actual: out ? 0 : Math.max(0, gap), required: rules.edgeClearance }, [o.key], [o.itemId]);
        }
      }
    });
  }

  function rectEdgeChecks() {
    const board = boardOutline(doc);
    const boardShape: CopperShape = {
      pts: [
        { x: board.r, y: board.r },
        { x: doc.width - board.r, y: board.r },
        { x: doc.width - board.r, y: doc.height - board.r },
        { x: board.r, y: doc.height - board.r },
      ],
      r: board.r,
    };
    objects.forEach((o, i) => {
      if (o.shape) {
        const d = polygonDistance(o.shape.pts, boardShape.pts);
        if (d > 0 && d - o.shape.r - boardShape.r >= -EPS) {
          add({ kind: 'outsideBoard', severity: 'error', at: shapeCentroid(o.shape), nets: netList(netOf(i)) }, [o.key], [o.itemId]);
          return;
        }
        const e = edgeDistance(board, o.shape.pts, o.shape.r);
        if (e.dist < rules.edgeClearance - EPS) {
          add({ kind: 'edgeClearance', severity: 'error', at: e.at, nets: netList(netOf(i)), actual: Math.max(0, e.dist), required: rules.edgeClearance }, [o.key], [o.itemId]);
        }
      } else if (o.fill) {
        const e = edgeDistance(board, o.fill[0], 0);
        if (e.dist < rules.edgeClearance - FILL_EPS) {
          add({ kind: 'edgeClearance', severity: 'error', at: e.at, nets: netList(o.net), actual: Math.max(0, e.dist), required: rules.edgeClearance }, [o.key], [o.itemId]);
        }
      }
    });
  }

  // courtyards
  const yards = footprints.map((fp) => courtyard(fp));
  const withYard = yards.flatMap((y, i) => (y ? [i] : []));
  sweepPairs(withYard.map((i) => copperShapeBounds({ pts: yards[i]!, r: 0 })), 0, (p, q) => {
    const i = withYard[Math.min(p, q)];
    const j = withYard[Math.max(p, q)];
    const a = footprints[i];
    const b = footprints[j];
    if (a.side !== b.side) return;
    const pa = yards[i]!;
    const pb = yards[j]!;
    if (penetration(pa, pb) <= EPS) return;
    const ra = copperShapeBounds({ pts: pa, r: 0 });
    const rb = copperShapeBounds({ pts: pb, r: 0 });
    const x1 = Math.max(ra.x, rb.x), x2 = Math.min(ra.x + ra.w, rb.x + rb.w);
    const y1 = Math.max(ra.y, rb.y), y2 = Math.min(ra.y + ra.h, rb.y + rb.h);
    add({ kind: 'courtyardOverlap', severity: 'warning', at: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } }, [a.id, b.id], [a.id, b.id]);
  });

  // dangling tracks and vias
  const hasPad = new Set<number>();
  objects.forEach((o, i) => o.kind === 'pad' && hasPad.add(conn.island[i]));
  objects.forEach((o, i) => {
    if ((o.kind !== 'track' && o.kind !== 'via') || hasPad.has(conn.island[i])) return;
    add({ kind: 'unconnectedItem', severity: 'warning', at: shapeCentroid(o.shape!), nets: netList(o.net) }, [o.key], [o.itemId]);
  });

  return out;
}

function netList(...nets: (string | undefined)[]): string[] | undefined {
  const list = [...new Set(nets.filter((n): n is string => !!n))];
  return list.length ? list : undefined;
}

/** One violation per island that joins pads of several nets, marked where two nets meet. */
function shorts(conn: PcbConnectivity, add: (v: Omit<DrcViolation, 'id' | 'items'>, keys: string[], items: string[]) => void): void {
  const { objects, island, islandNets, contacts } = conn;
  const bad = new Set<number>();
  for (const [k, nets] of islandNets) if (nets.size > 1) bad.add(k);
  if (!bad.size) return;

  // seed with pad nets and with declared nets that are pad nets of the island
  const label: (string | undefined)[] = objects.map((o, i) => {
    if (!bad.has(island[i]) || !o.net) return undefined;
    return o.kind === 'pad' || islandNets.get(island[i])!.has(o.net) ? o.net : undefined;
  });
  const conflict = new Map<number, [number, number]>();
  for (const [i, j] of contacts) {
    if (bad.has(island[i]) && !conflict.has(island[i]) && label[i] && label[j] && label[i] !== label[j]) conflict.set(island[i], [i, j]);
  }
  const adj = new Map<number, number[]>();
  for (const [i, j] of contacts) {
    if (!bad.has(island[i])) continue;
    (adj.get(i) ?? adj.set(i, []).get(i)!).push(j);
    (adj.get(j) ?? adj.set(j, []).get(j)!).push(i);
  }
  const queue = objects.flatMap((_, i) => (label[i] ? [i] : []));
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    for (const j of adj.get(i) ?? []) {
      if (!label[j]) {
        label[j] = label[i];
        queue.push(j);
      } else if (label[j] !== label[i] && !conflict.has(island[i])) conflict.set(island[i], [i, j]);
    }
  }
  const members = new Map<number, number[]>();
  objects.forEach((_, i) => bad.has(island[i]) && (members.get(island[i]) ?? members.set(island[i], []).get(island[i])!).push(i));
  for (const k of [...bad].sort((a, b) => a - b)) {
    const pair = conflict.get(k);
    const list = members.get(k)!;
    const [i, j] = pair ?? [list[0], list[0]];
    const at = pair ? contactPoint(conn, i, j) : objects[i].shape ? shapeCentroid(objects[i].shape!) : objects[i].fill![0][0];
    const others = list.filter((m) => objects[m].kind === 'pad' && m !== i && m !== j).map((m) => objects[m].itemId);
    add({ kind: 'short', severity: 'error', at, nets: [...islandNets.get(k)!].sort() }, [objects[i].key, objects[j].key], [objects[i].itemId, objects[j].itemId, ...others]);
  }
}

// ---- board edge -------------------------------------------------------------------------------

interface Board {
  w: number;
  h: number;
  r: number;
}

function boardOutline(doc: Doc): Board {
  const r = Math.max(0, Math.min(doc.pcb?.cornerRadius ?? 0, doc.width / 2, doc.height / 2));
  return { w: doc.width, h: doc.height, r };
}

/** Signed distance to the (rounded) board rectangle, negative inside. */
function boardSdf(b: Board, p: Pt): number {
  const qx = Math.abs(p.x - b.w / 2) - (b.w / 2 - b.r);
  const qy = Math.abs(p.y - b.h / 2) - (b.h / 2 - b.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b.r;
}

function nearestEdgePoint(b: Board, p: Pt): Pt {
  const cx = Math.max(b.r, Math.min(b.w - b.r, p.x));
  const cy = Math.max(b.r, Math.min(b.h - b.r, p.y));
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d = Math.hypot(dx, dy);
  if (d > 1e-12) return { x: cx + (dx / d) * b.r, y: cy + (dy / d) * b.r };
  const cand = [
    { d: p.x, q: { x: 0, y: p.y } },
    { d: b.w - p.x, q: { x: b.w, y: p.y } },
    { d: p.y, q: { x: p.x, y: 0 } },
    { d: b.h - p.y, q: { x: p.x, y: b.h } },
  ];
  return cand.reduce((m, c) => (c.d < m.d ? c : m)).q;
}

/**
 * Distance from copper (convex hull of pts inflated by r, or a fill outline) to the
 * board edge. The inner distance of a convex board is concave, so the minimum is at a vertex.
 */
function edgeDistance(b: Board, pts: Pt[], r: number): { dist: number; at: Pt } {
  let worst = pts[0];
  let sd = -Infinity;
  for (const p of pts) {
    const s = boardSdf(b, p);
    if (s > sd) {
      sd = s;
      worst = p;
    }
  }
  const e = nearestEdgePoint(b, worst);
  const dx = e.x - worst.x;
  const dy = e.y - worst.y;
  const d = Math.hypot(dx, dy) || 1;
  const sign = sd < 0 ? 1 : -1;
  const near = { x: worst.x + (sign * dx * r) / d, y: worst.y + (sign * dy * r) / d };
  return { dist: -sd - r, at: { x: (near.x + e.x) / 2, y: (near.y + e.y) / 2 } };
}

// ---- courtyards ---------------------------------------------------------------------------------

function courtyard(fp: FootprintItem): Pt[] | undefined {
  const c = fp.footprint.courtyard;
  if (!c || c.w <= 0 || c.h <= 0) return undefined;
  return [
    { x: c.x, y: c.y },
    { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h },
    { x: c.x, y: c.y + c.h },
  ].map((p) => footprintToWorld(fp, p));
}

/** Separating axis test: overlap depth of two convex polygons (<= 0 when apart or touching). */
function penetration(a: Pt[], b: Pt[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-12) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      let a1 = Infinity, a2 = -Infinity, b1 = Infinity, b2 = -Infinity;
      for (const v of a) {
        const t = v.x * nx + v.y * ny;
        a1 = Math.min(a1, t);
        a2 = Math.max(a2, t);
      }
      for (const v of b) {
        const t = v.x * nx + v.y * ny;
        b1 = Math.min(b1, t);
        b2 = Math.max(b2, t);
      }
      depth = Math.min(depth, Math.min(a2, b2) - Math.max(a1, b1));
      if (depth <= 0) return depth;
    }
  }
  return depth;
}
