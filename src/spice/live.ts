// Live values: the DC operating point of a schematic projected back onto the
// drawing. Every net gets its voltage, every device pin the current flowing
// into it, and the wires carry the currents between the pins (Kirchhoff's
// current law on the wire graph of each net), so the editor can colour wires
// by voltage and animate the current flow.

import type { Doc, LineItem, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey, type Connectivity } from './connectivity.ts';
import { buildNetlist, type NetlistResult } from './netlist.ts';
import { distToSegment, itemPins, type Pt } from '../geometry/geom.ts';
import { partLookup } from '../model/ops.ts';
import type { SpiceModel } from '../model/types.ts';

export interface FlowSegment {
  /** current flows from a to b */
  a: Pt;
  b: Pt;
  /** amperes, >= 0 */
  i: number;
  net: number;
}

export interface LiveValues {
  /** volts per connectivity net index */
  netVoltage: Map<number, number>;
  /** current into the device at `${symbolId}:${pinIndex}` (A) */
  pinCurrent: Map<string, number>;
  /** current through two terminal devices (into pin 1) and sources */
  deviceCurrent: Map<string, number>;
  segments: FlowSegment[];
  minV: number;
  maxV: number;
  maxI: number;
}

/** Device current vectors ngspice has to keep for the operating point. */
function saves(nl: NetlistResult): string[] {
  const out: string[] = [];
  for (const e of nl.elements) {
    const n = e.name.toLowerCase();
    switch (e.type) {
      case 'RESISTOR':
      case 'CAPACITOR':
      case 'INDUCTOR':
        out.push(`@${n}[i]`);
        break;
      case 'DIODE':
        out.push(`@${n}[id]`);
        break;
      case 'NPN':
      case 'PNP':
        out.push(`@${n}[ic]`, `@${n}[ib]`);
        break;
      case 'MOSFET':
        out.push(`@${n}[id]`);
        break;
    }
  }
  return out;
}

/** Netlist for the operating point analysis, with the device currents saved. */
export function opNetlist(doc: Doc, title: string, models: SpiceModel[]): NetlistResult {
  const nl = buildNetlist(doc, title, models, { analysis: '.op' });
  const extra = saves(nl);
  if (extra.length) {
    const save: string[] = [];
    for (let i = 0; i < extra.length; i += 8) save.push(`.save all ${extra.slice(i, i + 8).join(' ')}`);
    nl.netlist = nl.netlist.replace(/^\.op\s*$/m, `${save.join('\n')}\n.op`);
  }
  return nl;
}

/**
 * Turns the ngspice vectors of an operating point (name -> value, names as
 * ngspice prints them: "v(3)", "i(v1)", "i(@r1[i])") into live values.
 */
export function liveValues(doc: Doc, nl: NetlistResult, vectors: Map<string, number>, conn: Connectivity = computeConnectivity(doc)): LiveValues {
  const v = (node: string) => (node === '0' ? 0 : (vectors.get(`v(${node})`) ?? vectors.get(node) ?? NaN));
  const vec = (name: string) => vectors.get(name.toLowerCase()) ?? vectors.get(`i(${name.toLowerCase()})`);

  const netVoltage = new Map<number, number>();
  for (const [net, node] of nl.nodeOfNet) {
    const volts = v(node);
    if (Number.isFinite(volts)) netVoltage.set(net, volts);
  }

  const pinCurrent = new Map<string, number>();
  const deviceCurrent = new Map<string, number>();
  // potentiometers are two resistors sharing the wiper pin: currents add up
  const set = (symbolId: string, pin: number | undefined, i: number | undefined) => {
    if (pin === undefined || i === undefined || !Number.isFinite(i)) return;
    const k = pinKey(symbolId, pin);
    pinCurrent.set(k, (pinCurrent.get(k) ?? 0) + i);
  };
  for (const e of nl.elements) {
    const pins = e.pins.map((p) => p.index);
    const n = e.name.toLowerCase();
    switch (e.type) {
      case 'RESISTOR':
      case 'CAPACITOR':
      case 'INDUCTOR':
      case 'DIODE': {
        const i = vec(`@${n}[${e.type === 'DIODE' ? 'id' : 'i'}]`) ?? (e.type === 'CAPACITOR' ? 0 : undefined);
        if (i === undefined) break;
        set(e.symbolId, pins[0], i);
        set(e.symbolId, pins[1], -i);
        if (!deviceCurrent.has(e.symbolId)) deviceCurrent.set(e.symbolId, i);
        break;
      }
      case 'VOLTAGE_SOURCE': {
        // SPICE: positive branch current flows into the + terminal
        const i = vec(`i(${n})`) ?? vec(`${n}#branch`);
        if (i === undefined) break;
        set(e.symbolId, pins[0], i);
        set(e.symbolId, pins[1], -i);
        deviceCurrent.set(e.symbolId, -i);
        break;
      }
      case 'NPN':
      case 'PNP': {
        const ic = vec(`@${n}[ic]`);
        const ib = vec(`@${n}[ib]`);
        if (ic === undefined || ib === undefined) break;
        set(e.symbolId, pins[0], ic);
        set(e.symbolId, pins[1], ib);
        set(e.symbolId, pins[2], -(ic + ib));
        deviceCurrent.set(e.symbolId, ic);
        break;
      }
      case 'MOSFET': {
        const id = vec(`@${n}[id]`);
        if (id === undefined) break;
        set(e.symbolId, pins[0], id);
        set(e.symbolId, pins[1], 0);
        set(e.symbolId, pins[2], -id);
        deviceCurrent.set(e.symbolId, id);
        break;
      }
    }
  }

  const segments = wireCurrents(doc, conn, pinCurrent);
  const volts = [...netVoltage.values()];
  return {
    netVoltage,
    pinCurrent,
    deviceCurrent,
    segments,
    minV: Math.min(0, ...volts),
    maxV: Math.max(0, ...volts),
    maxI: Math.max(0, ...segments.map((s) => s.i)),
  };
}

