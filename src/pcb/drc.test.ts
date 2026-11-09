// Tests for the design rule check.

import { describe, expect, it } from 'vitest';
import type { Doc, FootprintItem, Item, PadDef, TrackItem, ViaItem, ZoneItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { runDrc, type DrcKind, type DrcViolation } from './drc.ts';
import { createPcbDoc, defaultRules } from './defaults.ts';
import { mm } from './units.ts';

const rules = defaultRules();
const W = mm(0.3);

const tht = (num: string, x = 0, y = 0, extra: Partial<PadDef> = {}): PadDef => ({ num, x, y, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8), ...extra });
const smd = (num: string, x = 0, y = 0): PadDef => ({ num, x, y, shape: 'rect', w: mm(1), h: mm(1.2) });

function fp(
  id: string,
  x: number,
  y: number,
  pads: PadDef[],
  nets: Record<string, string>,
  opts: { side?: 'top' | 'bottom'; rotation?: number; courtyard?: { x: number; y: number; w: number; h: number } } = {},
): FootprintItem {
  const side = opts.side ?? 'top';
  return {
    id,
    kind: 'footprint',
    layer: side === 'top' ? 'L1' : 'L2',
    x,
    y,
    rotation: opts.rotation ?? 0,
    side,
    name: id,
    value: '',
    nets,
    footprint: { id: 'test', name: 'test', description: '', category: 'test', pads, silk: [], courtyard: opts.courtyard ?? { x: 0, y: 0, w: 0, h: 0 } },
  };
}

const track = (id: string, x1: number, y1: number, x2: number, y2: number, layer = 'L1', net?: string, width = W): TrackItem => ({
  id,
  kind: 'track',
  layer,
  x1,
  y1,
  x2,
  y2,
  width,
  ...(net ? { net } : {}),
});

const via = (id: string, x: number, y: number, diameter = mm(0.8), drill = mm(0.4)): ViaItem => ({ id, kind: 'via', layer: 'L1', x, y, diameter, drill });

const zone = (id: string, net: string, layer = 'L1'): ZoneItem => ({ id, kind: 'zone', layer, net, points: [] });

const square = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

function board(items: Item[], cornerRadius?: number): Doc {
  const doc = createPcbDoc();
  return { ...doc, items, pcb: { ...doc.pcb!, cornerRadius } };
}

const ofKind = (v: DrcViolation[], kind: DrcKind) => v.filter((x) => x.kind === kind);

/** two pads of one net joined by a track: a clean, routed connection */
const routed = (id: string, y: number, net: string): Item[] => [
  fp(`${id}a`, mm(10), y, [tht('1')], { 1: net }),
  fp(`${id}b`, mm(30), y, [tht('1')], { 1: net }),
  track(`${id}t`, mm(10), y, mm(30), y, 'L2'),
];

