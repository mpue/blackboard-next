// Parametric 3D component bodies for the board viewer (three.js, 1 unit = 1 mm,
// z points away from the board surface the part is mounted on). The family is
// derived from the footprint id and category, dimensions from the pads, the
// description ("body 6.3x2.5 mm") and the courtyard. Every body is merged into
// one mesh per material to keep the draw calls low.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FootprintDef, FootprintItem } from '../model/types.ts';
import { parseEng } from '../model/ops.ts';
import { toMm } from '../pcb/units.ts';
import { resistorBands } from '../render/resistorColors.ts';

export const BOARD_THICKNESS = 1.6;

export type BodyKind =
  | 'resistor'
  | 'resistor-vertical'
  | 'inductor-axial'
  | 'inductor-radial'
  | 'diode'
  | 'disc-cap'
  | 'film-cap'
  | 'elco'
  | 'elco-smd'
  | 'buzzer'
  | 'led'
  | 'to92'
  | 'to220'
  | 'to220-horizontal'
  | 'dip'
  | 'soic'
  | 'qfp'
  | 'sot'
  | 'sot223'
  | 'dpak'
  | 'chip-r'
  | 'chip-c'
  | 'chip-l'
  | 'chip-led'
  | 'smd-diode'
  | 'melf'
  | 'crystal'
  | 'header'
  | 'socket'
  | 'terminal'
  | 'switch'
  | 'trimmer'
  | 'pot'
  | 'testpoint'
  | 'hole'
  | 'generic';

// ---- family ------------------------------------------------------------------------------

const RULES: [RegExp, BodyKind][] = [
  [/^MountingHole/i, 'hole'],
  [/^TestPoint/i, 'testpoint'],
  [/^R_Axial.*Vertical/i, 'resistor-vertical'],
  [/^R_Axial/i, 'resistor'],
  [/^L_Axial/i, 'inductor-axial'],
  [/^L_Radial/i, 'inductor-radial'],
  [/^D_(DO-|A-405|Axial)/i, 'diode'],
  [/MELF/i, 'melf'],
  [/^D_(SOD|SM[ABC])/i, 'smd-diode'],
  [/^C_Disc/i, 'disc-cap'],
  [/^C_(Rect|Film)/i, 'film-cap'],
  [/^CP_Radial/i, 'elco'],
  [/^CP_Elec/i, 'elco-smd'],
  [/^Buzzer/i, 'buzzer'],
  [/^LED_\d{4}/i, 'chip-led'],
  [/^LED_/i, 'led'],
  [/^TO-92/i, 'to92'],
  [/^TO-220.*Horizontal/i, 'to220-horizontal'],
  [/^TO-220/i, 'to220'],
  [/^TO-252|DPAK/i, 'dpak'],
  [/^SOT-223/i, 'sot223'],
  [/^(SOT-|SC-70|SC-74)/i, 'sot'],
  [/^(SOIC|SOP|SSOP|TSSOP|MSOP|SO-)/i, 'soic'],
  [/^(TQFP|LQFP|QFP)/i, 'qfp'],
  [/^(DIP|PDIP)-/i, 'dip'],
  [/^R_\d{4}/i, 'chip-r'],
  [/^C_\d{4}/i, 'chip-c'],
  [/^L_\d{4}/i, 'chip-l'],
  [/^Crystal/i, 'crystal'],
  [/^PinHeader/i, 'header'],
  [/^PinSocket/i, 'socket'],
  // a dev board plugs into two socket strips on its carrier board
  [/^Module_ESP32-DevKitC/i, 'socket'],
  [/^TerminalBlock/i, 'terminal'],
  [/^SW_(PUSH|Tactile)/i, 'switch'],
  [/Trimmer/i, 'trimmer'],
  [/^Potentiometer/i, 'pot'],
];

/** Body family of a footprint (or footprint instance). */
export function bodyKind(fp: FootprintItem | FootprintDef): BodyKind {
  const def = 'footprint' in fp ? fp.footprint : fp;
  for (const [re, kind] of RULES) if (re.test(def.id)) return kind;
  const tht = def.pads.some((p) => !!p.drill && !p.npth);
  const two = def.pads.filter((p) => !p.npth).length === 2;
  switch (def.category) {
    case 'Resistors':
      return two ? (tht ? 'resistor' : 'chip-r') : 'generic';
    case 'Capacitors':
      return two && !tht ? 'chip-c' : 'generic';
    case 'Inductors':
      return two ? (tht ? 'inductor-axial' : 'chip-l') : 'generic';
    case 'Diodes':
      return two ? (tht ? 'diode' : 'smd-diode') : 'generic';
    case 'LEDs':
      return two ? (tht ? 'led' : 'chip-led') : 'generic';
    case 'ICs DIP':
      return 'dip';
    case 'ICs SMD':
      return 'soic';
    case 'Mechanical':
      return def.pads.every((p) => p.npth) ? 'hole' : 'generic';
  }
  return 'generic';
}

// ---- colours ------------------------------------------------------------------------------

const GOLD = '#c9a227';
const SILVER = '#c0c0c0';

/** Colour bands from a value such as "4k7", "100R 1%" (resistors, ohms) or "100u" (inductors, µH). */
export function bandColors(value: string, kind: 'resistor' | 'inductor' = 'resistor'): string[] {
  const s = (value ?? '').trim();
  const tm = /(\d+(?:[.,]\d+)?)\s*%/.exec(s);
  const tol = tm ? parseFloat(tm[1].replace(',', '.')) : kind === 'inductor' ? 10 : 5;
  const token = s.replace(/±?\s*\d+(?:[.,]\d+)?\s*%/, '').trim().split(/\s+/)[0] ?? '';
  let v = token ? parseEng(token) : undefined;
  if (v === undefined || !Number.isFinite(v) || v < 0) return [];
  // inductor colour codes count in µH; plain numbers are taken as µH already
  if (kind === 'inductor' && v > 0 && v < 1) v *= 1e6;
  return resistorBands(v, tol);
}

/** LED lens colour from the value ("red", "LED grün", "blue 3mm" …); red by default. */
export function ledColor(value: string): string {
  const s = (value ?? '').toLowerCase();
  if (/\bir\b|infra/.test(s)) return '#4a3b4d';
  if (/\buv\b|violet|purple|lila/.test(s)) return '#9b5cff';
  if (/blue|blau/.test(s)) return '#3d7bff';
  if (/green|gr(ü|u|ue)n/.test(s)) return '#2bd96b';
  if (/yellow|gelb|amber/.test(s)) return '#ffd21f';
  if (/orange/.test(s)) return '#ff8c1a';
  if (/white|wei(ß|ss)|warm|kalt|cold/.test(s)) return '#f2f0e6';
  return '#ff2a1f';
}

// ---- materials (shared, see disposeModelCache) ---------------------------------------------

const materials = new Map<string, THREE.Material>();

function cached(key: string, make: () => THREE.Material): THREE.Material {
  let m = materials.get(key);
  if (!m) {
    m = make();
    materials.set(key, m);
  }
  return m;
}

