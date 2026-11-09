// PCB dimensions are stored in board units (16 units = 2.54 mm) as floats;
// the UI and the fabrication outputs work in mm (or mil).

import { MM_PER_UNIT } from '../model/types.ts';

/** millimetres -> board units */
export const mm = (v: number) => v / MM_PER_UNIT;
/** board units -> millimetres */
export const toMm = (u: number) => u * MM_PER_UNIT;
/** mil (1/1000 inch) -> board units */
export const mil = (v: number) => mm(v * 0.0254);
/** board units -> mil */
export const toMil = (u: number) => toMm(u) / 0.0254;

/** "0.25 mm" style label, trailing zeros removed */
export function fmtMm(u: number, digits = 2): string {
  return `${parseFloat(toMm(u).toFixed(digits))} mm`;
}
