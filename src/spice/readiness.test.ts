import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Item, SymbolDef, SymbolItem } from '../model/types.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { itemPins } from '../geometry/geom.ts';
import { LABEL_DEFS } from './labels.ts';
import { buildNetlist, supplyVolts } from './netlist.ts';
import { checkSimulation, guessType, suggestValue } from './readiness.ts';

const lib: SymbolDef[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8'));
const byFile = (f: string) => lib.find((s) => s.filename === f)!;

let n = 0;
const place = (def: SymbolDef, x: number, y: number, name: string, patch: Partial<SymbolItem> = {}): SymbolItem => ({ ...symbolItemFromDef(def, x, y, 'top', name), ...patch });
const pin = (s: SymbolItem, i: number) => itemPins(s, () => undefined)[i];
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
const schematic = (items: Item[]): Doc => ({
  width: 800,
  height: 600,
  type: 'SCHEMATICS',
  layers: [{ id: 'top', name: 'Top', visible: true, locked: false, opacity: 1, color: '#000' }],
  items,
  parts: {},
});

/** +5V -> R1 -> LED -> GND, the classic first circuit */
function ledCircuit(resistorValue: string, supply = '+5V') {
  const vcc = place(LABEL_DEFS.find((d) => d.name === supply) ?? LABEL_DEFS[1], 0, 0, supply, { value: supply });
  const r = place(byFile('elektor-R2.xml'), 100, 100, 'R1', { value: resistorValue });
  const led = place(lib.find((s) => s.spiceType === 'DIODE' && /led/i.test(s.name))!, 300, 100, 'D1');
  const gnd = place(byFile('GND.xml'), 500, 300, 'GND');
  const ledPins = itemPins(led, () => undefined);
  const anode = ledPins.find((p) => p.pin.name === 'A')!;
  const cathode = ledPins.find((p) => p.pin.name === 'K')!;
  return schematic([vcc, r, led, gnd, wire(pin(vcc, 0), pin(r, 0)), wire(pin(r, 1), anode), wire(cathode, pin(gnd, 0))]);
}

describe('simulation check', () => {
  it('suggests SPICE values for catalogue entries', () => {
    expect(suggestValue('1..470u', 'C')).toBe('1u');
    expect(suggestValue('4,7..100p', 'C')).toBe('4.7p');
    expect(suggestValue('C220nF', 'C')).toBe('220n');
    expect(suggestValue('', 'R')).toBe('1k');
    expect(suggestValue('Widerstand', 'R')).toBe('1k');
  });

  it('reads rail voltages from supply names', () => {
    expect(supplyVolts('+5V')).toBe(5);
    expect(supplyVolts('+3V3')).toBe(3.3);
    expect(supplyVolts('-12V')).toBe(-12);
    expect(supplyVolts('9 V')).toBe(9);
    expect(supplyVolts('VCC')).toBeUndefined();
  });

  it('lets supply symbols drive their rail', () => {
    const net = buildNetlist(ledCircuit('330'), 'led');
    expect(net.netlist).toMatch(/^VSUPPLY1 \d+ 0 DC 5$/m);
    expect(net.supplies).toEqual([expect.objectContaining({ volts: 5, assumed: false })]);
  });

  it('flags a missing resistor value with a suggestion, and nothing once it is set', () => {
    const bad = checkSimulation(ledCircuit('')).issues;
    expect(bad).toEqual([expect.objectContaining({ kind: 'badValue', severity: 'error', ref: 'R1', suggestion: '1k' })]);
    expect(checkSimulation(ledCircuit('330')).issues).toEqual([]);
  });

  it('assumes 5 V for a supply without voltage and says so', () => {
    const { issues } = checkSimulation(ledCircuit('330', 'VCC'));
    expect(issues).toEqual([expect.objectContaining({ kind: 'supplyAssumed', volts: 5 })]);
  });

  it('reports missing ground and source of a lone resistor', () => {
    const r = place(byFile('elektor-R2.xml'), 100, 100, 'R1', { value: '1k' });
    const kinds = checkSimulation(schematic([r])).issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['noGround', 'noSource', 'unconnected']));
  });

  it('names drawing-only symbols and guesses what they are', () => {
    const drawing = place(byFile('elektor-R2.xml'), 100, 100, 'R7', { spiceType: undefined });
    expect(guessType(drawing)).toBe('RESISTOR');
    const { issues } = checkSimulation(schematic([drawing]));
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'notSimulated', ref: 'R7', guess: 'RESISTOR' })]));
  });
});

