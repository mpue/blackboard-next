// Through hole footprints (dimensions after the KiCad library). The origin is
// pad 1, which is rectangular so that it can be recognised on the board.

import type { FootprintDef, FootprintGraphic, PadDef } from '../../model/types.ts';
import { arc, box, build, circle, fmt, hole, line, pad2, plus, polyline, racetrack, roundShape, SILK_GAP, SILK_OFFSET as O, tht, type Box } from './helpers.ts';

interface Meta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
}

const P = 2.54;
const deg = (rad: number) => (rad * 180) / Math.PI;

/** pads in a row along +x, pad 1 rectangular */
function row(count: number, pitch: number, w: number, h: number, drill: number, names?: string[]): PadDef[] {
  return Array.from({ length: count }, (_, i) => tht(String(i + 1), i * pitch, 0, i === 0 ? 'rect' : roundShape(w, h), w, h, drill, names?.[i]));
}

// ---- axial and box shaped two pin parts ----------------------------------------------------

function axial(m: Meta, pitch: number, len: number, dia: number, pad: number, drill: number, band = false): FootprintDef {
  const x1 = (pitch - len) / 2;
  const x2 = x1 + len;
  const r = dia / 2;
  const sy = r + O;
  const silk = box(x1 - O, -sy, x2 + O, sy);
  if (x1 - O > 0) silk.push(line(0, 0, x1 - O, 0), line(x2 + O, 0, pitch, 0));
  // cathode band next to pad 1
  if (band) for (const k of [-1, 0, 1]) silk.push(line(x1 + 0.15 * len + k * 0.12, -sy, x1 + 0.15 * len + k * 0.12, sy));
  return build({ ...m, pads: row(2, pitch, pad, pad, drill), silk, body: { x1, y1: -r, x2, y2: r } });
}

/** rectangular body centred between two pads (disc and film capacitors) */
function boxed(m: Meta, pitch: number, len: number, wid: number, pad: number, drill: number): FootprintDef {
  const body: Box = { x1: (pitch - len) / 2, y1: -wid / 2, x2: (pitch + len) / 2, y2: wid / 2 };
  return build({ ...m, pads: row(2, pitch, pad, pad, drill), silk: box(body.x1 - O, body.y1 - O, body.x2 + O, body.y2 + O), body });
}

/** round body centred between two pads; polarised parts get a "+" above pad 1 */
function radial(m: Meta, pitch: number, dia: number, pad: number, drill: number, polarised: boolean): FootprintDef {
  const cx = pitch / 2;
  const r = dia / 2;
  const silk: FootprintGraphic[] = [circle(cx, 0, r + O)];
  if (polarised) {
    const top = Math.sqrt(r * r - cx * cx);
    silk.push(...plus(0, -(pad / 2 + top) / 2, Math.min(0.5, (top - pad / 2) / 2 - 0.3)));
  }
  return build({ ...m, pads: row(2, pitch, pad, pad, drill), silk, body: { x1: cx - r, y1: -r, x2: cx + r, y2: r } });
}

