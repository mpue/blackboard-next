// Tests for the autorouter: connections get routed, results are DRC clean and
// follow the design rules (widths, layers, vias).

import { describe, expect, it, vi } from 'vitest';
import type { Doc, FootprintItem, Item, PadDef, TrackItem } from '../model/types.ts';
import { autoroute, type AutorouteOptions, type AutorouteResult } from './autoroute.ts';
import { ratsnest } from './connectivity.ts';
import { createPcbDoc, defaultRules } from './defaults.ts';
import { runDrc } from './drc.ts';
import { mm } from './units.ts';

const rules = defaultRules();

const tht = (num: string, x = 0, y = 0, d = mm(1.6)): PadDef => ({ num, x, y, shape: 'circle', w: d, h: d, drill: mm(0.8) });
const smd = (num: string, x = 0, y = 0): PadDef => ({ num, x, y, shape: 'roundrect', w: mm(1), h: mm(1.25), roundness: 0.25 });

function fp(id: string, x: number, y: number, pads: PadDef[], nets: Record<string, string>, rotation = 0): FootprintItem {
  return {
    id,
    kind: 'footprint',
    layer: 'L1',
    x: mm(x),
    y: mm(y),
    rotation,
    side: 'top',
    name: id,
    value: '',
    nets,
    footprint: { id: 'test', name: 'test', description: '', category: 'test', pads, silk: [], courtyard: { x: 0, y: 0, w: 0, h: 0 } },
  };
}

/** a one pad footprint at (x, y) mm */
const padAt = (id: string, x: number, y: number, net: string, pad = tht('1')) => fp(id, x, y, [pad], { 1: net });

const dip8 = (id: string, x: number, y: number, nets: string[]) =>
  fp(
    id,
    x,
    y,
    [0, 1, 2, 3].flatMap((i) => [tht(String(i + 1), 0, mm(i * 2.54)), tht(String(8 - i), mm(7.62), mm(i * 2.54))]),
    Object.fromEntries(nets.map((n, i) => [String(i + 1), n]).filter(([, n]) => n)),
  );
const resistor = (id: string, x: number, y: number, a: string, b: string, rotation = 0) => fp(id, x, y, [tht('1'), tht('2', mm(7.62))], { 1: a, 2: b }, rotation);
const cap = (id: string, x: number, y: number, a: string, b: string, rotation = 0) => fp(id, x, y, [smd('1', mm(-0.95)), smd('2', mm(0.95))], { 1: a, 2: b }, rotation);

function board(w: number, h: number, items: Item[], copperLayers: 1 | 2 = 2): Doc {
  const doc = createPcbDoc(mm(w), mm(h));
  return { ...doc, items, pcb: { ...doc.pcb!, rules: { ...doc.pcb!.rules, copperLayers } } };
}

const withResult = (doc: Doc, r: AutorouteResult): Doc => ({ ...doc, items: [...doc.items, ...r.tracks, ...r.vias] });

const drcErrors = (doc: Doc) => runDrc(doc).filter((v) => v.kind === 'clearance' || v.kind === 'short' || v.kind === 'edgeClearance');

const length = (ts: TrackItem[]) => ts.reduce((s, t) => s + Math.hypot(t.x2 - t.x1, t.y2 - t.y1), 0);

function route(doc: Doc, opts?: AutorouteOptions) {
  const r = autoroute(doc, opts);
  const after = withResult(doc, r);
  expect(drcErrors(after)).toEqual([]);
  return { r, after };
}

