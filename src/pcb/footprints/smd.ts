// Surface mount footprints: origin in the body centre, pad 1 on the left / top
// left. Land patterns are the IPC-7351 nominal ones of the KiCad library.

import type { FootprintDef, FootprintGraphic, PadDef } from '../../model/types.ts';
import { box, build, circle, dot, line, plus, polyline, SILK_GAP, SILK_OFFSET as O, smd } from './helpers.ts';

interface Meta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
}

// ---- two terminal parts ------------------------------------------------------------------

interface TwoPad {
  /** pad size and centre distance from the origin */
  w: number;
  h: number;
  x: number;
  /** body length (x) and width (y) */
  len: number;
  wid: number;
}

/** silk bracket around pad 1: marks the cathode of diodes and LEDs */
function bracket(t: TwoPad): FootprintGraphic[] {
  const y = Math.max(t.wid / 2 + O, t.h / 2 + SILK_GAP);
  const x = Math.max(t.len / 2 + O, t.x + t.w / 2 + SILK_GAP);
  return polyline([
    { x: t.x, y: -y },
    { x: -x, y: -y },
    { x: -x, y },
    { x: t.x, y },
  ]);
}

function twoPad(m: Meta, t: TwoPad, marked: boolean, roundness?: number): FootprintDef {
  const y = t.wid / 2 + O;
  return build({
    ...m,
    pads: [smd('1', -t.x, 0, t.w, t.h, roundness), smd('2', t.x, 0, t.w, t.h, roundness)],
    // unmarked chips: lines along the body edges, clipped to the gap between the pads
    silk: marked ? bracket(t) : [line(-t.len / 2, -y, t.len / 2, -y), line(-t.len / 2, y, t.len / 2, y)],
    body: { x1: -t.len / 2, y1: -t.wid / 2, x2: t.len / 2, y2: t.wid / 2 },
  });
}

function chips(): FootprintDef[] {
  // id, metric code, pad w, pad h, pad x, body length, body width
  const list: [string, string, number, number, number, number, number][] = [
    ['R_0402', '1005', 0.54, 0.64, 0.51, 1.0, 0.5],
    ['R_0603', '1608', 0.8, 0.95, 0.825, 1.6, 0.8],
    ['R_0805', '2012', 1.025, 1.4, 0.9125, 2.0, 1.25],
    ['R_1206', '3216', 1.125, 1.75, 1.4625, 3.2, 1.6],
    ['R_2512', '6332', 1.525, 3.35, 2.9625, 6.3, 3.2],
    ['C_0402', '1005', 0.59, 0.64, 0.48, 1.0, 0.5],
    ['C_0603', '1608', 0.9, 0.95, 0.775, 1.6, 0.8],
    ['C_0805', '2012', 1.0, 1.45, 0.95, 2.0, 1.25],
    ['C_1206', '3216', 1.15, 1.8, 1.475, 3.2, 1.6],
    ['LED_0603', '1608', 0.875, 0.95, 0.7875, 1.6, 0.8],
    ['LED_0805', '2012', 0.975, 1.4, 0.9375, 2.0, 1.25],
    ['L_1210', '3225', 1.25, 2.65, 1.4, 3.2, 2.5],
  ];
  const kinds: Record<string, [string, string, string[]]> = {
    R: ['Resistor', 'Resistors', ['resistor']],
    C: ['Capacitor', 'Capacitors', ['capacitor', 'mlcc', 'ceramic']],
    LED: ['LED', 'LEDs', ['led', 'diode']],
    L: ['Inductor', 'Inductors', ['inductor', 'choke']],
  };
  return list.map(([id, metric, w, h, x, len, wid]) => {
    const [prefix, size] = id.split('_');
    const [kind, category, tags] = kinds[prefix];
    const led = prefix === 'LED';
    return twoPad(
      {
        id,
        name: `${kind} ${size} (${metric} metric)`,
        description: `${kind}, SMD chip ${size} (${metric} metric), body ${len}x${wid} mm, IPC-7351 nominal land pattern${led ? ', pad 1 = cathode' : ''}`,
        category,
        tags: [...tags, 'smd', 'chip', size, metric],
      },
      { w, h, x, len, wid },
      led,
      0.25,
    );
  });
}

