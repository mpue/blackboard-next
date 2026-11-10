// What the circuit tells a microcontroller after an operating point: its
// supply voltage, the logic level on every pin and the voltages on the
// analog inputs.

import type { NetlistResult } from '../spice/netlist.ts';
import { AREF_PIN, AVCC_PIN, GND_PINS, IO_PINS, VCC_PIN, type Drives } from './pinout.ts';

export interface McuInputs {
  vcc: number;
  avcc: number;
  aref: number;
  /** pin number -> logic level */
  digital: Record<number, boolean>;
  /** ADC channel -> volts */
  analog: Record<number, number>;
}

/**
 * Reads the inputs from the node voltages ("v(3)" -> volts). Levels between
 * the datasheet thresholds (0.3 / 0.6 VCC) keep their previous value, like
 * the Schmitt triggers of the real pins; unconnected pins read their pull-up.
 */
export function readInputs(mcu: NetlistResult['mcus'][number], vectors: Map<string, number>, previous: Record<number, boolean> = {}, drives: Drives = {}): McuInputs {
  const at = (num: number): number | undefined => {
    const node = mcu.nodes[num];
    if (node === undefined) return undefined;
    const v = node === '0' ? 0 : vectors.get(`v(${node})`);
    return v !== undefined && Number.isFinite(v) ? v : undefined;
  };
  const gndPin = GND_PINS.find((n) => mcu.nodes[n] !== undefined);
  const gnd = gndPin === undefined ? 0 : (at(gndPin) ?? 0);
  const rel = (num: number) => {
    const v = at(num);
    return v === undefined ? undefined : v - gnd;
  };
  const vcc = gndPin === undefined ? 0 : Math.max(0, rel(VCC_PIN) ?? 0);
  const avcc = rel(AVCC_PIN) ?? vcc;
  const aref = rel(AREF_PIN) ?? avcc;
  const digital: Record<number, boolean> = {};
  const analog: Record<number, number> = {};
  for (const p of IO_PINS) {
    const v = rel(p.num);
    if (v === undefined) digital[p.num] = drives[p.num] === 'PU' || drives[p.num] === 'H';
    else if (v >= 0.6 * vcc) digital[p.num] = true;
    else if (v <= 0.3 * vcc) digital[p.num] = false;
    else digital[p.num] = previous[p.num] ?? false;
    if (p.adc !== undefined) analog[p.adc] = Math.max(0, v ?? 0);
  }
  return { vcc, avcc, aref, digital, analog };
}
