import { describe, expect, it } from 'vitest';
import type { FootprintDef, FootprintGraphic, PadDef } from '../../model/types.ts';
import { padShapeLocal, pointGap } from '../geometry.ts';
import { footprintById } from '../footprints/index.ts';
import { mm } from '../units.ts';
import {
  autoCourtyard,
  autoRefPos,
  clipSilk,
  duplicateSelection,
  emptyFootprint,
  finalizeFootprint,
  hitTest,
  moveSelection,
  nextPadNumber,
  normalizeOrigin,
  padArray,
  padBounds,
  padKey,
  rotateSelection,
  silkKey,
  silkViolations,
  validateFootprint,
  type PadTemplate,
} from './model.ts';

const THT: PadTemplate = { shape: 'oval', w: mm(2.4), h: mm(1.6), drill: mm(0.8) };

function samePads(a: PadDef[], b: PadDef[]) {
  expect(a.map((p) => p.num)).toEqual(b.map((p) => p.num));
  a.forEach((p, i) => {
    const q = b[i];
    expect(p.shape).toBe(q.shape);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(p[k] - q[k])).toBeLessThan(1e-6);
    expect(Math.abs((p.drill ?? 0) - (q.drill ?? 0))).toBeLessThan(1e-6);
  });
}

function fp(pads: PadDef[], silk: FootprintGraphic[] = []): FootprintDef {
  return { ...emptyFootprint('tht'), id: 'T', name: 'T', pads, silk };
}

/** points along the centre line of a silk graphic */
function samples(g: FootprintGraphic): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (g.kind === 'line') for (let i = 0; i <= 100; i++) out.push({ x: g.x1 + ((g.x2 - g.x1) * i) / 100, y: g.y1 + ((g.y2 - g.y1) * i) / 100 });
  if (g.kind === 'arc')
    for (let i = 0; i <= 100; i++) {
      const a = ((g.start + (g.sweep * i) / 100) * Math.PI) / 180;
      out.push({ x: g.cx + g.r * Math.cos(a), y: g.cy + g.r * Math.sin(a) });
    }
  return out;
}

