// Built-in symbols with SPICE models that the classic library lacks or has
// broken: an NE555 that keeps oscillating in long transient runs.

import type { LineGeom, Pin, SymbolDef, SymbolShape, TextGeom } from '../model/types.ts';
import { ESP32_PINS, PINOUT } from '../mcu/pinout.ts';
import { LCD_GEOMETRY, LCD_PIN_NAMES } from '../mcu/lcd.ts';

/**
 * Simplified behavioural model of the NE555: the internal 3 x 5 kΩ divider,
 * two comparators (THRES above CONT resets, TRIG below CONT/2 sets, RESET low
 * resets), a flip-flop made of two switches and a memory capacitor (node 11 =
 * 1 V while reset), and the discharge transistor and push-pull output as
 * switches. Transistor level macromodels such as the one of the NE555 sample
 * get stuck at the thresholds in long, slow transient runs; this one keeps
 * blinking for any length of the slow motion window and matches
 * f = 1.44 / ((R1 + 2 R2) C) within about 1 %.
 */
const NE555_MODEL = `* NE555 timer, simplified behavioural model (BlackBoard)
* pins: 1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CONT, 6 THRES, 7 DISC, 8 VCC
.SUBCKT NE555 1 2 3 4 5 6 7 8
RD1 8 5 5k
RD2 5 9 5k
RD3 9 1 5k
BR 10 1 V = 0.5 + 0.5*tanh(50*(V(6)-V(5))) + 0.5 + 0.5*tanh(20*(0.7-V(4,1)))
BS 13 1 V = 0.5 + 0.5*tanh(50*(V(9)-V(2)))
VONE 12 1 DC 1
SR 12 11 10 1 SWL
SS 11 1 13 1 SWL
CQ 11 1 1u
SDIS 7 1 11 1 SWDIS
SHI 8 3 1 11 SWHI
SLO 3 1 11 1 SWLO
.MODEL SWL SW(VT=0.5 VH=0 RON=1 ROFF=1T)
.MODEL SWDIS SW(VT=0.5 VH=0.05 RON=10 ROFF=1G)
.MODEL SWHI SW(VT=-0.5 VH=0.05 RON=20 ROFF=1G)
.MODEL SWLO SW(VT=0.5 VH=0.05 RON=10 ROFF=1G)
.ENDS NE555`;

const pinLine = (x1: number, y1: number, x2: number, y2: number, thickness = 2): LineGeom => ({ kind: 'line', x1, y1, x2, y2, color: '#000000', thickness, startType: 'STRAIGHT', endType: 'STRAIGHT' });
const label = (x: number, y: number, text: string, fontSize = 10, textType: TextGeom['textType'] = 'TEXT'): TextGeom => ({
  kind: 'text',
  x,
  y,
  text,
  font: 'Arial',
  fontSize,
  rotation: 0,
  textType,
  color: '#000000',
});

/**
 * NE555 in the usual block layout with every pin on the 16 grid (the library's
 * timer symbols have pins between grid points and no working model):
 * DIS, THR, TRIG on the left, RESET and VCC on top, OUT on the right, CV and GND below.
 */
export const NE555_SYMBOL: SymbolDef = {
  name: 'NE555',
  filename: 'NE555.xml',
  category: 'Active',
  width: 192,
  height: 224,
  value: 'NE555',
  customModel: true,
  spiceType: 'SUBCIRCUIT',
  model: { name: 'NE555', content: NE555_MODEL, type: 'SUBCIRCUIT' },
  properties: { prefix: 'U' },
  pins: [
    { num: 1, x: 128, y: 224, name: 'GND', orientation: 'BOTTOM_RIGHT' },
    { num: 2, x: 0, y: 160, name: 'TRIG', orientation: 'TOP_LEFT' },
    { num: 3, x: 192, y: 112, name: 'OUT', orientation: 'BOTTOM_RIGHT' },
    { num: 4, x: 64, y: 0, name: 'RESET', orientation: 'TOP_LEFT' },
    { num: 5, x: 64, y: 224, name: 'CV', orientation: 'BOTTOM_LEFT' },
    { num: 6, x: 0, y: 112, name: 'THR', orientation: 'TOP_LEFT' },
    { num: 7, x: 0, y: 64, name: 'DIS', orientation: 'TOP_LEFT' },
    { num: 8, x: 128, y: 0, name: 'VCC', orientation: 'TOP_LEFT' },
  ],
  shapes: [
    pinLine(0, 64, 32, 64),
    pinLine(0, 112, 32, 112),
    pinLine(0, 160, 32, 160),
    pinLine(64, 0, 64, 32),
    pinLine(128, 0, 128, 32),
    pinLine(160, 112, 192, 112),
    pinLine(64, 192, 64, 224),
    pinLine(128, 192, 128, 224),
    { kind: 'box', x: 32, y: 32, w: 128, h: 160, color: '#000000', thickness: 2, style: 'OUTLINED' },
    label(37, 68, 'DIS'),
    label(37, 116, 'THR'),
    label(37, 164, 'TRIG'),
    label(61, 46, 'R'),
    label(118, 46, 'VCC'),
    label(135, 116, 'OUT'),
    label(58, 187, 'CV'),
    label(117, 187, 'GND'),
    label(21, 60, '7'),
    label(21, 108, '6'),
    label(21, 156, '2'),
    label(68, 20, '4'),
    label(132, 20, '8'),
    label(174, 108, '3'),
    label(68, 216, '5'),
    label(132, 216, '1'),
    label(86, 96, 'X1', 13, 'NAME'),
    label(76, 142, 'NE555', 12, 'VALUE'),
  ],
};

