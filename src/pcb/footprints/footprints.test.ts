import { describe, expect, it } from 'vitest';
import type { FootprintDef, FootprintGraphic, PadDef } from '../../model/types.ts';
import { padShapeLocal, pointGap, polygonDistance, type CopperShape } from '../geometry.ts';
import { mm, toMm } from '../units.ts';
import { FOOTPRINT_CATEGORIES, FOOTPRINTS, footprintById, searchFootprints } from './index.ts';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const two = (n: number) => String(n).padStart(2, '0');

const REQUIRED = [
  'R_Axial_P7.62mm',
  'R_Axial_P10.16mm',
  'R_Axial_P12.70mm',
  'R_Axial_P15.24mm',
  'R_Axial_Vertical_P2.54mm',
  'D_DO-35_P7.62mm',
  'D_DO-35_P10.16mm',
  'D_DO-41_P10.16mm',
  'D_DO-201_P15.24mm',
  'C_Disc_P2.54mm',
  'C_Disc_P5.08mm',
  'C_Rect_P5.00mm',
  'C_Rect_P7.50mm',
  'CP_Radial_D5.0mm_P2.00mm',
  'CP_Radial_D6.3mm_P2.50mm',
  'CP_Radial_D8.0mm_P3.50mm',
  'CP_Radial_D10.0mm_P5.00mm',
  'CP_Radial_D12.5mm_P5.00mm',
  'L_Axial_P10.16mm',
  'L_Radial_D8.0mm_P5.00mm',
  'LED_3mm',
  'LED_5mm',
  'TO-92',
  'TO-92_Wide',
  'TO-92_CBE',
  'TO-92_EBC',
  'TO-92_DGS',
  'TO-220',
  'TO-220_GDS',
  'TO-220_BCE',
  'TO-220_Horizontal',
  ...[4, 6, 8, 14, 16, 18, 20, 24, 28].map((n) => `DIP-${n}_W7.62mm`),
  ...[24, 28, 32, 40, 48].map((n) => `DIP-${n}_W15.24mm`),
  ...range(1, 20).map((n) => `PinHeader_1x${two(n)}_P2.54mm`),
  ...range(2, 20).map((n) => `PinHeader_2x${two(n)}_P2.54mm`),
  ...range(2, 6).map((n) => `TerminalBlock_1x${two(n)}_P5.08mm`),
  ...range(2, 4).map((n) => `TerminalBlock_1x${two(n)}_P3.50mm`),
  'Crystal_HC49-U',
  'Crystal_HC49-4H',
  'Potentiometer_Trimmer_P2.54mm',
  'Potentiometer_RK09_Vertical',
  'SW_PUSH_6mm',
  'Buzzer_12x9.5RM7.6',
  'MountingHole_3.2mm_M3',
  'MountingHole_2.2mm_M2',
  'MountingHole_3.2mm_M3_Pad',
  'TestPoint_THT_D1.0mm',
  'R_0402',
  'R_0603',
  'R_0805',
  'R_1206',
  'R_2512',
  'C_0402',
  'C_0603',
  'C_0805',
  'C_1206',
  'LED_0603',
  'LED_0805',
  'L_1210',
  'D_SOD-123',
  'D_SMA',
  'D_SMB',
  'D_MiniMELF',
  'SOT-23',
  'SOT-23-5',
  'SOT-23-6',
  'SOT-223',
  'TO-252',
  'SOIC-8_3.9x4.9mm_P1.27mm',
  'SOIC-14_3.9x8.7mm_P1.27mm',
  'SOIC-16_3.9x9.9mm_P1.27mm',
  'SOIC-16W_7.5x10.3mm_P1.27mm',
  'SOIC-20W_7.5x12.8mm_P1.27mm',
  'SOIC-28W_7.5x17.9mm_P1.27mm',
  'TSSOP-14_4.4x5mm_P0.65mm',
  'TSSOP-16_4.4x5mm_P0.65mm',
  'TSSOP-20_4.4x6.5mm_P0.65mm',
  'MSOP-8_3x3mm_P0.65mm',
  'TQFP-32_7x7mm_P0.8mm',
  'TQFP-44_10x10mm_P0.8mm',
  'TQFP-64_10x10mm_P0.5mm',
  'CP_Elec_6.3x5.4',
  'TestPoint_Pad_D1.0mm',
];