function resistors(): FootprintDef[] {
  const axials: [number, string, number, number, number, number][] = [
    [7.62, 'DIN0207', 6.3, 2.5, 1.6, 0.8],
    [10.16, 'DIN0207', 6.3, 2.5, 1.6, 0.8],
    [12.7, 'DIN0309', 9.0, 3.2, 1.6, 0.8],
    [15.24, 'DIN0414', 11.9, 4.5, 2.4, 1.2],
  ];
  const out = axials.map(([p, din, len, dia, pad, drill]) =>
    axial(
      {
        id: `R_Axial_P${fmt(p)}mm`,
        name: `Resistor axial, ${fmt(p)} mm`,
        description: `Resistor, axial, ${din} body ${len}x${dia} mm, ${fmt(p)} mm pitch, horizontal`,
        category: 'Resistors',
        tags: ['resistor', 'axial', 'tht', din.toLowerCase()],
      },
      p,
      len,
      dia,
      pad,
      drill,
    ),
  );
  // standing resistor: body circle around pad 1, clear of the pad corners
  const rs = Math.max(1.25 + O, 0.8 * Math.SQRT2 + SILK_GAP);
  out.push(
    build({
      id: 'R_Axial_Vertical_P2.54mm',
      name: 'Resistor axial vertical, 2.54 mm',
      description: 'Resistor, axial, DIN0207 body 6.3x2.5 mm, 2.54 mm pitch, vertical (standing)',
      category: 'Resistors',
      tags: ['resistor', 'axial', 'vertical', 'standing', 'tht', 'din0207'],
      pads: row(2, P, 1.6, 1.6, 0.8),
      silk: [circle(0, 0, rs)],
      body: { x1: -1.25, y1: -1.25, x2: 1.25, y2: 1.25 },
    }),
  );
  return out;
}

function diodes(): FootprintDef[] {
  const list: [string, number, number, number, number, number][] = [
    ['DO-35', 7.62, 4.0, 2.0, 1.6, 0.8],
    ['DO-35', 10.16, 4.0, 2.0, 1.6, 0.8],
    ['DO-41', 10.16, 5.2, 2.7, 2.2, 1.1],
    ['DO-201', 15.24, 9.53, 5.21, 2.6, 1.3],
  ];
  return list.map(([pkg, p, len, dia, pad, drill]) =>
    axial(
      {
        id: `D_${pkg}_P${fmt(p)}mm`,
        name: `Diode ${pkg}, ${fmt(p)} mm`,
        description: `Diode, ${pkg}, axial, body ${len}x${dia} mm, ${fmt(p)} mm pitch, horizontal, pad 1 = cathode`,
        category: 'Diodes',
        tags: ['diode', 'axial', 'tht', pkg.toLowerCase()],
      },
      p,
      len,
      dia,
      pad,
      drill,
      true,
    ),
  );
}

function capacitors(): FootprintDef[] {
  const out = [
    boxed({ id: 'C_Disc_P2.54mm', name: 'Ceramic disc capacitor, 2.54 mm', description: 'Capacitor, ceramic disc, body 3.8x2.6 mm, 2.54 mm pitch', category: 'Capacitors', tags: ['capacitor', 'ceramic', 'disc', 'tht'] }, P, 3.8, 2.6, 1.6, 0.8),
    boxed({ id: 'C_Disc_P5.08mm', name: 'Ceramic disc capacitor, 5.08 mm', description: 'Capacitor, ceramic disc, body 5.1x3.2 mm, 5.08 mm pitch', category: 'Capacitors', tags: ['capacitor', 'ceramic', 'disc', 'tht'] }, 5.08, 5.1, 3.2, 1.6, 0.8),
    boxed({ id: 'C_Rect_P5.00mm', name: 'Film capacitor, 5.00 mm', description: 'Capacitor, film, box body 7.2x2.5 mm, 5.00 mm pitch', category: 'Capacitors', tags: ['capacitor', 'film', 'box', 'mkt', 'mks', 'tht'] }, 5, 7.2, 2.5, 1.6, 0.8),
    boxed({ id: 'C_Rect_P7.50mm', name: 'Film capacitor, 7.50 mm', description: 'Capacitor, film, box body 10.0x2.5 mm, 7.50 mm pitch', category: 'Capacitors', tags: ['capacitor', 'film', 'box', 'mkt', 'mks', 'tht'] }, 7.5, 10, 2.5, 2.0, 1.0),
  ];
  const elcos: [number, number, number, number][] = [
    [5, 2, 1.6, 0.8],
    [6.3, 2.5, 1.6, 0.8],
    [8, 3.5, 2.0, 1.0],
    [10, 5, 2.0, 1.0],
    [12.5, 5, 2.4, 1.2],
  ];
  for (const [d, p, pad, drill] of elcos)
    out.push(
      radial(
        {
          id: `CP_Radial_D${d.toFixed(1)}mm_P${fmt(p)}mm`,
          name: `Electrolytic capacitor D${d.toFixed(1)} mm, ${fmt(p)} mm`,
          description: `Capacitor, electrolytic, radial, diameter ${d.toFixed(1)} mm, ${fmt(p)} mm pitch, pad 1 = +`,
          category: 'Capacitors',
          tags: ['capacitor', 'electrolytic', 'polarized', 'radial', 'elko', 'tht'],
        },
        p,
        d,
        pad,
        drill,
        true,
      ),
    );
  return out;
}