/** Arduino pins with PWM ("~" on the board) */
const PWM_PINS = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);

/**
 * ATmega328P (Arduino Uno / Nano) with DIP-28 pin numbers, drawn by function:
 * supply on top, ground below, reset and crystal on the left, the ports on
 * the right in Arduino order (D0..D7, D8..D13, A0..A5). Runs firmware in the
 * live values (see src/mcu).
 */
function atmega328pSymbol(): SymbolDef {
  const W = 208;
  const H = 480;
  const pins: Pin[] = [];
  const shapes: SymbolShape[] = [{ kind: 'box', x: 32, y: 32, w: 144, h: 416, color: '#000000', thickness: 2, style: 'OUTLINED' }];
  const add = (num: number, x: number, y: number, side: 'left' | 'right' | 'top' | 'bottom', text: string, name = text) => {
    pins.push({ num, x, y, name, orientation: side === 'left' || side === 'top' ? 'TOP_LEFT' : 'BOTTOM_RIGHT' });
    if (side === 'left') shapes.push(pinLine(0, y, 32, y), label(37, y + 3.5, text, 9), label(14, y - 3, String(num), 8));
    if (side === 'right') shapes.push(pinLine(176, y, W, y), label(172 - text.length * 5.1, y + 3.5, text, 9), label(184, y - 3, String(num), 8));
    if (side === 'top') shapes.push(pinLine(x, 0, x, 32), label(x - text.length * 2.7, 46, text, 9), label(x + 3, 20, String(num), 8));
    if (side === 'bottom') shapes.push(pinLine(x, 448, x, H), label(x - text.length * 2.7, 441, text, 9), label(x + 3, 468, String(num), 8));
  };
  add(7, 64, 0, 'top', 'VCC');
  add(20, 96, 0, 'top', 'AVCC');
  add(21, 128, 0, 'top', 'AREF');
  add(8, 80, H, 'bottom', 'GND');
  add(22, 112, H, 'bottom', 'GND');
  add(1, 0, 80, 'left', 'RESET');
  add(9, 0, 144, 'left', 'XTAL1');
  add(10, 0, 176, 'left', 'XTAL2');
  const ports = Object.entries(PINOUT)
    .flatMap(([n, f]) => (f.kind === 'io' ? [{ num: Number(n), ...f }] : []))
    .sort((a, b) => 'DBC'.indexOf(a.port) - 'DBC'.indexOf(b.port) || a.bit - b.bit);
  ports.forEach((p, i) => {
    // D0..D7, gap, D8..D13, gap, A0..A5
    const y = 64 + 16 * (i + (p.port === 'D' ? 0 : p.port === 'B' ? 1 : 2));
    add(p.num, W, y, 'right', `P${p.port}${p.bit} ${PWM_PINS.has(p.arduino) ? '~' : ''}${p.arduino}`, p.arduino);
  });
  shapes.push(label(44, 262, 'U1', 13, 'NAME'), label(44, 280, 'ATmega328P', 11, 'VALUE'));
  return {
    name: 'ATmega328P',
    filename: 'ATmega328P.xml',
    category: 'Microcontrollers',
    width: W,
    height: H,
    value: 'ATmega328P',
    customModel: false,
    properties: { prefix: 'U', mcu: 'atmega328p', clock: '16000000' },
    pins,
    shapes,
  };
}

export const ATMEGA328P_SYMBOL = atmega328pSymbol();

