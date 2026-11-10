// Electrical connectivity of a document: wires, pins of parts/symbols and the
// copper stripes of stripboards are merged into nets with a union-find.

import type { Doc, Item, LineItem } from '../model/types.ts';
import { RASTER } from '../model/types.ts';
import { distToSegment, itemBounds, itemPins, type Pt, type WorldPin } from '../geometry/geom.ts';
import { partLookup } from '../model/ops.ts';
import { globalNetKey } from './labels.ts';

const WIRE_TOL = 4;
const PIN_TOL = 3;

class UnionFind {
  private parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(a: number): number {
    while (this.parent[a] !== a) {
      this.parent[a] = this.parent[this.parent[a]];
      a = this.parent[a];
    }
    return a;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

export interface Net {
  /** wire ids belonging to the net */
  wires: string[];
  pins: WorldPin[];
}

export interface Connectivity {
  nets: Net[];
  netOfWire: Map<string, number>;
  /** key `${itemId}:${pinIndex}` */
  netOfPin: Map<string, number>;
}

const pinKey = (itemId: string, index: number) => `${itemId}:${index}`;

function isBreak(it: Item, doc: Doc): boolean {
  if (it.kind !== 'part') return false;
  return /^breaks?\.xml$/i.test(it.ref) || /^break/i.test(doc.parts[it.ref]?.name ?? '');
}

export function computeConnectivity(doc: Doc, opts: { visibleOnly?: boolean } = {}): Connectivity {
  const visible = new Set(doc.layers.filter((l) => l.visible || !opts.visibleOnly).map((l) => l.id));
  const items = doc.items.filter((i) => visible.has(i.layer));
  const lookup = partLookup(doc);
  const uf = new UnionFind();

  const wires = items.filter((i): i is LineItem => i.kind === 'line' && !(i.x1 === i.x2 && i.y1 === i.y2));
  const wireNode = wires.map(() => uf.add());

  const pins: { pin: WorldPin; node: number; key: string }[] = [];
  for (const it of items) {
    if (isBreak(it, doc)) continue;
    itemPins(it, lookup).forEach((p, idx) => pins.push({ pin: p, node: uf.add(), key: pinKey(it.id, idx) }));
  }

  const a = (w: LineItem): Pt => ({ x: w.x1, y: w.y1 });
  const b = (w: LineItem): Pt => ({ x: w.x2, y: w.y2 });

  // wire <-> wire: an end point touching the other segment (T junctions included)
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const w1 = wires[i];
      const w2 = wires[j];
      if (
        distToSegment(a(w2), a(w1), b(w1)) <= WIRE_TOL ||
        distToSegment(b(w2), a(w1), b(w1)) <= WIRE_TOL ||
        distToSegment(a(w1), a(w2), b(w2)) <= WIRE_TOL ||
        distToSegment(b(w1), a(w2), b(w2)) <= WIRE_TOL
      ) {
        uf.union(wireNode[i], wireNode[j]);
      }
    }
  }
  // pin <-> wire
  for (const p of pins) {
    wires.forEach((w, i) => {
      if (distToSegment(p.pin, a(w), b(w)) <= PIN_TOL) uf.union(p.node, wireNode[i]);
    });
  }
  // pin <-> pin (parts plugged directly into each other)
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      if (pins[i].pin.itemId === pins[j].pin.itemId) continue;
      if (Math.hypot(pins[i].pin.x - pins[j].pin.x, pins[i].pin.y - pins[j].pin.y) <= PIN_TOL) uf.union(pins[i].node, pins[j].node);
    }
  }
  // net labels and supply/ground symbols of the same name are one net without a wire
  const globalNode = new Map<string, number>();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const p of pins) {
    const it = byId.get(p.pin.itemId);
    const key = it?.kind === 'symbol' ? globalNetKey(it) : undefined;
    if (!key) continue;
    const first = globalNode.get(key);
    if (first === undefined) globalNode.set(key, p.node);
    else uf.union(first, p.node);
  }
  // copper stripes connect everything in a row, interrupted by breaks
  if (doc.type === 'STRIPES') {
    const breaks = items.filter((i) => isBreak(i, doc)).map((i) => {
      const r = itemBounds(i, lookup);
      return { x: Math.round((r.x + r.w / 2) / RASTER) * RASTER, y: Math.round((r.y + r.h / 2) / RASTER) * RASTER };
    });
    const rows = new Map<number, { x: number; node: number }[]>();
    const onHole = (p: Pt) => Math.abs(p.y - Math.round(p.y / RASTER) * RASTER) < 3 && Math.abs(p.x - Math.round(p.x / RASTER) * RASTER) < 3;
    const addPoint = (p: Pt, node: number) => {
      if (!onHole(p)) return;
      const y = Math.round(p.y / RASTER) * RASTER;
      const row = rows.get(y) ?? [];
      row.push({ x: Math.round(p.x / RASTER) * RASTER, node });
      rows.set(y, row);
    };
    for (const p of pins) addPoint(p.pin, p.node);
    wires.forEach((w, i) => {
      addPoint(a(w), wireNode[i]);
      addPoint(b(w), wireNode[i]);
    });
    for (const [y, row] of rows) {
      const cuts = breaks.filter((br) => br.y === y).map((br) => br.x);
      row.sort((p, q) => p.x - q.x);
      for (let i = 1; i < row.length; i++) {
        const prev = row[i - 1];
        const cur = row[i];
        if (cuts.some((c) => c >= prev.x && c <= cur.x)) continue;
        uf.union(prev.node, cur.node);
      }
    }
  }

  const byRoot = new Map<number, Net>();
  const netOf = (node: number) => {
    const r = uf.find(node);
    let n = byRoot.get(r);
    if (!n) {
      n = { wires: [], pins: [] };
      byRoot.set(r, n);
    }
    return n;
  };
  wires.forEach((w, i) => netOf(wireNode[i]).wires.push(w.id));
  for (const p of pins) netOf(p.node).pins.push(p.pin);

  const nets = [...byRoot.values()];
  const index = new Map(nets.map((n, i) => [n, i]));
  const netOfWire = new Map<string, number>();
  const netOfPin = new Map<string, number>();
  wires.forEach((w, i) => netOfWire.set(w.id, index.get(netOf(wireNode[i]))!));
  for (const p of pins) netOfPin.set(p.key, index.get(netOf(p.node))!);
  return { nets, netOfWire, netOfPin };
}

/** Net touching a world point (wire or pin), used by the connection check tool. */
export function netAt(doc: Doc, p: Pt, tol: number): Net | undefined {
  const c = computeConnectivity(doc, { visibleOnly: true });
  const lookup = partLookup(doc);
  for (const it of [...doc.items].reverse()) {
    if (it.kind === 'line' && distToSegment(p, { x: it.x1, y: it.y1 }, { x: it.x2, y: it.y2 }) <= it.thickness / 2 + tol) {
      const n = c.netOfWire.get(it.id);
      if (n !== undefined) return c.nets[n];
    }
    const pins = itemPins(it, lookup);
    for (let i = 0; i < pins.length; i++) {
      if (Math.hypot(pins[i].x - p.x, pins[i].y - p.y) <= tol + 3) {
        const n = c.netOfPin.get(pinKey(it.id, i));
        if (n !== undefined) return c.nets[n];
      }
    }
  }
  return undefined;
}

export { pinKey };
