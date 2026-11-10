// KiCad footprints (.kicad_mod): reads KiCad 6/7/8 "(footprint …)" and KiCad 5
// "(module …)" files into FootprintDef (pads, silkscreen, courtyard, designator
// position) and writes FootprintDef as a KiCad 7 footprint.

import type { FootprintDef, FootprintGraphic, PadDef, PadShape } from '../../model/types.ts';
import { autoCourtyard, finalizeFootprint, graphicBounds, round6, USER_CATEGORY } from '../../pcb/editor/model.ts';
import { mm, toMm } from '../../pcb/units.ts';
import { atoms, find, isList, num, parseSexpr, q, str, writeSexpr, type SExpr, type SOut } from './sexpr.ts';

export const KICAD_ID_PREFIX = 'KiCad:';

type Pt = { x: number; y: number };

const DEFAULT_SILK = 0.12;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

// ---- reading (geometry in mm until the end) ---------------------------------------------

function pt(list: SExpr[] | undefined, name: string): Pt {
  const l = find(list, name);
  return { x: num(l, 1) ?? 0, y: num(l, 2) ?? 0 };
}

function strokeWidth(g: SExpr[]): number {
  return num(find(find(g, 'stroke'), 'width'), 1) ?? num(find(g, 'width'), 1) ?? DEFAULT_SILK;
}

/** (fill solid) in KiCad 6/7, (fill yes) in KiCad 9; polygons without a fill token are filled up to KiCad 6 */
function isFilled(g: SExpr[], byDefault: boolean): boolean {
  const f = find(g, 'fill');
  if (!f) return byDefault;
  const v = str(f, 1) ?? find(f, 'type')?.[1];
  return v === 'solid' || v === 'yes' || v === 'true';
}

function arcFromCentre(c: Pt, r: number, start: number, sweep: number, width: number): FootprintGraphic {
  if (Math.abs(sweep) >= 360 - 1e-9) return { kind: 'circle', cx: c.x, cy: c.y, r, width };
  // the direction of silk arcs carries no meaning: stored with a positive sweep
  const s = sweep < 0 ? start + sweep : start;
  return { kind: 'arc', cx: c.x, cy: c.y, r, start: r4(norm360(s)), sweep: r4(Math.abs(sweep)), width };
}

/** circle through three points; undefined when they are collinear */
function circumcentre(a: Pt, b: Pt, c: Pt): Pt | undefined {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return undefined;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
}

const angleOf = (c: Pt, p: Pt) => deg(Math.atan2(p.y - c.y, p.x - c.x));

/** KiCad 6+: start, mid and end point on the arc */
function arc3(s: Pt, m: Pt, e: Pt, width: number): FootprintGraphic {
  if (Math.hypot(s.x - e.x, s.y - e.y) < 1e-9) {
    const c = { x: (s.x + m.x) / 2, y: (s.y + m.y) / 2 };
    return { kind: 'circle', cx: c.x, cy: c.y, r: Math.hypot(s.x - c.x, s.y - c.y), width };
  }
  const c = circumcentre(s, m, e);
  if (!c) return { kind: 'line', x1: s.x, y1: s.y, x2: e.x, y2: e.y, width };
  const a = angleOf(c, s);
  const dm = norm360(angleOf(c, m) - a);
  const de = norm360(angleOf(c, e) - a);
  return arcFromCentre(c, Math.hypot(s.x - c.x, s.y - c.y), a, dm <= de ? de : de - 360, width);
}

function arcPoints(s: Pt, m: Pt, e: Pt): Pt[] {
  const g = arc3(s, m, e, 0);
  if (g.kind !== 'arc') return [s, e];
  const n = Math.max(2, Math.ceil(g.sweep / 10));
  const forward = Math.hypot(s.x - (g.cx + g.r * Math.cos(rad(g.start))), s.y - (g.cy + g.r * Math.sin(rad(g.start)))) < 1e-6;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = forward ? i / n : 1 - i / n;
    const a = rad(g.start + g.sweep * t);
    out.push({ x: g.cx + g.r * Math.cos(a), y: g.cy + g.r * Math.sin(a) });
  }
  return out;
}

