// Human readable names for SPICE vectors: "v(3)" -> "OUT" (net label) or
// "R1·C2" (the parts on that node), "i(vdmm1)" -> "I DMM1".

import type { Doc, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey } from './connectivity.ts';
import { globalNetKey, isNetLabel } from './labels.ts';
import { isGround, type NetlistResult } from './netlist.ts';

/** SPICE node -> readable name */
export function nodeNames(doc: Doc, net: NetlistResult): Map<string, string> {
  const conn = computeConnectivity(doc);
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const labels = new Map<string, string>();
  const partsOn = new Map<string, string[]>();
  for (const s of symbols) {
    s.pins.forEach((p, i) => {
      const n = conn.netOfPin.get(pinKey(s.id, i));
      const node = n === undefined ? undefined : net.nodeOfNet.get(n);
      if (node === undefined || node === '0') return;
      // net labels and supply names win
      if ((isNetLabel(s) || globalNetKey(s)?.startsWith('supply:')) && !labels.has(node)) labels.set(node, s.name);
      else if (!isGround(s) && s.pins.length > 1) {
        const ref = s.pins.length > 2 && p.name ? `${s.name}.${p.name}` : s.name;
        const list = partsOn.get(node) ?? [];
        if (!list.includes(ref)) list.push(ref);
        partsOn.set(node, list);
      }
    });
  }
  const out = new Map<string, string>();
  for (const node of new Set([...labels.keys(), ...partsOn.keys()])) {
    const label = labels.get(node);
    if (label) out.set(node, label);
    else {
      const list = partsOn.get(node)!;
      out.set(node, list.length > 3 ? `${list.slice(0, 3).join('·')}…` : list.join('·'));
    }
  }
  return out;
}

/** Readable name of an ngspice vector, or undefined to keep the raw one. */
export function vectorName(vector: string, names: Map<string, string>, net: NetlistResult, doc: Doc): string | undefined {
  const v = /^v\((\w+)\)$/i.exec(vector);
  if (v) return names.get(v[1]);
  const i = /^i\((\w+)\)$/i.exec(vector);
  if (i) {
    const sup = net.supplies.find((x) => x.element.toLowerCase() === i[1].toLowerCase());
    if (sup) return `I ${sup.name}`;
    const e = net.elements.find((x) => x.name.toLowerCase() === i[1].toLowerCase());
    const s = e && doc.items.find((it) => it.id === e.symbolId);
    if (s && s.kind === 'symbol') return `I ${s.name}`;
  }
  return undefined;
}
