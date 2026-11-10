import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, Item, SymbolDef, SymbolItem } from '../model/types.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { itemPins } from '../geometry/geom.ts';
import { LABEL_DEFS } from '../spice/labels.ts';
import { buildNetlist } from '../spice/netlist.ts';
import { averageOperatingPoints, opNetlist } from '../spice/live.ts';
import { checkSimulation } from '../spice/readiness.ts';
import { ATMEGA328P_SYMBOL } from '../spice/builtinSymbols.ts';
import { readInputs } from './coupling.ts';
import { Atmega328p } from './atmega328p.ts';
import { parseHex } from './hex.ts';
import { exampleHex } from './examples.ts';
import { buildMcuDemo } from './mcuDemo.ts';
import type { Drives } from './pinout.ts';

const lib: SymbolDef[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8'));
const byFile = (f: string) => lib.find((s) => s.filename === f)!;

let n = 0;
const place = (def: SymbolDef, x: number, y: number, name: string, patch: Partial<SymbolItem> = {}): SymbolItem => ({ ...symbolItemFromDef(def, x, y, 'top', name), ...patch });
const pin = (s: SymbolItem, num: number) => itemPins(s, () => undefined).find((p) => p.pin.num === num)!;
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
  width: 2000,
  height: 1200,
  type: 'SCHEMATICS',
  layers: [{ id: 'top', name: 'Top', visible: true, locked: false, opacity: 1, color: '#000' }],
  items,
  parts: {},
});

/** +5V on VCC, GND on pin 8, D13 -> 220 Ω -> LED -> GND */
function blinkCircuit(opts: { power?: boolean; firmware?: string } = {}) {
  const u1 = place(ATMEGA328P_SYMBOL, 400, 100, 'U1', opts.firmware ? { properties: { ...ATMEGA328P_SYMBOL.properties, firmware: opts.firmware } } : {});
  const vcc = place(LABEL_DEFS.find((d) => d.name === '+5V')!, 0, 0, '+5V', { value: '+5V' });
  const gnd = place(byFile('GND.xml'), 900, 900, 'GND');
  const gnd2 = place(byFile('GND.xml'), 300, 900, 'GND');
  const r = place(byFile('elektor-R2.xml'), 700, 300, 'R1', { value: '220' });
  const led = place(lib.find((s) => s.spiceType === 'DIODE' && /led/i.test(s.name))!, 900, 300, 'D1');
  const anode = itemPins(led, () => undefined).find((p) => p.pin.name === 'A')!;
  const cathode = itemPins(led, () => undefined).find((p) => p.pin.name === 'K')!;
  const items: Item[] = [u1, gnd, gnd2, r, led, wire(pin(u1, 19), pin(r, 1)), wire(pin(r, 2), anode), wire(cathode, pin(gnd, 1))];
  if (opts.power !== false) items.push(vcc, wire(pin(vcc, 1), pin(u1, 7)), wire(pin(u1, 8), pin(gnd2, 1)));
  return { doc: schematic(items), u1 };
}

async function op(netlist: string) {
  const { Simulation } = await import('eecircuit-engine');
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(netlist);
  const res = await sim.runSim();
  return new Map(res.data.map((d) => [d.name.toLowerCase(), Number((d.values as number[])[0])]));
}