describe('padArray', () => {
  it('builds DIP-8 like the library (numbering and positions)', () => {
    const lib = footprintById('DIP-8_W7.62mm')!;
    const pads = padArray({ pattern: 'dip', count: 8, pitch: mm(2.54), rowSpacing: mm(7.62), pad: THT, firstShape: 'rect' });
    expect(pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    samePads(pads, lib.pads);
    // pin 5 opposite pin 4, pin 8 opposite pin 1
    expect(pads[4].y).toBeCloseTo(pads[3].y, 9);
    expect(pads[7].y).toBeCloseTo(0, 9);
  });

  it('numbers a 2x5 header zig-zag like the library', () => {
    const lib = footprintById('PinHeader_2x05_P2.54mm')!;
    const pads = padArray({ pattern: 'zigzag', count: 10, pitch: mm(2.54), rowSpacing: mm(2.54), pad: { shape: 'oval', w: mm(1.7), h: mm(1.7), drill: mm(1) }, firstShape: 'rect' });
    expect(pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    samePads(pads, lib.pads);
    expect(pads[1].x).toBeCloseTo(mm(2.54), 9);
    expect(pads[1].y).toBeCloseTo(0, 9);
    expect(pads[2].x).toBeCloseTo(0, 9);
  });

  it('numbers QFP-32 counter clockwise from the top of the left side', () => {
    const lib = footprintById('TQFP-32_7x7mm_P0.8mm')!;
    const pads = padArray({ pattern: 'quad', count: 32, pitch: mm(0.8), rowSpacing: mm(2 * 4.1625), pad: { shape: 'roundrect', w: mm(1.475), h: mm(0.55), roundness: 0.25 } });
    samePads(pads, lib.pads);
    const at = (n: number) => pads.find((p) => p.num === String(n))!;
    // left side top to bottom, bottom side left to right, right side upwards, top side leftwards
    expect(at(1).x).toBeLessThan(0);
    expect(at(1).y).toBeLessThan(at(8).y);
    expect(at(9).y).toBeGreaterThan(0);
    expect(at(9).x).toBeLessThan(at(16).x);
    expect(at(17).x).toBeGreaterThan(0);
    expect(at(17).y).toBeGreaterThan(at(24).y);
    expect(at(25).y).toBeLessThan(0);
    expect(at(25).x).toBeGreaterThan(at(32).x);
    // top and bottom pads are turned
    expect(at(9).w).toBeCloseTo(mm(0.55), 9);
    expect(at(9).h).toBeCloseTo(mm(1.475), 9);
  });

  it('places a single row downwards or to the right, with a start number and anchor', () => {
    const down = padArray({ pattern: 'single', count: 3, pitch: mm(2.54), pad: THT, start: 5, at: { x: 10, y: 20 } });
    expect(down.map((p) => [p.num, p.x, p.y])).toEqual([
      ['5', 10, 20],
      ['6', 10, 20 + mm(2.54)],
      ['7', 10, 20 + 2 * mm(2.54)],
    ].map(([n, x, y]) => [n, Math.round((x as number) * 1e6) / 1e6, Math.round((y as number) * 1e6) / 1e6]));
    const right = padArray({ pattern: 'single', count: 3, pitch: 16, pad: THT, direction: 'right', anchor: 'center' });
    expect(right.map((p) => p.x)).toEqual([-16, 0, 16]);
  });

  it('names a BGA grid A1… and skips the letter I', () => {
    const pads = padArray({ pattern: 'grid', count: 0, cols: 3, rows: 9, pitch: 8, pad: { shape: 'circle', w: 4, h: 4 } });
    expect(pads).toHaveLength(27);
    expect(pads.slice(0, 4).map((p) => p.num)).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect(pads.map((p) => p.num)).not.toContain('I1');
    expect(pads.at(-1)!.num).toBe('J3');
    // centred
    expect(pads[0].x + pads.at(-1)!.x).toBeCloseTo(0, 9);
    const numeric = padArray({ pattern: 'grid', count: 0, cols: 2, rows: 2, pitch: 8, pad: { shape: 'circle', w: 4, h: 4 }, naming: 'numeric' });
    expect(numeric.map((p) => p.num)).toEqual(['1', '2', '3', '4']);
  });
});

describe('numbering', () => {
  it('continues after the highest number', () => {
    expect(nextPadNumber({ pads: [] })).toBe('1');
    expect(nextPadNumber(fp(padArray({ pattern: 'dip', count: 8, pitch: 16, rowSpacing: 48, pad: THT })))).toBe('9');
    expect(nextPadNumber(fp([{ num: 'A3', x: 0, y: 0, shape: 'circle', w: 4, h: 4 }]))).toBe('A4');
  });
});

describe('courtyard and designator', () => {
  it('encloses pads and silk with 0.25 mm on a 0.05 mm grid', () => {
    const def = fp([{ num: '1', x: 0, y: 0, shape: 'rect', w: mm(2), h: mm(1) }], [{ kind: 'line', x1: 0, y1: mm(-2), x2: mm(3), y2: mm(-2), width: mm(0.2) }]);
    const c = autoCourtyard(def);
    const r = (v: number) => Math.round((v / mm(1)) * 1000) / 1000;
    // pads -1..1 x -0.5..0.5, silk 0..3 at y=-2 (± 0.1)
    expect([r(c.x), r(c.y), r(c.x + c.w), r(c.y + c.h)]).toEqual([-1.25, -2.35, 3.35, 0.75]);
    const ref = autoRefPos({ ...def, courtyard: c });
    expect(ref.x).toBeCloseTo(c.x + c.w / 2, 6);
    expect(ref.y).toBeCloseTo(c.y - mm(0.8), 6);
  });

  it('matches the library courtyard for a footprint without silk outside the body', () => {
    const lib = footprintById('PinHeader_1x01_P2.54mm')!;
    const c = autoCourtyard({ pads: lib.pads, silk: [] });
    const p = padBounds(lib.pads[0]);
    expect(c.x).toBeLessThanOrEqual(p.x - mm(0.25) + 1e-6);
    expect(c.x + c.w).toBeGreaterThanOrEqual(p.x + p.w + mm(0.25) - 1e-6);
  });
});

describe('clipSilk', () => {
  it('keeps 0.2 mm between silkscreen and copper', () => {
    const pads = padArray({ pattern: 'dip', count: 8, pitch: mm(2.54), rowSpacing: mm(7.62), pad: THT, firstShape: 'rect' });
    const width = mm(0.15);
    const silk: FootprintGraphic[] = [
      // straight through the left pad column, across the package, and a circle around pad 1
      { kind: 'line', x1: 0, y1: mm(-2), x2: 0, y2: mm(10), width },
      { kind: 'line', x1: mm(-2), y1: mm(2.54), x2: mm(10), y2: mm(2.54), width },
      { kind: 'circle', cx: 0, cy: 0, r: mm(1.3), width },
      { kind: 'rect', x: mm(-1.3), y: mm(-1.3), w: mm(10.2), h: mm(10.2), width },
    ];
    const def = fp(pads, silk);
    expect(silkViolations(def).length).toBe(4);
    const out = clipSilk(def);
    expect(out.silk.length).toBeGreaterThan(4);
    const shapes = pads.map(padShapeLocal);
    for (const g of out.silk) {
      expect(['line', 'arc']).toContain(g.kind);
      for (const p of samples(g)) for (const s of shapes) expect(pointGap(p, s) - g.width / 2).toBeGreaterThanOrEqual(mm(0.2) - 2e-3);
    }
    // idempotent, nothing left to clip
    expect(silkViolations(out)).toEqual([]);
    expect(clipSilk(out).silk).toHaveLength(out.silk.length);
  });

  it('leaves silk away from copper untouched', () => {
    const g: FootprintGraphic = { kind: 'rect', x: mm(5), y: mm(5), w: mm(2), h: mm(2), width: mm(0.15) };
    const out = clipSilk(fp([{ num: '1', x: 0, y: 0, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) }], [g]));
    expect(out.silk).toEqual([g]);
  });
});

describe('validateFootprint', () => {
  const codes = (def: FootprintDef) => validateFootprint(def).map((i) => i.code);

  it('finds overlapping pads', () => {
    const def = fp([
      { num: '1', x: 0, y: 0, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) },
      { num: '2', x: mm(1), y: 0, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) },
      { num: '3', x: mm(5), y: 0, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) },
    ]);
    const issues = validateFootprint(def);
    const overlap = issues.filter((i) => i.code === 'overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0].severity).toBe('error');
    expect(overlap[0].pads).toEqual([0, 1]);
  });

  it('accepts overlapping copper of the same pad number but warns about duplicates', () => {
    const def = fp([
      { num: '1', x: 0, y: 0, shape: 'rect', w: mm(2), h: mm(2) },
      { num: '1', x: mm(1), y: 0, shape: 'rect', w: mm(2), h: mm(2) },
    ]);
    const c = codes(def);
    expect(c).not.toContain('overlap');
    expect(c).toContain('duplicateNumber');
  });

  it('reports a missing id, drills larger than the pad, thin rings and close pads', () => {
    const def: FootprintDef = {
      ...fp([
        { num: '1', x: 0, y: 0, shape: 'circle', w: mm(1), h: mm(1), drill: mm(1) },
        { num: '2', x: mm(3), y: 0, shape: 'circle', w: mm(1), h: mm(1), drill: mm(0.8) },
        { num: '3', x: mm(4.05), y: 0, shape: 'circle', w: mm(1), h: mm(1) },
      ]),
      id: ' ',
    };
    const c = codes(def);
    expect(c).toContain('emptyId');
    expect(c).toContain('drillTooLarge');
    expect(c).toContain('annularRing');
    expect(c).toContain('tightGap');
    expect(c).toContain('noCourtyard');
  });

  it('is clean for library footprints', () => {
    for (const id of ['DIP-8_W7.62mm', 'TQFP-32_7x7mm_P0.8mm', 'PinHeader_2x05_P2.54mm']) {
      const errors = validateFootprint(footprintById(id)!).filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
    }
  });
});

