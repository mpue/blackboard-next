// Time behaviour of the lessons that are watched in slow motion or on the
// bench: the transient analyses really show what the texts describe. They
// get their own engine instance in this file (a second instance next to the
// one of the operating point helper would make the older one return stale
// results).

import { describe, expect, it } from 'vitest';
import type { Doc, SymbolItem } from '../../model/types.ts';
import { buildNetlist, type NetlistResult } from '../../spice/netlist.ts';
import { tranNetlist } from '../../spice/live.ts';
import { benchAnalysis } from '../../spice/instruments.ts';
import { libraryModels, librarySymbols } from '../testing.ts';
import { LESSONS } from './index.ts';
import { change, type LessonDef } from './kit.ts';

const lib = librarySymbols();
const models = libraryModels();

type Engine = { setNetList(n: string): void; runSim(): Promise<{ data: { name: string; values: unknown[] }[] }> };
let engine: Promise<Engine> | undefined;

/** Transient run of a netlist: time axis and the node voltages / device currents by lower case name. */
async function transient(nl: NetlistResult): Promise<{ time: number[]; vec: (name: string) => number[] }> {
  engine ??= (async () => {
    const { Simulation } = await import('eecircuit-engine');
    const s = new Simulation();
    await s.start();
    return s as unknown as Engine;
  })();
  const s = await engine;
  expect(nl.errors).toEqual([]);
  s.setNetList(nl.netlist);
  const [time, ...rest] = (await s.runSim()).data;
  const vectors = new Map(rest.map((d) => [d.name.toLowerCase(), d.values.map(Number)]));
  return {
    time: time.values.map(Number),
    vec: (name) => {
      const v = vectors.get(name.toLowerCase()) ?? vectors.get(`i(${name.toLowerCase()})`);
      if (!v) throw new Error(`no vector ${name}`);
      return v;
    },
  };
}

const lessonById = (id: string) => LESSONS.find((l) => l.id === id) as LessonDef;
const ref = (doc: Doc, name: string) => doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === name)!;
/** SPICE node of a pin of a component */
function node(doc: Doc, nl: NetlistResult, name: string, pin: number): string {
  const s = ref(doc, name);
  const el = nl.elements.find((e) => e.symbolId === s.id)!;
  return el.pins.find((p) => s.pins[p.index].num === pin)!.node;
}
type Run = Awaited<ReturnType<typeof transient>>;
const volts = (r: Run, n: string) => (n === '0' ? r.time.map(() => 0) : r.vec(`v(${n})`));
const at = (r: Run, x: number[], t: number) => x[r.time.findIndex((tt) => tt >= t)];
/** times at which `x` crosses `level` upwards */
const rising = (r: Run, x: number[], level: number) => r.time.filter((_, i) => i > 0 && x[i - 1] < level && x[i] >= level);

