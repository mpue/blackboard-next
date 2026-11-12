import { describe, expect, it } from 'vitest';
import type { Doc } from '../model/types.ts';
import { defaultLayers } from '../io/legacy.ts';
import { parseEng } from '../model/ops.ts';
import { libraryModels, librarySymbols, runNetlist } from '../learn/testing.ts';
import { TOOL_NAMES } from '../../server/assistantTools.ts';
import { allSymbols } from './circuit.ts';
import { runTool, waveStats, type Bench } from './tools.ts';

const symbols = allSymbols(librarySymbols());
const models = libraryModels();

/** The tools on a document of their own, with ngspice in node. */
function bench(start?: Doc) {
  let doc = start;
  let name = 'test.bb';
  const b: Bench = {
    doc: () => doc,
    fileName: () => name,
    edit: (fn) => {
      const d = structuredClone(doc!);
      fn(d);
      doc = d;
    },
    layer: () => doc!.layers[0].id,
    symbols: () => symbols,
    models: () => models,
    newSchematic: (n) => {
      doc = { width: 1040, height: 656, type: 'SCHEMATICS', layers: defaultLayers('SCHEMATICS'), items: [], parts: {} };
      name = `${n ?? 'schaltplan'}.bb`;
    },
    simulate: (netlist) => runNetlist(netlist),
  };
  const call = async (tool: string, input: object = {}) => {
    const r = await runTool(b, tool, input);
    if (r.isError) throw new Error(r.content);
    return JSON.parse(r.content);
  };
  const error = async (tool: string, input: object = {}) => {
    const r = await runTool(b, tool, input);
    expect(r.isError).toBe(true);
    return r.content;
  };
  return { b, call, error, doc: () => doc! };
}

/** 9 V battery, 470 Ω and a red LED to ground, built the way Claude builds it. */
async function ledCircuit() {
  const t = bench();
  await t.call('new_schematic', { name: 'led' });
  const v1 = await t.call('place_part', { symbol: 'Battery', x: 96, y: 160, pin: '+', value: '9V', properties: { mode: 'DC', dcVoltage: '9' } });
  const r1 = await t.call('place_part', { symbol: 'R#', x: 192, y: 112, value: '470' });
  const d1 = await t.call('place_part', { symbol: 'LED-rot', x: 352, y: 160, pin: 'A' });
  await t.call('connect', { from: 'V1.+', to: 'R1.1' });
  await t.call('connect', { from: 'R1.2', to: 'D1.A' });
  await t.call('add_label', { pin: 'D1.K', name: 'GND' });
  await t.call('add_label', { pin: 'V1.-', name: 'GND' });
  return { ...t, v1, r1, d1 };
}