describe('autoroute', () => {
  it('connects two pads of one net with a track', () => {
    const doc = board(40, 30, [padAt('A1', 10, 15, 'A'), padAt('A2', 30, 15, 'A')]);
    const { r, after } = route(doc);
    expect(r.routed).toBe(1);
    expect(r.failed).toEqual([]);
    expect(r.tracks.length).toBeGreaterThan(0);
    expect(r.vias).toEqual([]);
    for (const t of r.tracks) {
      expect(t.net).toBe('A');
      expect(['L1', 'L2']).toContain(t.layer);
      expect(t.width).toBe(rules.trackWidth);
    }
    expect(new Set(r.tracks.map((t) => t.id)).size).toBe(r.tracks.length);
    // a straight line between pads on the raster
    expect(r.tracks.length).toBe(1);
    expect(length(r.tracks)).toBeCloseTo(mm(20), 6);
    expect(ratsnest(after)).toEqual([]);
  });

  it('routes two crossing nets on a two layer board', () => {
    const doc = board(40, 40, [
      padAt('A1', 10, 20, 'A', smd('1')),
      padAt('A2', 30, 20, 'A', smd('1')),
      padAt('B1', 20, 10, 'B', smd('1')),
      padAt('B2', 20, 30, 'B', smd('1')),
    ]);
    const { r, after } = route(doc);
    expect(r.routed).toBe(2);
    expect(ratsnest(after)).toEqual([]);
    // SMD pads are on top only: the crossing needs vias (or a long detour)
    const detour = length(r.tracks) > mm(40) + mm(2);
    expect(r.vias.length > 0 || detour).toBe(true);
    for (const v of r.vias) {
      expect(v.diameter).toBe(rules.viaDiameter);
      expect(v.drill).toBe(rules.viaDrill);
      expect(v.net).toMatch(/^[AB]$/);
    }
  });

  it('routes only on the bottom copper of a single sided board', () => {
    const doc = board(40, 40, [padAt('A1', 10, 20, 'A'), padAt('A2', 30, 20, 'A'), padAt('B1', 20, 10, 'B'), padAt('B2', 20, 30, 'B')], 1);
    const { r } = route(doc);
    expect(r.vias).toEqual([]);
    expect(r.tracks.every((t) => t.layer === 'L2')).toBe(true);
    expect(r.routed + r.failed.length).toBe(2);
    // there is room to go around the ends of the other net
    expect(r.routed).toBe(2);
  });

  it('detours around a pad of another net', () => {
    const doc = board(40, 40, [padAt('A1', 10, 20, 'A'), padAt('A2', 30, 20, 'A'), padAt('X', 20, 20, 'X', tht('1', 0, 0, mm(2.5)))]);
    const { r, after } = route(doc);
    expect(r.routed).toBe(1);
    expect(length(r.tracks)).toBeGreaterThan(mm(20));
    expect(ratsnest(after).filter((l) => l.net === 'A')).toEqual([]);
  });

  it('uses the power track width for supply nets', () => {
    const doc = board(40, 30, [padAt('G1', 10, 10, 'GND'), padAt('G2', 30, 10, 'GND'), padAt('S1', 10, 20, 'SIG'), padAt('S2', 30, 20, 'SIG')]);
    const { r } = route(doc);
    expect(r.routed).toBe(2);
    expect(r.tracks.filter((t) => t.net === 'GND').every((t) => t.width === rules.powerTrackWidth)).toBe(true);
    expect(r.tracks.filter((t) => t.net === 'SIG').every((t) => t.width === rules.trackWidth)).toBe(true);
  });

  it('rips up a blocking route and reroutes it', () => {
    // B (shorter, routed first) walls off A1 against the left edge unless it goes around A1
    const items = [padAt('A1', 5, 10, 'A'), padAt('A2', 35, 10, 'A'), padAt('B1', 8, 1.2, 'B'), padAt('B2', 8, 18.8, 'B')];
    const doc = board(40, 20, items, 1);
    expect(autoroute(doc, { maxPasses: 1 }).routed).toBe(1);
    const { r, after } = route(doc);
    expect(r.routed).toBe(2);
    expect(ratsnest(after)).toEqual([]);
  });

  it('routes a medium board quickly and cleanly', () => {
    const items: Item[] = [
      dip8('U1', 7.62, 5.08, ['S1', '', 'S8', 'GND', 'S10', 'S9', 'S2', 'VCC']),
      dip8('U2', 25.4, 5.08, ['S4', 'S1', 'S3', 'GND', 'S10', '', 'S5', 'VCC']),
      dip8('U3', 43.18, 5.08, ['S7', 'S4', 'S6', 'GND', '', 'S9', '', 'VCC']),
      resistor('R1', 7.62, 20.32, 'S2', 'S3'),
      resistor('R2', 25.4, 20.32, 'S5', 'S6'),
      resistor('R3', 43.18, 20.32, 'S7', 'S8'),
      cap('C1', 11.43, 30.48, 'VCC', 'GND'),
      cap('C2', 29.21, 30.48, 'VCC', 'GND'),
      cap('C3', 46.99, 30.48, 'VCC', 'GND'),
    ];
    const doc = board(60, 40, items);
    const total = ratsnest(doc).length;
    expect(total).toBe(20);
    const t0 = performance.now();
    const { r, after } = route(doc);
    const ms = performance.now() - t0;
    expect(r.routed / total).toBeGreaterThanOrEqual(0.9);
    expect(ms).toBeLessThan(5000);
    expect(ratsnest(after).length).toBe(r.failed.length);
  });

  it('stays clean with off-raster and rotated parts', () => {
    const items: Item[] = [
      dip8('U1', 8.13, 6.07, ['A', 'B', 'C', 'GND', 'D', 'E', 'F', 'VCC']),
      resistor('R1', 25.3, 7.77, 'A', 'D', 90),
      resistor('R2', 31.9, 9.1, 'B', 'E', 45),
      cap('C1', 12.7, 25.1, 'VCC', 'GND', 30),
      cap('C2', 30.3, 26.2, 'C', 'F', 90),
      fp('H1', 20, 18, [{ num: '', x: 0, y: 0, shape: 'circle', w: mm(3.2), h: mm(3.2), drill: mm(3.2), npth: true }], {}),
    ];
    const doc = { ...board(45, 35, items), pcb: { ...board(45, 35, items).pcb!, cornerRadius: mm(3) } };
    const { r, after } = route(doc);
    expect(r.routed).toBeGreaterThanOrEqual(ratsnest(doc).length - 1);
    expect(ratsnest(after).length).toBe(r.failed.length);
    // clear of the mounting hole
    const hole = { x: mm(20), y: mm(18) };
    for (const t of r.tracks) {
      const d = Math.hypot(t.x1 - hole.x, t.y1 - hole.y);
      expect(d).toBeGreaterThan(mm(1.6));
    }
  });

  it('reports a pad enclosed by foreign copper as failed', () => {
    const ring = (layer: string): TrackItem[] => {
      const c = [
        [17, 17],
        [23, 17],
        [23, 23],
        [17, 23],
      ];
      return c.map(([x, y], i) => ({ id: `r${layer}${i}`, kind: 'track', layer, x1: mm(x), y1: mm(y), x2: mm(c[(i + 1) % 4][0]), y2: mm(c[(i + 1) % 4][1]), width: mm(0.3), net: 'B' }));
    };
    const doc = board(40, 40, [padAt('A1', 20, 20, 'A'), padAt('A2', 35, 20, 'A'), padAt('B1', 17, 17, 'B'), ...ring('L1'), ...ring('L2')]);
    let r: AutorouteResult | undefined;
    expect(() => (r = autoroute(doc))).not.toThrow();
    expect(r!.routed).toBe(0);
    expect(r!.failed).toHaveLength(1);
    expect(r!.failed[0].net).toBe('A');
    expect(drcErrors(withResult(doc, r!))).toEqual([]);
  });

  it('routes SMD pads of bottom side parts on the bottom copper', () => {
    const bottom = (id: string, x: number) => ({ ...padAt(id, x, 15, 'A', smd('1')), side: 'bottom' as const, layer: 'L2' });
    const { r } = route(board(40, 30, [bottom('A1', 10), bottom('A2', 30)]));
    expect(r.routed).toBe(1);
    expect(r.tracks.every((t) => t.layer === 'L2')).toBe(true);
  });

  it('stops at the time limit with a clean partial result', () => {
    const items: Item[] = [];
    for (let i = 0; i < 6; i++) items.push(dip8(`U${i}`, 7.62 + (i % 3) * 20.32, 5.08 + Math.floor(i / 3) * 20.32, ['A', 'B', 'C', 'GND', 'D', 'E', 'F', 'VCC'].map((n) => `${n}${i % 2}`)));
    const doc = board(70, 45, items);
    const total = ratsnest(doc).length;
    const t0 = performance.now();
    const { r } = route(doc, { timeLimitMs: 0 });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.routed + r.failed.length).toBe(total);
    expect(r.failed.length).toBeGreaterThan(0);
  });

  it('routes only the requested nets and reports progress', () => {
    const doc = board(40, 30, [padAt('A1', 10, 10, 'A'), padAt('A2', 30, 10, 'A'), padAt('B1', 10, 20, 'B'), padAt('B2', 30, 20, 'B')]);
    const calls: [number, number][] = [];
    const r = autoroute(doc, { nets: ['B'] }, (d, t) => calls.push([d, t]));
    expect(r.routed).toBe(1);
    expect(r.tracks.every((t) => t.net === 'B')).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toEqual([1, 1]);
  });

  it('runs in a worker: progress messages, then the result', async () => {
    const posted: { type: string; result?: AutorouteResult }[] = [];
    const scope: { onmessage?: (e: { data: unknown }) => void } = {};
    vi.stubGlobal('self', scope);
    vi.stubGlobal('postMessage', (m: { type: string }) => posted.push(m));
    try {
      await import('./autoroute.worker.ts');
      scope.onmessage!({ data: { doc: board(40, 30, [padAt('A1', 10, 15, 'A'), padAt('A2', 30, 15, 'A')]) } });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(posted.some((m) => m.type === 'progress')).toBe(true);
    const last = posted[posted.length - 1];
    expect(last.type).toBe('done');
    expect(last.result!.routed).toBe(1);
  });
});