describe('runDrc', () => {
  it('reports nothing for a clean board', () => {
    expect(runDrc(board([...routed('A', mm(10), 'A'), ...routed('B', mm(20), 'B')]))).toEqual([]);
  });

  /** two parallel top tracks of nets A and B, edge to edge distance gap */
  const pair = (gap: number): Item[] => [track('a', mm(10), mm(10), mm(30), mm(10), 'L1', 'A'), track('b', mm(10), mm(10) + W + gap, mm(30), mm(10) + W + gap, 'L1', 'B')];

  it('detects clearance violations between different nets', () => {
    const gap = mm(0.1);
    const v = ofKind(runDrc(board(pair(gap))), 'clearance');
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe('clearance:a+b');
    expect(v[0].severity).toBe('error');
    expect(v[0].items).toEqual(['a', 'b']);
    expect(v[0].nets).toEqual(['A', 'B']);
    expect(v[0].actual).toBeCloseTo(gap, 6);
    expect(v[0].required).toBe(rules.clearance);
    expect(v[0].at.y).toBeCloseTo(mm(10) + W / 2 + gap / 2, 6);
    expect(v[0].at.x).toBeGreaterThanOrEqual(mm(10));
    expect(v[0].at.x).toBeLessThanOrEqual(mm(30));
  });

  it('accepts copper exactly at the clearance and just beyond it', () => {
    for (const gap of [rules.clearance, rules.clearance + 1e-4]) expect(ofKind(runDrc(board(pair(gap))), 'clearance')).toEqual([]);
    expect(ofKind(runDrc(board(pair(rules.clearance - 1e-4))), 'clearance')).toHaveLength(1);
  });

  it('ignores close copper of the same net and copper on the other side', () => {
    const y = mm(10) + W + mm(0.05);
    const same = board([track('a', mm(10), mm(10), mm(30), mm(10), 'L1', 'A'), track('b', mm(10), y, mm(30), y, 'L1', 'A')]);
    expect(ofKind(runDrc(same), 'clearance')).toEqual([]);
    const other = board([track('a', mm(10), mm(10), mm(30), mm(10), 'L1', 'A'), track('b', mm(10), y, mm(30), y, 'L2', 'B')]);
    expect(ofKind(runDrc(other), 'clearance')).toEqual([]);
  });

  it('checks pads against tracks and treats unnamed copper as a foreign net', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), track('x', mm(5), mm(10) + mm(0.8) + W / 2 + mm(0.1), mm(15), mm(10) + mm(0.8) + W / 2 + mm(0.1), 'L1')]);
    const [v] = ofKind(runDrc(doc), 'clearance');
    expect(v.items).toEqual(['J1', 'x']);
    expect(v.nets).toEqual(['A']);
    expect(v.actual).toBeCloseTo(mm(0.1), 6);
  });

  it('reports a short once per island with all nets', () => {
    const doc = board([
      fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }),
      fp('J2', mm(30), mm(10), [tht('1')], { 1: 'B' }),
      fp('J3', mm(30), mm(20), [tht('1')], { 1: 'C' }),
      track('t1', mm(10), mm(10), mm(30), mm(10), 'L1', 'A'),
      track('t2', mm(30), mm(10), mm(30), mm(20), 'L1'),
    ]);
    const v = runDrc(doc);
    const s = ofKind(v, 'short');
    expect(s).toHaveLength(1);
    expect(s[0].nets).toEqual(['A', 'B', 'C']);
    expect(s[0].items).toContain('t1');
    expect(s[0].items).toContain('J2');
    // the A track meets the B pad at x = 30 mm
    expect(s[0].at.y).toBeCloseTo(mm(10), 3);
    expect(Math.abs(s[0].at.x - mm(30))).toBeLessThan(mm(1));
    expect(ofKind(v, 'clearance')).toEqual([]);
    expect(ofKind(v, 'unrouted')).toEqual([]);
  });

  it('warns about unrouted nets', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), fp('J2', mm(20), mm(10), [tht('1')], { 1: 'A' }), fp('J3', mm(40), mm(10), [tht('1')], { 1: 'A' })]);
    const v = runDrc(doc);
    expect(v.map((x) => x.kind)).toEqual(['unrouted']);
    expect(v[0].severity).toBe('warning');
    expect(v[0].nets).toEqual(['A']);
    expect(v[0].items).toEqual(['J1', 'J2', 'J3']);
    expect(v[0].at.x).toBeCloseTo(mm(15), 9);
    expect(v[0].at.y).toBeCloseTo(mm(10), 9);
  });

  it('checks track width, drills and annular rings', () => {
    const doc = board([
      track('thin', mm(10), mm(10), mm(20), mm(10), 'L1', undefined, mm(0.1)),
      track('ok', mm(10), mm(20), mm(20), mm(20), 'L1', undefined, rules.minTrackWidth),
      fp('J1', mm(10), mm(30), [tht('1'), tht('2', mm(5), 0, { drill: mm(0.2), w: mm(1), h: mm(1) }), tht('3', mm(10), 0, { w: mm(1), h: mm(1.6), drill: mm(0.9) })], {}),
      fp('H1', mm(30), mm(30), [tht('', 0, 0, { npth: true, drill: mm(0.1) })], {}),
      via('v1', mm(40), mm(10)),
      via('v2', mm(40), mm(20), mm(0.5), mm(0.2)),
      via('v3', mm(40), mm(30), mm(0.5), mm(0.4)),
    ]);
    const v = runDrc(doc);
    const w = ofKind(v, 'trackWidth');
    expect(w.map((x) => x.items[0])).toEqual(['thin']);
    expect(w[0].actual).toBeCloseTo(mm(0.1), 9);
    expect(w[0].required).toBe(rules.minTrackWidth);
    expect(ofKind(v, 'drill').map((x) => x.id).sort()).toEqual(['drill:H1:0', 'drill:J1:1', 'drill:v2']);
    expect(ofKind(v, 'annularRing').map((x) => x.id).sort()).toEqual(['annularRing:J1:2', 'annularRing:v3']);
    const ring = ofKind(v, 'annularRing').find((x) => x.id === 'annularRing:v3')!;
    expect(ring.actual).toBeCloseTo(mm(0.05), 9);
    expect(ring.at).toEqual({ x: mm(40), y: mm(30) });
  });

  it('checks the board edge and copper outside the board', () => {
    const doc = board([
      track('edge', mm(10), mm(0.2), mm(20), mm(0.2)),
      track('fine', mm(10), mm(1), mm(20), mm(1)),
      track('out', mm(10), -mm(2), mm(20), -mm(2)),
      track('right', mm(99.9), mm(40), mm(105), mm(40)),
      fp('R1', mm(50), -mm(5), [smd('1')], {}),
      fp('R2', mm(50), mm(40), [smd('1')], {}),
    ]);
    const v = runDrc(doc);
    const e = ofKind(v, 'edgeClearance');
    expect(e.map((x) => x.items[0]).sort()).toEqual(['edge', 'right']);
    const edge = e.find((x) => x.items[0] === 'edge')!;
    expect(edge.actual).toBeCloseTo(mm(0.2) - W / 2, 6);
    expect(edge.required).toBe(rules.edgeClearance);
    expect(edge.at.y).toBeCloseTo((mm(0.2) - W / 2) / 2, 6);
    expect(e.find((x) => x.items[0] === 'right')!.actual).toBe(0);
    expect(ofKind(v, 'outsideBoard').map((x) => x.items[0])).toEqual(['out', 'R1']);
  });

  it('follows rounded board corners', () => {
    const items = [via('v1', mm(1.85), mm(1.85))];
    expect(ofKind(runDrc(board(items)), 'edgeClearance')).toEqual([]);
    const v = ofKind(runDrc(board(items, mm(5))), 'edgeClearance');
    expect(v).toHaveLength(1);
    expect(v[0].actual).toBeCloseTo(mm(5) - Math.hypot(mm(3.15), mm(3.15)) - mm(0.4), 6);
    expect(ofKind(runDrc(board([via('v2', mm(0.5), mm(0.5))], mm(5))), 'outsideBoard')).toHaveLength(1);
  });

  it('warns about overlapping courtyards on the same side', () => {
    const yard = { x: -mm(2), y: -mm(1), w: mm(4), h: mm(2) };
    const v1 = ofKind(runDrc(board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(13), mm(10), [], {}, { courtyard: yard })])), 'courtyardOverlap');
    expect(v1).toHaveLength(1);
    expect(v1[0].severity).toBe('warning');
    expect(v1[0].items).toEqual(['U1', 'U2']);
    expect(v1[0].at.x).toBeCloseTo(mm(11.5), 6);
    expect(v1[0].at.y).toBeCloseTo(mm(10), 6);

    const abut = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(14), mm(10), [], {}, { courtyard: yard })]);
    expect(ofKind(runDrc(abut), 'courtyardOverlap')).toEqual([]);
    const sides = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(13), mm(10), [], {}, { courtyard: yard, side: 'bottom' })]);
    expect(ofKind(runDrc(sides), 'courtyardOverlap')).toEqual([]);

    // a rotated part reaches into its neighbour only after the rotation
    const apart = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(10), mm(12.5), [], {}, { courtyard: yard })]);
    expect(ofKind(runDrc(apart), 'courtyardOverlap')).toEqual([]);
    const rotated = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(10), mm(12.5), [], {}, { courtyard: yard, rotation: 90 })]);
    expect(ofKind(runDrc(rotated), 'courtyardOverlap')).toHaveLength(1);
    const tilted = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(13.8), mm(10), [], {}, { courtyard: yard, rotation: 45 })]);
    expect(ofKind(runDrc(tilted), 'courtyardOverlap')).toHaveLength(1);
    // bounding boxes overlap, the tilted outline passes the corner
    const corner = board([fp('U1', mm(10), mm(10), [], {}, { courtyard: yard }), fp('U2', mm(13.621), mm(12.621), [], {}, { courtyard: yard, rotation: 45 })]);
    expect(ofKind(runDrc(corner), 'courtyardOverlap')).toEqual([]);
  });

  it('warns about dangling tracks and vias', () => {
    const doc = board([...routed('A', mm(10), 'A'), track('d', mm(50), mm(50), mm(60), mm(50)), via('v', mm(60), mm(50)), via('w', mm(70), mm(70))]);
    const v = ofKind(runDrc(doc), 'unconnectedItem');
    expect(v.map((x) => x.items[0])).toEqual(['d', 'v', 'w']);
    expect(v.every((x) => x.severity === 'warning')).toBe(true);
    expect(v[2].at).toEqual({ x: mm(70), y: mm(70) });
  });

  it('checks zone fills against each other but not against other copper', () => {
    const items = [
      fp('C1', mm(10), mm(10), [smd('1')], { 1: 'GND' }),
      fp('C2', mm(10), mm(30), [smd('1')], { 1: 'VCC' }),
      zone('zg', 'GND'),
      zone('zv', 'VCC'),
      track('x', mm(5), mm(20.2), mm(25), mm(20.2), 'L1', 'VCC'),
    ];
    const fills = new Map([
      ['zg', [[square(mm(5), mm(5), mm(25), mm(20))]]],
      ['zv', [[square(mm(5), mm(20.1), mm(25), mm(35))]]],
    ]);
    const v = runDrc(board(items), { zoneFills: fills });
    const c = ofKind(v, 'clearance');
    expect(c).toHaveLength(1);
    expect(c[0].items.sort()).toEqual(['zg', 'zv']);
    expect(c[0].nets).toEqual(['GND', 'VCC']);
    expect(c[0].actual).toBeCloseTo(mm(0.1), 6);
    expect(c[0].at.y).toBeCloseTo(mm(20.05), 6);
    expect(ofKind(v, 'short')).toEqual([]);
  });

  it('uses zone fills for connectivity', () => {
    const items = [fp('C1', mm(10), mm(10), [smd('1')], { 1: 'GND' }), fp('C2', mm(30), mm(10), [smd('1')], { 1: 'GND' }), zone('z', 'GND')];
    expect(ofKind(runDrc(board(items)), 'unrouted')).toHaveLength(1);
    const fills = new Map([['z', [[square(mm(5), mm(5), mm(35), mm(15))]]]]);
    expect(runDrc(board(items), { zoneFills: fills })).toEqual([]);
  });

  it('honours explicit rules and produces stable ids', () => {
    const doc = board(pair(mm(0.3)));
    expect(ofKind(runDrc(doc), 'clearance')).toEqual([]);
    const strict = runDrc(doc, { rules: { ...rules, clearance: mm(0.5) } });
    expect(ofKind(strict, 'clearance')).toHaveLength(1);
    expect(runDrc(doc, { rules: { ...rules, clearance: mm(0.5) } }).map((x) => x.id)).toEqual(strict.map((x) => x.id));
  });
});

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('performance', () => {
  it('checks 2000 random tracks and 200 footprints quickly', () => {
    const rnd = rng(7);
    const items: Item[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * mm(100);
      const y = rnd() * mm(80);
      const a = rnd() * Math.PI * 2;
      const l = rnd() * mm(15);
      items.push(track(`t${i}`, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, rnd() < 0.5 ? 'L1' : 'L2'));
    }
    for (let i = 0; i < 200; i++) {
      items.push(fp(`R${i}`, rnd() * mm(100), rnd() * mm(80), [tht('1'), tht('2', mm(7.62), 0)], { 1: `N${i % 30}`, 2: 'GND' }, { courtyard: { x: -mm(1), y: -mm(1), w: mm(9.62), h: mm(2) } }));
    }
    const doc = board(items);
    runDrc(doc);
    const t0 = performance.now();
    runDrc(doc);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