function inductors(): FootprintDef[] {
  return [
    axial({ id: 'L_Axial_P10.16mm', name: 'Inductor axial, 10.16 mm', description: 'Inductor, axial, body 6.6x2.7 mm, 10.16 mm pitch, horizontal', category: 'Inductors', tags: ['inductor', 'choke', 'axial', 'tht'] }, 10.16, 6.6, 2.7, 1.6, 0.8),
    radial({ id: 'L_Radial_D8.0mm_P5.00mm', name: 'Inductor radial D8.0 mm, 5.00 mm', description: 'Inductor, radial, diameter 8.0 mm, 5.00 mm pitch', category: 'Inductors', tags: ['inductor', 'choke', 'radial', 'tht'] }, 5, 8, 2.0, 1.0, false),
  ];
}

// ---- LEDs ------------------------------------------------------------------------------------

/** round LED: flange outline with the flat on the cathode (pad 1) side */
function led(size: number, flangeR: number, flatX: number, lens: boolean): FootprintDef {
  const cx = P / 2;
  const a = deg(Math.acos((flatX - cx) / flangeR));
  const fy = flangeR * Math.sin((a * Math.PI) / 180);
  const silk: FootprintGraphic[] = [arc(cx, 0, flangeR, -a, 2 * a), line(flatX, -fy, flatX, fy)];
  if (lens) silk.push(circle(cx, 0, size / 2));
  return build({
    id: `LED_${size}mm`,
    name: `LED ${size} mm`,
    description: `LED, round, diameter ${size} mm, 2.54 mm pitch, pad 1 = cathode (flat side)`,
    category: 'LEDs',
    tags: ['led', 'diode', 'round', 'tht', `${size}mm`],
    pads: row(2, P, 1.8, 1.8, 0.9),
    silk,
    body: { x1: cx - flangeR + 0.1, y1: -flangeR + 0.1, x2: cx + flangeR - 0.1, y2: flangeR - 0.1 },
  });
}

// ---- transistors -----------------------------------------------------------------------------

/** TO-92: D shaped body, flat side towards +y */
function to92(id: string, pitch: number, pad: [number, number], drill: number, names?: string[]): FootprintDef {
  const cx = pitch;
  const r = 2.48;
  const flat = 1.75;
  const sr = r + O;
  const sf = flat + 0.1;
  const dx = Math.sqrt(sr * sr - sf * sf);
  const a = deg(Math.atan2(sf, dx));
  const pins = names ? ` (${names.join(' ')})` : '';
  return build({
    id,
    name: `TO-92${pitch > 2 ? ' wide' : ''}${pins}`,
    description: `TO-92, 3 pins inline, ${fmt(pitch)} mm pitch${names ? `, pins ${names.join(', ')}` : ''}`,
    category: 'Transistors',
    tags: ['to-92', 'to92', 'transistor', 'tht', ...(names ? [names.join('').toLowerCase()] : [])],
    pads: row(3, pitch, pad[0], pad[1], drill, names),
    silk: [line(cx - dx, sf, cx + dx, sf), arc(cx, 0, sr, 180 - a, 180 + 2 * a)],
    body: { x1: cx - r, y1: -r, x2: cx + r, y2: flat },
  });
}