const fp = (id: string): FootprintDef => {
  const f = footprintById(id);
  if (!f) throw new Error(`missing footprint ${id}`);
  return f;
};
const pad = (f: FootprintDef, num: string): PadDef => {
  const p = f.pads.find((q) => q.num === num);
  if (!p) throw new Error(`${f.id}: no pad ${num}`);
  return p;
};
const isTht = (f: FootprintDef) => f.pads.some((p) => p.drill && !p.npth);
const expectAt = (p: PadDef, xMm: number, yMm: number) => {
  expect(toMm(p.x)).toBeCloseTo(xMm, 4);
  expect(toMm(p.y)).toBeCloseTo(yMm, 4);
};

/** edge to edge gap between a silk graphic and pad copper (board units) */
function silkGap(g: FootprintGraphic, s: CopperShape): number {
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => polygonDistance([a, b], s.pts) - s.r;
  const ring = (cx: number, cy: number, r: number, start: number, sweep: number) => {
    let best = Infinity;
    const n = 720;
    for (let i = 0; i <= n; i++) {
      const a = ((start + (sweep * i) / n) * Math.PI) / 180;
      best = Math.min(best, pointGap({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }, s));
    }
    return best;
  };
  switch (g.kind) {
    case 'line':
      return seg({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }) - g.width / 2;
    case 'rect': {
      const c = [
        { x: g.x, y: g.y },
        { x: g.x + g.w, y: g.y },
        { x: g.x + g.w, y: g.y + g.h },
        { x: g.x, y: g.y + g.h },
      ];
      return Math.min(...c.map((p, i) => seg(p, c[(i + 1) % 4]))) - g.width / 2;
    }
    case 'circle':
      if (g.fill) return pointGap({ x: g.cx, y: g.cy }, s) - g.r - g.width / 2;
      return ring(g.cx, g.cy, g.r, 0, 360) - g.width / 2;
    case 'arc':
      return ring(g.cx, g.cy, g.r, g.start, g.sweep) - g.width / 2;
    case 'poly':
      return Math.min(...g.pts.map((p, i) => seg(p, g.pts[(i + 1) % g.pts.length]))) - g.width / 2;
  }
}