const plastic = (color: string, roughness = 0.55) => cached(`p${color}${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
const metal = (color: string, roughness = 0.3) => cached(`m${color}${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 }));
const clear = (color: string, opacity: number) =>
  cached(`c${color}${opacity}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity, emissive: color, emissiveIntensity: 0.2 }));

const tin = () => metal('#c9ccd2', 0.32);
const solder = () => metal('#dadde2', 0.2);
const gold = () => metal('#e2b552', 0.25);
const black = () => plastic('#1d1d20', 0.55);
const dark = () => plastic('#0b0b0c', 0.9);

/** Releases the shared materials; bodies created afterwards get fresh ones. */
export function disposeModelCache(): void {
  for (const m of materials.values()) m.dispose();
  materials.clear();
}

// ---- builder: collects geometry per material and merges it --------------------------------

interface Builder {
  /** applied to every geometry added from now on (null: footprint coordinates) */
  frame: THREE.Matrix4 | null;
  add(material: THREE.Material, geometry: THREE.BufferGeometry): void;
  finish(): THREE.Group;
}

function createBuilder(): Builder {
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const b: Builder = {
    frame: null,
    add(material, geometry) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      if (g !== geometry) geometry.dispose();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      if (b.frame) g.applyMatrix4(b.frame);
      const list = parts.get(material);
      if (list) list.push(g);
      else parts.set(material, [g]);
    },
    finish() {
      const group = new THREE.Group();
      const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
        const o = new THREE.Mesh(g, m);
        o.castShadow = true;
        o.receiveShadow = true;
        group.add(o);
      };
      for (const [m, list] of parts) {
        const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
        if (merged && merged !== list[0]) for (const g of list) g.dispose();
        if (merged) mesh(merged, m);
        else for (const g of list) mesh(g, m);
      }
      return group;
    },
  };
  return b;
}

// ---- primitives (mm) -----------------------------------------------------------------------

const HALF_PI = Math.PI / 2;
const UP = new THREE.Vector3(0, 1, 0);

/** box standing on z0 */
const box = (w: number, d: number, h: number, x: number, y: number, z0: number) => new THREE.BoxGeometry(w, d, h).translate(x, y, z0 + h / 2);

/** box from x = xa to x = xb (width d along y, centred on y = 0) */
const span = (xa: number, xb: number, d: number, h: number, z0: number) => box(Math.max(0.05, Math.abs(xb - xa)), d, h, (xa + xb) / 2, 0, z0);

function rbox(w: number, d: number, h: number, x: number, y: number, z0: number, r: number, seg = 1) {
  const rr = Math.max(0.01, Math.min(r, w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01));
  return new RoundedBoxGeometry(w, d, h, seg, rr).translate(x, y, z0 + h / 2);
}

/** vertical cylinder (axis z) standing on z0, optionally tapered to rTop */
const cyl = (r: number, h: number, x: number, y: number, z0: number, seg = 24, rTop = r) =>
  new THREE.CylinderGeometry(rTop, r, h, seg).rotateX(HALF_PI).translate(x, y, z0 + h / 2);

/** cylinder along +x starting at x0 */
const xcyl = (r: number, len: number, x0: number, y: number, z: number, seg = 24, open = false) =>
  new THREE.CylinderGeometry(r, r, len, seg, 1, open).rotateZ(-HALF_PI).translate(x0 + len / 2, y, z);

/** solid of revolution around the z axis; profile points are [radius, z] */
const latheZ = (profile: [number, number][], seg = 24, phiStart = 0, phiLength = Math.PI * 2) =>
  new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    seg,
    phiStart,
    phiLength,
  ).rotateX(HALF_PI);

/** extrusion of an x/y shape from z0 to z0 + depth; a bevel grows the shape by its size */
function extrude(shape: THREE.Shape, depth: number, z0: number, bevel = 0, curveSegments = 16) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  return g.translate(0, 0, z0 + bevel);
}

/** shape in the y/z plane extruded along +x from 0 to depth */
const PROFILE_TO_X = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const extrudeX = (shape: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).applyMatrix4(PROFILE_TO_X);

/** round wire through the points, spheres at the bends */
function wire(b: Builder, m: THREE.Material, pts: [number, number, number][], r: number, seg = 10) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = new THREE.Vector3(...pts[i]);
    const c = new THREE.Vector3(...pts[i + 1]);
    const dir = c.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) continue;
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    b.add(m, g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2));
    if (i > 0) b.add(m, new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)).translate(a.x, a.y, a.z));
  }
}

/** flat lead (thickness t, width w) along a centre line in the x/z plane, centred on y = 0 */
function strip(pts: [number, number][], t: number, w: number): THREE.BufferGeometry {
  const n = pts.length;
  const dirOf = (i: number) => {
    const dx = pts[i + 1][0] - pts[i][0];
    const dz = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const d1 = dirOf(Math.max(0, i - 1));
    const d2 = dirOf(Math.min(n - 2, i));
    let nx = -d1[1] - d2[1];
    let nz = d1[0] + d2[0];
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    const k = t / 2 / Math.max(0.35, nx * -d1[1] + nz * d1[0]);
    left.push(new THREE.Vector2(pts[i][0] + nx * k, pts[i][1] + nz * k));
    right.push(new THREE.Vector2(pts[i][0] - nx * k, pts[i][1] - nz * k));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape([...left, ...right.reverse()]), { depth: w, bevelEnabled: false });
  return g.translate(0, 0, -w / 2).rotateX(HALF_PI);
}

/** square pin along z from z1 to z2 with pointed ends */
function squarePin(b: Builder, m: THREE.Material, x: number, y: number, z1: number, z2: number, side = 0.64) {
  const tip = 0.45;
  const r = side / Math.SQRT2;
  b.add(m, box(side, side, z2 - z1 - 2 * tip, x, y, z1 + tip));
  b.add(m, new THREE.CylinderGeometry(r * 0.35, r, tip, 4).rotateY(Math.PI / 4).rotateX(HALF_PI).translate(x, y, z2 - tip / 2));
  b.add(m, new THREE.CylinderGeometry(r, r * 0.35, tip, 4).rotateY(Math.PI / 4).rotateX(HALF_PI).translate(x, y, z1 + tip / 2));
}

/** stadium outline (crystals): half circles of radius r around cx ± half */
function stadium(cx: number, half: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(cx - half, -r);
  s.lineTo(cx + half, -r);
  s.absarc(cx + half, 0, r, -HALF_PI, HALF_PI, false);
  s.lineTo(cx - half, r);
  s.absarc(cx - half, 0, r, HALF_PI, Math.PI * 1.5, false);
  return s;
}

/** circle around the origin with a flat at x = -cut (LED flange) */
function cutCircle(r: number, cut: number, seg = 40): THREE.Shape {
  const beta = Math.acos(Math.min(1, cut / r));
  const a0 = -(Math.PI - beta);
  const a1 = Math.PI - beta;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  return new THREE.Shape(pts);
}

/** D shaped outline (TO-92): circle around (cx, 0) with a flat at y = -flat */
function dShape(cx: number, r: number, flat: number, seg = 32): THREE.Shape {
  const g = Math.asin(Math.min(1, flat / r));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -g + ((Math.PI + 2 * g) * i) / seg;
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), r * Math.sin(a)));
  }
  return new THREE.Shape(pts);
}

// ---- footprint data in local mm --------------------------------------------------------------

interface LPad {
  num: string;
  /** centre in local mm (x right, y up) */
  x: number;
  y: number;
  /** copper size along local x / y */
  w: number;
  h: number;
  drill: number;
  tht: boolean;
  npth: boolean;
}

interface Ctx {
  fp: FootprintItem;
  def: FootprintDef;
  pads: LPad[];
  b: Builder;
  /** board thickness: the far surface is at z = -T */
  T: number;
  /** lead ends below the far surface */
  under: number;
}

function localPads(def: FootprintDef): LPad[] {
  return def.pads.map((p) => {
    const rot = ((((p.rotation ?? 0) % 180) + 180) % 180) / 90;
    const turned = rot > 0.5 && rot < 1.5;
    return {
      num: p.num,
      x: toMm(p.x),
      y: -toMm(p.y),
      w: toMm(turned ? p.h : p.w),
      h: toMm(turned ? p.w : p.h),
      drill: p.drill ? toMm(p.drill) : 0,
      tht: !!p.drill && !p.npth,
      npth: !!p.npth,
    };
  });
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** courtyard without its margin, local mm */
function courtyardRect(def: FootprintDef): Rect {
  const c = def.courtyard;
  const m = 0.25;
  const grow = (a: number, b: number): [number, number] => (b - a < 0.4 ? [(a + b) / 2 - 0.2, (a + b) / 2 + 0.2] : [a, b]);
  const [x1, x2] = grow(toMm(c.x) + m, toMm(c.x + c.w) - m);
  const [y1, y2] = grow(-toMm(c.y + c.h) + m, -toMm(c.y) - m);
  return { x1, y1, x2, y2 };
}

/** "body 6.3x2.5 mm" in the description or "_3.9x4.9mm_" in the id: x and y extent */
function bodySize(def: FootprintDef): { len: number; wid: number } | undefined {
  const m = /body\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm/i.exec(def.description) ?? /_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm/.exec(def.id);
  return m ? { len: parseFloat(m[1]), wid: parseFloat(m[2]) } : undefined;
}

const num = (re: RegExp, s: string): number | undefined => {
  const m = re.exec(s);
  return m ? parseFloat(m[1]) : undefined;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const leadR = (p: LPad) => clamp(p.drill * 0.33, 0.2, 0.5);
const firstValue = (fp: FootprintItem) => parseEng((fp.value ?? '').trim().split(/\s+/)[0] ?? '');

interface Axis {
  pitch: number;
  /** canonical frame: pad 1 at the origin, the other pad on +x */
  frame: THREE.Matrix4;
  a: LPad;
  b: LPad;
  /** a local point in the canonical frame */
  toAxis(p: { x: number; y: number }): { x: number; y: number };
}

/** Frame along the line from pad 1 to pad 2 ('second') or to the farthest pad ('far'). */
function axis(pads: LPad[], mode: 'second' | 'far' = 'second'): Axis | undefined {
  const ps = pads.filter((p) => !p.npth && p.num !== 'MP');
  if (ps.length < 2) return undefined;
  const a = ps.find((p) => p.num === '1') ?? ps[0];
  const others = ps.filter((p) => p !== a);
  const dist = (p: LPad) => Math.hypot(p.x - a.x, p.y - a.y);
  const b = mode === 'far' ? others.reduce((m, p) => (dist(p) > dist(m) ? p : m)) : (others.find((p) => p.num === '2') ?? others[0]);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const frame = new THREE.Matrix4().makeRotationZ(ang).setPosition(a.x, a.y, 0);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return {
    pitch: Math.max(0.5, dist(b)),
    frame,
    a,
    b,
    toAxis: (p) => ({ x: (p.x - a.x) * cos + (p.y - a.y) * sin, y: -(p.x - a.x) * sin + (p.y - a.y) * cos }),
  };
}

function minDistance(pads: LPad[]): number | undefined {
  let d = Infinity;
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) d = Math.min(d, Math.hypot(pads[i].x - pads[j].x, pads[i].y - pads[j].y));
  return Number.isFinite(d) && d > 0.1 ? d : undefined;
}

/** straight leads from inside the body down through the board */
function straightLeads(c: Ctx, z: number, pads = c.pads.filter((p) => p.tht)) {
  for (const p of pads) wire(c.b, tin(), [[p.x, p.y, z], [p.x, p.y, c.under]], leadR(p));
}

// ---- families ------------------------------------------------------------------------------

function dogBone(L: number, R: number): [number, number][] {
  const k = 0.84;
  return [
    [0, 0],
    [R * 0.78, 0],
    [R * 0.96, L * 0.025],
    [R, L * 0.07],
    [R, L * 0.2],
    [R * k, L * 0.27],
    [R * k, L * 0.73],
    [R, L * 0.8],
    [R, L * 0.93],
    [R * 0.96, L * 0.975],
    [R * 0.78, L],
    [0, L],
  ];
}

function roundedRod(L: number, R: number): [number, number][] {
  return [
    [0, 0],
    [R * 0.7, 0],
    [R * 0.95, R * 0.12],
    [R, R * 0.35],
    [R, L - R * 0.35],
    [R * 0.95, L - R * 0.12],
    [R * 0.7, L],
    [0, L],
  ];
}

/** largest profile radius within [t0, t1] */
function profileRadius(p: [number, number][], t0: number, t1: number): number {
  const at = (t: number) => {
    for (let i = 0; i + 1 < p.length; i++) {
      const [r0, z0] = p[i];
      const [r1, z1] = p[i + 1];
      if (t >= z0 && t <= z1 && z1 > z0) return r0 + ((r1 - r0) * (t - z0)) / (z1 - z0);
    }
    return 0;
  };
  let r = 0;
  for (let k = 0; k <= 6; k++) r = Math.max(r, at(t0 + ((t1 - t0) * k) / 6));
  return r;
}

/** band centres along a body of length L: digits and multiplier left, tolerance right */
function bandLayout(colors: string[], L: number): { t: number; color: string }[] {
  if (colors.length === 1) return [{ t: L * 0.5, color: colors[0] }];
  const n = colors.length - 1;
  const step = n > 1 ? 0.47 / (n - 1) : 0;
  return colors.map((color, i) => ({ t: L * (i < n ? 0.13 + i * step : 0.85), color }));
}

const bandMaterial = (color: string) => (color === GOLD || color === SILVER ? metal(color, 0.4) : plastic(color, 0.5));

function axialPart(c: Ctx, kind: 'resistor' | 'inductor' | 'diode') {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def);
  const L = Math.max(1, Math.min(size?.len ?? Math.min(6.3, ax.pitch * 0.62), ax.pitch - 1.4));
  const R = (size?.wid ?? 2.5) / 2;
  const zc = R + 0.4;
  const x1 = (ax.pitch - L) / 2;
  b.frame = ax.frame;
  if (kind === 'diode') {
    const glass = /DO-3[45]|DO-7\b/i.test(c.def.id);
    b.add(glass ? clear('#d2642a', 0.82) : plastic('#1f1f22', 0.45), latheZ(roundedRod(L, R)).rotateY(HALF_PI).translate(x1, 0, zc));
    if (glass) b.add(metal('#c0c4ca', 0.3), xcyl(R * 0.42, L * 0.7, x1 + L * 0.15, 0, zc, 16));
    b.add(glass ? plastic('#111111', 0.4) : plastic('#c8ccd4', 0.45), xcyl(R + 0.03, L * 0.12, x1 + L * 0.1, 0, zc, 24, true));
  } else {
    const prof = dogBone(L, R);
    const colors = bandColors(c.fp.value, kind);
    const bodyColor = kind === 'inductor' ? '#7aa874' : colors.length === 5 ? '#6f9fd8' : '#d8c49c';
    b.add(plastic(bodyColor, 0.5), latheZ(prof).rotateY(HALF_PI).translate(x1, 0, zc));
    const bw = L * 0.075;
    for (const { t, color } of bandLayout(colors, L)) {
      const r = profileRadius(prof, t - bw / 2, t + bw / 2) + 0.025;
      b.add(bandMaterial(color), xcyl(r, bw, x1 + t - bw / 2, 0, zc, 24, true));
    }
  }
  const rl = leadR(ax.a);
  wire(b, tin(), [[x1 + 0.3, 0, zc], [0, 0, zc], [0, 0, c.under]], rl);
  wire(b, tin(), [[x1 + L - 0.3, 0, zc], [ax.pitch, 0, zc], [ax.pitch, 0, c.under]], rl);
}

function verticalResistor(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def);
  const L = size?.len ?? 6.3;
  const R = (size?.wid ?? 2.5) / 2;
  const z0 = 0.8;
  const prof = dogBone(L, R);
  const colors = bandColors(c.fp.value);
  b.frame = ax.frame;
  b.add(plastic(colors.length === 5 ? '#6f9fd8' : '#d8c49c', 0.5), latheZ(prof).translate(0, 0, z0));
  const bw = L * 0.075;
  for (const { t, color } of bandLayout(colors, L)) {
    const r = profileRadius(prof, t - bw / 2, t + bw / 2) + 0.025;
    b.add(
      bandMaterial(color),
      latheZ([
        [r, z0 + t - bw / 2],
        [r, z0 + t + bw / 2],
      ]),
    );
  }
  const rl = leadR(ax.a);
  const top = z0 + L + 1;
  wire(b, tin(), [[0, 0, z0 + 0.3], [0, 0, c.under]], rl);
  wire(b, tin(), [[0, 0, z0 + L - 0.3], [0, 0, top], [ax.pitch, 0, top], [ax.pitch, 0, c.under]], rl);
}

function discCap(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def) ?? { len: Math.max(3.5, ax.pitch), wid: 2.5 };
  const R = size.len / 2;
  const th = Math.min(size.wid * 0.7, 2.6);
  const zc = 1.8 + R;
  const cx = ax.pitch / 2;
  const v = firstValue(c.fp);
  b.frame = ax.frame;
  b.add(plastic(v !== undefined && v >= 1e-8 ? '#2f63b8' : '#d07a2c', 0.6), new THREE.SphereGeometry(1, 28, 18).scale(R, th / 2, R * 1.04).translate(cx, 0, zc));
  for (const xp of [0, ax.pitch]) {
    const xe = cx + Math.sign(xp - cx) * Math.min(R * 0.45, Math.abs(xp - cx));
    wire(b, tin(), [[xe, 0, zc - R * 0.5], [xe, 0, 1.4], [xp, 0, 0.5], [xp, 0, c.under]], leadR(ax.a));
  }
}

function filmCap(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const size = bodySize(c.def) ?? { len: ax.pitch + 2.5, wid: 3 };
  const H = Math.min(size.len * 0.85 + 0.4, 13);
  c.b.frame = ax.frame;
  c.b.add(plastic('#b3262c', 0.42), rbox(size.len, size.wid, H, ax.pitch / 2, 0, 0.3, 0.45, 2));
  for (const x of [0, ax.pitch]) wire(c.b, tin(), [[x, 0, 0.8], [x, 0, c.under]], leadR(ax.a));
}

/** radial electrolytic: sleeve with crimp groove, aluminium top with vent, stripe at pad 2 (−) */
function elco(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const D = num(/_D(\d+(?:\.\d+)?)mm/i, c.def.id) ?? ax.pitch * 2.4;
  const R = D / 2;
  const H = D <= 6.3 ? 11 : D <= 8 ? 11.5 : D <= 10 ? 16 : 20;
  const z0 = 0.4;
  const cx = ax.pitch / 2;
  const sleeve = plastic('#203c8a', 0.45);
  const prof: [number, number][] = [
    [0, 0],
    [R - 0.5, 0],
    [R - 0.12, 0.12],
    [R, 0.45],
    [R, 1.1],
    [R - 0.28, 1.4],
    [R, 1.7],
    [R, H - 0.35],
    [R - 0.12, H - 0.1],
    [R - 0.5, H],
  ];
  b.frame = ax.frame;
  b.add(sleeve, latheZ(prof.map(([r, z]) => [r, z + z0]), 36).translate(cx, 0, 0));
  b.add(metal('#c5c9cf', 0.35), cyl(R - 0.45, 0.12, cx, 0, z0 + H - 0.2, 36));
  const vent = 2 * (R - 0.9);
  b.add(plastic('#5a5e65', 0.5), box(vent, 0.22, 0.04, cx, 0, z0 + H - 0.1));
  b.add(plastic('#5a5e65', 0.5), box(0.22, vent, 0.04, cx, 0, z0 + H - 0.1));
  // polarity stripe facing pad 2 (+x in the axis frame)
  const zs1 = z0 + 1.9;
  const zs2 = z0 + H - 0.5;
  b.add(
    plastic('#c8ccd6', 0.5),
    latheZ(
      [
        [R + 0.012, zs1],
        [R + 0.012, zs2],
      ],
      12,
      HALF_PI - 0.45,
      0.9,
    ).translate(cx, 0, 0),
  );
  for (let z = zs1 + 0.8; z < zs2 - 0.6; z += 2.2) b.add(sleeve, box(0.06, Math.min(1, R * 0.5), 0.22, cx + R + 0.03, 0, z));
  for (const x of [0, ax.pitch]) wire(b, tin(), [[x, 0, z0 + 0.3], [x, 0, c.under]], leadR(ax.a));
}

/** SMD electrolytic: black base plate (chamfered at +), aluminium can, dark mark at − */
function elcoSmd(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const m = /(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/.exec(c.def.id);
  const D = m ? parseFloat(m[1]) : 6.3;
  const H = m ? parseFloat(m[2]) : 5.4;
  const R = D / 2;
  const cx = ax.pitch / 2;
  const s = (D + 0.3) / 2;
  const ch = s * 0.35;
  b.frame = ax.frame;
  const base = new THREE.Shape([
    new THREE.Vector2(cx - s + ch, -s),
    new THREE.Vector2(cx + s, -s),
    new THREE.Vector2(cx + s, s),
    new THREE.Vector2(cx - s + ch, s),
    new THREE.Vector2(cx - s, s - ch),
    new THREE.Vector2(cx - s, -s + ch),
  ]);
  b.add(black(), extrude(base, 0.5, 0));
  const prof: [number, number][] = [
    [0, 0.5],
    [R - 0.05, 0.5],
    [R - 0.05, H - 0.45],
    [R - 0.25, H - 0.12],
    [R - 0.6, H],
    [0, H],
  ];
  b.add(metal('#c9cdd3', 0.38), latheZ(prof, 36).translate(cx, 0, 0));
  // half moon on the − side
  const rt = R - 0.65;
  const a = Math.acos(0.35);
  const moon: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = -a + (2 * a * i) / 16;
    moon.push(new THREE.Vector2(cx + rt * Math.cos(t), rt * Math.sin(t)));
  }
  b.add(plastic('#1b2440', 0.5), new THREE.ShapeGeometry(new THREE.Shape(moon)).translate(0, 0, H + 0.005));
  b.add(plastic('#6a6e75', 0.5), box(2 * rt * 0.6, 0.18, 0.02, cx, 0, H));
  b.add(plastic('#6a6e75', 0.5), box(0.18, 2 * rt * 0.6, 0.02, cx, 0, H));
  // terminals from under the base out over the pads
  const pw = Math.min(ax.a.w, ax.a.h);
  const pl = Math.max(ax.a.w, ax.a.h);
  b.add(tin(), span(cx - s + 0.6, -pl * 0.35, pw * 0.5, 0.15, 0));
  b.add(tin(), span(cx + s - 0.6, ax.pitch + pl * 0.35, pw * 0.5, 0.15, 0));
}

function drumInductor(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const R = (num(/_D(\d+(?:\.\d+)?)mm/i, c.def.id) ?? ax.pitch * 1.6) / 2;
  const cx = ax.pitch / 2;
  const hw = R * 1.1;
  const ferrite = plastic('#36383c', 0.7);
  b.frame = ax.frame;
  b.add(ferrite, cyl(R, 1, cx, 0, 0.3, 32));
  b.add(metal('#b87333', 0.35), cyl(R * 0.82, hw, cx, 0, 1.3, 32));
  b.add(ferrite, cyl(R, 1, cx, 0, 1.3 + hw, 32));
  for (const x of [0, ax.pitch]) wire(b, tin(), [[x, 0, 0.6], [x, 0, c.under]], leadR(ax.a));
}

function buzzer(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const R = (num(/diameter (\d+(?:\.\d+)?) mm/i, c.def.description) ?? 12) / 2;
  const H = num(/height (\d+(?:\.\d+)?) mm/i, c.def.description) ?? 9.5;
  const cx = ax.pitch / 2;
  c.b.frame = ax.frame;
  c.b.add(
    black(),
    latheZ(
      [
        [0, 0.3],
        [R - 0.3, 0.3],
        [R, 0.6],
        [R, H - 0.5],
        [R - 0.4, H],
        [1.1, H],
        [1.1, H - 0.6],
        [0, H - 0.6],
      ],
      40,
    ).translate(cx, 0, 0),
  );
  for (const x of [0, ax.pitch]) wire(c.b, tin(), [[x, 0, 0.6], [x, 0, c.under]], leadR(ax.a));
}

/** round LED: flange with the flat at pad 1 (cathode), cylinder, dome, anvil inside */
function led(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = num(/LED_(\d+(?:\.\d+)?)mm/i, c.def.id) ?? 5;
  const r = size / 2;
  const cx = ax.pitch / 2;
  const z0 = 1;
  const hc = size * 0.9;
  const lens = clear(ledColor(c.fp.value), 0.78);
  b.frame = ax.frame;
  b.add(lens, extrude(cutCircle(r + 0.5, r + 0.05), 1, z0).translate(cx, 0, 0));
  b.add(lens, cyl(r, hc, cx, 0, z0 + 1, 36));
  b.add(lens, new THREE.SphereGeometry(r, 36, 12, 0, Math.PI * 2, 0, HALF_PI).rotateX(HALF_PI).translate(cx, 0, z0 + 1 + hc));
  b.add(tin(), box(Math.min(1.3, cx), 0.35, 1.3, Math.min(1.3, cx) / 2, 0, z0 + 1.2));
  const rl = leadR(ax.a);
  wire(b, tin(), [[0, 0, z0 + 1.4], [0, 0, c.under]], rl);
  wire(b, tin(), [[ax.pitch, 0, z0 + 2.8], [ax.pitch, 0, c.under]], rl);
}

function to92(c: Ctx) {
  const ax = axis(c.pads, 'far');
  if (!ax) return generic(c);
  const { b } = c;
  const cx = ax.pitch / 2;
  const z0 = 2.8;
  const bev = 0.15;
  b.frame = ax.frame;
  b.add(black(), extrude(dShape(cx, 2.4 - bev, 1.6 - bev), 4.6, z0, bev));
  const spread = Math.min(1, 1.27 / Math.max(0.01, cx));
  for (const p of c.pads.filter((q) => q.tht)) {
    const xp = ax.toAxis(p).x;
    const xe = cx + (xp - cx) * spread;
    wire(b, tin(), [[xe, 0, z0 + 0.4], [xe, 0, z0 - 0.9], [xp, 0, 1.4], [xp, 0, c.under]], 0.22, 8);
  }
}

/** TO-220 standing: plastic body, metal tab with hole behind it (+y in the axis frame) */
function to220(c: Ctx) {
  const ax = axis(c.pads, 'far');
  if (!ax) return generic(c);
  const { b } = c;
  const cx = ax.pitch / 2;
  const z0 = 3;
  const tabT = 1.27;
  b.frame = ax.frame;
  b.add(black(), rbox(10, 3.13, 9, cx, 0.315, z0, 0.2));
  const tab = new THREE.Shape([new THREE.Vector2(-5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(5, 15.4), new THREE.Vector2(-5, 15.4)]);
  const hole = new THREE.Path();
  hole.absarc(0, 12.6, 1.8, 0, Math.PI * 2, true);
  tab.holes.push(hole);
  const tg = new THREE.ExtrudeGeometry(tab, { depth: tabT, bevelEnabled: false, curveSegments: 24 }).rotateX(HALF_PI);
  b.add(metal('#cfd3d8', 0.35), tg.translate(cx, 1.88 + tabT, z0));
  for (const p of c.pads.filter((q) => q.tht)) {
    const xp = ax.toAxis(p).x;
    b.add(tin(), box(1.3, 0.5, 1.6, xp, 0, z0 - 1.4));
    b.add(tin(), box(0.75, 0.45, z0 - 1.4 - c.under, xp, 0, c.under));
  }
}

/** TO-220 lying on its tab, leads bent down */
function to220Horizontal(c: Ctx) {
  const ax = axis(c.pads, 'far');
  if (!ax) return generic(c);
  const { b } = c;
  const cx = ax.pitch / 2;
  // the tab lies on +y; pads numbered the other way round turn the frame by 180°
  const h = c.pads.find((p) => p.npth);
  const flip = !!h && ax.toAxis(h).y < 0;
  const at = (p: LPad) => {
    const q = ax.toAxis(p);
    return flip ? { x: ax.pitch - q.x, y: -q.y } : q;
  };
  b.frame = flip ? ax.frame.clone().multiply(new THREE.Matrix4().makeTranslation(ax.pitch, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI)) : ax.frame;
  const hx = h ? at(h).x : cx;
  const hy = h ? at(h).y : 16.66;
  const tab = new THREE.Shape([new THREE.Vector2(cx - 5, hy - 12.8), new THREE.Vector2(cx + 5, hy - 12.8), new THREE.Vector2(cx + 5, hy + 2.8), new THREE.Vector2(cx - 5, hy + 2.8)]);
  const hole = new THREE.Path();
  hole.absarc(hx, hy, 1.75, 0, Math.PI * 2, true);
  tab.holes.push(hole);
  b.add(metal('#cfd3d8', 0.35), new THREE.ExtrudeGeometry(tab, { depth: 1.27, bevelEnabled: false, curveSegments: 24 }));
  const y1 = hy - 12.85;
  const y2 = hy - 3.6;
  b.add(black(), rbox(10, y2 - y1, 3.3, cx, (y1 + y2) / 2, 1.2, 0.2));
  for (const p of c.pads.filter((q) => q.tht)) {
    const xp = at(p).x;
    wire(b, tin(), [[xp, y1 + 0.3, 2.4], [xp, 1, 2.4], [xp, 0, 1.4], [xp, 0, c.under]], 0.35, 8);
  }
}

/** DIP: two-part body with the notch at pin 1, pins with shoulders */
function dip(c: Ctx) {
  const pins = c.pads.filter((p) => p.tht);
  if (!pins.length) return generic(c);
  const { b } = c;
  const xs = pins.map((p) => p.x);
  const ys = pins.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const bw = Math.max(2, maxX - minX - 1.27);
  const y1 = minY - 1.27;
  const y2 = maxY + 1.27;
  const cy = (y1 + y2) / 2;
  const p1 = c.pads.find((p) => p.num === '1') ?? pins[0];
  const notchTop = p1.y >= cy;
  const z0 = 0.6;
  const hl = 1.6;
  const hu = 1.7;
  const body = plastic('#232326', 0.6);
  b.add(body, rbox(bw, y2 - y1, hl, cx, cy, z0, 0.2));
  const bev = 0.15;
  const xa = cx - bw / 2 + bev;
  const xb = cx + bw / 2 - bev;
  const ya = y1 + bev;
  const yb = y2 - bev;
  const rn = Math.min(0.9, bw / 4);
  const s = new THREE.Shape();
  if (notchTop) {
    s.moveTo(xa, ya);
    s.lineTo(xb, ya);
    s.lineTo(xb, yb);
    s.lineTo(cx + rn, yb);
    s.absarc(cx, yb, rn, 0, Math.PI, true);
    s.lineTo(xa, yb);
  } else {
    s.moveTo(xa, ya);
    s.lineTo(cx - rn, ya);
    s.absarc(cx, ya, rn, Math.PI, 0, true);
    s.lineTo(xb, ya);
    s.lineTo(xb, yb);
    s.lineTo(xa, yb);
  }
  s.closePath();
  b.add(body, extrude(s, hu, z0 + hl - 0.02, bev, 12));
  const top = z0 + hl - 0.02 + hu;
  b.add(plastic('#3a3a3e', 0.4), cyl(0.45, 0.03, xa + 1.1, notchTop ? yb - 1.1 : ya + 1.1, top, 20));
  const zs = z0 + hl * 0.9;
  for (const p of pins) {
    const side = p.x < cx ? -1 : 1;
    const xe = cx + (side * bw) / 2;
    b.add(tin(), box(Math.abs(p.x - xe) + 0.35, 1.5, 0.25, (xe + p.x) / 2 + side * 0.05, p.y, zs - 0.25));
    b.add(tin(), box(0.25, 1.5, zs - 0.9, p.x, p.y, 0.9));
    b.add(tin(), box(0.25, 0.5, 0.9 - c.under, p.x, p.y, c.under));
  }
}

interface GullSpec {
  bw: number;
  bl: number;
  h: number;
  z0: number;
  cx?: number;
  cy?: number;
  dot?: boolean;
}

/** body estimate for SMD packages without dimensions: between the pad rows */
function padBody(pads: LPad[]): { len: number; wid: number } {
  const side = pads.filter((p) => Math.abs(p.x) >= Math.abs(p.y));
  const ends = pads.filter((p) => Math.abs(p.y) > Math.abs(p.x));
  const hx = side.length ? Math.min(...side.map((p) => Math.abs(p.x) - p.w * 0.3)) : Math.max(...pads.map((p) => Math.abs(p.x))) + 0.6;
  const hy = ends.length ? Math.min(...ends.map((p) => Math.abs(p.y) - p.h * 0.3)) : Math.max(...pads.map((p) => Math.abs(p.y))) + 0.6;
  return { len: Math.max(0.8, 2 * hx), wid: Math.max(0.8, 2 * hy) };
}

/** plastic body with gull wing leads to every SMD pad outside of it */
function gullWing(c: Ctx, s: GullSpec) {
  const { b } = c;
  const cx = s.cx ?? 0;
  const cy = s.cy ?? 0;
  const t = Math.min(0.2, s.h * 0.15);
  b.add(plastic('#202024', 0.6), rbox(s.bw, s.bl, s.h, cx, cy, s.z0, Math.min(0.15, s.h * 0.2)));
  const zl = s.z0 + s.h * 0.45;
  for (const p of c.pads) {
    if (p.tht || p.npth) continue;
    const dx = Math.abs(p.x - cx) - s.bw / 2;
    const dy = Math.abs(p.y - cy) - s.bl / 2;
    if (dx <= 0 && dy <= 0) continue;
    const alongX = dx >= dy;
    const sign = (alongX ? Math.sign(p.x - cx) : Math.sign(p.y - cy)) || 1;
    const edge = alongX ? cx + (sign * s.bw) / 2 : cy + (sign * s.bl) / 2;
    const outer = (alongX ? p.x : p.y) + sign * ((alongX ? p.w : p.h) / 2 - 0.12);
    const reach = Math.max(0.6, Math.abs(outer - edge));
    const knee = Math.min(0.5, reach * 0.4);
    const g = strip(
      [
        [-0.15, zl],
        [knee * 0.45, zl],
        [knee, t / 2],
        [reach, t / 2],
      ],
      t,
      Math.min(3.2, 0.7 * (alongX ? p.h : p.w)),
    );
    const angle = alongX ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? HALF_PI : -HALF_PI;
    b.add(tin(), g.rotateZ(angle).translate(alongX ? edge : p.x, alongX ? p.y : edge, 0));
  }
  const p1 = c.pads.find((p) => p.num === '1');
  if (s.dot && p1) {
    const r = Math.min(0.5, s.bw * 0.08, s.bl * 0.08);
    const m = r + 0.45;
    const sx = Math.sign(p1.x - cx) || -1;
    const sy = Math.sign(p1.y - cy) || 1;
    b.add(plastic('#3b3c41', 0.4), cyl(r, 0.02, cx + sx * (s.bw / 2 - m), cy + sy * (s.bl / 2 - m), s.z0 + s.h, 20));
  }
}

function soic(c: Ctx) {
  const size = bodySize(c.def) ?? padBody(c.pads);
  gullWing(c, { bw: size.len, bl: size.wid, h: /^(TSSOP|MSOP|SSOP)/i.test(c.def.id) ? 1 : 1.5, z0: 0.1, dot: true });
}

function qfp(c: Ctx) {
  const size = bodySize(c.def) ?? padBody(c.pads);
  gullWing(c, { bw: size.len, bl: size.wid, h: 1, z0: 0.1, dot: true });
}

function sot(c: Ctx) {
  const id = c.def.id;
  const size = /^SOT-23-[56]/i.test(id) ? { len: 1.6, wid: 2.9 } : /^SOT-23/i.test(id) ? { len: 1.3, wid: 2.9 } : /^SC-70/i.test(id) ? { len: 1.25, wid: 2 } : (bodySize(c.def) ?? padBody(c.pads));
  gullWing(c, { bw: size.len, bl: size.wid, h: 1, z0: 0.05 });
}

function sot223(c: Ctx) {
  gullWing(c, { bw: 3.5, bl: 6.5, h: 1.6, z0: 0.05 });
}

function dpak(c: Ctx) {
  gullWing(c, { bw: 6.22, bl: 6.5, h: 2.3, z0: 0.05 });
  c.b.add(tin(), box(1.4, 5.2, 0.5, 3.4, 0, 0));
}

/** SMD chip: end caps and body, resistors black, capacitors tan */
function chip(c: Ctx, kind: 'chip-r' | 'chip-c' | 'chip-l' | 'chip-led') {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def) ?? { len: ax.pitch + Math.min(ax.a.w, ax.a.h) * 0.5, wid: Math.max(ax.a.w, ax.a.h) * 0.85 };
  const L = size.len;
  const W = size.wid;
  const H = kind === 'chip-c' ? Math.min(1.6, W * 0.7) : kind === 'chip-l' ? W * 0.8 : kind === 'chip-led' ? 0.75 : 0.3 + W * 0.12;
  const cap = Math.min(0.55, L * 0.2);
  const cx = ax.pitch / 2;
  b.frame = ax.frame;
  for (const s of [-1, 1]) b.add(tin(), rbox(cap, W + 0.02, H + 0.02, cx + s * (L / 2 - cap / 2), 0, 0, Math.min(0.08, H * 0.2)));
  const inner = L - 2 * cap + 0.04;
  if (kind === 'chip-r') b.add(plastic('#161616', 0.6), box(inner, W * 0.98, H, cx, 0, 0));
  else if (kind === 'chip-c') b.add(plastic('#b69568', 0.65), rbox(inner, W, H, cx, 0, 0, 0.06));
  else if (kind === 'chip-l') b.add(plastic('#3c3d40', 0.6), rbox(inner, W, H, cx, 0, 0, 0.06));
  else {
    b.add(plastic('#ececec', 0.5), box(inner, W, H * 0.45, cx, 0, 0));
    b.add(clear(ledColor(c.fp.value), 0.8), box(L * 0.6, W * 0.92, H * 0.55, cx, 0, H * 0.45));
  }
}

function smdDiode(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def) ?? { len: ax.pitch * 0.9, wid: 1.6 };
  const L = size.len;
  const W = size.wid;
  const H = W >= 2.5 ? 2.1 : 1.1;
  const cx = ax.pitch / 2;
  const pw = Math.min(ax.a.w, ax.a.h);
  b.frame = ax.frame;
  b.add(plastic('#1f1f22', 0.55), rbox(L, W, H, cx, 0, 0.05, 0.12));
  b.add(plastic('#c8ccd4', 0.5), box(L * 0.1, W * 0.88, 0.02, cx - L / 2 + L * 0.18, 0, 0.05 + H));
  for (const [xp, s] of [
    [0, -1],
    [ax.pitch, 1],
  ] as const) {
    const xe = cx + (s * L) / 2;
    b.add(tin(), span(xe - s * 0.3, xp + s * Math.max(ax.a.w, ax.a.h) * 0.3, pw * 0.6, 0.15, 0));
    if (H > 1.5) b.add(tin(), box(0.18, pw * 0.6, H * 0.55, xe + s * 0.09, 0, 0));
  }
}

function melf(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def) ?? { len: 3.5, wid: 1.6 };
  const L = size.len;
  const R = size.wid / 2;
  const cx = ax.pitch / 2;
  const z = R + 0.02;
  const cap = Math.min(0.45, L * 0.15);
  b.frame = ax.frame;
  b.add(clear('#c8502c', 0.85), xcyl(R * 0.97, L - 2 * cap, cx - L / 2 + cap, 0, z));
  b.add(tin(), xcyl(R, cap, cx - L / 2, 0, z));
  b.add(tin(), xcyl(R, cap, cx + L / 2 - cap, 0, z));
  b.add(plastic('#111111', 0.4), xcyl(R * 0.99, L * 0.1, cx - L / 2 + cap + 0.1, 0, z, 24, true));
}

function crystal(c: Ctx) {
  const ax = axis(c.pads);
  if (!ax) return generic(c);
  const { b } = c;
  const size = bodySize(c.def) ?? { len: 11.05, wid: 4.65 };
  const r = size.wid / 2;
  const half = Math.max(0, size.len / 2 - r);
  const cx = ax.pitch / 2;
  const H = /HC-?49-?U|HC-?49\/U/i.test(c.def.id) ? 13.4 : 3.6;
  b.frame = ax.frame;
  b.add(metal('#9fa4ab', 0.45), extrude(stadium(cx, half, r + 0.2), 0.45, 0, 0, 24));
  b.add(metal('#d3d6db', 0.22), extrude(stadium(cx, half, r - 0.25), H - 0.45, 0.45, 0.25, 24));
  for (const x of [0, ax.pitch]) wire(b, tin(), [[x, 0, 0.3], [x, 0, c.under]], leadR(ax.a));
}

function header(c: Ctx, socket: boolean) {
  const pins = c.pads.filter((p) => p.tht);
  if (!pins.length) return generic(c);
  const { b } = c;
  const s = Math.min(2.5, (minDistance(pins) ?? 2.54) - 0.04);
  for (const p of pins) {
    if (socket) {
      b.add(black(), rbox(s, s, 8.5, p.x, p.y, 0, 0.15));
      b.add(dark(), box(s * 0.42, s * 0.42, 0.02, p.x, p.y, 8.5));
      squarePin(b, tin(), p.x, p.y, -3, 0.5, Math.min(0.64, s * 0.26));
    } else {
      b.add(black(), rbox(s, s, 2.5, p.x, p.y, 0, 0.3));
      squarePin(b, gold(), p.x, p.y, -3, 2.5 + 5.84, Math.min(0.64, s * 0.26));
    }
  }
}

/** screw terminal: one module per pole, wire entry towards -y (footprint +y) */
function terminal(c: Ctx) {
  const pins = c.pads.filter((p) => p.tht);
  if (!pins.length) return generic(c);
  const { b } = c;
  const r = courtyardRect(c.def);
  const pitch = minDistance(pins) ?? 5.08;
  const big = pitch >= 4.5;
  const h = big ? 10 : 8.5;
  const body = plastic(big ? '#2e8b57' : '#2b5fb0', 0.55);
  const yF = r.y1;
  const yB = r.y2;
  const D = yB - yF;
  const profile = new THREE.Shape([new THREE.Vector2(yF, 0), new THREE.Vector2(yB, 0), new THREE.Vector2(yB, h), new THREE.Vector2(yF + 0.45 * D, h), new THREE.Vector2(yF, h * 0.62)]);
  const ys = (yF + 0.45 * D + yB) / 2;
  const rs = Math.min(pitch * 0.32, 1.7);
  const w = pitch - 0.12;
  for (const p of pins) {
    b.add(body, extrudeX(profile, w).translate(p.x - w / 2, 0, 0));
    b.add(dark(), cyl(rs + 0.25, 0.03, p.x, ys, h, 24));
    b.add(tin(), cyl(rs, 0.3, p.x, ys, h - 0.25, 24));
    b.add(dark(), box(rs * 1.8, 0.35, 0.06, p.x, ys, h + 0.02));
    b.add(dark(), box(pitch * 0.55, 0.06, Math.min(2.6, h * 0.62 - 2), p.x, yF - 0.02, 1.5));
  }
  straightLeads(c, 0.5, pins);
}

function tactSwitch(c: Ctx) {
  const pins = c.pads.filter((p) => p.tht);
  if (!pins.length) return generic(c);
  const { b } = c;
  const cx = pins.reduce((s, p) => s + p.x, 0) / pins.length;
  const cy = pins.reduce((s, p) => s + p.y, 0) / pins.length;
  const S = num(/_(\d+(?:\.\d+)?)mm/i, c.def.id) ?? 6;
  b.add(black(), rbox(S, S, 3.3, cx, cy, 0.2, 0.25));
  b.add(tin(), box(S + 0.1, S + 0.1, 0.25, cx, cy, 3.5));
  b.add(plastic('#2a2a2e', 0.5), cyl(S * 0.29, 1.4, cx, cy, 3.75, 28, S * 0.27));
  for (const p of pins) {
    const side = Math.sign(p.x - cx) || 1;
    const xe = cx + (side * S) / 2;
    if (Math.abs(p.x - cx) > S / 2) b.add(tin(), box(Math.abs(p.x - xe) + 0.3, 0.7, 0.3, (xe + p.x) / 2, p.y, 1.2));
    b.add(tin(), box(0.3, 0.7, 1.5 - c.under, p.x, p.y, c.under));
  }
}

function trimmer(c: Ctx) {
  const { b } = c;
  const r = courtyardRect(c.def);
  const w = r.x2 - r.x1;
  const d = r.y2 - r.y1;
  const cy = (r.y1 + r.y2) / 2;
  const H = clamp(d * 2.1, 4, 10);
  b.add(plastic('#2a58b2', 0.5), rbox(w, d, H, (r.x1 + r.x2) / 2, cy, 0.4, 0.3, 2));
  const sx = r.x1 + Math.min(1.6, w / 4);
  b.add(metal('#c9a94a', 0.35), cyl(Math.min(1.1, d / 3), 0.7, sx, cy, 0.4 + H - 0.2, 24));
  b.add(dark(), box(Math.min(1.8, d / 2), 0.3, 0.06, sx, cy, 0.4 + H + 0.5));
  straightLeads(c, 0.6);
}

/** rotary potentiometer, shaft up (Alps RK09K vertical and similar) */
function pot(c: Ctx) {
  const { b } = c;
  const lugs = c.pads.filter((p) => p.num === 'MP' && p.tht);
  let x1: number, x2: number, y1: number, y2: number;
  if (/RK09/i.test(c.def.id) && lugs.length >= 2) {
    const lx = lugs.reduce((s, p) => s + p.x, 0) / lugs.length;
    const ly = lugs.reduce((s, p) => s + p.y, 0) / lugs.length;
    [x1, x2, y1, y2] = [lx - 6, lx + 6, ly - 4.9, ly + 4.9];
  } else ({ x1, x2, y1, y2 } = courtyardRect(c.def));
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const w = x2 - x1;
  const d = y2 - y1;
  const rs = Math.min(3, w / 4, d / 4);
  const steel = metal('#b9bec5', 0.4);
  b.add(plastic('#2b2b2e', 0.6), rbox(w, d, 2.6, cx, cy, 0.3, 0.2));
  b.add(steel, rbox(w - 0.4, d - 0.2, 3.8, cx, cy, 2.9, 0.15));
  b.add(steel, cyl(rs + 0.6, 1.2, cx, cy, 6.7, 32));
  b.add(metal('#d6d9de', 0.45), cyl(rs, 10, cx, cy, 7.9, 32));
  b.add(dark(), box(2 * rs + 0.1, 0.7, 0.05, cx, cy, 17.9));
  for (const p of c.pads.filter((q) => q.tht)) {
    if (p.num === 'MP') {
      b.add(tin(), box(0.4, Math.min(2.2, p.h), 0.7 - c.under, p.x, p.y, c.under));
      continue;
    }
    const inside = p.x > x1 && p.x < x2 && p.y > y1 && p.y < y2;
    if (!inside) {
      const ex = clamp(p.x, x1, x2);
      const ey = clamp(p.y, y1, y2);
      b.add(tin(), box(Math.abs(p.x - ex) + 0.6, Math.abs(p.y - ey) + 0.6, 0.3, (p.x + ex) / 2, (p.y + ey) / 2, 1.2));
    }
    b.add(tin(), box(0.6, 0.3, 1.5 - c.under, p.x, p.y, c.under));
  }
}

function testPoint(c: Ctx) {
  for (const p of c.pads) {
    if (p.npth) continue;
    if (p.tht) {
      wire(c.b, tin(), [[p.x, p.y, 2.2], [p.x, p.y, c.under]], 0.3);
      c.b.add(tin(), new THREE.SphereGeometry(0.55, 16, 10).translate(p.x, p.y, 2.4));
    } else {
      const r = (Math.min(p.w, p.h) / 2) * 0.9;
      c.b.add(solder(), new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, HALF_PI).rotateX(HALF_PI).scale(1, 1, 0.45).translate(p.x, p.y, 0));
    }
  }
}

/** unknown package: a dark box over the courtyard */
function generic(c: Ctx) {
  c.b.frame = null;
  const r = courtyardRect(c.def);
  const tht = c.pads.some((p) => p.tht);
  const h = tht ? 3 : 1.2;
  const z0 = tht ? 0.4 : 0.05;
  c.b.add(plastic('#3a3d43', 0.6), rbox(r.x2 - r.x1, r.y2 - r.y1, h, (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, z0, Math.min(0.3, h * 0.2)));
  straightLeads(c, z0 + 0.3);
}

const BUILDERS: Record<BodyKind, (c: Ctx) => void> = {
  resistor: (c) => axialPart(c, 'resistor'),
  'resistor-vertical': verticalResistor,
  'inductor-axial': (c) => axialPart(c, 'inductor'),
  'inductor-radial': drumInductor,
  diode: (c) => axialPart(c, 'diode'),
  'disc-cap': discCap,
  'film-cap': filmCap,
  elco,
  'elco-smd': elcoSmd,
  buzzer,
  led,
  to92,
  to220,
  'to220-horizontal': to220Horizontal,
  dip,
  soic,
  qfp,
  sot,
  sot223,
  dpak,
  'chip-r': (c) => chip(c, 'chip-r'),
  'chip-c': (c) => chip(c, 'chip-c'),
  'chip-l': (c) => chip(c, 'chip-l'),
  'chip-led': (c) => chip(c, 'chip-led'),
  'smd-diode': smdDiode,
  melf,
  crystal,
  header: (c) => header(c, false),
  socket: (c) => header(c, true),
  terminal,
  switch: tactSwitch,
  trimmer,
  pot,
  testpoint: testPoint,
  hole: () => {},
  generic,
};

/** solder cones around the leads on the far side of every plated hole */
function fillets(c: Ctx) {
  c.b.frame = null;
  for (const p of c.pads) {
    if (!p.tht) continue;
    const rp = (Math.min(p.w, p.h) / 2) * 0.8;
    c.b.add(solder(), cyl(Math.min(leadR(p) + 0.06, rp), 0.45, p.x, p.y, -c.T - 0.45, 16, rp));
  }
}

/**
 * 3D body of a placed footprint in board space (mm; x right, y up = -board y,
 * z = 0 is the board centre plane). Bottom side parts hang below the board.
 */
export function componentBody(fp: FootprintItem, thickness = BOARD_THICKNESS): THREE.Group {
  const kind = bodyKind(fp);
  const b = createBuilder();
  const c: Ctx = { fp, def: fp.footprint, pads: localPads(fp.footprint), b, T: thickness, under: -(thickness + 0.9) };
  BUILDERS[kind](c);
  if (kind !== 'hole' && kind !== 'testpoint') fillets(c);
  const body = b.finish();
  if (fp.side === 'bottom') body.rotation.y = Math.PI;
  const outer = new THREE.Group();
  outer.name = fp.name;
  outer.userData = { id: fp.id, kind };
  outer.position.set(toMm(fp.x), -toMm(fp.y), fp.side === 'bottom' ? -thickness / 2 : thickness / 2);
  outer.rotation.z = -((fp.rotation ?? 0) * Math.PI) / 180;
  outer.add(body);
  return outer;
}
