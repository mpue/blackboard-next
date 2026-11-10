// Ready-made microcontroller circuits: an ATmega328P on +5V with the demo
// firmware (LED blinking on D13, LED dimmed by PWM on D9, push button on D2,
// potentiometer on A0), and the same with an ESP32 DevKit on USB running the
// MicroPython demo (IO2, IO4, IO18, IO34).

import type { Doc, Item, LineItem, SymbolDef, TextItem } from '../model/types.ts';
import { defaultLayers } from '../io/legacy.ts';
import { uid } from '../model/id.ts';
import { placeWithPin, pinOf } from '../spice/benchDemo.ts';
import { LABEL_DEFS } from '../spice/labels.ts';
import { ATMEGA328P_SYMBOL, ESP32_DEVKIT_SYMBOL } from '../spice/builtinSymbols.ts';
import { esp32ExampleById } from './esp32Examples.ts';
import type { Pt } from '../geometry/geom.ts';
import { exampleHex } from './examples.ts';

export async function buildMcuDemo(library: SymbolDef[], lang: 'de' | 'en'): Promise<Doc> {
  const layers = defaultLayers('SCHEMATICS');
  const layer = layers[0].id;
  const color = '#1e6fd9';
  const items: Item[] = [];
  const wire = (...pts: Pt[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const w: LineItem = { id: uid(), kind: 'line', layer, x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, color, thickness: 2, startType: 'STRAIGHT', endType: 'STRAIGHT' };
      items.push(w);
    }
  };
  const byFile = (file: string, fallback: (s: SymbolDef) => boolean) => library.find((s) => s.filename === file) ?? library.find(fallback)!;
  const rDef = byFile('elektor-R2.xml', (s) => s.spiceType === 'RESISTOR' && s.pins.length === 2);
  const ledDef = byFile('D51-LED-rot 20mA_1a.xml', (s) => s.spiceType === 'DIODE' && /led/i.test(s.name));
  const potDef = byFile('elektor-Pot1.xml', (s) => s.spiceType === 'RESISTOR' && s.pins.length === 3);
  const buttonDef = byFile('S10-TasterEIN_1a.xml', (s) => /taster|button/i.test(`${s.name} ${s.filename}`) && s.pins.length === 2);
  const gndDef = byFile('GND.xml', (s) => /gnd/i.test(s.filename ?? '') && s.pins.length === 1);
  const vccDef = LABEL_DEFS.find((d) => d.name === '+5V')!;
  const gnd = (at: Pt) => items.push(placeWithPin(gndDef, 'GND', 1, at, layer));
  const vcc = (at: Pt) => items.push(placeWithPin(vccDef, '+5V', 1, at, layer));

  const u1 = placeWithPin(ATMEGA328P_SYMBOL, 'U1', 7, { x: 512, y: 192 }, layer);
  u1.properties = { ...u1.properties, firmware: await exampleHex('demo'), firmwareName: 'example:demo' };
  items.push(u1);

  // supply: VCC and AVCC to +5V, both GND pins to ground
  const pVcc = pinOf(u1, 7);
  const pAvcc = pinOf(u1, 20);
  wire(pVcc, { x: pVcc.x, y: pVcc.y - 32 }, { x: pAvcc.x, y: pAvcc.y - 32 }, pAvcc);
  vcc({ x: pVcc.x, y: pVcc.y - 32 });
  const g1 = pinOf(u1, 8);
  const g2 = pinOf(u1, 22);
  const gy = g1.y + 32;
  const gMid = { x: (g1.x + g2.x) / 2, y: gy };
  wire(g1, { x: g1.x, y: gy }, gMid);
  wire(g2, { x: g2.x, y: gy }, gMid);
  gnd(gMid);

  // D13 -> 220 Ω -> LED -> GND (blinks)
  const d13 = pinOf(u1, 19);
  const r1 = placeWithPin(rDef, 'R1', 1, { x: d13.x + 64, y: d13.y }, layer);
  r1.value = '220';
  const led1 = placeWithPin(ledDef, 'LED1', 1, { x: pinOf(r1, 2).x + 64, y: d13.y }, layer);
  items.push(r1, led1);
  wire(d13, pinOf(r1, 1));
  wire(pinOf(r1, 2), pinOf(led1, 1));
  const k1 = pinOf(led1, 2);
  wire(k1, { x: k1.x, y: k1.y + 32 });
  gnd({ x: k1.x, y: k1.y + 32 });

  // D9 (PWM) -> 220 Ω -> LED -> GND (brightness from the potentiometer)
  const d9 = pinOf(u1, 15);
  const r2 = placeWithPin(rDef, 'R2', 1, { x: d9.x + 64, y: d9.y }, layer);
  r2.value = '220';
  const led2 = placeWithPin(ledDef, 'LED2', 1, { x: pinOf(led1, 1).x + 96, y: d9.y }, layer);
  items.push(r2, led2);
  wire(d9, pinOf(r2, 1));
  wire(pinOf(r2, 2), pinOf(led2, 1));
  const k2 = pinOf(led2, 2);
  wire(k2, { x: k2.x, y: k1.y + 32 });
  gnd({ x: k2.x, y: k1.y + 32 });

  // D2 -> push button -> GND (internal pull-up)
  const d2 = pinOf(u1, 4);
  const s1 = placeWithPin(buttonDef, 'S1', 1, { x: pinOf(led2, 1).x + 96, y: d2.y }, layer);
  items.push(s1);
  wire(d2, pinOf(s1, 1));
  const s1b = pinOf(s1, 2);
  wire(s1b, { x: s1b.x, y: s1b.y + 32 });
  gnd({ x: s1b.x, y: s1b.y + 32 });

  // potentiometer between +5V and GND, wiper on A0
  const a0 = pinOf(u1, 23);
  const wiperAt = { x: a0.x + 64, y: g1.y - 16 };
  const r3 = placeWithPin(potDef, 'R3', 2, wiperAt, layer, 180);
  r3.value = '10k';
  items.push(r3);
  wire(a0, { x: wiperAt.x, y: a0.y }, wiperAt);
  const ends = [pinOf(r3, 1), pinOf(r3, 3)].sort((a, b) => a.x - b.x);
  wire(ends[0], { x: ends[0].x, y: ends[0].y + 48 });
  gnd({ x: ends[0].x, y: ends[0].y + 48 });
  wire(ends[1], { x: ends[1].x + 32, y: ends[1].y }, { x: ends[1].x + 32, y: ends[1].y - 32 });
  vcc({ x: ends[1].x + 32, y: ends[1].y - 32 });

  const text = (x: number, y: number, t: string, fontSize: number, bold = false): TextItem => ({
    id: uid(),
    kind: 'text',
    layer,
    x,
    y,
    text: bold ? `<b>${t}</b>` : t,
    font: 'Arial',
    fontSize,
    rotation: 0,
    textType: 'TEXT',
    color: '#111827',
  });
  items.push(
    text(64, 48, lang === 'de' ? 'Mikrocontroller-Demo: ATmega328P (Arduino Uno)' : 'Microcontroller demo: ATmega328P (Arduino Uno)', 16, true),
    text(
      64,
      72,
      lang === 'de'
        ? 'Mit Live-Werten läuft die Firmware: LED1 blinkt, das Poti R3 dimmt LED2 (PWM), Taster S1 gedrückt halten lässt LED1 schneller blinken.'
        : 'With live values the firmware runs: LED1 blinks, potentiometer R3 dims LED2 (PWM), holding push button S1 makes LED1 blink faster.',
      12,
    ),
  );

  const xs = items.flatMap((i) => (i.kind === 'line' ? [i.x1, i.x2] : 'width' in i && 'x' in i ? [i.x + i.width] : []));
  const ys = items.flatMap((i) => (i.kind === 'line' ? [i.y1, i.y2] : 'height' in i && 'y' in i ? [i.y + i.height] : []));
  return {
    width: Math.ceil((Math.max(...xs, 1100) + 96) / 16) * 16,
    height: Math.ceil((Math.max(...ys) + 96) / 16) * 16,
    type: 'SCHEMATICS',
    layers,
    items,
    parts: {},
  };
}

