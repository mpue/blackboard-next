// Compact single stroke vector font for silkscreen and copper text (Gerber has
// no fonts). Glyphs live on a grid: x 0..4 (a few glyphs are wider), y 0 = cap
// top, 2 = x-height, 6 = baseline, 8 = descender. A glyph is a list of strokes
// separated by spaces; a stroke is a sequence of "xy" digit pairs, a single
// pair is a dot.

import { rotatePt } from '../../geometry/geom.ts';
import type { Segment } from './types.ts';

const CAP = 6;
const SPACING = 2;

const GLYPHS: Record<string, string> = {
  ' ': '',
  '!': '0004 06',
  '"': '0002 2022',
  '#': '1016 3036 0242 0444',
  $: '42311102133344351504 2026',
  '%': '0640 0010110100 3545463635',
  '&': '4612112031320405162644',
  "'": '0002',
  '(': '201103041627',
  ')': '001123241607',
  '*': '2125 0244 0442',
  '+': '2125 0343',
  ',': '151607',
  '-': '0343',
  '.': '06',
  '/': '0630',
  '0': '103041453616050110',
  '1': '011016 0626',
  '2': '01103041420646',
  '3': '0110304142334445361605 1333',
  '4': '36300444',
  '5': '400003334445361605',
  '6': '4130100105163645443303',
  '7': '00404116',
  '8': '103041423313020110 1304051636454433',
  '9': '0516364541301001021343',
  ':': '02 06',
  ';': '12 151607',
  '<': '310335',
  '=': '0242 0444',
  '>': '013305',
  '?': '01103041422324 26',
  '@': '4222132444 4244546361501001051656',
  A: '0602204246 0444',
  B: '06003041423303 3344453606',
  C: '4130100105163645',
  D: '00304145360600',
  E: '40000646 0333',
  F: '400006 0333',
  G: '41301001051636454323',
  H: '0006 4046 0343',
  I: '0020 1016 0626',
  J: '4045361605',
  K: '0006 4004 1346',
  L: '000646',
  M: '0600234046',
  N: '06004640',
  O: '103041453616050110',
  P: '06003041423303',
  Q: '103041453616050110 2446',
  R: '06003041423303 2346',
  S: '413010010213334445361605',
  T: '0040 2026',
  U: '000516364540',
  V: '002640',
  W: '0016233640',
  X: '0046 4006',
  Y: '002340 2326',
  Z: '00400646',
  '[': '20000727',
  '\\': '0036',
  ']': '00202707',
  '^': '022042',
  _: '0747',
  '`': '0011',
  a: '4246 4332120305163645',
  b: '0006 0312324345361605',
  c: '4332120305163645',
  d: '4046 4332120305163645',
  e: '04444332120305163645',
  f: '30201116 0232',
  g: '4247381807 4332120305163645',
  h: '0006 0312324346',
  i: '0206 00',
  j: '121708 10',
  k: '0006 3205 1436',
  l: '000516',
  m: '0206 0312223336 3342526366',
  n: '0206 0312324346',
  o: '123243453616050312',
  p: '0208 0312324345361605',
  q: '4248 4332120305163645',
  r: '0206 031232',
  s: '4212031434453606',
  t: '10152636 0232',
  u: '0205163645 4246',
  v: '022642',
  w: '0216335662',
  x: '0246 4206',
  y: '0226 4218',
  z: '02420646',
  '{': '20111203141526',
  '|': '0007',
  '}': '00111223141506',
  '~': '03123443',
  µ: '0208 05163645 4246',
  Ω: '061615040110304144353646',
  '°': '1021120110',
};

/** glyphs without strokes need an explicit width */
const WIDTHS: Record<string, number> = { ' ': 2 };

interface Glyph {
  strokes: [number, number][][];
  width: number;
}

const cache = new Map<string, Glyph>();

function glyph(ch: string): Glyph {
  let g = cache.get(ch);
  if (g) return g;
  const src = GLYPHS[ch] ?? (ch === '\t' ? GLYPHS[' '] : GLYPHS['?']);
  const strokes = src
    .split(' ')
    .filter((s) => s.length >= 2)
    .map((s) => {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < s.length; i += 2) pts.push([+s[i], +s[i + 1]]);
      return pts;
    });
  const width = WIDTHS[ch] ?? Math.max(0, ...strokes.flat().map((p) => p[0]));
  g = { strokes, width };
  cache.set(ch, g);
  return g;
}

function lineAdvance(line: string): number {
  let w = 0;
  for (const ch of line) w += glyph(ch).width + SPACING;
  return line.length ? w - SPACING : 0;
}

/** Width of the widest line for a cap height of `height`. */
export function strokeTextWidth(text: string, height: number): number {
  return Math.max(0, ...text.split('\n').map(lineAdvance)) * (height / CAP);
}

export interface StrokeTextOptions {
  /** degrees, clockwise (y down) around the anchor point */
  rotation?: number;
  /** mirror horizontally around the anchor point (text on the bottom side) */
  mirror?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  /** reference of y: baseline of the first line, middle of the text block or cap top */
  valign?: 'baseline' | 'middle' | 'top';
  /** distance of the baselines as a multiple of the height, default 1.6 */
  lineSpacing?: number;
}

/**
 * Text as line segments. `height` is the cap height; a sensible stroke width
 * is about 0.15 * height.
 */
export function strokeText(text: string, x: number, y: number, height: number, opts: StrokeTextOptions = {}): Segment[] {
  const s = height / CAP;
  const lines = text.split('\n');
  const pitch = height * (opts.lineSpacing ?? 1.6);
  const blockH = height + (lines.length - 1) * pitch;
  const y0 = opts.valign === 'top' ? height : opts.valign === 'middle' ? height - blockH / 2 : 0;
  const origin = { x, y };
  const rot = opts.rotation ?? 0;
  const out: Segment[] = [];
  lines.forEach((line, li) => {
    const w = lineAdvance(line) * s;
    let pen = opts.anchor === 'middle' ? -w / 2 : opts.anchor === 'end' ? -w : 0;
    const base = y0 + li * pitch;
    for (const ch of line) {
      const g = glyph(ch);
      for (const stroke of g.strokes) {
        const pts = stroke.map(([gx, gy]) => {
          const lx = pen + gx * s;
          return rotatePt({ x: x + (opts.mirror ? -lx : lx), y: y + base + (gy - CAP) * s }, origin, rot);
        });
        if (pts.length === 1) out.push({ x1: pts[0].x, y1: pts[0].y, x2: pts[0].x, y2: pts[0].y });
        for (let i = 1; i < pts.length; i++) out.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
      }
      pen += (g.width + SPACING) * s;
    }
  });
  return out;
}