function to220(id: string, names?: string[]): FootprintDef {
  const pads = row(3, P, 1.8, 2.4, 1.1, names);
  const front = Math.max(1.25 + O, 1.2 + SILK_GAP);
  const pins = names ? ` (${names.join(' ')})` : '';
  return build({
    id,
    name: `TO-220 vertical${pins}`,
    description: `TO-220-3, vertical, 3 pins 2.54 mm pitch${names ? `, pins ${names.join(', ')}` : ''}`,
    category: 'Transistors',
    tags: ['to-220', 'to220', 'transistor', 'regulator', 'mosfet', 'vertical', 'tht', ...(names ? [names.join('').toLowerCase()] : [])],
    pads,
    silk: [...box(-2.46 - O, -3.15 - O, 7.54 + O, front), line(-2.46 - O, -1.88, 7.54 + O, -1.88), line(0.69, -3.15 - O, 0.69, -1.88), line(4.39, -3.15 - O, 4.39, -1.88)],
    body: { x1: -2.46, y1: -3.15, x2: 7.54, y2: 1.25 },
  });
}

function to220Horizontal(): FootprintDef {
  const leads = [0, P, 2 * P].flatMap((x) => [line(x - 0.485, -3.81 + O, x - 0.485, 0), line(x + 0.485, -3.81 + O, x + 0.485, 0)]);
  return build({
    id: 'TO-220_Horizontal',
    name: 'TO-220 horizontal',
    description: 'TO-220-3, horizontal (lying, tab down), 3 pins 2.54 mm pitch, 3.5 mm mounting hole',
    category: 'Transistors',
    tags: ['to-220', 'to220', 'transistor', 'regulator', 'mosfet', 'horizontal', 'tht'],
    pads: [...row(3, P, 1.8, 2.4, 1.1), hole(P, -16.66, 3.5)],
    silk: [...box(-2.46 - O, -19.46 - O, 7.54 + O, -3.81 + O), line(-2.46 - O, -13.06, 7.54 + O, -13.06), ...leads],
    body: { x1: -2.46, y1: -19.46, x2: 7.54, y2: 0 },
  });
}

// ---- ICs ---------------------------------------------------------------------------------------

/** DIP: pins counter clockwise, 1..n/2 down the left column, then up the right one */
function dip(pins: number, width: number): FootprintDef {
  const n = pins / 2;
  const pads: PadDef[] = [];
  for (let i = 0; i < n; i++) pads.push(tht(String(i + 1), 0, i * P, i === 0 ? 'rect' : 'oval', 2.4, 1.6, 0.8));
  for (let i = 0; i < n; i++) pads.push(tht(String(n + i + 1), width, (n - 1 - i) * P, 'oval', 2.4, 1.6, 0.8));
  const bodyW = width < 10 ? 6.35 : 13.97;
  const sx1 = 1.2 + SILK_GAP;
  const sx2 = width - sx1;
  const sy1 = -1.33;
  const sy2 = (n - 1) * P + 1.33;
  const c = width / 2;
  const mil = Math.round(width / 0.0254);
  return build({
    id: `DIP-${pins}_W${fmt(width)}mm`,
    name: `DIP-${pins} (${mil} mil)`,
    description: `DIP-${pins}, ${fmt(width)} mm row spacing, 2.54 mm pitch`,
    category: 'ICs DIP',
    tags: ['dip', 'dil', 'pdip', 'ic', 'tht', `${mil}mil`],
    pads,
    silk: [
      line(sx1, sy1, c - 1, sy1),
      arc(c, sy1, 1, 0, 180),
      ...polyline([
        { x: c + 1, y: sy1 },
        { x: sx2, y: sy1 },
        { x: sx2, y: sy2 },
        { x: sx1, y: sy2 },
        { x: sx1, y: sy1 },
      ]),
    ],
    body: { x1: (width - bodyW) / 2, y1: -1.27, x2: (width + bodyW) / 2, y2: (n - 1) * P + 1.27 },
  });
}