describe('normalizeOrigin', () => {
  const pads = padArray({ pattern: 'dip', count: 8, pitch: mm(2.54), rowSpacing: mm(7.62), pad: THT, anchor: 'center', at: { x: 7, y: -3 } });
  const def: FootprintDef = { ...fp(pads, [{ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, width: 1 }]), courtyard: { x: -40, y: -40, w: 80, h: 80 }, refPos: { x: 1, y: 2 } };

  it('moves pad 1 onto the origin, with silk, courtyard and designator', () => {
    const out = normalizeOrigin(def, 'pad1');
    const p1 = def.pads[0];
    expect(out.pads[0].x).toBeCloseTo(0, 9);
    expect(out.pads[0].y).toBeCloseTo(0, 9);
    expect(out.pads[7].x - out.pads[0].x).toBeCloseTo(mm(7.62), 6);
    const line = out.silk[0];
    expect(line.kind === 'line' && line.x1).toBeCloseTo(-p1.x, 6);
    expect(out.courtyard.x).toBeCloseTo(-40 - p1.x, 6);
    expect(out.refPos!.y).toBeCloseTo(2 - p1.y, 6);
  });

  it('centres the pads', () => {
    const out = normalizeOrigin(normalizeOrigin(def, 'pad1'), 'center');
    const xs = out.pads.map((p) => p.x);
    const ys = out.pads.map((p) => p.y);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 6);
    expect(normalizeOrigin(out, 'center')).toBe(out);
  });
});

