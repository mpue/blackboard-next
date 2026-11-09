// Tests for copper connectivity, ratsnest and net picking.

import { describe, expect, it } from 'vitest';
import type { Doc, FootprintItem, Item, PadDef, TrackItem, ViaItem, ZoneItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { computePcbConnectivity, copperObjects, netAt, ratsnest, unroutedNets, type PcbConnectivity } from './connectivity.ts';
import { createPcbDoc } from './defaults.ts';
import { mm } from './units.ts';

const tht = (num: string, x = 0, y = 0): PadDef => ({ num, x, y, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) });
const smd = (num: string, x = 0, y = 0): PadDef => ({ num, x, y, shape: 'rect', w: mm(1), h: mm(1.2) });

function fp(id: string, x: number, y: number, pads: PadDef[], nets: Record<string, string>, side: 'top' | 'bottom' = 'top'): FootprintItem {
  return {
    id,
    kind: 'footprint',
    layer: side === 'top' ? 'L1' : 'L2',
    x,
    y,
    rotation: 0,
    side,
    name: id,
    value: '',
    nets,
    footprint: { id: 'test', name: 'test', description: '', category: 'test', pads, silk: [], courtyard: { x: -mm(1), y: -mm(1), w: mm(2), h: mm(2) } },
  };
}

const track = (id: string, x1: number, y1: number, x2: number, y2: number, layer = 'L1', net?: string): TrackItem => ({
  id,
  kind: 'track',
  layer,
  x1,
  y1,
  x2,
  y2,
  width: mm(0.3),
  ...(net ? { net } : {}),
});

const via = (id: string, x: number, y: number): ViaItem => ({ id, kind: 'via', layer: 'L1', x, y, diameter: mm(0.8), drill: mm(0.4) });

const zone = (id: string, net: string, layer = 'L1'): ZoneItem => ({ id, kind: 'zone', layer, net, points: [] });

const square = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

function board(items: Item[]): Doc {
  return { ...createPcbDoc(), items };
}

function islandOf(conn: PcbConnectivity, key: string): number {
  const i = conn.objects.findIndex((o) => o.key === key);
  expect(i).toBeGreaterThanOrEqual(0);
  return conn.island[i];
}

const P = mm(2.54);

describe('copperObjects', () => {
  it('lists pads, tracks, vias and zone fills with their sides and nets', () => {
    const doc = board([
      fp('U1', P, P, [tht('1'), smd('2', P, 0)], { 1: 'A', 2: 'B' }),
      track('t1', 0, 0, P, 0, 'L2', 'A'),
      track('silk', 0, 0, P, 0, 'L0'),
      via('v1', P, P),
      zone('z1', 'GND'),
    ]);
    const objs = copperObjects(doc);
    expect(objs.map((o) => [o.key, o.kind, o.sides.join('/'), o.net])).toEqual([
      ['U1:0', 'pad', 'top/bottom', 'A'],
      ['U1:1', 'pad', 'top', 'B'],
      ['t1', 'track', 'bottom', 'A'],
      ['v1', 'via', 'top/bottom', undefined],
      ['z1', 'zone', 'top', 'GND'],
    ]);
    expect(objs[4].shape).toBeUndefined();
  });
});

