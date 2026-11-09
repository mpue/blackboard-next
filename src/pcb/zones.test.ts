// Copper zone filling: clearances, thermal reliefs, dead copper, priorities.

import { describe, expect, it } from 'vitest';
import type { Doc, FootprintItem, PadDef, TrackItem, ViaItem, ZoneItem } from '../model/types.ts';
import { distToSegment, type Pt } from '../geometry/geom.ts';
import { createPcbDoc } from './defaults.ts';
import { circleShape, padShapeWorld, pointGap, trackShape, viaShape, type CopperShape } from './geometry.ts';
import { mm } from './units.ts';
import { fillAllZones, fillZone, polygonArea, zoneFillPath, type MultiPolygon, type Ring } from './zones.ts';

const W = mm(40);
const H = mm(30);
/** numerical slack; obstacles are polygonized from the outside, so no chord error */
const TOL = mm(0.001);

let seq = 0;
const nextId = () => `t${++seq}`;

function tht(num: string, x: number, y: number, d = mm(1.6)): PadDef {
  return { num, x, y, shape: 'circle', w: d, h: d, drill: mm(0.8) };
}

function footprint(x: number, y: number, pads: PadDef[], nets: Record<string, string>, extra: Partial<FootprintItem> = {}): FootprintItem {
  return {
    id: nextId(),
    kind: 'footprint',
    layer: 'L1',
    x,
    y,
    rotation: 0,
    side: 'top',
    name: 'U',
    value: '',
    footprint: { id: 'test', name: 'test', description: '', category: 'Test', pads, silk: [], courtyard: { x: -1, y: -1, w: 2, h: 2 } },
    nets,
    ...extra,
  };
}

function track(x1: number, y1: number, x2: number, y2: number, net: string, layer = 'L2'): TrackItem {
  return { id: nextId(), kind: 'track', layer, x1, y1, x2, y2, width: mm(0.3), net };
}

function via(x: number, y: number, net: string): ViaItem {
  return { id: nextId(), kind: 'via', layer: 'L1', x, y, diameter: mm(0.8), drill: mm(0.4), net };
}

function rect(x1: number, y1: number, x2: number, y2: number): Pt[] {
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
}

function zone(net: string, extra: Partial<ZoneItem> = {}): ZoneItem {
  return { id: nextId(), kind: 'zone', layer: 'L2', points: rect(0, 0, W, H), net, ...extra };
}

function board(...items: Doc['items']): Doc {
  const doc = createPcbDoc(W, H);
  doc.items = items;
  return doc;
}

const P = (xmm: number, ymm: number): Pt => ({ x: mm(xmm), y: mm(ymm) });

function inRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i];
    const b = r[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function inFill(mp: MultiPolygon, p: Pt): boolean {
  return mp.some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));
}

function* edges(mp: MultiPolygon): Generator<[Pt, Pt]> {
  for (const poly of mp) for (const r of poly) for (let i = 0; i < r.length; i++) yield [r[i], r[(i + 1) % r.length]];
}

/** Points along all ring edges, at most `step` apart. */
function samples(mp: MultiPolygon, step = mm(0.05)): Pt[] {
  const out: Pt[] = [];
  for (const [a, b] of edges(mp)) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let i = 0; i < n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}

/** Smallest gap between the fill and a copper shape; -1 when the shape lies inside the fill. */
function fillGap(mp: MultiPolygon, s: CopperShape): number {
  if (inFill(mp, s.pts[0])) return -1;
  return Math.min(...samples(mp).map((p) => pointGap(p, s)));
}

/** Smallest distance between two fills; -1 when they overlap. */
function fillsGap(a: MultiPolygon, b: MultiPolygon): number {
  const sa = samples(a);
  if (sa.some((p) => inFill(b, p)) || samples(b).some((p) => inFill(a, p))) return -1;
  let best = Infinity;
  const eb = [...edges(b)];
  for (const p of sa) for (const [q, r] of eb) best = Math.min(best, distToSegment(p, q, r));
  return best;
}

const allPts = (mp: MultiPolygon) => mp.flat(2);