// ---- connectors ------------------------------------------------------------------------------

const S = 1.33;

function header1(n: number): FootprintDef {
  const pads = Array.from({ length: n }, (_, i) => tht(String(i + 1), 0, i * P, i === 0 ? 'rect' : 'oval', 1.7, 1.7, 1.0));
  const bottom = (n - 1) * P + S;
  const silk = [line(-S, bottom, S, bottom), line(-S, 0, -S, -S), line(-S, -S, 0, -S)];
  if (n > 1) silk.push(line(-S, 1.27, S, 1.27), line(-S, 1.27, -S, bottom), line(S, 1.27, S, bottom));
  return build({
    id: `PinHeader_1x${pad2(n)}_P2.54mm`,
    name: `Pin header 1x${pad2(n)}`,
    description: `Pin header, 1x${pad2(n)}, 2.54 mm pitch, single row, vertical`,
    category: 'Connectors',
    tags: ['connector', 'header', 'pin header', 'single row', 'tht', '2.54mm'],
    pads,
    silk,
    body: { x1: -1.27, y1: -1.27, x2: 1.27, y2: (n - 1) * P + 1.27 },
  });
}

/** double row header, IDC numbering: 1 2 / 3 4 / ... */
function header2(n: number): FootprintDef {
  const pads: PadDef[] = [];
  for (let i = 0; i < n; i++) pads.push(tht(String(2 * i + 1), 0, i * P, i === 0 ? 'rect' : 'oval', 1.7, 1.7, 1.0), tht(String(2 * i + 2), P, i * P, 'oval', 1.7, 1.7, 1.0));
  const bottom = (n - 1) * P + S;
  const right = P + S;
  return build({
    id: `PinHeader_2x${pad2(n)}_P2.54mm`,
    name: `Pin header 2x${pad2(n)}`,
    description: `Pin header, 2x${pad2(n)}, 2.54 mm pitch, double row, vertical`,
    category: 'Connectors',
    tags: ['connector', 'header', 'pin header', 'double row', 'idc', 'tht', '2.54mm'],
    pads,
    silk: [
      line(-S, bottom, right, bottom),
      line(-S, 1.27, -S, bottom),
      line(right, -S, right, bottom),
      line(1.27, -S, right, -S),
      line(-S, 1.27, 1.27, 1.27),
      line(1.27, 1.27, 1.27, -S),
      line(-S, 0, -S, -S),
      line(-S, -S, 0, -S),
    ],
    body: { x1: -1.27, y1: -1.27, x2: P + 1.27, y2: (n - 1) * P + 1.27 },
  });
}

/** screw terminal, wire entry towards +y */
function terminal(n: number, pitch: number, pad: number, drill: number, top: number, bottom: number, inner: number[], series: string): FootprintDef {
  const x1 = -pitch / 2;
  const x2 = (n - 1) * pitch + pitch / 2;
  return build({
    id: `TerminalBlock_1x${pad2(n)}_P${fmt(pitch)}mm`,
    name: `Terminal block 1x${pad2(n)}, ${fmt(pitch)} mm`,
    description: `Screw terminal block, 1x${pad2(n)}, ${fmt(pitch)} mm pitch, horizontal wire entry (${series} style)`,
    category: 'Connectors',
    tags: ['connector', 'terminal', 'terminal block', 'screw', 'tht', series.toLowerCase()],
    pads: row(n, pitch, pad, pad, drill),
    silk: [...box(x1 - O, top - O, x2 + O, bottom + O), ...inner.map((y) => line(x1 - O, y, x2 + O, y))],
    body: { x1, y1: top, x2, y2: bottom },
  });
}

// ---- crystals, potentiometers, switches, mechanical, misc -----------------------------------