export function buildEsp32Demo(library: SymbolDef[], lang: 'de' | 'en'): Doc {
  const layers = defaultLayers('SCHEMATICS');
  const layer = layers[0].id;
  const color = '#1e6fd9';
  const items: Item[] = [];
  const wire = (...pts: Pt[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const w: LineItem = { id: uid(), kind: 'line', layer, x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, color, thickness: 2, startType: 'STRAIGHT', endType: 'STRAIGHT' };
      items.push(w);
    }
  };
  const byFile = (file: string, fallback: (s: SymbolDef) => boolean) => library.find((s) => s.filename === file) ?? library.find(fallback)!;
  const rDef = byFile('elektor-R2.xml', (s) => s.spiceType === 'RESISTOR' && s.pins.length === 2);
  const ledDef = byFile('D51-LED-rot 20mA_1a.xml', (s) => s.spiceType === 'DIODE' && /led/i.test(s.name));
  const potDef = byFile('elektor-Pot1.xml', (s) => s.spiceType === 'RESISTOR' && s.pins.length === 3);
  const buttonDef = byFile('S10-TasterEIN_1a.xml', (s) => /taster|button/i.test(`${s.name} ${s.filename}`) && s.pins.length === 2);
  const gndDef = byFile('GND.xml', (s) => /gnd/i.test(s.filename ?? '') && s.pins.length === 1);
  const gnd = (at: Pt) => items.push(placeWithPin(gndDef, 'GND', 1, at, layer));

  // the board on USB: 3V3 (pin 1) at the top left
  const u1 = placeWithPin(ESP32_DEVKIT_SYMBOL, 'U1', 1, { x: 448, y: 192 }, layer);
  u1.properties = { ...u1.properties, script: esp32ExampleById('demo')!.script, firmwareName: 'example:demo' };
  items.push(u1);

  // IO2 -> 220 Ω -> LED -> GND (blinks)
  const io2 = pinOf(u1, 34);
  const r1 = placeWithPin(rDef, 'R1', 1, { x: io2.x + 64, y: io2.y }, layer);
  r1.value = '220';
  const led1 = placeWithPin(ledDef, 'LED1', 1, { x: pinOf(r1, 2).x + 64, y: io2.y }, layer);
  items.push(r1, led1);
  wire(io2, pinOf(r1, 1));
  wire(pinOf(r1, 2), pinOf(led1, 1));
  const k1 = pinOf(led1, 2);
  wire(k1, { x: k1.x, y: k1.y + 32 });
  gnd({ x: k1.x, y: k1.y + 32 });

  // IO4 (PWM) -> 220 Ω -> LED -> GND (brightness from the potentiometer)
  const io4 = pinOf(u1, 32);
  const r2 = placeWithPin(rDef, 'R2', 1, { x: io4.x + 64, y: io4.y }, layer);
  r2.value = '220';
  const led2 = placeWithPin(ledDef, 'LED2', 1, { x: pinOf(led1, 1).x + 96, y: io4.y }, layer);
  items.push(r2, led2);
  wire(io4, pinOf(r2, 1));
  wire(pinOf(r2, 2), pinOf(led2, 1));
  const k2 = pinOf(led2, 2);
  wire(k2, { x: k2.x, y: k1.y + 32 });
  gnd({ x: k2.x, y: k1.y + 32 });

  // IO18 -> push button -> GND (internal pull-up)
  const io18 = pinOf(u1, 28);
  const s1 = placeWithPin(buttonDef, 'S1', 1, { x: pinOf(led2, 1).x + 96, y: io18.y }, layer);
  items.push(s1);
  wire(io18, pinOf(s1, 1));
  const s1b = pinOf(s1, 2);
  wire(s1b, { x: s1b.x, y: s1b.y + 32 });
  gnd({ x: s1b.x, y: s1b.y + 32 });

  // potentiometer between 3V3 and GND, wiper on IO34
  const io34 = pinOf(u1, 5);
  const v33 = pinOf(u1, 1);
  const wiperAt = { x: io34.x - 96, y: io34.y + 96 };
  const r3 = placeWithPin(potDef, 'R3', 2, wiperAt, layer, 180);
  r3.value = '10k';
  items.push(r3);
  wire(io34, { x: wiperAt.x, y: io34.y }, wiperAt);
  const ends = [pinOf(r3, 1), pinOf(r3, 3)].sort((a, b) => a.x - b.x);
  wire(ends[0], { x: ends[0].x, y: v33.y }, v33);
  wire(ends[1], { x: ends[1].x, y: ends[1].y + 48 });
  gnd({ x: ends[1].x, y: ends[1].y + 48 });

  const text = (x: number, y: number, t: string, fontSize: number, bold = false): TextItem => ({
    id: uid(),
    kind: 'text',
    layer,
    x,
    y,
    text: bold ? `<b>${t}</b>` : t,
    font: 'Arial',
    fontSize,
    rotation: 0,
    textType: 'TEXT',
    color: '#111827',
  });
  items.push(
    text(64, 48, lang === 'de' ? 'ESP32-Demo: ESP32-DevKitC mit MicroPython, über USB versorgt' : 'ESP32 demo: ESP32-DevKitC with MicroPython, powered over USB', 16, true),
    text(
      64,
      72,
      lang === 'de'
        ? 'Mit Live-Werten läuft der Code: LED1 blinkt, das Poti R3 dimmt LED2 (PWM), Taster S1 gedrückt halten lässt LED1 schneller blinken. Code ändern: U1 auswählen, „Code bearbeiten…“.'
        : 'With live values the code runs: LED1 blinks, potentiometer R3 dims LED2 (PWM), holding push button S1 makes LED1 blink faster. To change the code select U1, “Edit code…”.',
      12,
    ),
  );

  const xs = items.flatMap((i) => (i.kind === 'line' ? [i.x1, i.x2] : 'width' in i && 'x' in i ? [i.x + i.width] : []));
  const ys = items.flatMap((i) => (i.kind === 'line' ? [i.y1, i.y2] : 'height' in i && 'y' in i ? [i.y + i.height] : []));
  return {
    width: Math.ceil((Math.max(...xs, 1300) + 96) / 16) * 16,
    height: Math.ceil((Math.max(...ys) + 96) / 16) * 16,
    type: 'SCHEMATICS',
    layers,
    items,
    parts: {},
  };
}