describe('assistant tools', () => {
  it('handle every tool the server offers Claude', async () => {
    const t = bench();
    expect(await t.error('get_circuit')).toMatch(/No schematic is open/);
    for (const name of TOOL_NAMES) expect((await runTool(t.b, name, {})).content).not.toMatch(/There is no tool/);
  });

  it('find the symbols that simulate well first', async () => {
    const t = bench();
    expect((await t.call('search_symbols', { query: 'LED' }))[0].symbol).toBe('LED-rot');
    expect((await t.call('search_symbols', { query: 'resistor' }))[0].symbol).toBe('R#');
    const npn = (await t.call('search_symbols', { query: 'npn transistor' }))[0];
    expect(npn.symbol).toBe('elektor-npn');
    expect(npn.pins.map((p: { pin: string }) => p.pin)).toEqual(['1 (C)', '2 (B)', '3 (E)']);
    expect(await t.error('search_symbols', { query: 'zzzqqq' })).toMatch(/Nothing found/);
  });

  it('build, describe and simulate an LED circuit', async () => {
    const t = await ledCircuit();
    expect([t.v1.ref, t.r1.ref, t.d1.ref]).toEqual(['V1', 'R1', 'D1']);
    expect(t.r1.pins).toEqual([
      { pin: '1', x: 192, y: 112 },
      { pin: '2', x: 288, y: 112 },
    ]);
    const c = await t.call('get_circuit');
    expect(c.problems).toEqual([]);
    expect(c.parts.map((p: { ref: string }) => p.ref)).toEqual(['V1', 'R1', 'D1']);
    const gnd = c.nets.find((n: { name: string }) => n.name === 'GND');
    expect(gnd.pins.sort()).toEqual(['D1.K', 'V1.-']);
    expect(c.labels).toHaveLength(2);

    const op = await t.call('simulate', { analysis: 'op' });
    const led = op.parts.find((p: { ref: string }) => p.ref === 'D1');
    const amps = parseEng(led.current)!;
    expect(amps).toBeGreaterThan(0.012);
    expect(amps).toBeLessThan(0.017);
    expect(op.nets.GND).toBe('0V');

    const tran = await t.call('simulate', { analysis: 'tran', stop: '1m', nets: ['D1.A'] });
    expect(parseEng(tran.nets['D1.A'].average)!).toBeGreaterThan(1.5);
    expect(tran.nets['D1.A'].frequency).toBeUndefined();
  }, 60_000);

  it('never connect other nets, neither on their own route nor on a given one', async () => {
    const t = bench();
    await t.call('new_schematic');
    // three resistors in a row: the straight way from R1.1 to R3.2 runs over R2
    await t.call('place_part', { symbol: 'R#', x: 96, y: 160 });
    await t.call('place_part', { symbol: 'R#', x: 256, y: 160 });
    await t.call('place_part', { symbol: 'R#', x: 416, y: 160 });
    const before = t.doc();
    expect(await t.error('connect', { from: 'R1.2', to: 'R3.1', via: [{ x: 300, y: 160 }] })).toMatch(/would also connect R2/);
    expect(t.doc()).toBe(before);
    const ok = await t.call('connect', { from: 'R1.2', to: 'R3.1' });
    expect(ok.net_pins.sort()).toEqual(['R1.2', 'R3.1']);
    expect(ok.path.length).toBeGreaterThan(2);
    // a second time there is nothing to do
    expect((await t.call('connect', { from: 'R3.1', to: 'R1.2' })).already_connected).toBe(true);
    expect(await t.error('connect', { from: 'R1.9', to: 'R2.1' })).toMatch(/R1 has no pin "9"/);
    expect(await t.error('connect', { from: 'R7.1', to: 'R2.1' })).toMatch(/no part "R7"/);
    expect(await t.error('connect', { from: 'R1.1', to: 'R2.1', via: [{ x: 50, y: 300 }] })).toMatch(/not horizontal or vertical/);
  });

  it('move parts with their wires and delete them with the wires that led to them', async () => {
    const t = await ledCircuit();
    const moved = await t.call('update_part', { ref: 'R1', value: '1k', y: 96 });
    expect(moved.value).toBe('1k');
    expect(moved.pins[0]).toEqual({ pin: '1', x: 192, y: 96 });
    // the wires followed the pins
    expect((await t.call('get_circuit')).problems).toEqual([]);
    expect(await t.error('update_part', { ref: 'R1', new_ref: 'D1' })).toMatch(/taken/);

    const wiresBefore = t.doc().items.filter((i) => i.kind === 'line').length;
    const del = await t.call('delete', { refs: ['R1'] });
    expect(del.deleted).toEqual(['R1']);
    expect(del.dangling_wires_removed).toBeGreaterThan(0);
    const c = await t.call('get_circuit');
    expect(c.parts.map((p: { ref: string }) => p.ref)).toEqual(['V1', 'D1']);
    // the ground wires stay
    expect(c.nets.find((n: { name: string }) => n.name === 'GND').pins.sort()).toEqual(['D1.K', 'V1.-']);
    expect(t.doc().items.filter((i) => i.kind === 'line').length).toBe(wiresBefore - del.dangling_wires_removed);
  });

  it('measure waveforms', () => {
    const time = Array.from({ length: 2001 }, (_, i) => i * 1e-5);
    const s = waveStats(
      time,
      time.map((t) => 2 + Math.sin(2 * Math.PI * 1000 * t)),
    );
    expect(s.min).toBeCloseTo(1, 2);
    expect(s.max).toBeCloseTo(3, 2);
    expect(s.avg).toBeCloseTo(2, 2);
    expect(s.frequency).toBeCloseTo(1000, -1);
  });
});
