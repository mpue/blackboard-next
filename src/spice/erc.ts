// Electrical rule check for schematics: open pins, duplicate designators,
// missing or unreadable values, missing ground and parts that will not map to
// a footprint.

import type { Doc, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey } from './connectivity.ts';
import { isGround, spiceValue } from './netlist.ts';
import { instrumentOf } from './instruments.ts';
import { symbolToWorld, itemBounds, type Pt } from '../geometry/geom.ts';
import { extractPcbNetlist } from '../pcb/fromSchematic.ts';
import { footprintById } from '../pcb/footprints/index.ts';
import { globalNetKey } from './labels.ts';

export type ErcKind = 'unconnectedPin' | 'duplicateRef' | 'noValue' | 'noGround' | 'noFootprint' | 'pinMismatch';

export interface ErcViolation {
  id: string;
  kind: ErcKind;
  severity: 'error' | 'warning';
  at: Pt;
  items: string[];
  ref?: string;
  pin?: string;
  value?: string;
}

const POWER = /^(gnd|agnd|dgnd|masse|vcc|vdd|vss|vee|vbat|v\+|v-|[+-]?\d+([.,]\d+)?v\d*)$/i;

/** Symbols that are components (not ground/supply marks, not instruments, not drawings). */
function isComponent(s: SymbolItem): boolean {
  return s.pins.length > 0 && !isGround(s) && !instrumentOf(s) && !globalNetKey(s) && !(s.pins.length === 1 && POWER.test(s.name.trim()));
}

export function runErc(doc: Doc): ErcViolation[] {
  const out: ErcViolation[] = [];
  const conn = computeConnectivity(doc);
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const center = (s: SymbolItem): Pt => {
    const r = itemBounds(s, () => undefined);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  for (const s of symbols) {
    if (!isComponent(s)) continue;
    s.pins.forEach((p, i) => {
      const n = conn.netOfPin.get(pinKey(s.id, i));
      const net = n === undefined ? undefined : conn.nets[n];
      if (net && (net.pins.length > 1 || net.wires.length > 0)) return;
      out.push({ id: `pin:${s.id}:${i}`, kind: 'unconnectedPin', severity: 'warning', at: symbolToWorld(s, p), items: [s.id], ref: s.name, pin: p.name || String(p.num) });
    });
    if ((s.spiceType === 'RESISTOR' || s.spiceType === 'CAPACITOR' || s.spiceType === 'INDUCTOR') && !spiceValue(s.value, s.spiceType === 'RESISTOR' ? 'R' : s.spiceType === 'CAPACITOR' ? 'C' : 'L')) {
      out.push({ id: `value:${s.id}`, kind: 'noValue', severity: 'error', at: center(s), items: [s.id], ref: s.name, value: s.value });
    }
  }

  const byRef = new Map<string, SymbolItem[]>();
  for (const s of symbols) if (isComponent(s)) byRef.set(s.name.trim().toUpperCase(), [...(byRef.get(s.name.trim().toUpperCase()) ?? []), s]);
  for (const [ref, list] of byRef) {
    if (list.length < 2) continue;
    // units of one package (LM324.A/.B) share their designator on purpose
    if (new Set(list.map((s) => s.symbolName.replace(/[.\s-]?[A-D]$/i, ''))).size === 1 && list.every((s) => /[.\s-]?[A-D]$/i.test(s.symbolName))) continue;
    for (const s of list.slice(1)) out.push({ id: `dup:${s.id}`, kind: 'duplicateRef', severity: 'error', at: center(s), items: list.map((x) => x.id), ref });
  }

  const devices = symbols.filter((s) => s.spiceType && !instrumentOf(s));
  if (devices.length && !symbols.some(isGround)) out.push({ id: 'noGround', kind: 'noGround', severity: 'warning', at: center(devices[0]), items: [] });

  // parts that will not make it onto a PCB as drawn
  const byName = new Map(symbols.map((s) => [s.name, s]));
  for (const w of extractPcbNetlist(doc, footprintById).warnings) {
    if (w.key !== 'noFootprint' && w.key !== 'pinMismatch') continue;
    const s = byName.get(w.ref);
    if (!s) continue;
    out.push({ id: `${w.key}:${s.id}`, kind: w.key, severity: 'warning', at: center(s), items: [s.id], ref: w.ref, value: w.footprintId });
  }
  return out;
}