describe('zone fill', () => {
  const rules = createPcbDoc().pcb!.rules;
  const c = rules.clearance;

  function basic(extra: Partial<ZoneItem> = {}) {
    const fp = footprint(mm(10), mm(10), [tht('1', 0, 0), tht('2', mm(2.54), 0)], { '1': 'GND', '2': 'SIG' });
    const sig = track(mm(2), mm(20), mm(38), mm(20), 'SIG');
    const sigVia = via(mm(20), mm(25), 'SIG');
    const gndTrack = track(mm(3), mm(3), mm(3), mm(15), 'GND');
    const z = zone('GND', extra);
    const doc = board(fp, sig, sigVia, gndTrack, z);
    return { doc, fp, sig, sigVia, gndTrack, z };
  }

  it('keeps the clearance to copper of other nets', () => {
    const { doc, fp, sig, sigVia, z } = basic();
    const f = fillZone(doc, z);
    expect(f.length).toBeGreaterThan(0);
    for (const s of [trackShape(sig), viaShape(sigVia), padShapeWorld(fp, fp.footprint.pads[1])]) {
      expect(fillGap(f, s)).toBeGreaterThanOrEqual(c - TOL);
    }
    // the fill does get close: not more than a few chord errors away
    expect(fillGap(f, trackShape(sig))).toBeLessThan(c + mm(0.02));
  });

  it('honours a zone specific clearance', () => {
    const { doc, sig, z } = basic({ clearance: mm(0.5) });
    const f = fillZone(doc, z);
    expect(fillGap(f, trackShape(sig))).toBeGreaterThanOrEqual(mm(0.5) - TOL);
  });

  it('pours over same net tracks and vias', () => {
    const { doc, gndTrack, z } = basic();
    doc.items.push(via(mm(30), mm(10), 'GND'));
    const f = fillZone(doc, z);
    expect(inFill(f, { x: gndTrack.x1, y: mm(9) })).toBe(true);
    expect(inFill(f, P(30, 10))).toBe(true);
  });

  it('connects pads of the zone net with thermal spokes', () => {
    const { doc, fp, z } = basic();
    const f = fillZone(doc, z);
    const pad = padShapeWorld(fp, fp.footprint.pads[0]);
    const cx = fp.x;
    const cy = fp.y;
    const rr = pad.r + c / 2;
    // a fill polygon overlaps the pad copper (the spokes run to the pad centre)
    expect(f.some((poly) => poly.some((r) => r.some((p) => pointGap(p, pad) < 0)))).toBe(true);
    expect(inFill(f, { x: cx, y: cy })).toBe(true);
    // spokes along the axes, relief gap on the diagonals
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(inFill(f, { x: cx + dx * rr, y: cy + dy * rr })).toBe(true);
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) expect(inFill(f, { x: cx + (dx * rr) / Math.SQRT2, y: cy + (dy * rr) / Math.SQRT2 })).toBe(false);
  });

  it('turns the spokes with the pad', () => {
    const pad: PadDef = { num: '1', x: 0, y: 0, shape: 'rect', w: mm(1.2), h: mm(0.8) };
    const fp = footprint(mm(20), mm(15), [pad], { '1': 'GND' }, { rotation: 30 });
    const z = zone('GND', { layer: 'L1' });
    const f = fillZone(board(fp, z), z);
    const a = (30 * Math.PI) / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const v = { x: -u.y, y: u.x };
    const at = (d: Pt, dist: number) => ({ x: fp.x + d.x * dist, y: fp.y + d.y * dist });
    expect(inFill(f, at(u, pad.w / 2 + c / 2))).toBe(true);
    expect(inFill(f, at(v, pad.h / 2 + c / 2))).toBe(true);
    // corner of the pad, just outside it: relief gap
    const corner = { x: (u.x * pad.w) / 2 + (v.x * pad.h) / 2, y: (u.y * pad.w) / 2 + (v.y * pad.h) / 2 };
    const k = 1 + c / 2 / Math.hypot(corner.x, corner.y);
    expect(inFill(f, { x: fp.x + corner.x * k, y: fp.y + corner.y * k })).toBe(false);
  });

  it('covers pads with a solid connection', () => {
    const { doc, fp, z } = basic({ connect: 'solid' });
    const f = fillZone(doc, z);
    const r = mm(0.8);
    for (const [dx, dy] of [[0, 0], [0.9, 0], [0.7, 0.7], [-0.7, 0.7], [0, -0.9], [1.05, 0.2]]) {
      expect(inFill(f, { x: fp.x + dx * r, y: fp.y + dy * r })).toBe(true);
    }
  });

  it('removes islands without a connection to the zone net', () => {
    const ring = [
      track(mm(25), mm(5), mm(35), mm(5), 'SIG'),
      track(mm(35), mm(5), mm(35), mm(12), 'SIG'),
      track(mm(35), mm(12), mm(25), mm(12), 'SIG'),
      track(mm(25), mm(12), mm(25), mm(5), 'SIG'),
    ];
    const gnd = footprint(mm(10), mm(20), [tht('1', 0, 0)], { '1': 'GND' });
    const z = zone('GND');
    const doc = board(gnd, ...ring, z);
    const f = fillZone(doc, z);
    expect(f.length).toBe(1);
    expect(inFill(f, P(30, 8.5))).toBe(false);
    expect(inFill(f, P(10, 25))).toBe(true);

    // a via of the zone net brings the island to life
    doc.items.push(via(mm(28), mm(8.5), 'GND'));
    const g = fillZone(doc, z);
    expect(g.length).toBe(2);
    expect(inFill(g, P(32, 8.5))).toBe(true);
    // ... unless it is smaller than minIsland (island ~ 9.4 x 6.4 mm)
    const h = fillZone(doc, z, { minIsland: mm(10) ** 2 });
    expect(h.length).toBe(1);
    expect(inFill(h, P(32, 8.5))).toBe(false);
  });

  it('drops a zone without any copper of its net', () => {
    const z = zone('GND');
    expect(fillZone(board(track(mm(2), mm(20), mm(38), mm(20), 'SIG'), z), z)).toEqual([]);
  });

  it('keeps the clearance to NPTH holes', () => {
    const hole: PadDef = { num: '', x: 0, y: 0, shape: 'circle', w: mm(3.2), h: mm(3.2), drill: mm(3.2), npth: true };
    const mount = footprint(mm(30), mm(20), [hole], {});
    const gnd = footprint(mm(10), mm(10), [tht('1', 0, 0)], { '1': 'GND' });
    const z = zone('GND');
    const f = fillZone(board(mount, gnd, z), z);
    const s = circleShape({ x: mount.x, y: mount.y }, mm(1.6));
    expect(fillGap(f, s)).toBeGreaterThanOrEqual(c - TOL);
    expect(fillGap(f, s)).toBeLessThan(c + mm(0.02));
  });

  it('keeps the board edge clearance', () => {
    const { doc, z } = basic();
    const e = rules.edgeClearance;
    const pts = allPts(fillZone(doc, z));
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(e, 6);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(e, 6);
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(W - e, 6);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(H - e, 6);

    // rounded corners: the fill keeps edgeClearance to the corner arc
    const R = mm(3);
    doc.pcb!.cornerRadius = R;
    const rounded = fillZone(doc, z);
    let cornerPts = 0;
    for (const p of allPts(rounded)) {
      const kx = p.x < R ? R : p.x > W - R ? W - R : undefined;
      const ky = p.y < R ? R : p.y > H - R ? H - R : undefined;
      if (kx === undefined || ky === undefined) continue;
      cornerPts++;
      expect(Math.hypot(p.x - kx, p.y - ky)).toBeLessThanOrEqual(R - e + TOL);
    }
    expect(cornerPts).toBeGreaterThan(8);
    expect(inFill(rounded, P(0.6, 0.6))).toBe(false);
  });

  it('clips the fill to the zone outline', () => {
    const gnd = footprint(mm(10), mm(10), [tht('1', 0, 0)], { '1': 'GND' });
    const z = zone('GND', { points: rect(mm(5), mm(5), mm(20), mm(18)) });
    const f = fillZone(board(gnd, z), z);
    const pts = allPts(f);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(mm(5), 6);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(mm(18), 6);
    expect(inFill(f, P(25, 25))).toBe(false);
  });

  it('ignores zones on non copper layers and outside the board', () => {
    const gnd = footprint(mm(10), mm(10), [tht('1', 0, 0)], { '1': 'GND' });
    const silk = zone('GND', { layer: 'L0' });
    const outside = zone('GND', { points: rect(-mm(20), -mm(20), -mm(5), -mm(5)) });
    const doc = board(gnd, silk, outside);
    expect(fillZone(doc, silk)).toEqual([]);
    expect(fillZone(doc, outside)).toEqual([]);
  });

  describe('priorities', () => {
    function twoZones(vccPriority: number, gndPriority: number) {
      const vccPad = footprint(mm(10), mm(15), [tht('1', 0, 0)], { '1': 'VCC' });
      const gndPad = footprint(mm(30), mm(15), [tht('1', 0, 0)], { '1': 'GND' });
      const vcc = zone('VCC', { points: rect(mm(2), mm(2), mm(20), mm(28)), priority: vccPriority });
      const gnd = zone('GND', { priority: gndPriority });
      return { doc: board(vccPad, gndPad, vcc, gnd), vcc, gnd };
    }

    it('lets a lower priority zone keep clearance from a higher one', () => {
      const { doc, vcc, gnd } = twoZones(1, 0);
      const all = fillAllZones(doc);
      const fv = all.get(vcc.id)!;
      const fg = all.get(gnd.id)!;
      expect(fv.length).toBeGreaterThan(0);
      expect(fg.length).toBeGreaterThan(0);
      expect(inFill(fv, P(10, 25))).toBe(true);
      expect(inFill(fg, P(10, 25))).toBe(false);
      expect(inFill(fg, P(35, 25))).toBe(true);
      const gap = fillsGap(fv, fg);
      expect(gap).toBeGreaterThanOrEqual(c - TOL);
      expect(gap).toBeLessThan(c + mm(0.05));
      // fillZone computes the higher zones it depends on itself
      expect(fillZone(doc, gnd)).toEqual(fg);
    });

    it('swaps when the priorities are swapped', () => {
      const { doc, vcc, gnd } = twoZones(0, 1);
      const all = fillAllZones(doc);
      const fv = all.get(vcc.id)!;
      const fg = all.get(gnd.id)!;
      expect(inFill(fg, P(10, 25))).toBe(true);
      // the whole VCC area is taken by GND: nothing useful is left
      expect(fv).toEqual([]);
    });

    it('is not blocked by a higher zone without fill', () => {
      const { doc, gnd } = twoZones(0, 0);
      const dead = zone('NC', { points: rect(mm(22), mm(2), mm(38), mm(28)), priority: 5 });
      doc.items.push(dead);
      const all = fillAllZones(doc);
      expect(all.get(dead.id)).toEqual([]);
      expect(inFill(all.get(gnd.id)!, P(35, 25))).toBe(true);
    });

    it('lets same net zones overlap', () => {
      const { doc, gnd } = twoZones(0, 0);
      const gnd2 = zone('GND', { points: rect(mm(22), mm(2), mm(38), mm(28)), priority: 5 });
      doc.items.push(gnd2);
      const all = fillAllZones(doc);
      expect(inFill(all.get(gnd.id)!, P(35, 25))).toBe(true);
      expect(inFill(all.get(gnd2.id)!, P(35, 25))).toBe(true);
    });
  });

  it('produces simple rings: outer positive, holes negative', () => {
    const { doc, z } = basic();
    const f = fillZone(doc, z);
    for (const poly of f) {
      expect(polygonArea(poly[0])).toBeGreaterThan(0);
      for (const h of poly.slice(1)) expect(polygonArea(h)).toBeLessThan(0);
    }
    expect(f[0].length).toBeGreaterThan(1);
  });

  it('computes signed ring areas', () => {
    const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 0, y: 3 }];
    expect(polygonArea(sq)).toBe(6);
    expect(polygonArea([...sq].reverse())).toBe(-6);
  });

  it('renders SVG path data', () => {
    const { doc, z } = basic();
    const f = fillZone(doc, z);
    const d = zoneFillPath(f);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/M/g)!.length).toBe(f.reduce((n, p) => n + p.length, 0));
    expect(zoneFillPath([])).toBe('');
  });

  it('fills a board with ~500 obstacles in under a second', () => {
    const doc = createPcbDoc(mm(100), mm(80));
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pads: PadDef[] = [];
    const nets: Record<string, string> = {};
    for (let i = 0; i < 18; i++) {
      for (let j = 0; j < 16; j++) {
        const num = `${i}-${j}`;
        pads.push(tht(num, i * mm(5.08), j * mm(5.08)));
        nets[num] = (i + j) % 3 === 0 ? 'GND' : `N${i}`;
      }
    }
    doc.items.push(footprint(mm(5), mm(2), pads, nets));
    for (let k = 0; k < 160; k++) {
      const x = mm(5 + rnd() * 85);
      const y = mm(4.5 + Math.floor(rnd() * 15) * 5.08);
      doc.items.push(track(x, y, x + mm(3 + rnd() * 6), y, `N${k % 18}`));
    }
    for (let k = 0; k < 60; k++) doc.items.push(via(mm(5 + rnd() * 90), mm(5 + rnd() * 70), k % 4 ? `N${k % 18}` : 'GND'));
    const z = zone('GND', { points: rect(0, 0, mm(100), mm(80)) });
    doc.items.push(z);
    expect(pads.length + 160 + 60).toBeGreaterThanOrEqual(500);
    const t0 = performance.now();
    const f = fillAllZones(doc).get(z.id)!;
    const dt = performance.now() - t0;
    expect(f.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(1000);
  });
});