/** (pts (xy x y) … (arc (start) (mid) (end)) …) */
function polyPoints(pts: SExpr[] | undefined): Pt[] {
  const out: Pt[] = [];
  for (const c of pts ?? []) {
    if (!isList(c)) continue;
    if (c[0] === 'xy') out.push({ x: num(c, 1) ?? 0, y: num(c, 2) ?? 0 });
    else if (c[0] === 'arc') {
      const p = arcPoints(pt(c, 'start'), pt(c, 'mid'), pt(c, 'end'));
      if (out.length && Math.hypot(out[out.length - 1].x - p[0].x, out[out.length - 1].y - p[0].y) < 1e-9) p.shift();
      out.push(...p);
    }
  }
  return out;
}

function graphic(g: SExpr[], polyFilledByDefault: boolean): FootprintGraphic[] {
  const width = strokeWidth(g);
  switch (g[0]) {
    case 'fp_line': {
      const a = pt(g, 'start');
      const b = pt(g, 'end');
      return [{ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width }];
    }
    case 'fp_rect': {
      const a = pt(g, 'start');
      const b = pt(g, 'end');
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (isFilled(g, false)) {
        const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
        return [{ kind: 'poly', pts, width, fill: true }];
      }
      return [{ kind: 'rect', x, y, w, h, width }];
    }
    case 'fp_circle': {
      const c = pt(g, 'center');
      const e = pt(g, 'end');
      const out: FootprintGraphic = { kind: 'circle', cx: c.x, cy: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), width };
      if (isFilled(g, false)) out.fill = true;
      return [out];
    }
    case 'fp_arc': {
      if (find(g, 'mid')) return [arc3(pt(g, 'start'), pt(g, 'mid'), pt(g, 'end'), width)];
      // KiCad 5: (start) is the centre, (end) the start point, (angle) the sweep, clockwise on screen
      const c = pt(g, 'start');
      const s = pt(g, 'end');
      return [arcFromCentre(c, Math.hypot(s.x - c.x, s.y - c.y), angleOf(c, s), num(find(g, 'angle'), 1) ?? 0, width)];
    }
    case 'fp_poly': {
      const pts = polyPoints(find(g, 'pts'));
      if (pts.length < 2) return [];
      const out: FootprintGraphic = { kind: 'poly', pts, width };
      if (isFilled(g, polyFilledByDefault)) out.fill = true;
      return [out];
    }
    case 'fp_curve': {
      // cubic Bézier, as line segments (our polygons are closed)
      const p = polyPoints(find(g, 'pts'));
      if (p.length !== 4) return [];
      const at = (t: number): Pt => {
        const u = 1 - t;
        const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        return { x: k.reduce((s, w, i) => s + w * p[i].x, 0), y: k.reduce((s, w, i) => s + w * p[i].y, 0) };
      };
      const out: FootprintGraphic[] = [];
      for (let i = 0; i < 16; i++) {
        const a = at(i / 16);
        const b = at((i + 1) / 16);
        out.push({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width });
      }
      return out;
    }
  }
  return [];
}

const PAD_SHAPES: Record<string, PadShape> = { circle: 'circle', oval: 'oval', rect: 'rect', roundrect: 'roundrect' };