function diodes(): FootprintDef[] {
  // id, package, pad w, pad h, pad x, body length, body width
  const list: [string, string, number, number, number, number, number][] = [
    ['D_SOD-123', 'SOD-123', 0.9, 1.2, 1.65, 2.7, 1.6],
    ['D_SMA', 'SMA (DO-214AC)', 2.5, 1.8, 2.0, 4.3, 2.6],
    ['D_SMB', 'SMB (DO-214AA)', 2.5, 2.3, 2.15, 4.3, 3.6],
    ['D_MiniMELF', 'MiniMELF (SOD-80)', 1.3, 1.7, 1.75, 3.3, 1.6],
  ];
  return list.map(([id, pkg, w, h, x, len, wid]) =>
    twoPad(
      {
        id,
        name: `Diode ${pkg}`,
        description: `Diode, SMD ${pkg}, body ${len}x${wid} mm, pad 1 = cathode`,
        category: 'Diodes',
        tags: ['diode', 'smd', ...pkg.toLowerCase().split(/[ ()]+/).filter(Boolean)],
      },
      { w, h, x, len, wid },
      true,
    ),
  );
}

// ---- SOT, dual row and quad packages -----------------------------------------------------

/** body outline plus a pin 1 mark: the top edge extended over pad 1 */
function outline(bodyW: number, bodyL: number, pin1OuterX: number): FootprintGraphic[] {
  const x = bodyW / 2 + O;
  const y = bodyL / 2 + O;
  return [...box(-x, -y, x, y), line(-x, -y, -pin1OuterX, -y)];
}

interface Dual {
  pins: number;
  pitch: number;
  /** pad centre distance from the origin */
  x: number;
  w: number;
  h: number;
  bodyW: number;
  bodyL: number;
}

/** pins counter clockwise: 1..n/2 down the left side, then up the right side */
function dualPads(d: Dual): PadDef[] {
  const n = d.pins / 2;
  const pads: PadDef[] = [];
  for (let i = 0; i < n; i++) pads.push(smd(String(i + 1), -d.x, (i - (n - 1) / 2) * d.pitch, d.w, d.h));
  for (let i = 0; i < n; i++) pads.push(smd(String(n + i + 1), d.x, ((n - 1) / 2 - i) * d.pitch, d.w, d.h));
  return pads;
}

function dual(m: Meta, d: Dual): FootprintDef {
  return build({ ...m, pads: dualPads(d), silk: outline(d.bodyW, d.bodyL, d.x + d.w / 2), body: { x1: -d.bodyW / 2, y1: -d.bodyL / 2, x2: d.bodyW / 2, y2: d.bodyL / 2 } });
}

