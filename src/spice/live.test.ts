import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Item, LineItem, SymbolDef, SymbolItem } from '../model/types.ts';
import { symbolItemFromDef, defaultLayers } from '../io/legacy.ts';
import { symbolToWorld, type Pt } from '../geometry/geom.ts';
import { liveValues, opNetlist } from './live.ts';

const symbols = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8')) as SymbolDef[];
const def = (name: string) => symbols.find((s) => s.name === name)!;

let n = 0;
const wire = (a: Pt, b: Pt): LineItem => ({ id: `w${n++}`, kind: 'line', layer: 'L0', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#000', thickness: 2, startType: 'STRAIGHT', endType: 'STRAIGHT' });
const pin = (s: SymbolItem, num: number) => symbolToWorld(s, s.pins.find((p) => p.num === num)!);

/** 9 V battery, R1 = 1k from + to the middle node, R2 = 2k from there to ground. */
function divider(): { doc: Doc; v1: SymbolItem; r1: SymbolItem; r2: SymbolItem } {
  const v1 = symbolItemFromDef(def('Battery'), 0, 160, 'L0', 'V1');
  v1.properties = { ...v1.properties, mode: 'DC', dcVoltage: '9' };
  const r1 = symbolItemFromDef(def('R#'), 200, 0, 'L0', 'R1');
  r1.value = '1k';
  const r2 = symbolItemFromDef(def('R#'), 200, 240, 'L0', 'R2');
  r2.value = '2k';
  const gnd = symbolItemFromDef(def('GND'), 0, 480, 'L0', 'GND');
  const items: Item[] = [
    v1,
    r1,
    r2,
    gnd,
    wire(pin(v1, 1), pin(r1, 1)),
    wire(pin(r1, 2), pin(r2, 1)),
    wire(pin(r2, 2), pin(v1, 2)),
    wire(pin(v1, 2), pin(gnd, 1)),
  ];
  return { doc: { width: 800, height: 600, type: 'SCHEMATICS', layers: defaultLayers('SCHEMATICS'), items, parts: {} }, v1, r1, r2 };
}

async function runOp(netlist: string): Promise<Map<string, number>> {
  const { Simulation } = await import('eecircuit-engine');
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(netlist);
  const r = await sim.runSim();
  return new Map(r.data.map((d) => [d.name.toLowerCase(), (d.values as number[])[0]]));
}

describe('live operating point', () => {
  it('asks ngspice for the device currents', () => {
    const { doc } = divider();
    const nl = opNetlist(doc, 'divider', []);
    expect(nl.errors).toEqual([]);
    expect(nl.netlist).toMatch(/^\.save all @r1\[i\] @r2\[i\]$/m);
    expect(nl.netlist).toMatch(/^\.op$/m);
  });

  it('projects voltages and currents back onto the schematic', async () => {
    const { doc, v1, r1, r2 } = divider();
    const nl = opNetlist(doc, 'divider', []);
    const live = liveValues(doc, nl, await runOp(nl.netlist));
    const volts = [...live.netVoltage.values()].sort((a, b) => a - b);
    expect(volts[0]).toBeCloseTo(0, 6);
    expect(volts[1]).toBeCloseTo(6, 3);
    expect(volts[2]).toBeCloseTo(9, 3);
    expect(live.deviceCurrent.get(r1.id)).toBeCloseTo(0.003, 6);
    expect(live.deviceCurrent.get(r2.id)).toBeCloseTo(0.003, 6);
    // the battery delivers the current
    expect(live.deviceCurrent.get(v1.id)).toBeCloseTo(0.003, 6);
    // every wire of the loop carries 3 mA; the ground stub carries nothing
    const carrying = live.segments.filter((s) => s.i > 1e-6);
    expect(carrying.length).toBeGreaterThanOrEqual(3);
    for (const s of carrying) expect(s.i).toBeCloseTo(0.003, 6);
    expect(live.maxV).toBeCloseTo(9, 3);
  }, 60_000);

  it('lets the current flow from + through R1 to the middle node', async () => {
    const { doc, v1, r1 } = divider();
    const nl = opNetlist(doc, 'divider', []);
    const live = liveValues(doc, nl, await runOp(nl.netlist));
    const top = live.segments.find((s) => s.i > 1e-6 && (Math.hypot(s.a.x - pin(v1, 1).x, s.a.y - pin(v1, 1).y) < 1 || Math.hypot(s.b.x - pin(v1, 1).x, s.b.y - pin(v1, 1).y) < 1));
    expect(top).toBeDefined();
    // conventional current leaves the + terminal
    expect(Math.hypot(top!.a.x - pin(v1, 1).x, top!.a.y - pin(v1, 1).y)).toBeLessThan(1);
    expect(Math.hypot(top!.b.x - pin(r1, 1).x, top!.b.y - pin(r1, 1).y)).toBeLessThan(1);
  }, 60_000);
});