function pad(p: SExpr[], slots: { found: boolean }): PadDef | undefined {
  const type = str(p, 2) ?? 'smd';
  const kind = str(p, 3) ?? 'rect';
  const npth = type === 'np_thru_hole';
  const layers = atoms(find(p, 'layers'));
  // paste or mask only apertures carry no copper
  if (!npth && !layers.some((l) => /(?:^|\.)Cu$/.test(l))) return undefined;
  const at = find(p, 'at');
  const size = find(p, 'size');
  const w = num(size, 1) ?? 0;
  const anchor = str(find(find(p, 'options'), 'anchor'), 1);
  const shape: PadShape = PAD_SHAPES[kind] ?? (kind === 'custom' && anchor === 'circle' ? 'circle' : 'rect');
  const out: PadDef = { num: npth ? '' : (str(p, 1) ?? ''), x: num(at, 1) ?? 0, y: num(at, 2) ?? 0, shape, w, h: num(size, 2) ?? w };
  // KiCad angles are counter clockwise on screen, ours clockwise
  const angle = norm360(-(num(at, 3) ?? 0));
  if (angle > 1e-9 && angle < 360 - 1e-9 && shape !== 'circle') out.rotation = r4(angle);
  if (shape === 'roundrect') out.roundness = Math.min(0.5, Math.max(0, num(find(p, 'roundrect_rratio'), 1) ?? 0.25));
  if (type === 'thru_hole' || npth) {
    const drill = find(p, 'drill');
    const dims = (drill ?? []).slice(1).filter((c): c is string => typeof c === 'string' && c !== 'oval').map(Number).filter((v) => v > 0);
    if (dims.length > 1 && Math.abs(dims[0] - dims[1]) > 1e-9) slots.found = true;
    const d = dims.length ? Math.min(...dims) : npth ? Math.min(out.w, out.h) : 0;
    if (d > 0) out.drill = d;
  }
  if (npth) out.npth = true;
  const fn = str(find(p, 'pinfunction'), 1)?.trim();
  if (fn && !npth) out.name = fn;
  return out;
}

const NAME_RULES: [string, RegExp][] = [
  ['Mechanical', /^(?:MountingHole|Fiducial|MountingPin|Hole)|mounting.?hole/i],
  ['Potentiometers', /^(?:Potentiometer|Pot_|Trimmer)/i],
  ['LEDs', /^LED/i],
  ['Diodes', /^(?:D_|Diode|Bridge)/i],
  ['Capacitors', /^(?:C_|CP_|Capacitor)/i],
  ['Inductors', /^(?:L_|Inductor|Choke)/i],
  ['Resistors', /^(?:R_|Resistor|RN_)/i],
  ['Crystals', /^(?:Crystal|Resonator|Oscillator|XTAL)/i],
  ['Switches', /^(?:SW_|Switch|Button)/i],
  ['ICs DIP', /^(?:DIP|PDIP|DIL)-?\d/i],
  ['ICs SMD', /^(?:SOIC|SOP|SO-\d|SSOP|TSSOP|HTSSOP|MSOP|VSSOP|QFN|DFN|VQFN|WQFN|UQFN|QFP|TQFP|LQFP|PQFP|BGA|PLCC|TSOP|LGA|WLCSP)/i],
  ['Transistors', /^(?:TO-|SOT-|SOT\d|SC-\d|DPAK|D2PAK|TSOT)/i],
  ['Connectors', /^(?:PinHeader|PinSocket|Connector|TerminalBlock|Conn_|JST|Molex|USB|IDC|Jack|BarrelJack|DSUB|RJ\d|Header)/i],
  ['Misc', /^(?:Buzzer|TestPoint|Speaker|Fuse|Relay|Battery)/i],
];
const TEXT_RULES: [string, RegExp][] = [
  ['Mechanical', /mounting hole|fiducial/i],
  ['Potentiometers', /potentiometer|trimmer/i],
  ['LEDs', /\bled\b/i],
  ['Diodes', /\bdiode|rectifier|zener/i],
  ['Capacitors', /capacitor/i],
  ['Inductors', /inductor|choke/i],
  ['Resistors', /resistor/i],
  ['Crystals', /crystal|resonator|oscillator/i],
  ['Switches', /switch|button/i],
  ['ICs DIP', /\bdip\b|\bdil\b/i],
  ['ICs SMD', /\b(?:soic|ssop|tssop|msop|qfn|qfp|bga)\b/i],
  ['Transistors', /transistor|mosfet|\bsot\b|\bto-?(?:92|220|247|126)\b/i],
  ['Connectors', /connector|header|terminal block|socket/i],
];

/** library category from the footprint name, then from tags and description; 'User' when unsure */
export function guessCategory(name: string, text = ''): string {
  for (const [cat, re] of NAME_RULES) if (re.test(name)) return cat;
  for (const [cat, re] of TEXT_RULES) if (re.test(text)) return cat;
  return USER_CATEGORY;
}

