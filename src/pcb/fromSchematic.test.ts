// Tests for the schematic -> PCB netlist extraction (footprint guesses, pin
// mapping, net names, annotation) on hand built schematics and the samples.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, FootprintDef, Item, Pin, SymbolDef, SymbolItem } from '../model/types.ts';
import { defaultLayers, symbolItemFromDef } from '../io/legacy.ts';
import { readBoardArchive } from '../io/bbfile.ts';
import { symbolToWorld, type Pt } from '../geometry/geom.ts';
import { uid } from '../model/id.ts';
import { INSTRUMENT_DEFS } from '../spice/instruments.ts';
import { annotate, extractPcbNetlist, guessFootprint, mapPins, netNames } from './fromSchematic.ts';

const root = join(import.meta.dirname, '..', '..');
const library: SymbolDef[] = JSON.parse(readFileSync(join(root, 'public', 'library', 'symbols.json'), 'utf8'));
const def = (name: string): SymbolDef => {
  const d = library.find((s) => s.name === name && s.pins.length);
  if (!d) throw new Error(`no library symbol ${name}`);
  return d;
};
const customDef = (name: string, pins: Pin[], extra: Partial<SymbolDef> = {}): SymbolDef => ({
  name, category: 'Misc', width: 64, height: 32, value: '', customModel: false, pins, shapes: [], ...extra,
});
const symbol = (d: SymbolDef | string, name = 'X1', patch: Partial<SymbolItem> = {}): SymbolItem => ({
  ...symbolItemFromDef(typeof d === 'string' ? def(d) : d, 0, 0, 'L0', name),
  ...patch,
});

// ---- stub footprints --------------------------------------------------------------------

function fp(id: string, pads: (string | [string, string])[]): FootprintDef {
  return {
    id, name: id, description: '', category: 'test',
    pads: pads.map((p, i) => {
      const [num, name] = typeof p === 'string' ? [p, undefined] : p;
      return { num, ...(name ? { name } : {}), x: i * 16, y: 0, shape: 'circle' as const, w: 10, h: 10, drill: 5 };
    }),
    silk: [], courtyard: { x: 0, y: 0, w: 16, h: 16 },
  };
}
const numbered = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
const FOOTPRINTS = new Map(
  [
    fp('R_Axial_P10.16mm', ['1', '2']),
    fp('C_Disc_P5.08mm', ['1', '2']),
    fp('CP_Radial_D6.3mm_P2.50mm', ['1', '2']),
    fp('TerminalBlock_1x02_P5.08mm', ['1', '2']),
    fp('PinHeader_1x02_P2.54mm', ['1', '2']),
    fp('TO-92_CBE', [['1', 'C'], ['2', 'B'], ['3', 'E']]),
    fp('TO-92_EBC', [['1', 'E'], ['2', 'B'], ['3', 'C']]),
    fp('SW_PUSH_6mm', ['1', '2', '1', '2']),
    fp('DIP-8_W7.62mm', numbered(8)),
    fp('DIP-14_W7.62mm', numbered(14)),
    fp('DIP-28_W7.62mm', numbered(28)),
  ].map((f) => [f.id, f]),
);
const lookup = (id: string) => FOOTPRINTS.get(id);

// ---- schematic builder ------------------------------------------------------------------
// Symbols sit on a coarse grid; every net is a star of straight wires to a far away
// hub, each net in its own direction, so wires only meet where they are meant to.