const WIRE_TOL = 4;
const PIN_TOL = 3;

/**
 * Currents along the wires of every net. The wires of a net are split at
 * junctions and pins into a graph; device pins inject (minus) their current.
 * On a spanning tree the edge currents follow from the injections; edges
 * closing a loop carry nothing (exact for the tree shaped nets of schematics).
 */
export function wireCurrents(doc: Doc, conn: Connectivity, pinCurrent: Map<string, number>): FlowSegment[] {
  const byId = new Map(doc.items.map((i) => [i.id, i]));
  const lookup = partLookup(doc);
  const out: FlowSegment[] = [];

  conn.nets.forEach((net, netIndex) => {
    const wires = net.wires.map((id) => byId.get(id)).filter((w): w is LineItem => w?.kind === 'line');
    if (!wires.length) return;
    // device pins of this net with a known current
    const pins: { p: Pt; inj: number }[] = [];
    for (const wp of net.pins) {
      const it = byId.get(wp.itemId);
      if (!it || it.kind !== 'symbol') continue;
      const index = (it as SymbolItem).pins.indexOf(wp.pin);
      const i = pinCurrent.get(pinKey(it.id, index >= 0 ? index : itemPins(it, lookup).findIndex((q) => q.x === wp.x && q.y === wp.y)));
      if (i !== undefined) pins.push({ p: wp, inj: -i });
    }

    // split points along every wire
    const nodes: Pt[] = [];
    const nodeAt = (p: Pt): number => {
      const k = nodes.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= WIRE_TOL);
      if (k >= 0) return k;
      nodes.push({ x: p.x, y: p.y });
      return nodes.length - 1;
    };
    const ends = wires.flatMap((w) => [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ]);
    const edges: [number, number][] = [];
    for (const w of wires) {
      const a = { x: w.x1, y: w.y1 };
      const b = { x: w.x2, y: w.y2 };
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const ts = new Set([0, 1]);
      for (const p of [...ends, ...pins.map((q) => q.p)]) {
        if (distToSegment(p, a, b) > WIRE_TOL) continue;
        ts.add(Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)));
      }
      const sorted = [...ts].sort((x, y) => x - y);
      for (let k = 1; k < sorted.length; k++) {
        const p = { x: a.x + (b.x - a.x) * sorted[k - 1], y: a.y + (b.y - a.y) * sorted[k - 1] };
        const q = { x: a.x + (b.x - a.x) * sorted[k], y: a.y + (b.y - a.y) * sorted[k] };
        const i = nodeAt(p);
        const j = nodeAt(q);
        if (i !== j) edges.push([i, j]);
      }
    }
    const inj = new Float64Array(nodes.length);
    for (const { p, inj: c } of pins) {
      let best = -1;
      let bestD = PIN_TOL + WIRE_TOL;
      nodes.forEach((q, k) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      if (best >= 0) inj[best] += c;
    }

    // spanning forest by BFS, then accumulate injections from the leaves
    const adj: { to: number; edge: number }[][] = nodes.map(() => []);
    edges.forEach(([i, j], e) => {
      adj[i].push({ to: j, edge: e });
      adj[j].push({ to: i, edge: e });
    });
    const parent = new Int32Array(nodes.length).fill(-2);
    const order: number[] = [];
    for (let root = 0; root < nodes.length; root++) {
      if (parent[root] !== -2) continue;
      parent[root] = -1;
      const queue = [root];
      while (queue.length) {
        const n = queue.shift()!;
        order.push(n);
        for (const { to } of adj[n]) {
          if (parent[to] !== -2) continue;
          parent[to] = n;
          queue.push(to);
        }
      }
    }
    const sub = Float64Array.from(inj);
    for (let k = order.length - 1; k >= 0; k--) {
      const n = order[k];
      const p = parent[n];
      if (p < 0) continue;
      sub[p] += sub[n];
      // sub[n] flows out of the subtree of n towards its parent
      const i = sub[n];
      if (Math.abs(i) < 1e-12) {
        out.push({ a: nodes[n], b: nodes[p], i: 0, net: netIndex });
        continue;
      }
      out.push(i > 0 ? { a: nodes[n], b: nodes[p], i, net: netIndex } : { a: nodes[p], b: nodes[n], i: -i, net: netIndex });
    }
  });
  return out;
}
