// Net labels and supply symbols. Like in other EDA tools they connect by name:
// all labels "CLK" are one net, all "+5V" symbols are one net, without wires.
// They are ordinary symbols (with a property), so .bb files stay compatible.

import type { LineGeom, SymbolDef, SymbolItem, TextGeom } from '../model/types.ts';

const line = (x1: number, y1: number, x2: number, y2: number, thickness = 1.5): LineGeom => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
  color: '#000000',
  thickness,
  startType: 'STRAIGHT',
  endType: 'STRAIGHT',
});

const name = (x: number, y: number, fontSize = 11): TextGeom => ({
  kind: 'text',
  x,
  y,
  text: 'NAME',
  font: 'Arial',
  fontSize,
  rotation: 0,
  textType: 'NAME',
  color: '#000000',
});

function netLabel(): SymbolDef {
  return {
    name: 'Netzlabel',
    category: 'Labels',
    width: 72,
    height: 16,
    value: '',
    customModel: false,
    properties: { netlabel: 'true' },
    pins: [{ num: 1, x: 0, y: 8, name: '1' }],
    shapes: [line(0, 8, 8, 0), line(8, 0, 72, 0), line(72, 0, 72, 16), line(72, 16, 8, 16), line(8, 16, 0, 8), name(12, 12)],
  };
}

function supply(label: string): SymbolDef {
  return {
    name: label,
    category: 'Labels',
    width: 32,
    height: 32,
    value: label,
    customModel: false,
    properties: { power: 'true' },
    pins: [{ num: 1, x: 16, y: 32, name: '1' }],
    shapes: [line(16, 32, 16, 14), line(4, 14, 28, 14, 2.5), name(4, 9, 10)],
  };
}

export const LABEL_DEFS: SymbolDef[] = [netLabel(), supply('VCC'), supply('+5V'), supply('+3V3'), supply('+12V'), supply('-12V')];

export const isNetLabel = (s: { kind: string; properties?: Record<string, string> }) => s.kind === 'symbol' && s.properties?.netlabel === 'true';

const SUPPLY_RE = /^(?:[+-]?V(?:CC|DD|SS|EE|BAT|IN|PP)[A-Z0-9_]*|V[+-]|[+-]?\d+(?:[.,]\d+)?V\d*|[+-]?\d+V\d+)$/i;
const GROUND_RE = /^(gnd|agnd|dgnd|ground|masse|0)$/i;

/**
 * Name under which a symbol joins a global net: net labels by their name,
 * one-pin supply and ground symbols by their rail name. A net label named
 * like a rail ("+5V", "GND") is that rail, as one would expect.
 */
export function globalNetKey(s: SymbolItem): string | undefined {
  if (s.pins.length !== 1) return undefined;
  const n = s.name.trim();
  if (!n) return undefined;
  if (s.properties?.netlabel === 'true') {
    if (GROUND_RE.test(n)) return 'ground';
    if (SUPPLY_RE.test(n.replace(/\s+/g, ''))) return `supply:${n.replace(/\s+/g, '').toUpperCase()}`;
    return `label:${n.toUpperCase()}`;
  }
  if (GROUND_RE.test(n) || /gnd/i.test(s.symbolName)) return 'ground';
  if (s.properties?.power === 'true' || SUPPLY_RE.test(n.replace(/\s+/g, ''))) return `supply:${n.replace(/\s+/g, '').toUpperCase()}`;
  return undefined;
}
