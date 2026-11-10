// The ATmega328P (Arduino Uno / Nano) as the circuit sees it: what every pin
// of the DIP-28 package is, and what a pin does to the circuit while the
// firmware runs. Kept free of the emulator so the netlist can use it.

export type PortName = 'B' | 'C' | 'D';

export type PinFunction =
  /** port pin; `arduino` is the pin name on an Arduino board, `adc` the analog channel */
  | { kind: 'io'; port: PortName; bit: number; arduino: string; adc?: number }
  | { kind: 'power'; power: 'VCC' | 'AVCC' | 'AREF' | 'GND' }
  | { kind: 'other'; name: 'RESET' | 'XTAL1' | 'XTAL2' };

const io = (port: PortName, bit: number, arduino: string, adc?: number): PinFunction => ({ kind: 'io', port, bit, arduino, ...(adc !== undefined ? { adc } : {}) });

/** DIP-28 package, pin number -> function */
export const PINOUT: Record<number, PinFunction> = {
  1: { kind: 'other', name: 'RESET' },
  2: io('D', 0, 'D0'),
  3: io('D', 1, 'D1'),
  4: io('D', 2, 'D2'),
  5: io('D', 3, 'D3'),
  6: io('D', 4, 'D4'),
  7: { kind: 'power', power: 'VCC' },
  8: { kind: 'power', power: 'GND' },
  9: { kind: 'other', name: 'XTAL1' },
  10: { kind: 'other', name: 'XTAL2' },
  11: io('D', 5, 'D5'),
  12: io('D', 6, 'D6'),
  13: io('D', 7, 'D7'),
  14: io('B', 0, 'D8'),
  15: io('B', 1, 'D9'),
  16: io('B', 2, 'D10'),
  17: io('B', 3, 'D11'),
  18: io('B', 4, 'D12'),
  19: io('B', 5, 'D13'),
  20: { kind: 'power', power: 'AVCC' },
  21: { kind: 'power', power: 'AREF' },
  22: { kind: 'power', power: 'GND' },
  23: io('C', 0, 'A0', 0),
  24: io('C', 1, 'A1', 1),
  25: io('C', 2, 'A2', 2),
  26: io('C', 3, 'A3', 3),
  27: io('C', 4, 'A4', 4),
  28: io('C', 5, 'A5', 5),
};

export const IO_PINS = Object.entries(PINOUT)
  .filter(([, f]) => f.kind === 'io')
  .map(([n, f]) => ({ num: Number(n), ...(f as Extract<PinFunction, { kind: 'io' }>) }));

export const VCC_PIN = 7;
export const AVCC_PIN = 20;
export const AREF_PIN = 21;
export const GND_PINS = [8, 22];

/**
 * What a pin does to the circuit: high impedance input, input with pull-up,
 * output low or high, or a PWM output given by its duty cycle (0..1).
 */
export type Drive = 'Z' | 'PU' | 'L' | 'H' | number;

/** pin number -> drive, for the pins that are not plain inputs */
export type Drives = Record<number, Drive>;

/** Datasheet values of the pin drivers (5 V, typical). */
export const PIN_OHMS = 25;
export const PULLUP_OHMS = 35_000;
/** the chip itself draws about 5 mA at 5 V (16 MHz, active) */
export const SUPPLY_OHMS = 1000;
/** brown-out detection of the Arduino fuses: below this the chip is held in reset */
export const BROWN_OUT_VOLTS = 2.7;

export const DEFAULT_CLOCK = 16_000_000;

export const isMcu = (s: { kind: string; properties?: Record<string, string> }) => s.kind === 'symbol' && s.properties?.mcu === 'atmega328p';

export function mcuClock(s: { properties?: Record<string, string> }): number {
  const f = parseFloat(s.properties?.clock ?? '');
  return Number.isFinite(f) && f > 0 ? f : DEFAULT_CLOCK;
}

export const mcuFirmware = (s: { properties?: Record<string, string> }) => s.properties?.firmware || undefined;