describe('analysis setup, error explanations and node names', async () => {
  const { analysisDirective, defaultSetup, niceTime, hasAcSource } = await import('./analysisSetup.ts');
  const { explainSpiceError } = await import('./explain.ts');
  const { nodeNames, vectorName } = await import('./nodeNames.ts');

  it('writes the analysis from plain settings', () => {
    expect(analysisDirective({ kind: 'tran', duration: 0.01, from: 10, to: 1e5 })).toBe('.tran 0.00001 0.01');
    expect(analysisDirective({ kind: 'ac', duration: 0.01, from: 10, to: 1e5 })).toBe('.ac dec 50 10 100000');
    expect(analysisDirective({ kind: 'op', duration: 0.01, from: 10, to: 1e5 })).toBe('.op');
    expect(analysisDirective({ kind: 'schematic', duration: 0.01, from: 10, to: 1e5 })).toBeUndefined();
    expect(niceTime(0.0042)).toBe(0.005);
    expect(defaultSetup(ledCircuit('330'))).toMatchObject({ kind: 'tran', duration: 0.01 });
  });

  it('explains ngspice errors and names the parts', () => {
    const doc = ledCircuit('330');
    const net = buildNetlist(doc, 'led');
    const r1 = doc.items.find((i) => i.kind === 'symbol' && i.name === 'R1')!;
    expect(explainSpiceError('Error: singular matrix:  check node 2 (r1)', net, doc)).toEqual({ kind: 'floating', parts: [{ id: r1.id, ref: 'R1' }] });
    expect(explainSpiceError('doAnalyses: TRAN:  Timestep too small').kind).toBe('timestep');
    expect(explainSpiceError('Error: unknown subckt: x1 1 2 ne556')).toMatchObject({ kind: 'subckt' });
    expect(explainSpiceError('something odd').kind).toBe('unknown');
    expect(hasAcSource(net.netlist)).toBe(false);
  });

  it('names nodes after labels and the parts on them', () => {
    const doc = ledCircuit('330');
    const net = buildNetlist(doc, 'led');
    const names = nodeNames(doc, net);
    expect([...names.values()].sort()).toEqual(['+5V', 'R1·D1']);
    const supplyNode = net.supplies[0].node;
    expect(vectorName(`v(${supplyNode})`, names, net, doc)).toBe('+5V');
    expect(vectorName('v(999)', names, net, doc)).toBeUndefined();
  });

  it(
    'simulates the first LED circuit at its operating point',
    async () => {
      const doc = ledCircuit('330');
      const net = buildNetlist(doc, 'led', [], { analysis: '.op' });
      const { Simulation } = await import('eecircuit-engine');
      const sim = new Simulation();
      await sim.start();
      sim.setNetList(net.netlist);
      const res = await sim.runSim();
      const r1 = net.elements.find((e) => e.name.toUpperCase() === 'R1')!;
      const nodes = r1.pins.map((p) => p.node);
      const v = (node: string) => (node === '0' ? 0 : (res.data.find((d) => d.name === `v(${node})`)!.values as number[])[0]);
      const current = (v(nodes[0]) - v(nodes[1])) / 330;
      // (5 V - ~1.9 V LED) / 330 Ω ≈ 9.4 mA
      expect(current).toBeGreaterThan(0.008);
      expect(current).toBeLessThan(0.011);
    },
    120_000,
  );
});
