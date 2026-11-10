// The microcontrollers as the circuit sees them: the ATmega328P (Arduino Uno /
// Nano, DIP-28) and the ESP32 (DevKitC board), what every pin is, and what a
// pin does to the circuit while the firmware runs. Kept free of the emulators
// so the netlist can use it.

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
 * What a pin does to the circuit: high impedance input, input with pull-up or
 * pull-down, output low or high, or a PWM output given by its duty cycle (0..1).
 */
export type Drive = 'Z' | 'PU' | 'PD' | 'L' | 'H' | number;

/** symbol pin number -> drive */
export type Drives = Record<number, Drive>;

/** Datasheet values of the ATmega328P pin drivers (5 V, typical). */
export const PIN_OHMS = 25;
export const PULLUP_OHMS = 35_000;
/** the chip itself draws about 5 mA at 5 V (16 MHz, active) */
export const SUPPLY_OHMS = 1000;
/** brown-out detection of the Arduino fuses: below this the chip is held in reset */
export const BROWN_OUT_VOLTS = 2.7;

export const DEFAULT_CLOCK = 16_000_000;

// ---- ESP32 DevKitC (V4): the board, 2 x 19 pins, numbered J2 1..19 (left) and J3 1..19 as 20..38 ----

const ESP32_LEFT = ['3V3', 'EN', 'IO36', 'IO39', 'IO34', 'IO35', 'IO32', 'IO33', 'IO25', 'IO26', 'IO27', 'IO14', 'IO12', 'GND', 'IO13', 'SD2', 'SD3', 'CMD', '5V'];
const ESP32_RIGHT = ['GND', 'IO23', 'IO22', 'TXD0', 'RXD0', 'IO21', 'GND', 'IO19', 'IO18', 'IO5', 'IO17', 'IO16', 'IO4', 'IO0', 'IO2', 'IO15', 'SD1', 'SD0', 'CLK'];
/** header pin number -> silkscreen name */
export const ESP32_PINS: { num: number; name: string; side: 'left' | 'right' }[] = [
  ...ESP32_LEFT.map((name, i) => ({ num: i + 1, name, side: 'left' as const })),
  ...ESP32_RIGHT.map((name, i) => ({ num: i + 20, name, side: 'right' as const })),
];
/** GPIOs with an ADC channel (ADC1: 32..39, ADC2: the rest) */
const ESP32_ADC = new Set([36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 0, 2, 4, 15]);
export const ESP32_3V3_PIN = 1;
export const ESP32_5V_PIN = 19;
export const ESP32_GND_PINS = [14, 20, 26];

// ---- the chips, as the circuit sees them ----

export type McuKind = 'atmega328p' | 'esp32';

export interface IoPin {
  /** symbol pin number */
  num: number;
  /** the name a beginner knows it by: D13, A0, IO2 */
  label: string;
  /** the emulator's name for it: DIP pin (ATmega) or GPIO number (ESP32) */
  key: number;
  analog: boolean;
}

export interface McuModel {
  kind: McuKind;
  io: IoPin[];
  /** supply pin of the chip's logic */
  vddPin: number;
  gndPins: number[];
  pinOhms: number;
  pullupOhms: number;
  pulldownOhms: number;
  /** the chip's own current draw as a resistor across its supply */
  supplyOhms: number;
  /** runs from this supply voltage on, stops below the second (brown-out with hysteresis) */
  brownOut: [number, number];
  /** input thresholds as fractions of the supply (low below the first, high above the second) */
  vil: number;
  vih: number;
}

export const MODELS: Record<McuKind, McuModel> = {
  atmega328p: {
    kind: 'atmega328p',
    io: IO_PINS.map((p) => ({ num: p.num, label: p.arduino, key: p.num, analog: p.adc !== undefined })),
    vddPin: VCC_PIN,
    gndPins: GND_PINS,
    pinOhms: PIN_OHMS,
    pullupOhms: PULLUP_OHMS,
    pulldownOhms: PULLUP_OHMS,
    supplyOhms: SUPPLY_OHMS,
    brownOut: [BROWN_OUT_VOLTS, BROWN_OUT_VOLTS - 0.1],
    vil: 0.3,
    vih: 0.6,
  },
  esp32: {
    kind: 'esp32',
    // TXD0/RXD0 carry the serial console, SD*/CMD/CLK the flash: not for the circuit
    io: ESP32_PINS.filter((p) => /^IO\d+$/.test(p.name)).map((p) => {
      const gpio = Number(p.name.slice(2));
      return { num: p.num, label: p.name, key: gpio, analog: ESP32_ADC.has(gpio) };
    }),
    vddPin: ESP32_3V3_PIN,
    gndPins: ESP32_GND_PINS,
    // ESP32 datasheet: about 40 Ω at the default drive strength, 45 kΩ pulls, VIL 0.25 / VIH 0.75 VDD
    pinOhms: 40,
    pullupOhms: 45_000,
    pulldownOhms: 45_000,
    // about 35 mA with the radio off
    supplyOhms: 100,
    brownOut: [2.7, 2.5],
    vil: 0.25,
    vih: 0.75,
  },
};

export function mcuKind(s: { kind: string; properties?: Record<string, string> }): McuKind | undefined {
  const m = s.kind === 'symbol' ? s.properties?.mcu : undefined;
  return m === 'atmega328p' || m === 'esp32' ? m : undefined;
}

export const isMcu = (s: { kind: string; properties?: Record<string, string> }) => mcuKind(s) !== undefined;

export const mcuModel = (s: { kind: string; properties?: Record<string, string> }) => MODELS[mcuKind(s) ?? 'atmega328p'];

export function mcuClock(s: { properties?: Record<string, string> }): number {
  if (s.properties?.mcu === 'esp32') return 240_000_000;
  const f = parseFloat(s.properties?.clock ?? '');
  return Number.isFinite(f) && f > 0 ? f : DEFAULT_CLOCK;
}

/** The program of a chip: firmware image / HEX, or (ESP32) a MicroPython script. */
export const mcuFirmware = (s: { properties?: Record<string, string> }) => s.properties?.firmware || s.properties?.script || undefined;

/** ESP32 board powered over its USB socket (5V and 3V3 pins are outputs then). */
export const usbPowered = (s: { properties?: Record<string, string> }) => s.properties?.usb !== 'false';