function sots(): FootprintDef[] {
  const tags = ['sot', 'transistor', 'regulator', 'smd'];
  const sot23 = { w: 1.475, h: 0.6, x: 0.9375 };
  const sot23x = { pitch: 0.95, x: 1.1375, w: 1.325, h: 0.6, bodyW: 1.6, bodyL: 2.9 };
  const sot235 = dualPads({ pins: 6, ...sot23x }).filter((p) => p.num !== '5');
  sot235[4].num = '5';
  return [
    build({
      id: 'SOT-23',
      name: 'SOT-23',
      description: 'SOT-23 (TO-236), 3 pins, 0.95 mm pitch: pads 1 and 2 left, 3 right',
      category: 'Transistors',
      tags: [...tags, 'sot-23', 'sot23', 'to-236'],
      pads: [smd('1', -sot23.x, -0.95, sot23.w, sot23.h), smd('2', -sot23.x, 0.95, sot23.w, sot23.h), smd('3', sot23.x, 0, sot23.w, sot23.h)],
      silk: outline(1.3, 2.9, sot23.x + sot23.w / 2),
      body: { x1: -0.65, y1: -1.45, x2: 0.65, y2: 1.45 },
    }),
    build({
      id: 'SOT-23-5',
      name: 'SOT-23-5',
      description: 'SOT-23-5, 5 pins, 0.95 mm pitch: 1-3 left, 4 and 5 right',
      category: 'Transistors',
      tags: [...tags, 'sot-23-5', 'sot23-5', 'sc-74a'],
      pads: sot235,
      silk: outline(1.6, 2.9, sot23x.x + sot23x.w / 2),
      body: { x1: -0.8, y1: -1.45, x2: 0.8, y2: 1.45 },
    }),
    dual({ id: 'SOT-23-6', name: 'SOT-23-6', description: 'SOT-23-6, 6 pins, 0.95 mm pitch', category: 'Transistors', tags: [...tags, 'sot-23-6', 'sot23-6', 'sc-74'] }, { pins: 6, ...sot23x }),
    build({
      id: 'SOT-223',
      name: 'SOT-223',
      description: 'SOT-223, 3 pins 2.3 mm pitch and tab (pad 4)',
      category: 'Transistors',
      tags: [...tags, 'sot-223', 'sot223'],
      pads: [smd('1', -3.15, -2.3, 2, 1.5), smd('2', -3.15, 0, 2, 1.5), smd('3', -3.15, 2.3, 2, 1.5), smd('4', 3.15, 0, 2, 3.8)],
      silk: outline(3.5, 6.5, 4.15),
      body: { x1: -1.75, y1: -3.25, x2: 1.75, y2: 3.25 },
    }),
    build({
      id: 'TO-252',
      name: 'TO-252 (DPAK)',
      description: 'TO-252-2 (DPAK), pins 1 and 3, tab = pad 2',
      category: 'Transistors',
      tags: [...tags, 'to-252', 'to252', 'dpak', 'mosfet'],
      pads: [smd('1', -5.04, -2.28, 2.2, 1.2), smd('2', 1.26, 0, 6.4, 5.8), smd('3', -5.04, 2.28, 2.2, 1.2)],
      silk: [...box(-3.11 - O, -3.25 - O, 3.11 + O, 3.25 + O), line(-3.11 - O, -3.25 - O, -6.14, -3.25 - O)],
      body: { x1: -3.11, y1: -3.25, x2: 4.11, y2: 3.25 },
    }),
  ];
}

