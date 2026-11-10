// Round scales for dials, knobs and meters (ScaleDesignerDialog of the classic
// BlackBoard): major ticks with captions, minor ticks in between, an optional
// arc and a centre hole. The scale is made of loose lines, texts and ellipses.

import type { EllipseGeom, LineGeom, TextGeom } from '../model/types.ts';
import { MM_PER_UNIT } from '../model/types.ts';
import { estimateTextWidth, type Pt } from '../geometry/geom.ts';

export interface ScaleParams {
  /** major divisions */
  steps: number;
  /** minor ticks between two major ticks */
  minor: number;
  /** first major tick, degrees clockwise from 12 o'clock */
  start: number;
  /** extent of the scale in degrees, 360 = full circle */
  sweep: number;
  /** outer end of the ticks, mm */
  radius: number;
  /** tick lengths from the outer end inwards, mm */
  majorLength: number;
  minorLength: number;
  thickness: number;
  minorThickness: number;
  captions: boolean;
  captionsInside: boolean;
  startValue: number;
  /** value from one major tick to the next */
  stepValue: number;
  fontSize: number;
  /** arc along the outer end of the ticks */
  arc: boolean;
  /** diameter of the centre hole in mm, 0 = none */
  hole: number;
  color: string;
}

export type ScaleShape = LineGeom | TextGeom | EllipseGeom;

export const DEFAULT_SCALE: ScaleParams = {
  steps: 10,
  minor: 4,
  start: -135,
  sweep: 270,
  radius: 16,
  majorLength: 4,
  minorLength: 2,
  thickness: 2,
  minorThickness: 1,
  captions: true,
  captionsInside: false,
  startValue: 0,
  stepValue: 1,
  fontSize: 10,
  arc: true,
  hole: 7,
  color: '#000000',
};

/** start and extent of the usual scale shapes */
export const SCALE_PRESETS = [
  { id: 'meter', start: -135, sweep: 270 },
  { id: 'knob', start: -150, sweep: 300 },
  { id: 'half', start: -90, sweep: 180 },
  { id: 'quarter', start: -45, sweep: 90 },
  { id: 'full', start: 0, sweep: 360 },
] as const;

const r2 = (v: number) => Math.round(v * 100) / 100;
const units = (mm: number) => mm / MM_PER_UNIT;

/** point `r` units from `c`, `a` degrees clockwise from 12 o'clock */
function polar(c: Pt, r: number, a: number): Pt {
  const t = (a * Math.PI) / 180;
  return { x: c.x + r * Math.sin(t), y: c.y - r * Math.cos(t) };
}

/** The shapes of a scale centred on `c` (board units). */
export function scaleShapes(p: ScaleParams, c: Pt, format: (v: number) => string = String): ScaleShape[] {
  const steps = Math.max(1, Math.round(p.steps));
  const minor = Math.max(0, Math.round(p.minor));
  const sweep = Math.min(360, Math.max(1, p.sweep));
  const full = sweep >= 360;
  const R = units(Math.max(0.1, p.radius));
  const div = sweep / steps;
  const out: ScaleShape[] = [];
  const tick = (a: number, len: number, thickness: number): LineGeom => {
    const from = polar(c, Math.max(0, R - units(len)), a);
    const to = polar(c, R, a);
    return { kind: 'line', x1: r2(from.x), y1: r2(from.y), x2: r2(to.x), y2: r2(to.y), color: p.color, thickness, startType: 'STRAIGHT', endType: 'STRAIGHT' };
  };
  if (p.arc) {
    out.push({
      kind: 'ellipse',
      x: r2(c.x - R),
      y: r2(c.y - R),
      w: r2(2 * R),
      h: r2(2 * R),
      color: p.color,
      thickness: p.minorThickness,
      style: 'OUTLINED',
      // java.awt arcs run counter clockwise from 3 o'clock
      startAngle: full ? 0 : r2(90 - p.start - sweep),
      arcAngle: full ? 360 : sweep,
    });
  }
  if (p.hole > 0) {
    const h = units(p.hole) / 2;
    out.push({ kind: 'ellipse', x: r2(c.x - h), y: r2(c.y - h), w: r2(2 * h), h: r2(2 * h), color: p.color, thickness: p.minorThickness, style: 'OUTLINED', startAngle: 0, arcAngle: 360 });
  }
  // on a full circle the last major tick would land on the first one
  const majors = full ? steps : steps + 1;
  for (let i = 0; i < majors; i++) {
    const a = p.start + i * div;
    out.push(tick(a, p.majorLength, p.thickness));
    if (i < steps) for (let k = 1; k <= minor; k++) out.push(tick(a + (div * k) / (minor + 1), p.minorLength, p.minorThickness));
    if (!p.captions) continue;
    const text = format(p.startValue + i * p.stepValue);
    const w = estimateTextWidth(text, p.fontSize);
    // digits are about 0.72 em high; the caption box keeps a gap to the ticks in every direction
    const h = p.fontSize * 0.72;
    const t = (a * Math.PI) / 180;
    const reach = (Math.abs(Math.sin(t)) * w) / 2 + (Math.abs(Math.cos(t)) * h) / 2;
    const gap = Math.max(2, p.fontSize * 0.3);
    const r = p.captionsInside ? R - units(p.majorLength) - gap - reach : R + gap + reach;
    const m = polar(c, Math.max(0, r), a);
    out.push({ kind: 'text', x: r2(m.x - w / 2), y: r2(m.y + h / 2), text, font: 'Arial', fontSize: p.fontSize, rotation: 0, textType: 'TEXT', color: p.color });
  }
  return out;
}