function sheet() {
  const layers = defaultLayers('SCHEMATICS');
  const layer = layers[0].id;
  const items: Item[] = [];
  let slot = 0;
  let hubs = 0;
  const place = (d: SymbolDef | string, name: string, patch: Partial<SymbolItem> = {}) => {
    const s = symbol(d, name, { ...patch, layer, x: 400 + (slot % 4) * 480, y: 400 + Math.floor(slot / 4) * 480 });
    slot++;
    items.push(s);
    return s;
  };
  const line = (a: Pt, b: Pt) => items.push({ id: uid(), kind: 'line', layer, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#000000', thickness: 2, startType: 'STRAIGHT', endType: 'STRAIGHT' });
  const pinAt = (s: SymbolItem, index: number) => symbolToWorld(s, s.pins[index]);
  const pin = (s: SymbolItem, num: number) => pinAt(s, s.pins.findIndex((p) => p.num === num));
  /** connects [symbol, pin number] pairs (or [symbol, pin index, true]) */
  const net = (...ends: ([SymbolItem, number] | [SymbolItem, number, true])[]) => {
    const a = 0.37 + hubs++ * 0.83;
    const hub = { x: Math.cos(a) * 1e6, y: Math.sin(a) * 1e6 };
    for (const [s, n, byIndex] of ends) line(byIndex ? pinAt(s, n) : pin(s, n), hub);
  };
  const dangling = (s: SymbolItem, num: number) => {
    const p = pin(s, num);
    line(p, { x: p.x - 13, y: p.y - 29 });
  };
  const doc = (): Doc => ({ width: 2400, height: 2400, type: 'SCHEMATICS', layers, items, parts: {} });
  return { place, net, dangling, doc, items };
}

const byRef = (r: ReturnType<typeof extractPcbNetlist>, ref: string) => {
  const c = r.components.find((x) => x.ref === ref);
  if (!c) throw new Error(`no component ${ref}`);
  return c;
};
const padNets = (r: ReturnType<typeof extractPcbNetlist>, ref: string) => Object.fromEntries(byRef(r, ref).pins.map((p) => [p.pad, p.net]));

// ---- footprint guesses --------------------------------------------------------------------

describe('guessFootprint', () => {
  it.each([
    ['R#', '', 'R_Axial_P10.16mm'],
    ['R#', '10R 5W', 'R_Axial_P15.24mm'],
    ['R#', '4k7 1/4W', 'R_Axial_P10.16mm'],
    ['LDR1', '', 'R_Axial_Vertical_P2.54mm'],
    ['Pot', '', 'Potentiometer_Trimmer_P2.54mm'],
    ['P2', '', 'Potentiometer_Trimmer_P2.54mm'],
    ['-Widerstands-Array-8x', '', 'DIP-16_W7.62mm'],
    ['Capacitor', '100n', 'C_Disc_P5.08mm'],
    ['Capacitor', '100u', 'CP_Radial_D6.3mm_P2.50mm'],
    ['Capacitor', '22000u', 'CP_Radial_D12.5mm_P5.00mm'],
    ['Elko klein', '47u', 'CP_Radial_D6.3mm_P2.50mm'],
    ['Elko klein', '1000µF', 'CP_Radial_D10.0mm_P5.00mm'],
    ['Hochvolt-Elko', '10u', 'CP_Radial_D10.0mm_P5.00mm'],
    ['Folie klein', '100n', 'C_Rect_P5.00mm'],
    ['Keramik', '4p7', 'C_Disc_P5.08mm'],
    ['elektor-Spule-liegend', '', 'L_Axial_P10.16mm'],
    ['L1', '470uH', 'L_Axial_P10.16mm'],
    ['Led rot', '', 'LED_5mm'],
    ['Led # orange', '3mm', 'LED_3mm'],
    ['Diode', '', 'D_DO-35_P7.62mm'],
    ['elektor-1N', '1N4007', 'D_DO-41_P10.16mm'],
    ['elektor-Leis.Diod-vertikal', '1N4148', 'D_DO-35_P7.62mm'],
    ['elektor-LeiDio', '', 'D_DO-41_P10.16mm'],
    ['D#-Schottky-Diode', 'BAT81', 'D_DO-35_P7.62mm'],
    ['elektor-npn', 'BC547', 'TO-92_CBE'],
    ['elektor-npn', 'TIP120', 'TO-220_BCE'],
    ['elektor-npn', '2N3055', 'TO-220_BCE'],
    ['-Transistor (Schalt)', '2N2222A', 'TO-92_EBC'],
    ['UJT-npn', '2N2646', 'TO-92'],
    ['JFET-npn', 'BF245', 'TO-92_DGS'],
    ['MOSFETenh.N-channel', 'BS170', 'TO-92_DGS'],
    ['MOSFETenh.N-channel', 'IRF540', 'TO-220_GDS'],
    ['TH#', 'TIC106D', 'TO-220'],
    ['7805', '', 'TO-220'],
    ['-Spannungsregel-IC', '', 'TO-220'],
    ['-IC11-Temp.Sensor LM35', '', 'TO-92'],
    ['Timer-IC', '', 'DIP-8_W7.62mm'],
    ['LM741', '', 'DIP-8_W7.62mm'],
    ['ua741', '', 'DIP-8_W7.62mm'],
    ['LM324.A', '', 'DIP-14_W7.62mm'],
    ['LF444-Quad-Low-Power-JFET-OpAmp', '', 'DIP-14_W7.62mm'],
    ['AND-IEC-2', 'CD4011', 'DIP-14_W7.62mm'],
    ['-U41-Hex-Inverter (6-fach)', '4049', 'DIP-16_W7.62mm'],
    ['-U47-74HC541  8-fach 3-state Treiber', '', 'DIP-20_W7.62mm'],
    ['-U2-LM3914', '', 'DIP-18_W7.62mm'],
    ['TDA7000', '', 'DIP-18_W7.62mm'],
    ['ATMega32', '', 'DIP-28_W7.62mm'],
    ['-OC5-Optokoppler-', 'PC817A', 'DIP-4_W7.62mm'],
    ['-Optokoppler-Transistor', '4N28', 'DIP-6_W7.62mm'],
    ['Crystal', '', 'Crystal_HC49-4H'],
    ['elektor-Quarz', '16MHz', 'Crystal_HC49-4H'],
    ['Connector 1x2', '', 'PinHeader_1x02_P2.54mm'],
    ['Connector 2x5', '', 'PinHeader_2x05_P2.54mm'],
    ['-K10-Stiftleiste-1x6', '', 'PinHeader_1x06_P2.54mm'],
    ['IDC-Stecker-10pol.', '', 'PinHeader_2x05_P2.54mm'],
    ['elektor-EIN-Taster', '', 'SW_PUSH_6mm'],
    ['-S24-DIP-Schalter (Mäuseklavier)', '', 'DIP-16_W7.62mm'],
    ['-Bz2-Buzzer', '', 'Buzzer_12x9.5RM7.6'],
    ['Speaker', '', 'PinHeader_1x02_P2.54mm'],
    ['Battery', '9V', 'TerminalBlock_1x02_P5.08mm'],
    ['Sine Voltage Source', '', 'TerminalBlock_1x02_P5.08mm'],
    ['Transformer (iron)', '', 'PinHeader_1x04_P2.54mm'],
    ['elektor-Relais', '', 'PinHeader_1x08_P2.54mm'],
  ])('%s (%s) -> %s', (name, value, expected) => {
    expect(guessFootprint(symbol(name, 'X1', value ? { value } : {}))).toBe(expected);
  });

  it('honours an explicitly chosen footprint', () => {
    expect(guessFootprint(symbol('R#', 'R1', { properties: { footprint: 'R_Axial_P7.62mm' } }))).toBe('R_Axial_P7.62mm');
  });

  it('rounds IC pin counts up to DIP packages, wide from 32 pins', () => {
    const ic = (n: number) => symbol(customDef('MCU', Array.from({ length: n }, (_, i) => ({ num: i + 1, x: 0, y: 16 * i })), { category: 'Microcontrollers' }));
    expect(guessFootprint(ic(7))).toBe('DIP-8_W7.62mm');
    expect(guessFootprint(ic(12))).toBe('DIP-14_W7.62mm');
    expect(guessFootprint(ic(28))).toBe('DIP-28_W7.62mm');
    expect(guessFootprint(ic(40))).toBe('DIP-40_W15.24mm');
  });

  it('falls back to a pin header with one pin per pin number', () => {
    const odd = symbol(customDef('Thing', [{ num: 1, x: 0, y: 0 }, { num: 2, x: 16, y: 0 }, { num: 5, x: 32, y: 0 }]));
    expect(guessFootprint(odd)).toBe('PinHeader_1x05_P2.54mm');
  });
});

// ---- pin mapping ----------------------------------------------------------------------------

describe('mapPins', () => {
  it('maps transistor pins by name when all pads are named', () => {
    const q = symbol('elektor-npn-horizontal', 'Q1'); // pin order B, E, C
    const names = q.pins.map((p) => p.name);
    const { padOfPin, unmapped } = mapPins(q, lookup('TO-92_EBC')!);
    expect(unmapped).toEqual([]);
    expect(Object.fromEntries(names.map((n, i) => [n, padOfPin[i]]))).toEqual({ E: '1', B: '2', C: '3' });
  });

  it('maps by number when pads are not named', () => {
    const q = symbol('elektor-npn', 'Q1');
    const { padOfPin } = mapPins(q, fp('TO-92', ['1', '2', '3']));
    expect(padOfPin).toEqual(q.pins.map((p) => String(p.num)));
  });

  it('maps by number when the pin names do not cover the pad names', () => {
    const r = symbol('R#', 'R1');
    expect(mapPins(r, fp('X', [['1', 'A'], ['2', 'K']])).padOfPin).toEqual(['1', '2']);
  });

  it('accepts repeated pad numbers (push button)', () => {
    const sw = symbol('elektor-EIN-Taster', 'SW1');
    expect(mapPins(sw, lookup('SW_PUSH_6mm')!)).toEqual({ padOfPin: ['1', '2'], unmapped: [] });
  });

  it('puts the + pin of a source on pad 1', () => {
    const v = symbol(customDef('Battery', [{ num: 1, x: 0, y: 0, name: '-' }, { num: 2, x: 0, y: 32, name: '+' }], { spiceType: 'VOLTAGE_SOURCE' }), 'V1');
    expect(mapPins(v, lookup('TerminalBlock_1x02_P5.08mm')!).padOfPin).toEqual(['2', '1']);
  });

  it('reports pins without pad', () => {
    const c = symbol('Connector 2x5', 'J1');
    const { unmapped } = mapPins(c, lookup('PinHeader_1x02_P2.54mm')!);
    expect(unmapped.map((i) => c.pins[i].num).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

// ---- netlist ---------------------------------------------------------------------------------

describe('extractPcbNetlist', () => {
  it('turns an RC low pass with battery and ground symbols into components and nets', () => {
    const s = sheet();
    const v = s.place('Battery', 'V1', { value: '9V' });
    const r = s.place('R#', 'R1', { value: '1k' });
    const c = s.place('Capacitor', 'C1', { value: '100n' });
    const g1 = s.place('GND', 'GND');
    const g2 = s.place('GND', 'GND');
    s.net([v, 1], [r, 1]);
    s.net([r, 2], [c, 1]);
    s.net([c, 2], [g1, 1]);
    s.net([v, 2], [g2, 1]);
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.warnings).toEqual([]);
    expect(res.components.map((x) => [x.ref, x.footprintId, x.value])).toEqual([
      ['V1', 'TerminalBlock_1x02_P5.08mm', '9V'],
      ['R1', 'R_Axial_P10.16mm', '1k'],
      ['C1', 'C_Disc_P5.08mm', '100n'],
    ]);
    expect(padNets(res, 'V1')).toEqual({ 1: 'Net-(R1-Pad1)', 2: 'GND' });
    expect(padNets(res, 'R1')).toEqual({ 1: 'Net-(R1-Pad1)', 2: 'Net-(C1-Pad1)' });
    expect(padNets(res, 'C1')).toEqual({ 1: 'Net-(C1-Pad1)', 2: 'GND' });
    expect(res.nets).toEqual(['GND', 'Net-(C1-Pad1)', 'Net-(R1-Pad1)']);
    expect(byRef(res, 'R1').pins[0]).toEqual({ pinIndex: 0, pinNum: 1, pinName: '1', pad: '1', net: 'Net-(R1-Pad1)' });
    // both ground islands are the same net
    // ground symbols are one net by name, even when no wire joins them
    expect([...netNames(s.doc()).values()].filter((n) => n === 'GND')).toHaveLength(1);
  });

  it('maps a transistor stage by pin names and names supply nets', () => {
    const s = sheet();
    const q = s.place('elektor-npn-horizontal', 'Q1', { value: 'BC547' });
    const r1 = s.place('R#', 'R1');
    const r2 = s.place('R#', 'R2');
    const vcc = s.place('VCC', 'VCC');
    const vcc2 = s.place('VCC', 'VCC');
    const gnd = s.place('Masse-Symbol', 'U9');
    s.net([vcc, 1], [r1, 1]);
    s.net([vcc2, 1], [r2, 1]);
    s.net([r1, 2], [q, 2]);
    s.net([r2, 2], [q, 1]);
    s.net([q, 3], [gnd, 1]);
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components.map((x) => x.ref)).toEqual(['Q1', 'R1', 'R2']);
    expect(byRef(res, 'Q1').footprintId).toBe('TO-92_CBE');
    expect(padNets(res, 'Q1')).toEqual({ 1: 'Net-(Q1-Pad1)', 2: 'Net-(Q1-Pad2)', 3: 'GND' });
    expect(padNets(res, 'R1')).toEqual({ 1: 'VCC', 2: 'Net-(Q1-Pad2)' });
    expect(padNets(res, 'R2')).toEqual({ 1: 'VCC', 2: 'Net-(Q1-Pad1)' });
    expect(res.nets).toEqual(['GND', 'VCC', 'Net-(Q1-Pad1)', 'Net-(Q1-Pad2)']);

    // a footprint with a different pad order is still wired correctly
    q.properties = { footprint: 'TO-92_EBC' };
    expect(padNets(extractPcbNetlist(s.doc(), lookup), 'Q1')).toEqual({ 1: 'GND', 2: 'Net-(Q1-Pad2)', 3: 'Net-(Q1-Pad3)' });
  });

  it('normalises supply names', () => {
    const s = sheet();
    const r = s.place('R#', 'R1');
    const p = s.place('VCC', '5v');
    const n = s.place('VCC', 'vee');
    s.net([p, 1], [r, 1]);
    s.net([n, 1], [r, 2]);
    expect(padNets(extractPcbNetlist(s.doc(), lookup), 'R1')).toEqual({ 1: '+5V', 2: 'VEE' });
  });

  it('places the 555 timer and the LM741 in DIP-8', () => {
    const s = sheet();
    s.place('Timer-IC', 'IC1');
    s.place('LM741', 'IC2');
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components.map((c) => c.footprintId)).toEqual(['DIP-8_W7.62mm', 'DIP-8_W7.62mm']);
    expect(byRef(res, 'IC1').pins.find((p) => p.pinName === 'Vcc')?.pad).toBe('8');
    expect(byRef(res, 'IC2').pins.map((p) => p.pad).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(res.warnings).toEqual([]);
  });

  it('leaves out bench instruments but keeps their earthed ground', () => {
    const s = sheet();
    const fg = s.place(INSTRUMENT_DEFS.fgen, 'FG1');
    const r = s.place('R#', 'R1');
    const c = s.place('Capacitor', 'C1');
    const scope = s.place(INSTRUMENT_DEFS.scope, 'OSC1');
    const dmm = s.place(INSTRUMENT_DEFS.dmm, 'DMM1');
    s.net([fg, 1], [r, 1], [scope, 1]);
    s.net([r, 2], [c, 1], [scope, 2], [dmm, 1]);
    s.net([c, 2], [fg, 2], [scope, 3], [dmm, 2]);
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components.map((x) => x.ref)).toEqual(['R1', 'C1']);
    expect(padNets(res, 'C1')).toEqual({ 1: 'Net-(C1-Pad1)', 2: 'GND' });
    expect(annotate(s.doc())).toEqual([]);
  });

  it('honours the footprint property and reports unknown footprints', () => {
    const s = sheet();
    s.place('R#', 'R1', { properties: { footprint: 'R_Axial_P7.62mm' } });
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components[0].footprintId).toBe('R_Axial_P7.62mm');
    expect(res.warnings).toEqual([{ key: 'noFootprint', ref: 'R1', footprintId: 'R_Axial_P7.62mm' }]);
    // the netlist stays usable: pin numbers stand in for pads
    expect(res.components[0].pins.map((p) => p.pad)).toEqual(['1', '2']);
  });

  it('reports pins the footprint cannot take', () => {
    const s = sheet();
    s.place('Connector 2x5', 'J1', { properties: { footprint: 'PinHeader_1x02_P2.54mm' } });
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.warnings).toContainEqual({ key: 'pinMismatch', ref: 'J1', footprintId: 'PinHeader_1x02_P2.54mm', pins: 10, pads: 2 });
    expect(res.warnings.filter((w) => w.key === 'unmappedPin')).toHaveLength(8);
    expect(byRef(res, 'J1').pins.map((p) => p.pad).sort()).toEqual(['1', '2']);
  });

  it('keeps designators unique', () => {
    const s = sheet();
    s.place('R#', 'R1');
    s.place('R#', 'R1');
    s.place('R#', 'r1');
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components.map((c) => c.ref)).toEqual(['R1', 'R1_2', 'r1_3']);
    expect(res.warnings).toEqual([{ key: 'duplicateRef', ref: 'R1' }, { key: 'duplicateRef', ref: 'r1' }]);
    expect(new Set(res.nets).size).toBe(6);
  });

  it('merges the units of a quad op-amp that share a designator', () => {
    const s = sheet();
    const a = s.place('LM324.A', 'IC1');
    const b = s.place('LM324.B', 'IC1');
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(res.components).toHaveLength(1);
    const ic = res.components[0];
    expect(ic.footprintId).toBe('DIP-14_W7.62mm');
    expect(ic.units).toEqual([a.id, b.id]);
    expect(ic.pins.map((p) => p.pad).sort((x, y) => +x - +y)).toEqual(['1', '2', '3', '4', '5', '6', '7', '11']);
    expect(ic.pins.filter((p) => p.symbolId === b.id).map((p) => p.pinNum).sort((x, y) => x - y)).toEqual([5, 6, 7, 11]);
    expect(res.warnings).toEqual([{ key: 'multiUnit', ref: 'IC1' }]);
    expect(annotate(s.doc())).toEqual([]);

    // a gate of a CD4011 is another package, even on the same footprint
    const gate = s.place('AND-IEC-2', 'IC1');
    const again = extractPcbNetlist(s.doc(), lookup);
    expect(again.components.map((c) => [c.ref, c.footprintId])).toEqual([['IC1', 'DIP-14_W7.62mm'], ['IC1_2', 'DIP-14_W7.62mm']]);
    expect(again.warnings).toContainEqual({ key: 'duplicateRef', ref: 'IC1' });
    expect(annotate(s.doc())).toEqual([{ id: gate.id, name: 'IC2' }]);
  });

  it('names unconnected pins and keeps dangling wires as nets', () => {
    const s = sheet();
    const r = s.place('R#', 'R1');
    s.dangling(r, 1);
    const res = extractPcbNetlist(s.doc(), lookup);
    expect(padNets(res, 'R1')).toEqual({ 1: 'Net-(R1-Pad1)', 2: 'unconnected-(R1-Pad2)' });
    expect(res.nets).toEqual(['Net-(R1-Pad1)', 'unconnected-(R1-Pad2)']);
  });

  it('keeps net names unique', () => {
    const s = sheet();
    // two pins numbered 1 on different nets would both be called Net-(A1-Pad1)
    const a = s.place(customDef('Odd', [{ num: 1, x: 0, y: 0 }, { num: 1, x: 64, y: 0 }]), 'A1');
    const r1 = s.place('R#', 'R1');
    const r2 = s.place('R#', 'R2');
    s.net([a, 0, true], [r1, 1]);
    s.net([a, 1, true], [r2, 1]);
    const res = extractPcbNetlist(s.doc(), (id) => fp(id, numbered(2)));
    expect(res.components[0].pins.map((p) => p.net)).toEqual(['Net-(A1-Pad1)', 'Net-(A1-Pad1)_2']);
    expect(padNets(res, 'R2')[1]).toBe('Net-(A1-Pad1)_2');
  });
});

// ---- annotation ----------------------------------------------------------------------------

describe('annotate', () => {
  it('numbers unnamed and duplicate designators per prefix', () => {
    const s = sheet();
    s.place('R#', 'R1');
    const dup = s.place('R#', 'R1');
    const q = s.place('R#', 'R?');
    const cap = s.place('Capacitor', 'Capacitor');
    s.place('Capacitor', 'C3');
    const bat = s.place('Battery', 'VCC');
    const t = s.place('elektor-npn', 'T!');
    s.place('GND', 'GND');
    s.place('VCC', 'VCC');
    expect(annotate(s.doc())).toEqual([
      { id: dup.id, name: 'R2' },
      { id: q.id, name: 'R3' },
      { id: cap.id, name: 'C4' },
      { id: bat.id, name: 'V1' },
      { id: t.id, name: 'T1' },
    ]);
  });
});

// ---- samples ---------------------------------------------------------------------------------

describe('sample schematics', () => {
  const dir = join(root, '..', 'samples', 'schematics');
  const files = readdirSync(dir).filter((f) => f.endsWith('.bb'));
  const anyFootprint = (id: string) => fp(id, numbered(64));
  const load = (f: string) => readBoardArchive(new Uint8Array(readFileSync(join(dir, f))), f, () => undefined).doc;

  it.each(files)('extracts %s', (f) => {
    const res = extractPcbNetlist(load(f), anyFootprint);
    const refs = res.components.map((c) => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const used = new Set(res.components.flatMap((c) => c.pins.map((p) => p.net)));
    expect(res.components.every((c) => c.pins.every((p) => p.net && p.pad))).toBe(true);
    expect([...used].sort()).toEqual([...res.nets].sort());
    expect(res.warnings.filter((w) => w.key === 'noFootprint')).toEqual([]);
    expect(() => annotate(load(f))).not.toThrow();
  });

  it('extracts the NE555 multivibrator', () => {
    const res = extractPcbNetlist(load('ne555_multivibrator.bb'), anyFootprint);
    expect(byRef(res, 'X1').footprintId).toBe('DIP-8_W7.62mm');
    // the battery is labelled VCC: its + terminal names the supply rail
    expect(byRef(res, 'VCC').footprintId).toBe('TerminalBlock_1x02_P5.08mm');
    expect(padNets(res, 'VCC')).toEqual({ 1: 'VCC', 2: 'GND' });
    expect(padNets(res, 'X1')[1]).toBe('GND');
    expect(padNets(res, 'X1')[8]).toBe('VCC');
    expect(res.components.map((c) => c.ref).sort()).toEqual(['C1', 'C2', 'C3', 'R1', 'R2', 'R3', 'VCC', 'X1']);
  });
});

describe('diode polarity with the real footprint library', () => {
  it('puts the anode of diodes and LEDs on pad 2 (pad 1 = cathode)', async () => {
    const { footprintById } = await import('./footprints/index.ts');
    const syms = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8')) as SymbolDef[];
    for (const [symbol, fp] of [
      ['Diode', 'D_DO-35_P7.62mm'],
      ['Led rot', 'LED_5mm'],
      ['Led rot', 'LED_0805'],
    ] as const) {
      const def = syms.find((s) => s.name === symbol)!;
      const item = symbolItemFromDef(def, 0, 0, 'L0', 'D1');
      const { padOfPin } = mapPins(item, footprintById(fp)!);
      const anode = item.pins.findIndex((p) => p.name === 'A');
      const cathode = item.pins.findIndex((p) => p.name === 'K');
      expect(padOfPin[anode]).toBe('2');
      expect(padOfPin[cathode]).toBe('1');
    }
  });
});