describe('time behaviour of the lessons', () => {
  it('capacitor-charging: the slow motion view shows the charging curve', async () => {
    const lesson = lessonById('capacitor-charging');
    const start = lesson.start!(lib, 'de');
    // with the start values (τ = 0.47 s) C1 only gets to about 72 % in the 600 ms window
    const slow = change(start, { S1: { props: { closed: 'true' } } });
    const nlSlow = tranNetlist(slow, 'charging', models);
    expect(nlSlow.netlist).toMatch(/^\.tran 1m 600m uic$/m);
    const a = await transient(nlSlow);
    const ca = volts(a, node(slow, nlSlow, 'C1', 1));
    expect(at(a, ca, 0.6)).toBeGreaterThan(6.3);
    expect(at(a, ca, 0.6)).toBeLessThan(6.7);
    expect(Math.max(...a.vec('@r1[i]'))).toBeCloseTo(9 / 4700, 4);
    // solved: τ = 100 ms, 63 % after τ, practically full after 5τ
    const solved = lesson.solve!(start, lib);
    const nl = tranNetlist(solved, 'charging', models);
    const r = await transient(nl);
    const c = volts(r, node(solved, nl, 'C1', 1));
    expect(at(r, c, 0.1)).toBeGreaterThan(5.5);
    expect(at(r, c, 0.1)).toBeLessThan(5.9);
    expect(at(r, c, 0.5)).toBeGreaterThan(8.9);
    expect(Math.max(...r.vec('@r1[i]'))).toBeCloseTo(9e-3, 4);
  }, 30_000);

  it('blinker-555: the LED really blinks, at about 1 Hz once solved', async () => {
    const lesson = lessonById('blinker-555');
    const start = lesson.start!(lib, 'de');
    const frequency = async (doc: Doc) => {
      const nl = tranNetlist(doc, 'blinker', models);
      expect(nl.netlist).toMatch(/^\.tran 1m 3 uic$/m);
      const r = await transient(nl);
      const out = volts(r, node(doc, nl, 'X1', 3));
      const cap = volts(r, node(doc, nl, 'X1', 6));
      const edges = rising(r, out, 4.5);
      expect(edges.length).toBeGreaterThanOrEqual(2);
      // after the first charge C1 swings between 1/3 and 2/3 of 9 V
      const later = cap.filter((_, i) => r.time[i] > 1.5);
      expect(Math.min(...later)).toBeGreaterThan(2.9);
      expect(Math.max(...later)).toBeLessThan(6.1);
      // the LED gets its current while the output is high
      expect(Math.max(...r.vec('@d1[id]'))).toBeGreaterThan(0.01);
      return (edges.length - 1) / (edges[edges.length - 1] - edges[0]);
    };
    // f = 1.44 / ((R1 + 2 R2) C1): 6.9 Hz at the start, 1.05 Hz with R2 = 68k
    const f0 = await frequency(start);
    expect(f0).toBeGreaterThan(6.86 * 0.8);
    expect(f0).toBeLessThan(6.86 * 1.2);
    const f1 = await frequency(lesson.solve!(start, lib));
    expect(f1).toBeGreaterThan(0.8);
    expect(f1).toBeLessThan(1.2);
  }, 30_000);

  it('rectifier: the bench simulates the start schematic, the bridge uses both half-waves', async () => {
    const lesson = lessonById('rectifier');
    const start = lesson.start!(lib, 'de');
    const solved = lesson.solve!(start, lib);
    // the bench runs with UIC by default: no part may hang in the air
    const bench = await transient(buildNetlist(start, 'rectifier', models, { analysis: benchAnalysis(start, true).directive }));
    expect(bench.time[bench.time.length - 1]).toBeCloseTo(0.15, 3);
    // slow motion of the finished bridge without the capacitor: the diode pairs take turns, R2 always carries current the same way
    const bare = change(solved, { C1: { value: '1p' } });
    const nl = tranNetlist(bare, 'rectifier', models);
    expect(nl.netlist).toMatch(/^\.tran 0\.1m 40m uic$/m);
    const r = await transient(nl);
    const id = (d: string, t: number) => at(r, r.vec(`@${d}[id]`), t);
    expect(id('d2', 0.005)).toBeGreaterThan(5e-3);
    expect(id('d3', 0.005)).toBeGreaterThan(5e-3);
    expect(Math.abs(id('d4', 0.005))).toBeLessThan(1e-6);
    expect(id('d4', 0.015)).toBeGreaterThan(5e-3);
    expect(id('d5', 0.015)).toBeGreaterThan(5e-3);
    expect(Math.abs(id('d2', 0.015))).toBeLessThan(1e-6);
    expect(Math.min(...r.vec('@r2[i]'))).toBeGreaterThan(-1e-6);
    // peaks: one diode drop on the half-wave rectifier, two on the bridge
    const peak = (doc: Doc, n: NetlistResult, res: Run, name: string) => Math.max(...volts(res, node(doc, n, name, 1)));
    expect(peak(bare, nl, r, 'R1')).toBeGreaterThan(9.1);
    expect(peak(bare, nl, r, 'R1')).toBeLessThan(9.45);
    expect(peak(bare, nl, r, 'R2')).toBeGreaterThan(8.4);
    expect(peak(bare, nl, r, 'R2')).toBeLessThan(8.75);
    // with 470 µF: just over 8 V and a ripple below the estimate I / (2 f C) ≈ 0.17 V
    const nlC = buildNetlist(solved, 'rectifier', models, { analysis: benchAnalysis(solved, true).directive });
    const smooth = await transient(nlC);
    const out = volts(smooth, node(solved, nlC, 'R2', 1)).filter((_, i) => smooth.time[i] > 0.1);
    expect(Math.min(...out)).toBeGreaterThan(8);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThan(0.17);
    expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(0.1);
  }, 30_000);
});