describe('footprint library', () => {
  it('contains every required footprint with unique ids', () => {
    const ids = FOOTPRINTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED) expect(footprintById(id), id).toBeDefined();
    expect(footprintById('nope')).toBeUndefined();
  });

  it('has complete metadata in the known categories', () => {
    for (const f of FOOTPRINTS) {
      expect(f.name, f.id).toBeTruthy();
      expect(f.description, f.id).toBeTruthy();
      expect(f.tags?.length, f.id).toBeGreaterThan(0);
      expect(FOOTPRINT_CATEGORIES, f.id).toContain(f.category);
      expect(f.refPos, f.id).toBeDefined();
      expect(f.refPos!.y, f.id).toBeLessThan(f.courtyard.y);
    }
  });

  it('has pads on every footprint except bare holes', () => {
    for (const f of FOOTPRINTS) {
      const copper = f.pads.filter((p) => !p.npth);
      if (f.pads.length && f.pads.every((p) => p.npth)) continue;
      expect(copper.length, f.id).toBeGreaterThan(0);
    }
    expect(fp('MountingHole_3.2mm_M3').pads).toEqual([expect.objectContaining({ npth: true })]);
    expect(toMm(fp('MountingHole_3.2mm_M3').pads[0].drill!)).toBeCloseTo(3.2);
    expect(toMm(fp('MountingHole_2.2mm_M2').pads[0].drill!)).toBeCloseTo(2.2);
    expect(toMm(pad(fp('MountingHole_3.2mm_M3_Pad'), '1').w)).toBeCloseTo(6);
  });

  it('puts pad 1 of THT footprints on the origin', () => {
    for (const f of FOOTPRINTS.filter(isTht)) expectAt(pad(f, '1'), 0, 0);
  });

  it('centres SMD footprints on the body with pad 1 on the left', () => {
    for (const f of FOOTPRINTS.filter((x) => !isTht(x) && x.pads.length > 1)) {
      const c = f.courtyard;
      expect(toMm(c.x + c.w / 2), f.id).toBeLessThan(1.5);
      expect(pad(f, '1').x, f.id).toBeLessThan(0);
    }
  });

  it('keeps pad numbers unique except for internally connected pads', () => {
    for (const f of FOOTPRINTS) {
      if (f.id === 'SW_PUSH_6mm' || f.id === 'Potentiometer_RK09_Vertical') continue;
      const nums = f.pads.filter((p) => !p.npth).map((p) => p.num);
      expect(new Set(nums).size, f.id).toBe(nums.length);
    }
    expect(fp('SW_PUSH_6mm').pads.map((p) => p.num)).toEqual(['1', '2', '1', '2']);
  });

  it('numbers DIP pins counter clockwise', () => {
    const f = fp('DIP-8_W7.62mm');
    expect(f.pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expectAt(pad(f, '1'), 0, 0);
    expectAt(pad(f, '4'), 0, 3 * 2.54);
    expectAt(pad(f, '5'), 7.62, 3 * 2.54);
    expectAt(pad(f, '8'), 7.62, 0);
    expect(pad(f, '1').shape).toBe('rect');
    expect(pad(f, '2').shape).toBe('oval');
    expect(toMm(pad(f, '2').w)).toBeCloseTo(2.4);
    expect(toMm(pad(f, '2').h)).toBeCloseTo(1.6);
    expect(toMm(pad(f, '2').drill!)).toBeCloseTo(0.8);
    const w = fp('DIP-40_W15.24mm');
    expect(w.pads).toHaveLength(40);
    expectAt(pad(w, '20'), 0, 19 * 2.54);
    expectAt(pad(w, '21'), 15.24, 19 * 2.54);
    expectAt(pad(w, '40'), 15.24, 0);
  });

  it('numbers double row headers like IDC connectors', () => {
    const f = fp('PinHeader_2x05_P2.54mm');
    expect(f.pads).toHaveLength(10);
    for (let i = 0; i < 5; i++) {
      expectAt(pad(f, String(2 * i + 1)), 0, i * 2.54);
      expectAt(pad(f, String(2 * i + 2)), 2.54, i * 2.54);
    }
    const s = fp('PinHeader_1x20_P2.54mm');
    expect(s.pads).toHaveLength(20);
    expectAt(pad(s, '20'), 0, 19 * 2.54);
    expect(toMm(pad(s, '1').drill!)).toBeCloseTo(1.0);
  });

  it('places SOIC-8 pads at 1.27 mm pitch with pad 1 top left', () => {
    const f = fp('SOIC-8_3.9x4.9mm_P1.27mm');
    const p1 = pad(f, '1');
    expect(toMm(pad(f, '2').y - p1.y)).toBeCloseTo(1.27, 4);
    expect(toMm(pad(f, '4').y - p1.y)).toBeCloseTo(3 * 1.27, 4);
    expectAt(p1, -2.475, -1.905);
    for (const p of f.pads) {
      expect(p1.x).toBeLessThanOrEqual(p.x + 1e-9);
      expect(p1.y).toBeLessThanOrEqual(p.y + 1e-9);
    }
    // counter clockwise: 5 bottom right, 8 top right
    expectAt(pad(f, '5'), 2.475, 1.905);
    expectAt(pad(f, '8'), 2.475, -1.905);
    expect(p1.drill).toBeUndefined();
  });

  it('numbers QFP pins counter clockwise from the top of the left side', () => {
    const f = fp('TQFP-32_7x7mm_P0.8mm');
    expect(f.pads).toHaveLength(32);
    expectAt(pad(f, '1'), -4.1625, -2.8);
    expectAt(pad(f, '8'), -4.1625, 2.8);
    expectAt(pad(f, '9'), -2.8, 4.1625);
    expectAt(pad(f, '17'), 4.1625, 2.8);
    expectAt(pad(f, '25'), 2.8, -4.1625);
    expectAt(pad(f, '32'), -2.8, -4.1625);
    expect(toMm(pad(f, '9').w)).toBeCloseTo(0.55);
    expect(f.silk.some((g) => g.kind === 'circle' && g.fill)).toBe(true);
    expect(fp('TQFP-64_10x10mm_P0.5mm').pads).toHaveLength(64);
  });

  it('lays out transistor packages like KiCad', () => {
    const sot = fp('SOT-23');
    expect(pad(sot, '1').x).toBeLessThan(0);
    expect(pad(sot, '2').x).toBeLessThan(0);
    expect(pad(sot, '3').x).toBeGreaterThan(0);
    expect(pad(sot, '1').y).toBeLessThan(pad(sot, '2').y);
    const sot5 = fp('SOT-23-5');
    expect(sot5.pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5']);
    expectAt(pad(sot5, '4'), 1.1375, 0.95);
    expectAt(pad(sot5, '5'), 1.1375, -0.95);
    const sot223 = fp('SOT-223');
    expect(toMm(pad(sot223, '4').h)).toBeCloseTo(3.8);
    const to220 = fp('TO-220');
    expect(to220.pads.map((p) => toMm(p.x))).toEqual([0, 2.54, 5.08].map((x) => expect.closeTo(x, 4)));
    expect(toMm(pad(to220, '2').drill!)).toBeCloseTo(1.1);
    expect(fp('TO-220_Horizontal').pads.some((p) => p.npth)).toBe(true);
    expect(toMm(pad(fp('TO-92'), '2').x)).toBeCloseTo(1.27, 4);
    expect(toMm(pad(fp('TO-92_Wide'), '3').x)).toBeCloseTo(5.08, 4);
  });

  it('names the pins of the pin specific variants', () => {
    const names = (id: string) => fp(id).pads.map((p) => `${p.num}${p.name}`);
    expect(names('TO-92_CBE')).toEqual(['1C', '2B', '3E']);
    expect(names('TO-92_EBC')).toEqual(['1E', '2B', '3C']);
    expect(names('TO-92_DGS')).toEqual(['1D', '2G', '3S']);
    expect(names('TO-220_GDS')).toEqual(['1G', '2D', '3S']);
    expect(names('TO-220_BCE')).toEqual(['1B', '2C', '3E']);
    expect(toMm(pad(fp('TO-92_CBE'), '2').x)).toBeCloseTo(2.54, 4);
    expect(pad(fp('TO-92'), '1').name).toBeUndefined();
  });

  it('uses IPC nominal chip land patterns', () => {
    const r = fp('R_0805');
    expectAt(pad(r, '1'), -0.9125, 0);
    expect(toMm(pad(r, '1').w)).toBeCloseTo(1.025);
    expect(toMm(pad(r, '1').h)).toBeCloseTo(1.4);
    expect(pad(r, '1').shape).toBe('roundrect');
    expect(pad(r, '1').roundness).toBe(0.25);
  });

  it('marks pad 1 as rectangular on polarised THT parts', () => {
    for (const id of ['D_DO-41_P10.16mm', 'CP_Radial_D8.0mm_P3.50mm', 'LED_5mm', 'DIP-14_W7.62mm', 'PinHeader_1x03_P2.54mm', 'TO-92']) {
      expect(pad(fp(id), '1').shape, id).toBe('rect');
      expect(pad(fp(id), '2').shape, id).not.toBe('rect');
    }
  });

  it('encloses all pads in the courtyard', () => {
    for (const f of FOOTPRINTS) {
      const c = f.courtyard;
      for (const p of f.pads) {
        const s = padShapeLocal(p);
        for (const q of s.pts) {
          expect(q.x - s.r, f.id).toBeGreaterThanOrEqual(c.x + mm(0.2));
          expect(q.x + s.r, f.id).toBeLessThanOrEqual(c.x + c.w - mm(0.2));
          expect(q.y - s.r, f.id).toBeGreaterThanOrEqual(c.y + mm(0.2));
          expect(q.y + s.r, f.id).toBeLessThanOrEqual(c.y + c.h - mm(0.2));
        }
      }
    }
  });

  it('keeps the silkscreen clear of pad copper', () => {
    for (const f of FOOTPRINTS) {
      const shapes = f.pads.map(padShapeLocal);
      for (const g of f.silk) {
        for (const s of shapes) {
          const gap = toMm(silkGap(g, s));
          if (gap < 0.15) throw new Error(`${f.id}: silk ${JSON.stringify(g)} ${gap.toFixed(3)} mm from copper`);
        }
      }
    }
  });

  it('draws silkscreen on every footprint with a body larger than its pads', () => {
    for (const f of FOOTPRINTS) {
      if (f.pads.every((p) => p.npth) || f.id === 'MountingHole_3.2mm_M3_Pad' || /_0402$/.test(f.id)) continue;
      expect(f.silk.length, f.id).toBeGreaterThan(0);
    }
  });

  it('draws the polarity marks', () => {
    // cathode band: vertical lines next to pad 1
    const d = fp('D_DO-35_P7.62mm');
    expect(d.silk.some((g) => g.kind === 'line' && g.x1 === g.x2 && toMm(g.x1) > 1.6 && toMm(g.x1) < 3.81)).toBe(true);
    // "+" above pad 1 and the body circle
    const cp = fp('CP_Radial_D10.0mm_P5.00mm');
    expect(cp.silk.some((g) => g.kind === 'circle' && toMm(g.r) > 5)).toBe(true);
    expect(cp.silk.filter((g) => g.kind === 'line' && Math.abs(g.x1) < mm(0.6) && g.y1 < 0)).toHaveLength(2);
    // LED flat side on the cathode
    const led = fp('LED_5mm');
    expect(led.silk.some((g) => g.kind === 'line' && g.x1 === g.x2 && g.x1 < 0)).toBe(true);
    // DIP notch
    expect(fp('DIP-8_W7.62mm').silk.some((g) => g.kind === 'arc' && toMm(g.cx) === 3.81)).toBe(true);
  });

  it('searches ids, names, descriptions and tags', () => {
    expect(searchFootprints('dip 8')[0].id).toBe('DIP-8_W7.62mm');
    expect(searchFootprints('DIP 8').map((f) => f.id)).toContain('DIP-8_W7.62mm');
    expect(searchFootprints('to-92 cbe').map((f) => f.id)).toEqual(['TO-92_CBE']);
    expect(searchFootprints('resistor 0805').map((f) => f.id)).toEqual(['R_0805']);
    expect(searchFootprints('header 2x05')[0].id).toBe('PinHeader_2x05_P2.54mm');
    expect(searchFootprints('electrolytic').every((f) => f.category === 'Capacitors')).toBe(true);
    expect(searchFootprints('')).toHaveLength(FOOTPRINTS.length);
    expect(searchFootprints('nothing like this')).toEqual([]);
  });

  it('groups the library by category', () => {
    const order = FOOTPRINTS.map((f) => FOOTPRINT_CATEGORIES.indexOf(f.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const c of FOOTPRINT_CATEGORIES) expect(FOOTPRINTS.some((f) => f.category === c), c).toBe(true);
  });
});
