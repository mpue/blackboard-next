// What the circuit tells a microcontroller after an operating point: its
// supply voltage, the logic level on every pin and the voltages on the
// analog inputs.

import type { NetlistResult } from '../spice/netlist.ts';
import { AREF_PIN, AVCC_PIN, MODELS, type Drives } from './pinout.ts';

export interface McuInputs {
  vcc: number;
  /** ADC references (ATmega: AVCC and AREF; the ESP32 converts against its own reference) */
  avcc: number;
  aref: number;
  /** symbol pin number -> logic level */
  digital: Record<number, boolean>;
  /** symbol pin number -> volts, for the pins with an ADC */
  analog: Record<number, number>;
}

/**
 * Reads the inputs from the node voltages ("v(3)" -> volts). Levels between
 * the thresholds of the chip (ATmega 0.3 / 0.6 VCC, ESP32 0.25 / 0.75 VDD)
 * keep their previous value, like the Schmitt triggers of the real pins;
 * unconnected pins read their pull-up or pull-down.
 */
export function readInputs(mcu: NetlistResult['mcus'][number], vectors: Map<string, number>, previous: Record<number, boolean> = {}, drives: Drives = {}): McuInputs {
  const model = MODELS[mcu.kind];
  const volts = (node: string | undefined): number | undefined => {
    if (node === undefined) return undefined;
    const v = node === '0' ? 0 : vectors.get(`v(${node})`);
    return v !== undefined && Number.isFinite(v) ? v : undefined;
  };
  const gnd = volts(mcu.gnd) ?? 0;
  const rel = (node: string | undefined) => {
    const v = volts(node);
    return v === undefined ? undefined : v - gnd;
  };
  const vcc = mcu.gnd === undefined ? 0 : Math.max(0, rel(mcu.vdd) ?? 0);
  const avcc = mcu.kind === 'atmega328p' ? (rel(mcu.nodes[AVCC_PIN]) ?? vcc) : vcc;
  const aref = mcu.kind === 'atmega328p' ? (rel(mcu.nodes[AREF_PIN]) ?? avcc) : vcc;
  const digital: Record<number, boolean> = {};
  const analog: Record<number, number> = {};
  for (const p of model.io) {
    const v = rel(mcu.nodes[p.num]);
    if (v === undefined) digital[p.num] = drives[p.num] === 'PU' || drives[p.num] === 'H';
    else if (v >= model.vih * vcc) digital[p.num] = true;
    else if (v <= model.vil * vcc) digital[p.num] = false;
    else digital[p.num] = previous[p.num] ?? false;
    if (p.analog) analog[p.num] = Math.max(0, v ?? 0);
  }
  return { vcc, avcc, aref, digital, analog };
}
