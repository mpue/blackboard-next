import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartDef } from '../model/types.ts';
import { footprintFromPart, partDesignator } from './fromParts.ts';
import { designatorForFootprint } from './place.ts';
import { toMm } from './units.ts';

const parts = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'parts.json'), 'utf8')) as PartDef[];

describe('footprints from the classic part library', () => {
  it('turns every part with pins into a through-hole footprint', () => {
    const fps = parts.map(footprintFromPart).filter((f) => !!f);
    expect(fps.length).toBe(parts.filter((p) => p.pins.length).length);
    expect(new Set(fps.map((f) => f.id)).size).toBe(fps.length);
    for (const f of fps) {
      expect(f.pads.every((p) => p.drill && p.drill > 0)).toBe(true);
      const c = f.courtyard;
      for (const p of f.pads) {
        expect(p.x).toBeGreaterThanOrEqual(c.x);
        expect(p.y).toBeGreaterThanOrEqual(c.y);
        expect(p.x).toBeLessThanOrEqual(c.x + c.w);
        expect(p.y).toBeLessThanOrEqual(c.y + c.h);
      }
    }
  });

  it('keeps the 0.1 inch pin raster with pad 1 at the origin', () => {
    const atmega = footprintFromPart(parts.find((p) => p.name === 'ATMega32')!)!;
    expect(atmega.pads).toHaveLength(40);
    const pad1 = atmega.pads.find((p) => p.num === '1')!;
    expect([pad1.x, pad1.y, pad1.shape]).toEqual([0, 0, 'rect']);
    const pad2 = atmega.pads.find((p) => p.num === '2')!;
    expect(toMm(pad2.y)).toBeCloseTo(2.54, 6);
    expect(partDesignator(atmega)).toBe('U');
    const disc = footprintFromPart(parts.find((p) => p.packageType === 'CCER')!)!;
    expect(designatorForFootprint(disc)).toBe('C');
  });
});
