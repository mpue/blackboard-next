// Gerber RS-274X writer with X2 attributes (format 4.6, mm). The board is seen
// from the top on every layer (bottom layers are not mirrored) and Y points up:
// gerberY = doc.height - y.

import type { Doc } from '../../model/types.ts';
import { rotatePt, type Pt } from '../../geometry/geom.ts';
import { mm, toMm } from '../units.ts';
import { copperPrims, edgePrims, maskPrims, silkPrims, type PadGeom, type Prim } from './layers.ts';
import { GENERATOR, safeProjectName, type FabFile, type Ring, type ZoneFills } from './types.ts';

export interface GerberOptions {
  zoneFills?: ZoneFills;
  project?: string;
  /** solder mask opening around pads, board units, default 0.05 mm */
  maskExpansion?: number;
}

// $1 = corner circle diameter, $2..$9 = corner circle centres
const MACROS: Record<string, string> = {
  RoundRect: [
    '%AMRoundRect*',
    '0 Rectangle with rounded corners*',
    '4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*',
    '1,1,$1,$2,$3*',
    '1,1,$1,$4,$5*',
    '1,1,$1,$6,$7*',
    '1,1,$1,$8,$9*',
    '20,1,$1,$2,$3,$4,$5,0*',
    '20,1,$1,$4,$5,$6,$7,0*',
    '20,1,$1,$6,$7,$8,$9,0*',
    '20,1,$1,$8,$9,$2,$3,0*%',
  ].join('\n'),
  RotRect: ['%AMRotRect*', '0 Rotated rectangle given by its corners*', '4,1,4,$1,$2,$3,$4,$5,$6,$7,$8,$1,$2,0*%'].join('\n'),
  RotOval: ['%AMRotOval*', '0 Rotated obround: diameter and centres of the end circles*', '1,1,$1,$2,$3*', '1,1,$1,$4,$5*', '20,1,$1,$2,$3,$4,$5,0*%'].join('\n'),
};

const EPS = 1e-6;

/** board units -> mm with 6 decimals (aperture parameters) */
function num(u: number): string {
  const v = toMm(u);
  return (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);
}

/** 0 or 90 when a 180° symmetric shape is axis aligned. */
function quarterTurn(rot: number): 0 | 90 | undefined {
  const a = ((rot % 180) + 180) % 180;
  if (a < EPS || a > 180 - EPS) return 0;
  if (Math.abs(a - 90) < EPS) return 90;
  return undefined;
}

/** Offsets from the pad centre, rotated, in Gerber orientation (y up). */
function offsets(pts: Pt[], rot: number): string[] {
  const o = { x: 0, y: 0 };
  return pts.flatMap((p) => {
    const q = rotatePt(p, o, rot);
    return [num(q.x), num(-q.y)];
  });
}

const rectCorners = (hx: number, hy: number): Pt[] => [
  { x: -hx, y: -hy },
  { x: hx, y: -hy },
  { x: hx, y: hy },
  { x: -hx, y: hy },
];

export function padAperture(g: PadGeom): string {
  switch (g.kind) {
    case 'circle':
      return `C,${num(g.d)}`;
    case 'rect':
    case 'oval': {
      const q = quarterTurn(g.rot);
      if (q !== undefined) {
        const [w, h] = q === 0 ? [g.w, g.h] : [g.h, g.w];
        return `${g.kind === 'rect' ? 'R' : 'O'},${num(w)}X${num(h)}`;
      }
      if (g.kind === 'rect') return `RotRect,${offsets(rectCorners(g.w / 2, g.h / 2), g.rot).join('X')}`;
      const d = Math.min(g.w, g.h);
      const l = (Math.max(g.w, g.h) - d) / 2;
      const ends = g.w > g.h ? [{ x: -l, y: 0 }, { x: l, y: 0 }] : [{ x: 0, y: -l }, { x: 0, y: l }];
      return `RotOval,${[num(d), ...offsets(ends, g.rot)].join('X')}`;
    }
    case 'roundrect':
      return `RoundRect,${[num(2 * g.r), ...offsets(rectCorners(g.w / 2 - g.r, g.h / 2 - g.r), g.rot)].join('X')}`;
  }
}

