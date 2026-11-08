// A ready-made bench: function generator -> RC low pass, oscilloscope on input
// and output, multimeter across the capacitor.

import type { Doc, Item, LineItem, SymbolDef, SymbolItem, TextItem } from '../model/types.ts';
import { symbolItemFromDef, defaultLayers } from '../io/legacy.ts';
import { itemPins, type Pt } from '../geometry/geom.ts';
import { uid } from '../model/id.ts';
import { INSTRUMENT_DEFS } from './instruments.ts';

function placeWithPin(def: SymbolDef, name: string, pinNum: number, at: Pt, layer: string, rotation = 0): SymbolItem {
  const s = symbolItemFromDef(def, 0, 0, layer, name);
  s.rotation = rotation;
  const p = itemPins(s, () => undefined).find((x) => x.pin.num === pinNum)!;
  s.x = Math.round(at.x - p.x);
  s.y = Math.round(at.y - p.y);
  return s;
}

const pinOf = (s: SymbolItem, num: number): Pt => {
  const p = itemPins(s, () => undefined).find((x) => x.pin.num === num)!;
  return { x: Math.round(p.x), y: Math.round(p.y) };
};

export function buildBenchDemo(library: SymbolDef[], lang: 'de' | 'en'): Doc {
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
  const horizontal = (d: SymbolDef) => d.pins.length === 2 && d.pins[0].y === d.pins[1].y && d.pins[0].x !== d.pins[1].x;
  // plain symbols (the ones the 1.x samples use), with fallbacks for edited libraries
  const pick = (type: string, file: string) =>
    library.find((s) => s.filename === file) ?? library.find((s) => s.spiceType === type && horizontal(s)) ?? library.find((s) => s.spiceType === type)!;
  const rDef = pick('RESISTOR', 'elektor-R2.xml');
  const cDef = pick('CAPACITOR', 'Capacitor.xml');

  const fg = placeWithPin(INSTRUMENT_DEFS.fgen, 'FG1', 1, { x: 224, y: 304 }, layer);
  fg.properties = { ...fg.properties, acAmplitude: '2', frequency: '1000' };
  fg.value = '1 kHz';
  const out = pinOf(fg, 1);
  const com = pinOf(fg, 2);

  const r = placeWithPin(rDef, 'R1', 1, { x: out.x + 64, y: out.y }, layer);
  r.value = '1k';
  const nodeB = pinOf(r, 2);
  const cTop = { x: nodeB.x + 96, y: out.y };
  const c = placeWithPin(cDef, 'C1', 1, cTop, layer, 90);
  c.value = '100n';
  const cBottom = pinOf(c, 2);
  const rail = Math.max(cBottom.y, com.y) + 64;

  const dmm = placeWithPin(INSTRUMENT_DEFS.dmm, 'DMM1', 1, { x: cTop.x + 80, y: rail - 32 }, layer);
  dmm.properties = { ...dmm.properties, dmmMode: 'VAC' };
  const dmmV = pinOf(dmm, 1);
  const dmmCom = pinOf(dmm, 2);

  const scope = placeWithPin(INSTRUMENT_DEFS.scope, 'OSC1', 1, { x: dmmCom.x + 96, y: 96 }, layer);
  scope.properties = { ...scope.properties, timeDiv: '0.0002', ch1Div: '1', ch2Div: '1', ch1Pos: '1.5', ch2Pos: '-1.5', trigLevel: '0' };
  const ch1 = pinOf(scope, 1);
  const ch2 = pinOf(scope, 2);
  const gnd = pinOf(scope, 3);

  items.push(fg, r, c, dmm, scope);
  // signal path
  wire(out, pinOf(r, 1));
  wire(nodeB, cTop);
  // ground rail along the bottom
  const railEnd = gnd.x - 32;
  wire(com, { x: com.x + 16, y: com.y }, { x: com.x + 16, y: rail }, { x: railEnd, y: rail });
  wire(cBottom, { x: cBottom.x, y: rail });
  // multimeter across the capacitor
  wire(dmmV, { x: dmmV.x, y: cTop.y }, cTop);
  wire(dmmCom, { x: dmmCom.x, y: rail });
  // oscilloscope: CH1 on the input, CH2 on the output, GND to the rail
  const tapA = { x: out.x + 32, y: out.y };
  wire(ch1, { x: tapA.x, y: ch1.y }, tapA);
  const tapB = { x: nodeB.x + 48, y: nodeB.y };
  wire(ch2, { x: tapB.x, y: ch2.y }, tapB);
  wire(gnd, { x: railEnd, y: gnd.y }, { x: railEnd, y: rail });

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
    text(64, 48, lang === 'de' ? 'Messplatz-Demo: RC-Tiefpass (1 kΩ, 100 nF, fg ≈ 1,6 kHz)' : 'Bench demo: RC low pass (1 kΩ, 100 nF, fc ≈ 1.6 kHz)', 16, true),
    text(
      64,
      72,
      lang === 'de'
        ? 'Simulieren (F5) öffnet den Messplatz. Am Generator die Frequenz drehen: Kanal 2 und das Multimeter folgen live.'
        : 'Simulate (F5) opens the bench. Turn the generator frequency: channel 2 and the multimeter follow live.',
      12,
    ),
  );

  const maxX = Math.max(...items.map((i) => ('x2' in i ? Math.max(i.x1, i.x2) : 'width' in i ? i.x + i.width : i.x + 600)));
  return {
    width: Math.ceil((Math.max(maxX, scope.x + scope.width) + 96) / 16) * 16,
    height: Math.ceil((rail + 96) / 16) * 16,
    type: 'SCHEMATICS',
    layers,
    items,
    parts: {},
  };
}