const u6 = (v: number) => round6(mm(v));

function graphicToUnits(g: FootprintGraphic): FootprintGraphic {
  switch (g.kind) {
    case 'line':
      return { ...g, x1: u6(g.x1), y1: u6(g.y1), x2: u6(g.x2), y2: u6(g.y2), width: u6(g.width) };
    case 'rect':
      return { ...g, x: u6(g.x), y: u6(g.y), w: u6(g.w), h: u6(g.h), width: u6(g.width) };
    case 'circle':
    case 'arc':
      return { ...g, cx: u6(g.cx), cy: u6(g.cy), r: u6(g.r), width: u6(g.width) };
    case 'poly':
      return { ...g, pts: g.pts.map((p) => ({ x: u6(p.x), y: u6(p.y) })), width: u6(g.width) };
  }
}

/** bottom side drawings (seen from the bottom in KiCad) back to the top view: y mirrored */
function mirrorGraphic(g: FootprintGraphic): FootprintGraphic {
  switch (g.kind) {
    case 'line':
      return { ...g, y1: -g.y1, y2: -g.y2 };
    case 'rect':
      return { ...g, y: -(g.y + g.h) };
    case 'circle':
      return { ...g, cy: -g.cy };
    case 'arc':
      return { ...g, cy: -g.cy, start: r4(norm360(-(g.start + g.sweep))) };
    case 'poly':
      return { ...g, pts: g.pts.map((p) => ({ x: p.x, y: -p.y })) };
  }
}

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9._+\-]/g, '_');

/** Reads one .kicad_mod file. Throws on syntax errors and on files that are no footprint. */
export function parseKicadFootprint(text: string, fileName?: string): FootprintDef {
  const root = parseSexpr(text).find((e): e is SExpr[] => isList(e) && (e[0] === 'footprint' || e[0] === 'module'));
  if (!root) throw new Error('not a KiCad footprint: (footprint …) or (module …) expected');
  const legacy = root[0] === 'module';
  const version = num(find(root, 'version'), 1) ?? (legacy ? 0 : 20221018);
  const fileBase = fileName?.split(/[\\/]/).pop()?.replace(/\.kicad_mod$/i, '');
  // "Lib:Name" when copied from a board
  const name = (str(root, 1) ?? '').split(':').pop()?.trim() || fileBase || 'footprint';
  const bottom = (str(find(root, 'layer'), 1) ?? 'F.Cu').startsWith('B.');
  const side = bottom ? 'B.' : 'F.';
  const silkLayers = [`${side}SilkS`, `${side}Silkscreen`];
  const yardLayers = [`${side}CrtYd`, `${side}Courtyard`];
  const polyFilled = legacy || version <= 20210722;

  let silk: FootprintGraphic[] = [];
  let yard: FootprintGraphic[] = [];
  let pads: PadDef[] = [];
  let ref: Pt | undefined;
  const slots = { found: false };
  for (const c of root) {
    if (!isList(c)) continue;
    const key = c[0];
    if (typeof key === 'string' && key.startsWith('fp_') && key !== 'fp_text' && key !== 'fp_text_box') {
      const layer = str(find(c, 'layer'), 1) ?? '';
      if (silkLayers.includes(layer)) silk.push(...graphic(c, polyFilled));
      else if (yardLayers.includes(layer)) yard.push(...graphic(c, polyFilled));
    } else if ((key === 'fp_text' && str(c, 1) === 'reference') || (key === 'property' && str(c, 1)?.toLowerCase() === 'reference' && find(c, 'at'))) {
      ref = pt(c, 'at');
    } else if (key === 'pad') {
      const p = pad(c, slots);
      if (p) pads.push(p);
    }
  }
  if (bottom) {
    silk = silk.map(mirrorGraphic);
    yard = yard.map(mirrorGraphic);
    pads = pads.map((p) => {
      const out = { ...p, y: -p.y };
      if (p.rotation) out.rotation = r4(norm360(-p.rotation));
      return out;
    });
    if (ref) ref = { x: ref.x, y: -ref.y };
  }

  const descr = str(find(root, 'descr'), 1) ?? '';
  const kicadTags = (str(find(root, 'tags'), 1) ?? '').split(/[\s,]+/).filter((t) => /[A-Za-z0-9]/.test(t));
  const attr = atoms(find(root, 'attr'));
  const copper = pads.filter((p) => !p.npth);
  const tht = attr.includes('through_hole') || copper.some((p) => p.drill);
  const smdOnly = attr.includes('smd') || (copper.length > 0 && !tht);
  const tags = [...kicadTags, 'kicad'];
  if (tht) tags.push('tht');
  else if (smdOnly) tags.push('smd');
  if (slots.found) tags.push('slot');

  const def: FootprintDef = {
    id: KICAD_ID_PREFIX + sanitize(name),
    name,
    description: descr,
    category: guessCategory(name, `${kicadTags.join(' ')} ${descr}`),
    pads: pads.map((p) => {
      const out: PadDef = { ...p, x: u6(p.x), y: u6(p.y), w: u6(p.w), h: u6(p.h) };
      if (p.drill !== undefined) out.drill = u6(p.drill);
      return out;
    }),
    silk: silk.map((g) => {
      const out = graphicToUnits(g);
      // zero width outlines would vanish
      if (!(out.width > 0) && !('fill' in out && out.fill)) out.width = u6(DEFAULT_SILK);
      return out;
    }),
    courtyard: { x: 0, y: 0, w: 0, h: 0 },
    tags,
  };
  if (yard.length) {
    const b = yard.map((g) => graphicBounds({ ...graphicToUnits(g), width: 0 }));
    const x1 = Math.min(...b.map((r) => r.x));
    const y1 = Math.min(...b.map((r) => r.y));
    const x2 = Math.max(...b.map((r) => r.x + r.w));
    const y2 = Math.max(...b.map((r) => r.y + r.h));
    def.courtyard = { x: round6(x1), y: round6(y1), w: round6(x2 - x1), h: round6(y2 - y1) };
  } else def.courtyard = autoCourtyard(def);
  if (ref) def.refPos = { x: u6(ref.x), y: u6(ref.y) };
  return finalizeFootprint(def);
}

