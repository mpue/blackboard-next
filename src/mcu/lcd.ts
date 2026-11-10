// Character LCD modules with an HD44780 controller (1602, 2004): the 16 pins
// of the module and what the circuit decides about the display: supply,
// contrast and backlight. Kept free of the emulators so the netlist can use it.

export const LCD_PIN_NAMES = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
export const LCD_VSS = 1;
export const LCD_VDD = 2;
export const LCD_V0 = 3;
export const LCD_RS = 4;
export const LCD_RW = 5;
export const LCD_E = 6;
/** D0..D7 are pins 7..14 */
export const LCD_D0 = 7;
export const LCD_A = 15;
export const LCD_K = 16;

/** the controller logic draws about 1.5 mA at 5 V */
export const LCD_LOGIC_OHMS = 3300;
/** series resistor of the backlight on most modules */
export const LCD_BACKLIGHT_OHMS = 100;
/** the controller works from this supply voltage on */
export const LCD_MIN_VOLTS = 2.7;

export type Backlight = 'green' | 'blue';

export const isLcd = (s: { kind: string; properties?: Record<string, string> }) => s.kind === 'symbol' && !!s.properties?.lcd;

export function lcdSize(s: { properties?: Record<string, string> }): { cols: number; rows: number } {
  const m = /^(\d+)x(\d+)$/.exec(s.properties?.lcd ?? '');
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : { cols: 16, rows: 2 };
}

export const lcdBacklight = (s: { properties?: Record<string, string> }): Backlight => (s.properties?.backlight === 'blue' ? 'blue' : 'green');

/**
 * Contrast 0..1 from the LCD drive voltage VDD - V0: the dots show from about
 * 2.5 V and are fully dark from 4 V (a 5 V module with V0 near GND). An open
 * V0 counts as connected to GND.
 */
export function lcdContrast(vdd: number, v0: number | undefined): number {
  const drive = vdd - (v0 ?? 0);
  return Math.min(1, Math.max(0, (drive - 2.5) / 1.5));
}

/** Where the characters sit in the symbol: cell pitch, dot pitch, first cell. */
export const LCD_GEOMETRY = { x: 80, y: 44, cellW: 18, cellH: 30, dot: 3 };
