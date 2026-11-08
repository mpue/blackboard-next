import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Item, SymbolDef, SymbolItem } from '../model/types.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { itemPins } from '../geometry/geom.ts';
import { buildNetlist } from './netlist.ts';
import { INSTRUMENT_DEFS, benchAnalysis, dmmReading, scopeView, type SimData } from './instruments.ts';

const symbols: SymbolDef[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8'));
const resistorDef = symbols.find((s) => s.spiceType === 'RESISTOR' && s.pins.length === 2)!;
const capacitorDef = symbols.find((s) => s.spiceType === 'CAPACITOR' && s.pins.length === 2 && s.name === 'Capacitor')!;

let n = 0;
function place(def: SymbolDef, x: number, y: number, name: string, props?: Record<string, string>): SymbolItem {
  const s = symbolItemFromDef(def, x, y, 'top', name);
  if (props) s.properties = { ...s.properties, ...props };
  return s;
}
const pinAt = (s: SymbolItem, num: number) => itemPins(s, () => undefined).find((p) => p.pin.num === num)!;
const wire = (a: { x: number; y: number }, b: { x: number; y: number }): Item => ({
  id: `w${n++}`,
  kind: 'line',
  layer: 'top',
  x1: a.x,
  y1: a.y,
  x2: b.x,
  y2: b.y,
  color: '#00f',
  thickness: 2,
  startType: 'STRAIGHT',
  endType: 'STRAIGHT',
});

/** generator -> R -> C -> COM, scope on input and output, DMM across C */
function rcBench(dmmProps: Record<string, string>, fgenProps: Record<string, string> = {}): { doc: Doc; scope: SymbolItem; dmm: SymbolItem } {
  const fg = place(INSTRUMENT_DEFS.fgen, 0, 0, 'FG1', { acAmplitude: '2', frequency: '1000', ...fgenProps });
  const r = place(resistorDef, 300, 0, 'R1');
  r.value = '1k';
  const c = place(capacitorDef, 600, 0, 'C1');
  c.value = '100n';
  const scope = place(INSTRUMENT_DEFS.scope, 300, 300, 'OSC1', { timeDiv: '0.0005' });
  const dmm = place(INSTRUMENT_DEFS.dmm, 800, 300, 'DMM1', dmmProps);
  const out = pinAt(fg, 1);
  const com = pinAt(fg, 2);
  const items: Item[] = [fg, r, c, scope, dmm];
  items.push(wire(out, pinAt(r, 1)), wire(pinAt(r, 2), pinAt(c, 1)), wire(pinAt(c, 2), com));
  items.push(wire(pinAt(scope, 1), out), wire(pinAt(scope, 2), pinAt(c, 1)), wire(pinAt(scope, 3), com));
  if (dmmProps.dmmMode?.startsWith('A')) {
    // ammeter in series between C and COM instead of the direct wire
    items.splice(7, 1);
    items.push(wire(pinAt(c, 2), pinAt(dmm, 1)), wire(pinAt(dmm, 2), com));
  } else {
    items.push(wire(pinAt(dmm, 1), pinAt(c, 1)), wire(pinAt(dmm, 2), com));
  }
  const doc: Doc = {
    width: 1200,
    height: 600,
    type: 'SCHEMATICS',
    layers: [{ id: 'top', name: 'Top', visible: true, locked: false, opacity: 1, color: '#000' }],
    items,
    parts: {},
  };
  return { doc, scope, dmm };
}

async function run(doc: Doc) {
  const analysis = benchAnalysis(doc, true);
  const net = buildNetlist(doc, 'bench', [], { analysis: analysis.directive });
  const { Simulation } = await import('eecircuit-engine');
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(net.netlist);
  const r = await sim.runSim();
  expect(sim.getError().filter((e) => e.trim() && !/^warning/i.test(e))).toEqual([]);
  const data: SimData = { time: r.data[0].values as number[], vectors: new Map(r.data.slice(1).map((d) => [d.name, d.values as number[]])) };
  return { net, analysis, data };
}

describe('bench instruments', () => {
  it('earths the generator and probes the scope and voltmeter nodes', () => {
    const { doc } = rcBench({ dmmMode: 'VAC' });
    const net = buildNetlist(doc, 'bench', [], { analysis: '.tran 1u 1m' });
    expect(net.errors).toEqual([]);
    expect(net.netlist).toMatch(/^VFG1 \d+ 0 DC 0 AC 1 SIN\(0 2 1000 0 0 0\)$/m);
    expect(net.netlist).not.toMatch(/^\.tran 10u 10m/m);
    expect(Object.values(net.probes.nodes)).toHaveLength(2);
  });

  it(
    'measures an RC low pass with the oscilloscope and the voltmeter',
    async () => {
      const { doc, scope, dmm } = rcBench({ dmmMode: 'VAC' });
      const { net, analysis, data } = await run(doc);
      const view = scopeView(data, net.probes, scope, analysis);
      expect(view.triggered).toBe(true);
      const [ch1, ch2] = view.channels;
      expect(ch1!.stats.freq).toBeCloseTo(1000, -1);
      expect(ch1!.stats.acRms).toBeCloseTo(2 / Math.SQRT2, 1);
      // |H| = 1 / sqrt(1 + (f/fc)^2) with fc = 1/(2 pi R C) = 1592 Hz
      const expected = (2 / Math.SQRT2) / Math.sqrt(1 + (1000 / 1591.55) ** 2);
      expect(ch2!.stats.acRms).toBeCloseTo(expected, 1);
      const reading = dmmReading(data, net.probes, dmm, analysis);
      expect(reading.unit).toBe('V');
      expect(reading.value!).toBeCloseTo(expected, 1);
    },
    120_000,
  );

  it(
    'measures current in series as an ammeter',
    async () => {
      // 5 V DC through 1 kOhm: the capacitor blocks, so use a square wave and read the DC average instead
      const { doc, dmm } = rcBench({ dmmMode: 'AAC' }, { acAmplitude: '1', frequency: '1000' });
      const { net, analysis, data } = await run(doc);
      expect(net.probes.currents[dmm.id]).toBe('i(vdmm1)');
      const reading = dmmReading(data, net.probes, dmm, analysis);
      expect(reading.unit).toBe('A');
      // I = U / |Z|, |Z| = sqrt(R^2 + Xc^2), Xc = 1/(2 pi f C) = 1591.5 Ohm
      const expected = (1 / Math.SQRT2) / Math.hypot(1000, 1591.55);
      expect(reading.value! / expected).toBeGreaterThan(0.95);
      expect(reading.value! / expected).toBeLessThan(1.05);
    },
    120_000,
  );
});

describe('bench demo', () => {
  it(
    'is wired so that every probe is connected and the low pass attenuates',
    async () => {
      const { buildBenchDemo } = await import('./benchDemo.ts');
      const doc = buildBenchDemo(symbols, 'en');
      const scope = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'OSC1')!;
      const dmm = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'DMM1')!;
      const { net, analysis, data } = await run(doc);
      expect(net.errors).toEqual([]);
      expect(net.warnings).toEqual([]);
      expect(Object.keys(net.probes.nodes[scope.id])).toEqual(['1', '2', '3']);
      expect(net.probes.nodes[scope.id][3]).toBe('0');
      const view = scopeView(data, net.probes, scope, analysis);
      const [ch1, ch2] = view.channels;
      expect(ch1!.stats.acRms).toBeCloseTo(2 / Math.SQRT2, 1);
      expect(ch2!.stats.acRms / ch1!.stats.acRms).toBeCloseTo(1 / Math.sqrt(1 + (1000 / 1591.55) ** 2), 1);
      expect(dmmReading(data, net.probes, dmm, analysis).value).toBeCloseTo(ch2!.stats.acRms, 1);
    },
    120_000,
  );
});