/**
 * ESP32-DevKitC (V4) as the board looks: the two pin headers in their real
 * order with the silkscreen names, the USB socket below. Header J2 is pins
 * 1..19, J3 20..38. Runs firmware or MicroPython in the live values.
 */
function esp32DevkitSymbol(): SymbolDef {
  const W = 256;
  const H = 400;
  const pins: Pin[] = [];
  const shapes: SymbolShape[] = [
    { kind: 'box', x: 48, y: 16, w: 160, h: 368, color: '#000000', thickness: 2, style: 'OUTLINED' },
    // the module's shield and antenna at the top, the USB socket below
    { kind: 'box', x: 88, y: 24, w: 80, h: 30, color: '#000000', thickness: 1, style: 'OUTLINED' },
    { kind: 'box', x: 112, y: 384, w: 32, h: 14, color: '#000000', thickness: 1.5, style: 'OUTLINED' },
    label(119, 395, 'USB', 7),
  ];
  for (const p of ESP32_PINS) {
    const y = 64 + 16 * ((p.num - 1) % 19);
    if (p.side === 'left') {
      pins.push({ num: p.num, x: 0, y, name: p.name, orientation: 'TOP_LEFT' });
      shapes.push(pinLine(0, y, 48, y), label(53, y + 3.5, p.name, 9));
    } else {
      pins.push({ num: p.num, x: W, y, name: p.name, orientation: 'BOTTOM_RIGHT' });
      shapes.push(pinLine(208, y, W, y), label(203 - p.name.length * 5.1, y + 3.5, p.name, 9));
    }
  }
  shapes.push(label(92, 36, 'U1', 11, 'NAME'), label(92, 49, 'ESP32-DevKitC', 8.5, 'VALUE'));
  return {
    name: 'ESP32-DevKitC',
    filename: 'ESP32-DevKitC.xml',
    category: 'Microcontrollers',
    width: W,
    height: H,
    value: 'ESP32-DevKitC',
    customModel: false,
    properties: { prefix: 'U', mcu: 'esp32', usb: 'true', footprint: 'Module_ESP32-DevKitC_V4' },
    pins,
    shapes,
  };
}

export const ESP32_DEVKIT_SYMBOL = esp32DevkitSymbol();

/**
 * Character LCD module with HD44780 controller: the 16 pins in the module's
 * order (VSS, VDD, V0, RS, RW, E, D0..D7, A, K) down the left side on the 16
 * grid, so a bus from a microcontroller's pin row runs straight across, and
 * the display window, in which the live values draw the characters.
 */
function lcdSymbol(cols: number, rows: number, backlight: 'green' | 'blue'): SymbolDef {
  const g = LCD_GEOMETRY;
  const W = cols * g.cellW + 112;
  const H = 304;
  const winBottom = g.y + rows * g.cellH + 4;
  const shapes: SymbolShape[] = [
    { kind: 'box', x: 32, y: 16, w: W - 48, h: H - 24, color: '#000000', thickness: 2, style: 'OUTLINED' },
    { kind: 'box', x: g.x - 4, y: g.y - 4, w: cols * g.cellW + 8, h: winBottom - g.y + 4, color: '#000000', thickness: 1.5, style: 'OUTLINED' },
  ];
  const pins: Pin[] = LCD_PIN_NAMES.map((name, i) => {
    const y = 32 + 16 * i;
    shapes.push(pinLine(0, y, 32, y), label(37, y + 3, name, 7.5), label(14, y - 3, String(i + 1), 6));
    return { num: i + 1, x: 0, y, name, orientation: 'TOP_LEFT' };
  });
  const value = `HD44780 ${cols}x${rows}`;
  shapes.push(label(g.x - 4, winBottom + 22, 'LCD1', 11, 'NAME'), label(g.x + 44, winBottom + 22, value, 9, 'VALUE'));
  return {
    name: `LCD ${cols}x${rows}`,
    filename: `LCD-${cols}x${rows}.xml`,
    category: 'Optoelectronics',
    width: W,
    height: H,
    value,
    customModel: false,
    properties: { prefix: 'LCD', lcd: `${cols}x${rows}`, backlight, footprint: `PinHeader_1x16_P2.54mm` },
    pins,
    shapes,
  };
}

export const LCD1602_SYMBOL = lcdSymbol(16, 2, 'green');
export const LCD2004_SYMBOL = lcdSymbol(20, 4, 'blue');

export const BUILTIN_SYMBOLS: SymbolDef[] = [NE555_SYMBOL, ATMEGA328P_SYMBOL, ESP32_DEVKIT_SYMBOL, LCD1602_SYMBOL, LCD2004_SYMBOL];