describe('editing', () => {
  const def = fp(padArray({ pattern: 'single', count: 2, pitch: 16, pad: { shape: 'rect', w: 8, h: 4 }, direction: 'right' }), [{ kind: 'line', x1: 0, y1: 10, x2: 16, y2: 10, width: 1 }]);

  it('hits pads before silk', () => {
    expect(hitTest(def, { x: 0, y: 0 }, 0.5)).toBe(padKey(0));
    expect(hitTest(def, { x: 8, y: 10.2 }, 0.5)).toBe(silkKey(0));
    expect(hitTest(def, { x: 8, y: 5 }, 0.5)).toBeNull();
  });

  it('moves, rotates and duplicates the selection', () => {
    const moved = moveSelection(def, [padKey(1)], 0, 8);
    expect(moved.pads[1]).toMatchObject({ x: 16, y: 8 });
    expect(moved.pads[0]).toBe(def.pads[0]);
    const turned = rotateSelection(def, [padKey(0), padKey(1)], 90);
    // around the centre (8, 0): the row becomes vertical, the pads turn
    expect(turned.pads.map((p) => [Math.round(p.x), Math.round(p.y), p.w, p.h])).toEqual([
      [8, -8, 4, 8],
      [8, 8, 4, 8],
    ]);
    const dup = duplicateSelection(def, [padKey(1), silkKey(0)], 0, 32);
    expect(dup.def.pads.at(-1)).toMatchObject({ num: '3', x: 16, y: 32 });
    expect(dup.sel).toEqual([padKey(2), silkKey(1)]);
  });

  it('finalizes with a derived courtyard and designator position', () => {
    const out = finalizeFootprint({ ...def, id: '  My_FP ', name: '', tags: [' a ', 'a', ''] });
    expect(out.id).toBe('My_FP');
    expect(out.name).toBe('My_FP');
    expect(out.tags).toEqual(['a']);
    // SMD pads only: the default "tht" tag of a new footprint becomes "smd"
    expect(finalizeFootprint({ ...def, id: 'X', tags: ['tht', 'b'] }).tags).toEqual(['smd', 'b']);
    expect(out.courtyard.w).toBeGreaterThan(0);
    expect(out.refPos).toBeDefined();
  });
});