export interface KicadImport {
  footprints: FootprintDef[];
  errors: { file: string; message: string }[];
}

/** Reads several .kicad_mod files (e.g. the content of a .pretty folder); broken files are reported, not thrown. */
export function parseKicadFootprints(files: { name: string; text: string }[]): KicadImport {
  const out: KicadImport = { footprints: [], errors: [] };
  for (const f of files) {
    try {
      out.footprints.push(parseKicadFootprint(f.text, f.name));
    } catch (e) {
      out.errors.push({ file: f.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// ---- writing -----------------------------------------------------------------------------

/** characters KiCad does not accept in footprint names */
export const kicadName = (s: string) => s.trim().replace(/[\\/:"*?<>|\s]+/g, '_') || 'footprint';

/** KiCad footprint name of a definition: imported footprints keep their KiCad name */
export const kicadFootprintName = (def: Pick<FootprintDef, 'id' | 'name'>) =>
  kicadName(def.id.startsWith(KICAD_ID_PREFIX) ? def.name || def.id.slice(KICAD_ID_PREFIX.length) : def.id);

/** file name inside a .pretty folder */
export const kicadFootprintFileName = (def: Pick<FootprintDef, 'id' | 'name'>) => `${kicadFootprintName(def)}.kicad_mod`;

const m = (u: number) => round6(toMm(u));
const xy = (name: string, x: number, y: number): SOut => [name, m(x), m(y)];
const stroke = (w: number): SOut => ['stroke', ['width', m(w)], ['type', 'solid']];
const fill = (on: boolean | undefined): SOut => ['fill', on ? 'solid' : 'none'];

function writeGraphic(g: FootprintGraphic, layer: string): SOut {
  const lay: SOut = ['layer', q(layer)];
  switch (g.kind) {
    case 'line':
      return ['fp_line', xy('start', g.x1, g.y1), xy('end', g.x2, g.y2), stroke(g.width), lay];
    case 'rect':
      return ['fp_rect', xy('start', g.x, g.y), xy('end', g.x + g.w, g.y + g.h), stroke(g.width), fill(false), lay];
    case 'circle':
      return ['fp_circle', xy('center', g.cx, g.cy), xy('end', g.cx + g.r, g.cy), stroke(g.width), fill(g.fill), lay];
    case 'arc': {
      if (Math.abs(g.sweep) >= 360) return writeGraphic({ kind: 'circle', cx: g.cx, cy: g.cy, r: g.r, width: g.width }, layer);
      const on = (name: string, a: number) => xy(name, g.cx + g.r * Math.cos(rad(a)), g.cy + g.r * Math.sin(rad(a)));
      return ['fp_arc', on('start', g.start), on('mid', g.start + g.sweep / 2), on('end', g.start + g.sweep), stroke(g.width), lay];
    }
    case 'poly':
      return ['fp_poly', ['pts', ...g.pts.map((p) => xy('xy', p.x, p.y))], stroke(g.width), fill(g.fill), lay];
  }
}

function writePad(p: PadDef): SOut {
  const tht = p.drill !== undefined && p.drill > 0;
  const type = p.npth ? 'np_thru_hole' : tht ? 'thru_hole' : 'smd';
  const angle = p.rotation ? round6(norm360(-p.rotation)) : 0;
  const at: SOut = angle ? ['at', m(p.x), m(p.y), angle] : ['at', m(p.x), m(p.y)];
  const d = p.shape === 'circle' ? Math.min(p.w, p.h) : 0;
  const out: SOut[] = ['pad', q(p.npth ? '' : p.num), type, p.shape, at, d ? ['size', m(d), m(d)] : ['size', m(p.w), m(p.h)]];
  if (tht || p.npth) out.push(['drill', m(p.drill ?? Math.min(p.w, p.h))]);
  out.push(['layers', ...(tht || p.npth ? ['*.Cu', '*.Mask'] : ['F.Cu', 'F.Paste', 'F.Mask']).map(q)]);
  if (p.shape === 'roundrect') out.push(['roundrect_rratio', round6(p.roundness ?? 0.25)]);
  // not used by KiCad in libraries; keeps the pad functions (TO-92 C/B/E) on a round trip
  if (p.name && !p.npth) out.push(['pinfunction', q(p.name)]);
  return out;
}

const font: SOut = ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]];

/** KiCad 7 .kicad_mod text of a footprint (origin, pads and silkscreen unchanged). */
export function writeKicadFootprint(def: FootprintDef): string {
  const name = kicadFootprintName(def);
  const c = def.courtyard;
  const copper = def.pads.filter((p) => !p.npth);
  const attr = copper.some((p) => p.drill) ? 'through_hole' : copper.length ? 'smd' : undefined;
  const ref = def.refPos ?? { x: c.x + c.w / 2, y: c.y - mm(0.8) };
  const tags = (def.tags ?? []).filter((t) => t !== 'kicad').join(' ');
  const out: SOut[] = ['footprint', q(name), ['version', 20221018], ['generator', 'blackboard_next'], ['layer', q('F.Cu')]];
  const descr = def.description || (def.name !== name ? def.name : '');
  if (descr) out.push(['descr', q(descr)]);
  if (tags) out.push(['tags', q(tags)]);
  if (attr) out.push(['attr', attr]);
  out.push(['fp_text', 'reference', q('REF**'), xy('at', ref.x, ref.y), ['layer', q('F.SilkS')], font]);
  out.push(['fp_text', 'value', q(name), xy('at', c.x + c.w / 2, c.y + c.h + mm(1)), ['layer', q('F.Fab')], font]);
  for (const g of def.silk) out.push(writeGraphic(g, 'F.SilkS'));
  if (c.w > 0 && c.h > 0) out.push(writeGraphic({ kind: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, width: mm(0.05) }, 'F.CrtYd'));
  for (const p of def.pads) out.push(writePad(p));
  return writeSexpr(out) + '\n';
}
