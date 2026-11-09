// Printable 1:1 copper artwork for home etching (toner transfer, UV exposure):
// black copper on white, small white dots in the drill holes to centre the
// drill bit, thin board outline.
//
// Mirroring: in toner transfer the print is laid face down onto the copper, so
// the board receives the mirror image of the print. The document shows every
// layer as seen from the top. The top copper therefore has to be printed
// mirrored, while the bottom copper - which seen from below is the mirror image
// of the top view - comes out right when printed unmirrored. Hence the default
// `mirror = side === 'top'`. For UV exposure with the printed side on the copper
// the same rule applies.

import type { CopperSide, Doc } from '../../model/types.ts';
import type { Pt } from '../../geometry/geom.ts';
import { mm, toMm } from '../units.ts';
import { copperPrims, edgePrims, holes, type PadGeom, type Prim } from './layers.ts';
import type { Ring, ZoneFills } from './types.ts';

export interface EtchingOptions {
  /** default: side === 'top' (see above) */
  mirror?: boolean;
  zoneFills?: ZoneFills;
  /** diameter of the centring dots, board units, default 0.5 mm (at most the drill) */
  drillDot?: number;
}

const f = (u: number) => {
  const v = Math.round(toMm(u) * 1e4) / 1e4;
  return String(v === 0 ? 0 : v);
};

function padSvg(g: PadGeom): string {
  if (g.kind === 'circle') return `<circle cx="${f(g.c.x)}" cy="${f(g.c.y)}" r="${f(g.d / 2)}"/>`;
  const rx = g.kind === 'oval' ? Math.min(g.w, g.h) / 2 : g.kind === 'roundrect' ? g.r : 0;
  const t = g.rot ? ` transform="rotate(${+g.rot.toFixed(4)} ${f(g.c.x)} ${f(g.c.y)})"` : '';
  return `<rect x="${f(g.c.x - g.w / 2)}" y="${f(g.c.y - g.h / 2)}" width="${f(g.w)}" height="${f(g.h)}"${rx ? ` rx="${f(rx)}"` : ''}${t}/>`;
}

const ringPath = (r: Ring) => `M${r.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`;
const pts = (ps: Pt[]) => ps.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');

function primSvg(p: Prim): string {
  const stroke = (w: number) => `fill="none" stroke="#000" stroke-width="${f(w)}"`;
  switch (p.kind) {
    case 'flash':
      return padSvg(p.shape);
    case 'path': {
      const same = p.pts.every((q) => Math.abs(q.x - p.pts[0].x) < 1e-9 && Math.abs(q.y - p.pts[0].y) < 1e-9);
      if (same) return p.pts.length ? `<circle cx="${f(p.pts[0].x)}" cy="${f(p.pts[0].y)}" r="${f(p.width / 2)}"/>` : '';
      return `<${p.closed ? 'polygon' : 'polyline'} points="${pts(p.pts)}" ${stroke(p.width)}/>`;
    }
    case 'arc': {
      const r = Math.hypot(p.a.x - p.c.x, p.a.y - p.c.y);
      const a0 = Math.atan2(p.a.y - p.c.y, p.a.x - p.c.x);
      const a1 = Math.atan2(p.b.y - p.c.y, p.b.x - p.c.x);
      // y points down: clockwise on screen = increasing angle
      const sweep = (((p.cw ? a1 - a0 : a0 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return `<path d="M${f(p.a.x)} ${f(p.a.y)}A${f(r)} ${f(r)} 0 ${sweep > Math.PI ? 1 : 0} ${p.cw ? 1 : 0} ${f(p.b.x)} ${f(p.b.y)}" ${stroke(p.width)}/>`;
    }
    case 'circle':
      return `<circle cx="${f(p.c.x)}" cy="${f(p.c.y)}" r="${f(p.r)}" ${stroke(p.width)}/>`;
    case 'region':
      return `<path fill-rule="evenodd" d="${[p.outer, ...p.holes].map(ringPath).join('')}"/>`;
  }
}

export function etchingSvg(doc: Doc, side: CopperSide, opts: EtchingOptions = {}): string {
  const mirror = opts.mirror ?? side === 'top';
  const W = f(doc.width);
  const H = f(doc.height);
  const dot = opts.drillDot ?? mm(0.5);
  const copper = copperPrims(doc, side, opts.zoneFills).map(primSvg);
  const dots = holes(doc)
    .filter((h) => h.plated)
    .map((h) => `<circle cx="${f(h.x)}" cy="${f(h.y)}" r="${f(Math.min(dot, h.d) / 2)}"/>`);
  const edge = edgePrims(doc).map(primSvg);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<desc>${side} copper, scale 1:1${mirror ? ', mirrored' : ''}</desc>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`,
    `<g${mirror ? ` transform="translate(${W} 0) scale(-1 1)"` : ''} stroke-linecap="round" stroke-linejoin="round">`,
    `<g fill="#000">`,
    ...copper,
    '</g>',
    '<g fill="#fff">',
    ...dots,
    '</g>',
    ...edge,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