function crystal(id: string, name: string, c1: number, c2: number): FootprintDef {
  const r = 2.325;
  return build({
    id,
    name,
    description: `Crystal, ${name}, 2 pins 4.88 mm pitch, body ${fmt(c2 - c1 + 2 * r)}x${4.65} mm`,
    category: 'Crystals',
    tags: ['crystal', 'quartz', 'xtal', 'hc-49', 'hc49', 'tht'],
    pads: row(2, 4.88, 1.5, 1.5, 0.8),
    silk: racetrack(c1, c2, r + 0.11),
    body: { x1: c1 - r, y1: -r, x2: c2 + r, y2: r },
  });
}

function potentiometers(): FootprintDef[] {
  return [
    build({
      id: 'Potentiometer_Trimmer_P2.54mm',
      name: 'Trimmer potentiometer, 2.54 mm',
      description: 'Trimmer potentiometer, multi turn, 3 pins inline 2.54 mm pitch, body 9.5x4.8 mm (Bourns 3296W style)',
      category: 'Potentiometers',
      tags: ['potentiometer', 'trimmer', 'trimpot', 'variable resistor', '3296', 'tht'],
      pads: row(3, P, 1.44, 1.44, 0.8),
      silk: box(-2.225 - O, -2.42 - O, 7.305 + O, 2.41 + O),
      body: { x1: -2.225, y1: -2.42, x2: 7.305, y2: 2.41 },
    }),
    build({
      id: 'Potentiometer_RK09_Vertical',
      name: 'Potentiometer Alps RK09K, vertical',
      description: 'Potentiometer, 9 mm, Alps RK09K single gang, vertical, 3 pins 2.5 mm pitch, 2 mounting lugs',
      category: 'Potentiometers',
      tags: ['potentiometer', 'pot', 'alps', 'rk09', 'rk09k', 'variable resistor', 'tht'],
      pads: [
        tht('1', 0, 0, 'rect', 1.8, 1.8, 1.0),
        tht('2', 0, 2.5, 'circle', 1.8, 1.8, 1.0),
        tht('3', 0, 5, 'circle', 1.8, 1.8, 1.0),
        { ...tht('MP', 7, -1.9, 'roundrect', 4, 3, 2.1), roundness: 0.25 / 3 },
        { ...tht('MP', 7, 6.9, 'roundrect', 4, 3, 2.1), roundness: 0.25 / 3 },
      ],
      silk: box(1 - O, -2.4 - O, 13 + O, 7.4 + O),
      body: { x1: 1, y1: -2.4, x2: 13, y2: 7.4 },
    }),
  ];
}