/** Serialises primitives (board units, y down) into one Gerber file. */
export function writeGerber(height: number, fileAttributes: string[], prims: Prim[]): string {
  const ix = (v: number) => Math.round(toMm(v) * 1e6);
  const iy = (v: number) => Math.round(toMm(height - v) * 1e6);
  const xy = (p: Pt) => `X${ix(p.x)}Y${iy(p.y)}`;

  const apertures = new Map<string, { code: number; def: string; fn?: string }>();
  const macros = new Set<string>();
  const body: string[] = [];
  let current = 0;
  let pos = '';
  let dark = true;
  let regionFn: string | undefined;

  const use = (def: string, fn?: string) => {
    const key = `${fn ?? ''}|${def}`;
    let a = apertures.get(key);
    if (!a) {
      a = { code: 10 + apertures.size, def, fn };
      apertures.set(key, a);
      const m = def.slice(0, def.indexOf(','));
      if (MACROS[m]) macros.add(m);
    }
    if (a.code !== current) {
      body.push(`D${a.code}*`);
      current = a.code;
    }
  };
  const moveTo = (p: Pt) => {
    const c = xy(p);
    if (c !== pos) body.push(`${c}D02*`);
    pos = c;
  };
  const lineTo = (p: Pt) => {
    pos = xy(p);
    body.push(`${pos}D01*`);
  };
  const flash = (p: Pt) => {
    pos = xy(p);
    body.push(`${pos}D03*`);
  };
  const setDark = (d: boolean) => {
    if (d !== dark) body.push(d ? '%LPD*%' : '%LPC*%');
    dark = d;
  };
  const arcTo = (c: Pt, a: Pt, b: Pt, cw: boolean) => {
    const end = xy(b);
    // coincident end points would be a full circle in multi quadrant mode
    if (end === xy(a)) return;
    body.push(cw ? 'G02*' : 'G03*', `${end}I${ix(c.x) - ix(a.x)}J${iy(c.y) - iy(a.y)}D01*`, 'G01*');
    pos = end;
  };
  const region = (ring: Ring, fn?: string) => {
    const pts = ring.map(xy).filter((c, i, all) => c !== all[(i + all.length - 1) % all.length]);
    if (pts.length < 3) return;
    if (fn !== regionFn) body.push(fn ? `%TA.AperFunction,${fn}*%` : '%TD.AperFunction*%');
    regionFn = fn;
    body.push('G36*', `${pts[0]}D02*`, ...pts.slice(1).map((c) => `${c}D01*`), `${pts[0]}D01*`, 'G37*');
    pos = pts[0];
  };

  for (const p of prims) {
    switch (p.kind) {
      case 'flash':
        use(padAperture(p.shape), p.fn);
        flash(p.shape.c);
        break;
      case 'path': {
        if (!p.pts.length) break;
        use(`C,${num(p.width)}`, p.fn);
        const first = xy(p.pts[0]);
        if (p.pts.every((q) => xy(q) === first)) {
          flash(p.pts[0]);
          break;
        }
        moveTo(p.pts[0]);
        for (const q of p.pts.slice(1)) lineTo(q);
        if (p.closed && pos !== first) lineTo(p.pts[0]);
        break;
      }
      case 'arc':
        use(`C,${num(p.width)}`, p.fn);
        moveTo(p.a);
        arcTo(p.c, p.a, p.b, p.cw);
        break;
      case 'circle': {
        if (p.r <= EPS) break;
        use(`C,${num(p.width)}`, p.fn);
        const s = { x: p.c.x + p.r, y: p.c.y };
        const m = { x: p.c.x - p.r, y: p.c.y };
        moveTo(s);
        arcTo(p.c, s, m, true);
        arcTo(p.c, m, s, true);
        break;
      }
      case 'region':
        setDark(true);
        region(p.outer, p.fn);
        if (p.holes.length) {
          setDark(false);
          for (const h of p.holes) region(h, p.fn);
          setDark(true);
        }
        break;
    }
  }
  if (regionFn) body.push('%TD*%');

  const out = [
    `%TF.GenerationSoftware,${GENERATOR}*%`,
    '%TF.SameCoordinates,Original*%',
    ...fileAttributes.map((a) => `%TF.${a}*%`),
    '%FSLAX46Y46*%',
    'G04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*',
    'G04 Created by BlackBoard Next*',
    '%MOMM*%',
    '%LPD*%',
    'G01*',
    'G75*',
  ];
  if (macros.size) {
    out.push('G04 Aperture macros*');
    for (const m of Object.keys(MACROS)) if (macros.has(m)) out.push(MACROS[m]);
  }
  out.push('G04 Aperture list*');
  let fn: string | undefined;
  for (const a of apertures.values()) {
    if (a.fn !== fn) out.push(a.fn ? `%TA.AperFunction,${a.fn}*%` : '%TD.AperFunction*%');
    fn = a.fn;
    out.push(`%ADD${a.code}${a.def}*%`);
  }
  if (fn) out.push('%TD*%');
  out.push('G04 End of aperture list*', ...body, 'M02*');
  return out.join('\n') + '\n';
}

/** All Gerber layers with KiCad/Protel file names. */
export function gerberFiles(doc: Doc, opts: GerberOptions = {}): FabFile[] {
  const p = safeProjectName(opts.project);
  const e = opts.maskExpansion ?? mm(0.05);
  const file = (suffix: string, fn: string, polarity: 'Positive' | 'Negative', prims: Prim[]): FabFile => ({
    name: `${p}-${suffix}`,
    content: writeGerber(doc.height, [`FileFunction,${fn}`, `FilePolarity,${polarity}`], prims),
  });
  return [
    file('F_Cu.gtl', 'Copper,L1,Top', 'Positive', copperPrims(doc, 'top', opts.zoneFills)),
    file('B_Cu.gbl', 'Copper,L2,Bot', 'Positive', copperPrims(doc, 'bottom', opts.zoneFills)),
    file('F_Mask.gts', 'Soldermask,Top', 'Negative', maskPrims(doc, 'top', e)),
    file('B_Mask.gbs', 'Soldermask,Bot', 'Negative', maskPrims(doc, 'bottom', e)),
    file('F_Silkscreen.gto', 'Legend,Top', 'Positive', silkPrims(doc, 'top')),
    file('B_Silkscreen.gbo', 'Legend,Bot', 'Positive', silkPrims(doc, 'bottom')),
    file('Edge_Cuts.gm1', 'Profile,NP', 'Positive', edgePrims(doc)),
  ];
}
