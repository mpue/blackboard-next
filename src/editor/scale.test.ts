import { describe, expect, it } from 'vitest';
import { DEFAULT_SCALE, scaleShapes, type ScaleParams } from './scale.ts';
import { MM_PER_UNIT } from '../model/types.ts';

const c = { x: 400, y: 300 };
const plain: ScaleParams = { ...DEFAULT_SCALE, arc: false, hole: 0, captions: false, minor: 0 };

describe('scale designer', () => {
  it('puts both end ticks on an arc and skips the duplicate on a full circle', () => {
    expect(scaleShapes({ ...plain, steps: 10, sweep: 270 }, c)).toHaveLength(11);
    expect(scaleShapes({ ...plain, steps: 10, sweep: 360 }, c)).toHaveLength(10);
  });

  it('starts at the start angle and runs clockwise', () => {
    const [first, second] = scaleShapes({ ...plain, steps: 4, start: 0, sweep: 90 }, c);
    const R = plain.radius / MM_PER_UNIT;
    // 12 o'clock first, then clockwise towards 3 o'clock
    expect(first.kind === 'line' && [first.x2, first.y2]).toEqual([400, Math.round((300 - R) * 100) / 100]);
    expect(second.kind === 'line' && second.x2 > 400 && second.y2 > 300 - R).toBe(true);
  });

  it('adds minor ticks between the major ticks only', () => {
    const shapes = scaleShapes({ ...plain, steps: 5, minor: 4, sweep: 180 }, c);
    expect(shapes.filter((s) => s.kind === 'line')).toHaveLength(6 + 5 * 4);
    expect(shapes.filter((s) => s.kind === 'line' && s.thickness === plain.minorThickness)).toHaveLength(20);
  });

  it('labels the major ticks with formatted values outside the ticks', () => {
    const shapes = scaleShapes({ ...plain, steps: 4, start: -90, sweep: 180, captions: true, startValue: 0, stepValue: 0.5 }, c, (v) => v.toLocaleString('de'));
    const texts = shapes.filter((s) => s.kind === 'text');
    expect(texts.map((s) => s.kind === 'text' && s.text)).toEqual(['0', '0,5', '1', '1,5', '2']);
    const R = plain.radius / MM_PER_UNIT;
    const top = texts[2];
    // the caption at 12 o'clock sits above the outer end of its tick
    expect(top.kind === 'text' && top.y < 300 - R).toBe(true);
  });

  it('draws the arc over the scale and a centre hole', () => {
    const shapes = scaleShapes({ ...plain, arc: true, hole: 6, start: -135, sweep: 270 }, c);
    const [arc, hole] = shapes;
    expect(arc).toMatchObject({ kind: 'ellipse', startAngle: -45, arcAngle: 270 });
    expect(hole.kind === 'ellipse' && Math.round(hole.w * MM_PER_UNIT)).toBe(6);
  });
});