describe('computePcbConnectivity', () => {
  it('joins two pads connected by a track into one island', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), fp('J2', mm(20), mm(10), [tht('1')], { 1: 'A' }), track('t1', mm(10), mm(10), mm(20), mm(10), 'L2')]);
    const conn = computePcbConnectivity(doc);
    expect(islandOf(conn, 'J1:0')).toBe(islandOf(conn, 'J2:0'));
    expect(islandOf(conn, 't1')).toBe(islandOf(conn, 'J1:0'));
    expect([...conn.islandNets.get(islandOf(conn, 't1'))!]).toEqual(['A']);
    expect(conn.netOfItem.get('t1')).toBe('A');
    expect(ratsnest(doc, conn)).toEqual([]);
    expect(unroutedNets(doc, conn)).toEqual([]);
  });

  it('keeps a dangling track in its own island without pad nets', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), track('t1', mm(30), mm(30), mm(40), mm(30)), track('t2', mm(30), mm(40), mm(40), mm(40), 'L1', 'X')]);
    const conn = computePcbConnectivity(doc);
    const k = islandOf(conn, 't1');
    expect(k).not.toBe(islandOf(conn, 'J1:0'));
    expect(conn.islandNets.get(k)!.size).toBe(0);
    expect(conn.netOfItem.has('t1')).toBe(false);
    expect(conn.netOfItem.get('t2')).toBe('X');
  });

  it('a track inherits the pad net even if it declares another one', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), track('t1', mm(10), mm(10), mm(20), mm(10), 'L1', 'OLD')]);
    expect(computePcbConnectivity(doc).netOfItem.get('t1')).toBe('A');
  });

  it('connects top and bottom copper through a THT pad', () => {
    const doc = board([fp('J1', mm(10), mm(10), [tht('1')], { 1: 'A' }), track('top', mm(10), mm(10), mm(20), mm(10), 'L1'), track('bot', mm(10), mm(10), mm(10), mm(20), 'L2')]);
    const conn = computePcbConnectivity(doc);
    expect(islandOf(conn, 'top')).toBe(islandOf(conn, 'bot'));
  });

  it('connects layers through a via', () => {
    const items = [track('top', mm(10), mm(10), mm(20), mm(10), 'L1'), track('bot', mm(20), mm(10), mm(20), mm(20), 'L2')];
    const without = computePcbConnectivity(board(items));
    expect(islandOf(without, 'top')).not.toBe(islandOf(without, 'bot'));
    const conn = computePcbConnectivity(board([...items, via('v1', mm(20), mm(10))]));
    expect(islandOf(conn, 'top')).toBe(islandOf(conn, 'bot'));
    expect(islandOf(conn, 'v1')).toBe(islandOf(conn, 'top'));
  });

  it('does not connect an SMD pad on top to a bottom track below it', () => {
    const doc = board([fp('R1', mm(10), mm(10), [smd('1')], { 1: 'A' }), track('bot', mm(5), mm(10), mm(15), mm(10), 'L2'), track('top', mm(10), mm(10), mm(10), mm(15), 'L1')]);
    const conn = computePcbConnectivity(doc);
    expect(islandOf(conn, 'bot')).not.toBe(islandOf(conn, 'R1:0'));
    expect(islandOf(conn, 'top')).toBe(islandOf(conn, 'R1:0'));
  });

  it('puts SMD pads of bottom side footprints on the bottom copper', () => {
    const doc = board([fp('R1', mm(10), mm(10), [smd('1')], { 1: 'A' }, 'bottom'), track('bot', mm(5), mm(10), mm(15), mm(10), 'L2')]);
    const conn = computePcbConnectivity(doc);
    expect(islandOf(conn, 'bot')).toBe(islandOf(conn, 'R1:0'));
  });

  it('connects pads with equal numbers inside one footprint', () => {
    const doc = board([fp('Q1', mm(10), mm(10), [smd('1'), smd('1', P * 2, 0), smd('2', P, P * 2)], { 1: 'A', 2: 'B' })]);
    const conn = computePcbConnectivity(doc);
    expect(islandOf(conn, 'Q1:0')).toBe(islandOf(conn, 'Q1:1'));
    expect(islandOf(conn, 'Q1:2')).not.toBe(islandOf(conn, 'Q1:0'));
  });

  it('treats touching shapes as connected but not ones a hair apart', () => {
    const w = mm(0.3);
    const touch = computePcbConnectivity(board([track('a', 0, 0, mm(10), 0), track('b', mm(10) + w, 0, mm(20), 0)]));
    expect(islandOf(touch, 'a')).toBe(islandOf(touch, 'b'));
    const apart = computePcbConnectivity(board([track('a', 0, 0, mm(10), 0), track('b', mm(10) + w + 1e-3, 0, mm(20), 0)]));
    expect(islandOf(apart, 'a')).not.toBe(islandOf(apart, 'b'));
  });
});

describe('zone fills', () => {
  const pads = [fp('C1', mm(10), mm(10), [smd('1')], { 1: 'GND' }), fp('C2', mm(30), mm(10), [smd('1')], { 1: 'GND' })];

  it('connects two pads through a fill polygon', () => {
    const doc = board([...pads, zone('z1', 'GND')]);
    expect(ratsnest(doc)).toHaveLength(1);
    const fills = new Map([['z1', [[square(mm(5), mm(5), mm(35), mm(15))]]]]);
    const conn = computePcbConnectivity(doc, fills);
    expect(islandOf(conn, 'C1:0')).toBe(islandOf(conn, 'C2:0'));
    expect(islandOf(conn, 'z1')).toBe(islandOf(conn, 'C1:0'));
    expect(conn.netOfItem.get('z1')).toBe('GND');
    expect(ratsnest(doc, conn)).toEqual([]);
  });

  it('connects a pad that only crosses the fill outline', () => {
    const doc = board([...pads, zone('z1', 'GND')]);
    const fills = new Map([['z1', [[square(mm(10), mm(5), mm(30), mm(15))]]]]);
    const conn = computePcbConnectivity(doc, fills);
    expect(islandOf(conn, 'C1:0')).toBe(islandOf(conn, 'C2:0'));
  });

  it('respects holes and separate fill polygons', () => {
    const doc = board([...pads, zone('z1', 'GND')]);
    const holed = new Map([['z1', [[square(mm(5), mm(5), mm(35), mm(15)), square(mm(28), mm(8), mm(32), mm(12))]]]]);
    const c1 = computePcbConnectivity(doc, holed);
    expect(islandOf(c1, 'C1:0')).toBe(islandOf(c1, 'z1'));
    expect(islandOf(c1, 'C2:0')).not.toBe(islandOf(c1, 'z1'));

    const split = new Map([['z1', [[square(mm(5), mm(5), mm(15), mm(15))], [square(mm(25), mm(5), mm(35), mm(15))]]]]);
    const c2 = computePcbConnectivity(doc, split);
    expect(c2.objects.filter((o) => o.kind === 'zone').map((o) => o.key)).toEqual(['z1', 'z1#1']);
    expect(islandOf(c2, 'C1:0')).toBe(islandOf(c2, 'z1'));
    expect(islandOf(c2, 'C2:0')).toBe(islandOf(c2, 'z1#1'));
    expect(islandOf(c2, 'C1:0')).not.toBe(islandOf(c2, 'C2:0'));
  });

  it('ignores fills on the other side and joins overlapping zones', () => {
    const doc = board([...pads, zone('zb', 'GND', 'L2')]);
    const fills = new Map([['zb', [[square(mm(5), mm(5), mm(35), mm(15))]]]]);
    const conn = computePcbConnectivity(doc, fills);
    expect(islandOf(conn, 'C1:0')).not.toBe(islandOf(conn, 'C2:0'));

    const two = board([...pads, zone('za', 'GND'), zone('zc', 'GND')]);
    const f2 = new Map([
      ['za', [[square(mm(5), mm(5), mm(21), mm(15))]]],
      ['zc', [[square(mm(20), mm(5), mm(35), mm(15))]]],
    ]);
    const c2 = computePcbConnectivity(two, f2);
    expect(islandOf(c2, 'C1:0')).toBe(islandOf(c2, 'C2:0'));
  });
});