function ics(): FootprintDef[] {
  // id, pins, pitch, pad x, pad w, pad h, body w, body l
  const list: [string, number, number, number, number, number, number, number][] = [
    ['SOIC-8_3.9x4.9mm_P1.27mm', 8, 1.27, 2.475, 1.95, 0.6, 3.9, 4.9],
    ['SOIC-14_3.9x8.7mm_P1.27mm', 14, 1.27, 2.475, 1.95, 0.6, 3.9, 8.7],
    ['SOIC-16_3.9x9.9mm_P1.27mm', 16, 1.27, 2.475, 1.95, 0.6, 3.9, 9.9],
    ['SOIC-16W_7.5x10.3mm_P1.27mm', 16, 1.27, 4.65, 2.05, 0.6, 7.5, 10.3],
    ['SOIC-20W_7.5x12.8mm_P1.27mm', 20, 1.27, 4.65, 2.05, 0.6, 7.5, 12.8],
    ['SOIC-28W_7.5x17.9mm_P1.27mm', 28, 1.27, 4.65, 2.05, 0.6, 7.5, 17.9],
    ['TSSOP-14_4.4x5mm_P0.65mm', 14, 0.65, 2.8625, 1.475, 0.4, 4.4, 5.0],
    ['TSSOP-16_4.4x5mm_P0.65mm', 16, 0.65, 2.8625, 1.475, 0.4, 4.4, 5.0],
    ['TSSOP-20_4.4x6.5mm_P0.65mm', 20, 0.65, 2.8625, 1.475, 0.4, 4.4, 6.5],
    ['MSOP-8_3x3mm_P0.65mm', 8, 0.65, 2.1125, 1.475, 0.42, 3.0, 3.0],
  ];
  const out = list.map(([id, pins, pitch, x, w, h, bodyW, bodyL]) => {
    const pkg = id.split('_')[0];
    const family = pkg.replace(/-.*/, '');
    return dual(
      {
        id,
        name: pkg,
        description: `${pkg}, ${pins} pins, body ${bodyW}x${bodyL} mm, ${pitch} mm pitch`,
        category: 'ICs SMD',
        tags: ['ic', 'smd', family.toLowerCase(), pkg.toLowerCase(), ...(family === 'SOIC' ? ['so', pkg.endsWith('W') ? 'wide' : 'narrow'] : [])],
      },
      { pins, pitch, x, w, h, bodyW, bodyL },
    );
  });
  // QFP: pins counter clockwise from the top of the left side
  const qfps: [number, number, number, number, number][] = [
    [32, 7, 0.8, 4.1625, 0.55],
    [44, 10, 0.8, 5.6625, 0.55],
    [64, 10, 0.5, 5.6625, 0.3],
  ];
  for (const [pins, body, pitch, c, wid] of qfps) {
    const n = pins / 4;
    const len = 1.475;
    const off = (i: number) => (i - (n - 1) / 2) * pitch;
    const pads: PadDef[] = [];
    for (let i = 0; i < n; i++) pads.push(smd(String(i + 1), -c, off(i), len, wid));
    for (let i = 0; i < n; i++) pads.push(smd(String(n + i + 1), off(i), c, wid, len));
    for (let i = 0; i < n; i++) pads.push(smd(String(2 * n + i + 1), c, -off(i), len, wid));
    for (let i = 0; i < n; i++) pads.push(smd(String(3 * n + i + 1), -off(i), -c, wid, len));
    const b = body / 2;
    out.push(
      build({
        id: `TQFP-${pins}_${body}x${body}mm_P${pitch}mm`,
        name: `TQFP-${pins}`,
        description: `TQFP-${pins}, body ${body}x${body} mm, ${pitch} mm pitch`,
        category: 'ICs SMD',
        tags: ['ic', 'smd', 'qfp', 'tqfp', 'lqfp', `tqfp-${pins}`],
        pads,
        // the outline is clipped to corner marks; the dot marks pin 1
        silk: [...box(-b - 0.11, -b - 0.11, b + 0.11, b + 0.11), dot(-b + 0.9, -b + 0.9, 0.3)],
        body: { x1: -b, y1: -b, x2: b, y2: b },
      }),
    );
  }
  return out;
}

function misc(): FootprintDef[] {
  const s = 3.41;
  const c = 1.065;
  return [
    build({
      id: 'CP_Elec_6.3x5.4',
      name: 'Electrolytic capacitor SMD 6.3x5.4 mm',
      description: 'Capacitor, electrolytic, SMD, diameter 6.3 mm, height 5.4 mm, pad 1 = +',
      category: 'Capacitors',
      tags: ['capacitor', 'electrolytic', 'polarized', 'elko', 'smd', 'can'],
      pads: [smd('1', -2.8, 0, 3.5, 1.6), smd('2', 2.8, 0, 3.5, 1.6)],
      silk: [
        ...polyline(
          [
            { x: s, y: -s },
            { x: -s + c, y: -s },
            { x: -s, y: -s + c },
            { x: -s, y: s - c },
            { x: -s + c, y: s },
            { x: s, y: s },
          ],
          true,
        ),
        ...plus(-4.04, -1.85, 0.39),
      ],
      body: { x1: -3.3, y1: -3.3, x2: 3.3, y2: 3.3 },
    }),
    build({
      id: 'TestPoint_Pad_D1.0mm',
      name: 'Test point pad 1.0 mm',
      description: 'Test point, SMD round pad diameter 1.0 mm',
      category: 'Misc',
      tags: ['test point', 'testpoint', 'probe', 'smd', 'pad'],
      pads: [{ num: '1', x: 0, y: 0, shape: 'circle', w: 1, h: 1 }],
      silk: [circle(0, 0, 0.5 + SILK_GAP)],
      body: { x1: -0.9, y1: -0.9, x2: 0.9, y2: 0.9 },
    }),
  ];
}

export function smdFootprints(): FootprintDef[] {
  return [...chips(), ...diodes(), ...sots(), ...ics(), ...misc()];
}
