// Built-in symbols with SPICE models that the classic library lacks or has
// broken: an NE555 that keeps oscillating in long transient runs.

import type { LineGeom, SymbolDef, TextGeom } from '../model/types.ts';

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

export const BUILTIN_SYMBOLS: SymbolDef[] = [NE555_SYMBOL];