describe('ratsnest', () => {
  const pads = [fp('J1', 0 + mm(10), mm(10), [tht('1')], { 1: 'N' }), fp('J2', mm(20), mm(10), [tht('1')], { 1: 'N' }), fp('J3', mm(40), mm(10), [tht('1')], { 1: 'N' })];

  it('spans the unconnected pads of a net with a minimum tree', () => {
    const doc = board(pads);
    const lines = ratsnest(doc);
    expect(lines).toHaveLength(2);
    const len = lines.reduce((s, l) => s + Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y), 0);
    expect(len).toBeCloseTo(mm(30), 6);
    expect(unroutedNets(doc)).toEqual([{ net: 'N', missing: 2 }]);
  });

  it('drops a line once a connection is routed', () => {
    const doc = board([...pads, track('t1', mm(10), mm(10), mm(20), mm(10))]);
    const lines = ratsnest(doc);
    expect(lines).toHaveLength(1);
    expect(Math.hypot(lines[0].a.x - lines[0].b.x, lines[0].a.y - lines[0].b.y)).toBeCloseTo(mm(20), 6);
    expect(unroutedNets(doc)).toEqual([{ net: 'N', missing: 1 }]);
  });

  it('starts lines at track ends when they are closer than the pads', () => {
    const doc = board([...pads, track('t1', mm(10), mm(10), mm(20), mm(10)), track('t2', mm(20), mm(10), mm(35), mm(10))]);
    const [l] = ratsnest(doc);
    expect(Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y)).toBeCloseTo(mm(5), 6);
  });

  it('draws nothing for fully routed nets', () => {
    const doc = board([...pads, track('t1', mm(10), mm(10), mm(40), mm(10))]);
    expect(ratsnest(doc)).toEqual([]);
  });
});

describe('netAt', () => {
  const doc = board([
    fp('R1', mm(10), mm(10), [smd('1')], { 1: 'A' }),
    track('t1', mm(10), mm(10), mm(20), mm(10), 'L1'),
    track('t2', mm(10), mm(20), mm(20), mm(20), 'L2', 'B'),
    zone('z1', 'GND', 'L2'),
  ]);
  const conn = computePcbConnectivity(doc, new Map([['z1', [[square(mm(30), mm(30), mm(40), mm(40))]]]]));

  it('finds pads, tracks and zone fills under a point', () => {
    expect(netAt(doc, { x: mm(10.2), y: mm(10) }, undefined, conn)).toBe('A');
    expect(netAt(doc, { x: mm(15), y: mm(10) }, 'top', conn)).toBe('A');
    expect(netAt(doc, { x: mm(15), y: mm(10) }, 'bottom', conn)).toBeUndefined();
    expect(netAt(doc, { x: mm(15), y: mm(20) }, undefined, conn)).toBe('B');
    expect(netAt(doc, { x: mm(35), y: mm(35) }, 'bottom', conn)).toBe('GND');
    expect(netAt(doc, { x: mm(50), y: mm(50) }, undefined, conn)).toBeUndefined();
  });
});

// deterministic random numbers
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
  it('handles 2000 random tracks in well under 500 ms', () => {
    const rnd = rng(42);
    const items: Item[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * mm(100);
      const y = rnd() * mm(80);
      const a = rnd() * Math.PI * 2;
      const l = rnd() * mm(15);
      items.push(track(`t${i}`, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, rnd() < 0.5 ? 'L1' : 'L2'));
    }
    const doc = board(items);
    computePcbConnectivity(doc);
    const t0 = performance.now();
    const conn = computePcbConnectivity(doc);
    ratsnest(doc, conn);
    const dt = performance.now() - t0;
    expect(conn.objects).toHaveLength(2000);
    expect(dt).toBeLessThan(500);
  });
});