function misc(): FootprintDef[] {
  const mountingHole = (id: string, d: number, head: number, m: string): FootprintDef =>
    build({
      id,
      name: `Mounting hole ${d} mm (${m})`,
      description: `Mounting hole, ${d} mm non plated, for ${m} screws, no copper`,
      category: 'Mechanical',
      tags: ['mounting', 'hole', 'mounting hole', 'npth', 'screw', m.toLowerCase()],
      pads: [hole(0, 0, d)],
      silk: [],
      body: { x1: -head / 2, y1: -head / 2, x2: head / 2, y2: head / 2 },
    });
  const tpR = 0.5 + SILK_GAP;
  return [
    build({
      id: 'SW_PUSH_6mm',
      name: 'Tactile switch 6x6 mm',
      description: 'Push button, tactile switch 6x6 mm, 4 pins 6.5x4.5 mm; pads with the same number are connected internally',
      category: 'Switches',
      tags: ['switch', 'push button', 'tactile', 'button', 'tht'],
      pads: [tht('1', 0, 0, 'circle', 2, 2, 1.1), tht('2', 0, 4.5, 'circle', 2, 2, 1.1), tht('1', 6.5, 0, 'circle', 2, 2, 1.1), tht('2', 6.5, 4.5, 'circle', 2, 2, 1.1)],
      silk: [...box(-0.25, -1, 6.75, 5.5), circle(3.25, 2.25, 1.75)],
      body: { x1: 0.25, y1: -0.75, x2: 6.25, y2: 5.25 },
    }),
    radial({ id: 'Buzzer_12x9.5RM7.6', name: 'Buzzer 12 mm', description: 'Buzzer / beeper, diameter 12 mm, height 9.5 mm, 7.6 mm pitch, pad 1 = +', category: 'Misc', tags: ['buzzer', 'beeper', 'piezo', 'speaker', 'tht'] }, 7.6, 12, 2, 1, true),
    mountingHole('MountingHole_3.2mm_M3', 3.2, 6.4, 'M3'),
    mountingHole('MountingHole_2.2mm_M2', 2.2, 4.4, 'M2'),
    build({
      id: 'MountingHole_3.2mm_M3_Pad',
      name: 'Mounting hole 3.2 mm (M3), pad',
      description: 'Mounting hole, 3.2 mm plated, 6 mm pad, for M3 screws',
      category: 'Mechanical',
      tags: ['mounting', 'hole', 'mounting hole', 'plated', 'pad', 'screw', 'm3'],
      pads: [tht('1', 0, 0, 'circle', 6, 6, 3.2)],
      silk: [],
      body: { x1: -3.2, y1: -3.2, x2: 3.2, y2: 3.2 },
    }),
    build({
      id: 'TestPoint_THT_D1.0mm',
      name: 'Test point THT 1.0 mm',
      description: 'Test point, through hole pad diameter 1.0 mm, drill 0.5 mm',
      category: 'Misc',
      tags: ['test point', 'testpoint', 'probe', 'tht'],
      pads: [tht('1', 0, 0, 'circle', 1, 1, 0.5)],
      silk: [circle(0, 0, tpR)],
      body: { x1: -0.9, y1: -0.9, x2: 0.9, y2: 0.9 },
    }),
  ];
}

export function thtFootprints(): FootprintDef[] {
  const out: FootprintDef[] = [...resistors(), ...diodes(), ...capacitors(), ...inductors(), led(3, 1.99, -0.29, true), led(5, 3.0, -1.29, false)];
  // TO-92 narrow (1.27 mm) and wide (2.54 mm)
  out.push(to92('TO-92', 1.27, [1.05, 1.5], 0.75), to92('TO-92_Wide', P, [1.5, 1.5], 0.8));
  out.push(to92('TO-92_CBE', P, [1.5, 1.5], 0.8, ['C', 'B', 'E']), to92('TO-92_EBC', P, [1.5, 1.5], 0.8, ['E', 'B', 'C']), to92('TO-92_DGS', P, [1.5, 1.5], 0.8, ['D', 'G', 'S']));
  out.push(to220('TO-220'), to220('TO-220_GDS', ['G', 'D', 'S']), to220('TO-220_BCE', ['B', 'C', 'E']), to220Horizontal());
  for (const n of [4, 6, 8, 14, 16, 18, 20, 24, 28]) out.push(dip(n, 7.62));
  for (const n of [24, 28, 32, 40, 48]) out.push(dip(n, 15.24));
  for (let n = 1; n <= 20; n++) out.push(header1(n));
  for (let n = 2; n <= 20; n++) out.push(header2(n));
  for (let n = 2; n <= 6; n++) out.push(terminal(n, 5.08, 2.6, 1.3, -5.2, 4.6, [-2.3, 2.6, 4.1], 'Phoenix MKDS'));
  for (let n = 2; n <= 4; n++) out.push(terminal(n, 3.5, 2.4, 1.2, -3.1, 4.5, [3.0, 4.1], 'Phoenix PT'));
  out.push(crystal('Crystal_HC49-U', 'HC-49/U', -0.685, 5.565), crystal('Crystal_HC49-4H', 'HC-49/4H', -0.76, 5.64));
  out.push(...potentiometers(), ...misc());
  return out;
}