describe('microcontroller in the netlist', () => {
  it('draws supply current, and drives its pins only while running', () => {
    const { doc, u1 } = blinkCircuit();
    const idle = buildNetlist(doc, 't');
    expect(idle.netlist).toMatch(/^RU1_VCC \d+ 0 1000$/m);
    expect(idle.netlist).not.toMatch(/RU1_P19/);
    expect(idle.mcus[0].nodes[19]).toBeDefined();

    const high = buildNetlist(doc, 't', [], { mcu: new Map<string, Drives>([[u1.id, { 19: 'H', 4: 'PU', 2: 'Z' }]]) });
    const vccNode = high.mcus[0].nodes[7];
    expect(high.netlist).toMatch(new RegExp(`^RU1_P19H ${high.mcus[0].nodes[19]} ${vccNode} 25$`, 'm'));
    // unconnected pins (D2, D0) stay out of the netlist
    expect(high.netlist).not.toMatch(/RU1_P4|RU1_P2/);

    const pwm = buildNetlist(doc, 't', [], { mcu: new Map<string, Drives>([[u1.id, { 19: 0.25 }]]) });
    expect(pwm.netlist).toMatch(new RegExp(`^EU1_P19 \\d+ 0 ${vccNode} 0 0.25$`, 'm'));
  });

  it('checks firmware and supply, and does not call the chip a drawing', () => {
    const kinds = (doc: Doc) => checkSimulation(doc).issues.map((i) => i.kind);
    expect(kinds(blinkCircuit().doc)).toEqual(expect.arrayContaining(['mcuFirmware', 'mcuLiveOnly']));
    expect(kinds(blinkCircuit().doc)).not.toContain('notSimulated');
    expect(kinds(blinkCircuit({ power: false }).doc)).toContain('mcuPower');
    expect(kinds(blinkCircuit({ firmware: ':00000001FF' }).doc)).not.toContain('mcuFirmware');
  });

  it('reads levels with hysteresis and the analog inputs', () => {
    const m = { symbolId: 'u', ref: 'U1', nodes: { 7: '1', 8: '0', 4: '2', 5: '3', 23: '4' } as Record<number, string> };
    const v = new Map([
      ['v(1)', 5],
      ['v(2)', 0.4],
      ['v(3)', 2.2],
      ['v(4)', 1.7],
    ]);
    const a = readInputs(m, v, { 5: true }, { 6: 'PU' });
    expect(a.vcc).toBe(5);
    expect(a.avcc).toBe(5);
    expect(a.digital[4]).toBe(false);
    // between 1.5 V and 3 V: keeps the previous level
    expect(a.digital[5]).toBe(true);
    expect(readInputs(m, v, { 5: false }).digital[5]).toBe(false);
    // unconnected pin with pull-up reads high
    expect(a.digital[6]).toBe(true);
    expect(a.analog[0]).toBeCloseTo(1.7);
  });

  it(
    'lights the LED on a high pin (real ngspice)',
    async () => {
      const { doc, u1 } = blinkCircuit();
      const nl = opNetlist(doc, 't', [], new Map([[u1.id, { 19: 'H' }]]));
      const v = await op(nl.netlist);
      const r1 = nl.elements.find((e) => e.name === 'R1')!;
      const i = Math.abs((v.get(`v(${r1.pins[0].node})`)! - v.get(`v(${r1.pins[1].node})`)!) / 220);
      // (5 V - ~1.9 V) / (220 Ω + 25 Ω driver)
      expect(i).toBeGreaterThan(0.011);
      expect(i).toBeLessThan(0.014);
      expect(readInputs(nl.mcus[0], v).vcc).toBeCloseTo(5, 2);
    },
    120_000,
  );

  it(
    'averages PWM over high and low, so a LED at 25 % carries a quarter of its current',
    async () => {
      const { doc, u1 } = blinkCircuit();
      const runs = [];
      for (const [d, weight] of [
        ['H', 0.25],
        ['L', 0.75],
      ] as const) {
        const nl = opNetlist(doc, 't', [], new Map([[u1.id, { 19: d }]]));
        runs.push({ nl, weight, vectors: await op(nl.netlist) });
      }
      const id = (v: Map<string, number>) => v.get('@d1[id]') ?? v.get('i(@d1[id])');
      const full = id(runs[0].vectors)!;
      expect(full).toBeGreaterThan(0.01);
      const avg = averageOperatingPoints(runs);
      expect(id(avg.vectors)!).toBeCloseTo(0.25 * full, 6);
      // both pin drivers are known to the live values
      expect(avg.nl.elements.map((e) => e.name)).toEqual(expect.arrayContaining(['RU1_P19H', 'RU1_P19L']));
    },
    120_000,
  );
});

describe('microcontroller demo', () => {
  it('is wired completely', async () => {
    const doc = await buildMcuDemo(lib, 'de');
    const issues = checkSimulation(doc).issues;
    expect(issues.map((i) => i.kind)).toEqual(['mcuLiveOnly']);
  });

  it(
    'runs in a closed loop with the circuit: potentiometer -> ADC -> PWM, button -> faster blinking',
    async () => {
      const doc = await buildMcuDemo(lib, 'en');
      const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
      const chip = new Atmega328p(parseHex(await exampleHex('demo')).flash);
      let drives: Drives = {};
      let digital: Record<number, boolean> = {};
      const step = async (d: Doc) => {
        const nl = opNetlist(d, 't', [], new Map([[u1.id, drives]]));
        const v = await op(nl.netlist);
        const inp = readInputs(nl.mcus[0], v, digital, drives);
        digital = inp.digital;
        for (const [num, high] of Object.entries(inp.digital)) chip.setInput(Number(num), high);
        for (const [ch, volts] of Object.entries(inp.analog)) chip.setAnalog(Number(ch), volts);
        chip.setReferences(inp.avcc, inp.aref);
        chip.run(0.02 * chip.frequency);
        drives = chip.drives();
        return { inp, v, nl };
      };
      // the wiper sits in the middle: about half the supply on A0, half brightness on D9
      let r = await step(doc);
      expect(r.inp.vcc).toBeCloseTo(5, 1);
      expect(r.inp.analog[0]).toBeGreaterThan(2);
      expect(r.inp.analog[0]).toBeLessThan(3);
      r = await step(doc);
      expect(typeof drives[15]).toBe('number');
      expect(drives[15] as number).toBeGreaterThan(0.35);
      expect(drives[15] as number).toBeLessThan(0.65);
      expect(r.inp.digital[4]).toBe(true);
      // pressing S1 pulls D2 low
      const pressed: Doc = { ...doc, items: doc.items.map((i) => (i.kind === 'symbol' && i.name === 'S1' ? { ...i, properties: { ...(i.properties ?? {}), closed: 'true' } } : i)) };
      r = await step(pressed);
      expect(r.inp.digital[4]).toBe(false);
    },
    120_000,
  );
});
