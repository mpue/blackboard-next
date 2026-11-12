// The schematic as Claude's tools see and change it (server/assistantTools.ts):
// a compact description, the library search, and placing, wiring, labelling,
// changing and deleting parts. Plain functions on a document that change it in
// place (an immer draft in the editor, a copy in the tests); a ToolError
// leaves the document as it was, since the editor drops the whole draft then.

import type { Doc, Item, LineItem, SymbolDef, SymbolItem, SpiceModel } from '../model/types.ts';
import { RASTER } from '../model/types.ts';
import { distToSegment, inflate, itemBounds, itemPins, snapTo, unionRect, type Pt, type Rect } from '../geometry/geom.ts';
import { computeConnectivity, pinKey, type Connectivity } from '../spice/connectivity.ts';
import { globalNetKey, LABEL_DEFS } from '../spice/labels.ts';
import { INSTRUMENT_DEFS } from '../spice/instruments.ts';
import { BUILTIN_SYMBOLS } from '../spice/builtinSymbols.ts';
import { runErc, type ErcViolation } from '../spice/erc.ts';
import { checkSimulation, type SimIssue } from '../spice/readiness.ts';
import { makePlacedItem } from '../editor/placement.ts';
import { applyAttachments, collectAttachments } from '../model/magnet.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { uid } from '../model/id.ts';

const R = RASTER;
const WIRE = { color: '#1e6fd9', thickness: 2 };

/** A wrong input or an impossible change: Claude gets the message and tries again. */
export class ToolError extends Error {}
const fail = (msg: string): never => {
  throw new ToolError(msg);
};

const noParts = () => undefined;
const snap = (v: number) => snapTo(v, R);
const snapPt = (p: Pt): Pt => ({ x: snap(p.x), y: snap(p.y) });

/** The symbols of the library panel: instruments, labels, built-in chips, the user's own and the classic library. */
export function allSymbols(library: SymbolDef[], user: SymbolDef[] = []): SymbolDef[] {
  return [...Object.values(INSTRUMENT_DEFS), ...LABEL_DEFS, ...BUILTIN_SYMBOLS, ...user.map((u) => ({ ...u, category: 'User' })), ...library];
}

// ---- parts, pins and nets ----------------------------------------------------------------

/** Ground, supply symbols and net labels: they name nets and are no parts. */
const isLabel = (s: SymbolItem) => !!globalNetKey(s);
const symbols = (doc: Doc) => doc.items.filter((i): i is SymbolItem => i.kind === 'symbol' && i.pins.length > 0);
const components = (doc: Doc) => symbols(doc).filter((s) => !isLabel(s));

export function findPart(doc: Doc, ref: string): SymbolItem {
  const all = components(doc);
  let hits = all.filter((s) => s.name === ref.trim());
  if (!hits.length) hits = all.filter((s) => s.name.toLowerCase() === ref.trim().toLowerCase());
  if (!hits.length) fail(`There is no part "${ref}" in the schematic. Parts: ${all.map((s) => s.name).join(', ') || 'none'}.`);
  if (hits.length > 1) fail(`${hits.length} parts are called "${ref}". Delete or rename the extra ones by their ids from get_circuit first.`);
  return hits[0];
}

const pinLabel = (p: { num: number; name?: string }) => (p.name && p.name !== String(p.num) ? `${p.num} (${p.name})` : String(p.num));

/** Pin by number or name: "2", "B", "vcc". */
export function findPin(s: SymbolItem, pin: string): { index: number; at: Pt } {
  const pins = itemPins(s, noParts);
  const want = pin.trim();
  const byName = () => pins.findIndex((p) => (p.pin.name ?? '').toLowerCase() === want.toLowerCase());
  const byNum = () => (/^\d+$/.test(want) ? pins.findIndex((p) => p.pin.num === Number(want)) : -1);
  let index = /^\d+$/.test(want) ? byNum() : byName();
  if (index < 0) index = /^\d+$/.test(want) ? byName() : byNum();
  if (index < 0) fail(`${s.name} has no pin "${pin}". Its pins: ${s.pins.map(pinLabel).join(', ')}.`);
  return { index, at: { x: Math.round(pins[index].x), y: Math.round(pins[index].y) } };
}

/** "R1.2" -> the part, the pin and where it is. */
export function pinOf(doc: Doc, ref: string) {
  const dot = ref.lastIndexOf('.');
  if (dot <= 0 || dot === ref.length - 1) fail(`"${ref}" is no pin. Write designator, dot, pin, e.g. "R1.2" or "Q1.B".`);
  const item = findPart(doc, ref.slice(0, dot));
  return { item, ...findPin(item, ref.slice(dot + 1)) };
}

const pinName = (s: SymbolItem, index: number) => `${s.name}.${s.pins[index].name && !/^\d+$/.test(s.pins[index].name!) ? s.pins[index].name : s.pins[index].num}`;

/** Connectivity with names: labels name their nets (GND, +5V, OUT), the others are N1, N2 … */
export function namedNets(doc: Doc) {
  const conn = computeConnectivity(doc);
  const byId = new Map(doc.items.map((i) => [i.id, i]));
  const names: string[] = [];
  conn.nets.forEach((net, i) => {
    for (const p of net.pins) {
      const it = byId.get(p.itemId);
      const key = it?.kind === 'symbol' ? globalNetKey(it) : undefined;
      if (key && it?.kind === 'symbol') {
        names[i] = key === 'ground' ? 'GND' : it.name.trim();
        return;
      }
    }
  });
  let n = 0;
  conn.nets.forEach((_, i) => (names[i] ??= `N${++n}`));
  /** pin keys of a net */
  const pinsOf = (net: number | undefined) => {
    const out = new Set<string>();
    if (net !== undefined) for (const [k, v] of conn.netOfPin) if (v === net) out.add(k);
    return out;
  };
  return { conn, names, byId, pinsOf };
}

/** Is the pin connected to anything (another pin or a wire)? */
const isConnected = (conn: Connectivity, net: number | undefined) => net !== undefined && (conn.nets[net].pins.length > 1 || conn.nets[net].wires.length > 0);

function growDoc(doc: Doc) {
  let r: Rect | undefined;
  for (const it of doc.items) r = unionRect(r, itemBounds(it, noParts));
  if (!r) return;
  doc.width = Math.max(doc.width, Math.ceil((r.x + r.w + 96) / R) * R);
  doc.height = Math.max(doc.height, Math.ceil((r.y + r.h + 96) / R) * R);
}

/** A schematic Claude started: as large as its content plus a margin, so "fit" shows the circuit large. */
export function tightenDoc(doc: Doc, margin = 96) {
  let r: Rect | undefined;
  for (const it of doc.items) r = unionRect(r, itemBounds(it, noParts));
  if (!r) return;
  doc.width = Math.max(320, Math.ceil((r.x + r.w + margin) / R) * R);
  doc.height = Math.max(240, Math.ceil((r.y + r.h + margin) / R) * R);
}

const box = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** Short property values only: firmware and code stay out of the conversation. */
function shortProps(p: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!p) return undefined;
  const out = Object.fromEntries(Object.entries(p).filter(([k, v]) => v.length <= 40 && !/firmware|code|hex|sketch|source/i.test(k)));
  return Object.keys(out).length ? out : undefined;
}

// ---- get_circuit ------------------------------------------------------------------------------

function ercText(v: ErcViolation): string | undefined {
  switch (v.kind) {
    case 'unconnectedPin':
      return `${v.ref}.${v.pin} is not connected`;
    case 'duplicateRef':
      return `the designator ${v.ref} is used more than once`;
    case 'noValue':
      return `${v.ref} has no usable value ("${v.value ?? ''}")`;
    case 'noGround':
      return 'there is no ground (GND)';
    default:
      return undefined;
  }
}

function issueText(i: SimIssue): string | undefined {
  switch (i.kind) {
    case 'noSource':
      return 'the simulation finds no voltage source';
    case 'notSimulated':
      return `${i.ref} is not simulated (the symbol has no SPICE type)`;
    case 'noModel':
      return `${i.ref} has no SPICE model`;
    case 'pins':
      return `${i.ref} cannot be simulated: ${i.detail === 'pins2' ? 'wrong number of pins connected' : `problem with its ${i.detail}`}`;
    case 'supplyAssumed':
      return `the supply ${i.ref} is assumed to be ${i.volts} V`;
    case 'mcuFirmware':
      return `${i.ref} has no firmware yet (code editor)`;
    case 'mcuPower':
      return `${i.ref} has no supply`;
    case 'lcdPower':
      return `the display ${i.ref} has no supply`;
    case 'lcdBus':
      return `the display ${i.ref} is not driven by a microcontroller`;
    default:
      return undefined;
  }
}

export function describe(doc: Doc, fileName: string, models: SpiceModel[]) {
  const { conn, names } = namedNets(doc);
  const netName = (s: SymbolItem, i: number) => {
    const n = conn.netOfPin.get(pinKey(s.id, i));
    return isConnected(conn, n) ? names[n!] : null;
  };
  let used: Rect | undefined;
  for (const it of doc.items) used = unionRect(used, itemBounds(it, noParts));

  const parts = components(doc).map((s) => ({
    ref: s.name,
    symbol: s.symbolName,
    value: s.value || undefined,
    simulated: s.spiceType ?? undefined,
    rotation: s.rotation || undefined,
    mirror: s.mirrorH || undefined,
    properties: shortProps(s.properties),
    pins: itemPins(s, noParts).map((p, i) => ({ pin: pinLabel(p.pin), x: Math.round(p.x), y: Math.round(p.y), net: netName(s, i) })),
    box: box(itemBounds(s, noParts)),
  }));
  const labels = symbols(doc)
    .filter(isLabel)
    .map((s) => {
      const p = itemPins(s, noParts)[0];
      return { id: s.id, name: s.name, x: Math.round(p.x), y: Math.round(p.y), net: netName(s, 0) ?? names[conn.netOfPin.get(pinKey(s.id, 0))!] };
    });
  const byNet = new Map<number, string[]>();
  for (const [k, n] of conn.netOfPin) {
    const [id, i] = k.split(':');
    const it = doc.items.find((x) => x.id === id);
    if (it?.kind === 'symbol' && !isLabel(it)) byNet.set(n, [...(byNet.get(n) ?? []), pinName(it, Number(i))]);
  }
  const nets = [...byNet]
    .filter(([n, pins]) => pins.length > 1 || !/^N\d+$/.test(names[n]))
    .map(([n, pins]) => ({ name: names[n], pins }));
  const wires = doc.items
    .filter((i): i is LineItem => i.kind === 'line')
    .map((w) => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, net: names[conn.netOfWire.get(w.id) ?? -1] ?? null }));
  const texts = doc.items.filter((i) => i.kind === 'text').map((t) => ({ id: t.id, text: t.text.replace(/<[^>]*>/g, ''), x: t.x, y: t.y }));
  const problems = [
    ...runErc(doc).map(ercText),
    ...checkSimulation(doc, models)
      .issues.filter((i) => i.severity !== 'info')
      .map(issueText),
  ].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);

  return {
    document: fileName,
    empty: doc.items.length === 0,
    size: { w: doc.width, h: doc.height },
    used_area: used ? box(used) : null,
    parts,
    labels,
    nets,
    wires,
    texts: texts.length ? texts : undefined,
    problems,
  };
}

// ---- search_symbols ---------------------------------------------------------------------------

/** Symbols the lessons use and that simulate well; they come first. */
const PREFERRED = [
  'R#',
  'C#',
  'Elko klein',
  'Pot',
  'LED-rot',
  'elektor-DUS',
  'ZD# Z-Diode',
  'elektor-npn',
  'elektor-pnp',
  'MOSFETenh.N-channel',
  'MOSFETenh.P-channel',
  'NE555',
  '7805',
  'Battery',
  'Pulse Voltage Source',
  'Sine Voltage Source',
  'elektor-EIN-Schalter-klein',
  'elektor-EIN-Taster',
  'Oscilloscope',
  'Multimeter',
  'Function generator',
  'ATmega328P',
  'ESP32-DevKitC',
  'LCD 16x2',
  'GND',
  'Netzlabel',
];

const TYPE_WORDS: Record<string, string> = {
  RESISTOR: 'resistor widerstand',
  CAPACITOR: 'capacitor kondensator cap elko electrolytic',
  INDUCTOR: 'inductor spule coil',
  DIODE: 'diode',
  NPN: 'transistor npn bjt',
  PNP: 'transistor pnp bjt',
  MOSFET: 'mosfet fet transistor',
  VOLTAGE_SOURCE: 'source quelle voltage spannung',
  SUBCIRCUIT: 'ic chip',
  VOLTAGE_CONTROLLED_SWITCH: 'switch schalter relay relais',
};

const CATEGORY_WORDS: Record<string, string> = {
  Optoelectronics: 'led light licht',
  Switches: 'switch schalter taster button',
  Sources: 'source supply battery batterie',
  Microcontrollers: 'mcu microcontroller arduino',
  Connectors: 'connector stecker header buchse',
  Labels: 'label net supply power ground',
  Instruments: 'instrument measure messen',
};

const simulates = (d: SymbolDef) => !!(d.spiceType || d.model || d.properties?.mcu || d.properties?.lcd || d.properties?.instrument || d.properties?.power || d.properties?.netlabel || /gnd/i.test(d.name));

export function searchSymbols(defs: SymbolDef[], query: string, limit = 8) {
  const words = query.toLowerCase().split(/[\s,;/]+/).filter(Boolean);
  if (!words.length) fail('Give a search word.');
  const scored = defs
    .filter((d) => d.pins.length > 0)
    .map((d) => {
      const name = d.name.toLowerCase();
      const hay = `${name} ${d.value} ${d.category} ${d.filename ?? ''} ${d.model?.name ?? ''} ${d.pins.map((p) => p.name ?? '').join(' ')} ${TYPE_WORDS[d.spiceType ?? ''] ?? ''} ${CATEGORY_WORDS[d.category] ?? ''}`.toLowerCase();
      let hits = 0;
      let score = 0;
      for (const w of words) {
        if (name === w) score += 12;
        else if (name.includes(w)) score += 6;
        if (hay.includes(w)) hits++;
      }
      if (!hits) return { d, score: -1, hits };
      const pref = PREFERRED.indexOf(d.name);
      // among the preferred ones the more common part first (a resistor before a potentiometer)
      score += hits * 4 + (pref >= 0 ? 8 + (PREFERRED.length - pref) / 100 : 0) + (simulates(d) ? 4 : 0);
      return { d, score, hits };
    })
    .filter((x) => x.score > 0);
  // all words first, then the best partial matches
  scored.sort((a, b) => b.hits - a.hits || b.score - a.score);
  const seen = new Set<string>();
  const out = [];
  for (const { d } of scored) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    const first = d.pins[0];
    out.push({
      symbol: d.name,
      category: d.category,
      simulated: d.spiceType ?? (simulates(d) ? 'yes' : 'no'),
      value: d.value || undefined,
      size: [Math.round(d.width), Math.round(d.height)],
      pins: d.pins.map((p) => ({ pin: pinLabel(p), dx: Math.round(p.x - first.x), dy: Math.round(p.y - first.y) })),
      properties: shortProps(d.properties),
    });
    if (out.length >= Math.min(20, Math.max(1, limit))) break;
  }
  return out.length ? out : fail(`Nothing found for "${query}". Try a shorter or an English word.`);
}

function findDef(defs: SymbolDef[], name: string): SymbolDef {
  const withPins = defs.filter((d) => d.pins.length > 0);
  const sorted = (list: SymbolDef[]) => [...list].sort((a, b) => Number(simulates(b)) - Number(simulates(a)));
  const d =
    sorted(withPins.filter((x) => x.name === name))[0] ??
    sorted(withPins.filter((x) => x.name.toLowerCase() === name.toLowerCase()))[0] ??
    withPins.find((x) => x.filename === name || x.filename === `${name}.xml`);
  if (d) return d;
  let hint = '';
  try {
    hint = ` Similar: ${searchSymbols(defs, name, 5)
      .map((s) => s.symbol)
      .join(', ')}.`;
  } catch {
    /* nothing similar */
  }
  return fail(`There is no symbol "${name}" in the library.${hint} Use search_symbols.`);
}

// ---- place_part -------------------------------------------------------------------------------

export interface PlaceInput {
  symbol: string;
  x: number;
  y: number;
  pin?: string;
  rotation?: number;
  mirror?: boolean;
  ref?: string;
  value?: string;
  properties?: Record<string, string>;
}

function checkRef(doc: Doc, ref: string, self?: SymbolItem) {
  if (!/^[A-Za-z][\w.+-]{0,15}$/.test(ref)) fail(`"${ref}" is no valid designator (letters first, e.g. R3).`);
  if (components(doc).some((s) => s !== self && s.name.toLowerCase() === ref.toLowerCase())) fail(`The designator ${ref} is taken.`);
}

function checkPoint(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 20_000 || y > 20_000) fail('Coordinates must be between 0 and 20000.');
}

const pinList = (s: SymbolItem) => itemPins(s, noParts).map((p) => ({ pin: pinLabel(p.pin), x: Math.round(p.x), y: Math.round(p.y) }));

/** Moves a symbol so that one of its pins lands on the (snapped) point. */
function moveTo(s: SymbolItem, pin: string | undefined, at: Pt) {
  const p = findPin(s, pin ?? String(s.pins[0].num)).at;
  const t = snapPt(at);
  s.x += t.x - p.x;
  s.y += t.y - p.y;
}

export function placePart(doc: Doc, defs: SymbolDef[], layer: string, input: PlaceInput) {
  checkPoint(input.x, input.y);
  const def = findDef(defs, input.symbol);
  const s = makePlacedItem(doc, { kind: 'symbol', def }, { x: 0, y: 0 }, layer, true, noParts) as SymbolItem;
  if (input.rotation !== undefined) s.rotation = ((Math.round(input.rotation / 90) * 90) % 360 + 360) % 360;
  if (input.mirror) s.mirrorH = true;
  if (input.ref) {
    checkRef(doc, input.ref);
    s.name = input.ref;
  }
  if (input.value !== undefined) s.value = input.value;
  if (input.properties) s.properties = { ...(s.properties ?? {}), ...input.properties };
  moveTo(s, input.pin, input);

  const area = itemBounds(s, noParts);
  const overlaps = components(doc)
    .filter((o) => {
      const r = inflate(itemBounds(o, noParts), -4);
      return r.w > 0 && r.h > 0 && area.x < r.x + r.w && r.x < area.x + area.w && area.y < r.y + r.h && r.y < area.y + area.h;
    })
    .map((o) => o.name);
  doc.items.push(s);
  growDoc(doc);

  // a pin that lands on a wire or pin is connected right away
  const { conn, names } = namedNets(doc);
  const touching = s.pins.flatMap((p, i) => {
    const n = conn.netOfPin.get(pinKey(s.id, i));
    return isConnected(conn, n) ? [`pin ${pinLabel(p)} touches net ${names[n!]} and is connected to it`] : [];
  });
  const warnings = [...(overlaps.length ? [`overlaps ${overlaps.join(', ')}; move it to free space`] : []), ...touching];
  return { ref: s.name, symbol: s.symbolName, value: s.value || undefined, rotation: s.rotation, pins: pinList(s), box: box(area), warnings: warnings.length ? warnings : undefined };
}

// ---- wiring -----------------------------------------------------------------------------------

const wire = (layer: string, a: Pt, b: Pt): LineItem => ({ id: uid(), kind: 'line', layer, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...WIRE, startType: 'STRAIGHT', endType: 'STRAIGHT' });

/** Drops repeated points and points in the middle of a straight run. */
function simplify(path: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of path) {
    if (out.length && out[out.length - 1].x === p.x && out[out.length - 1].y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Does an axis parallel segment run through the inside of the rectangle? */
function crossesRect(a: Pt, b: Pt, r: Rect): boolean {
  if (r.w <= 0 || r.h <= 0) return false;
  if (a.y === b.y) return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
  if (a.x === b.x) return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
  return false;
}

/** Do two segments cross (in their interiors, at a right angle)? */
function crosses(a: Pt, b: Pt, w: LineItem): boolean {
  const h1 = a.y === b.y;
  const h2 = w.y1 === w.y2;
  if (h1 === h2) return false;
  const [hs, vs] = h1 ? [{ a, b }, { a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } }] : [{ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } }, { a, b }];
  const x = vs.a.x;
  const y = hs.a.y;
  return x > Math.min(hs.a.x, hs.b.x) && x < Math.max(hs.a.x, hs.b.x) && y > Math.min(vs.a.y, vs.b.y) && y < Math.max(vs.a.y, vs.b.y);
}

/** Straight, one-bend and two-bend routes from p to q, through channels around both. */
function routes(p: Pt, q: Pt): Pt[][] {
  const out: Pt[][] = [[p, { x: q.x, y: p.y }, q], [p, { x: p.x, y: q.y }, q]];
  for (let m = Math.min(p.x, q.x) - 8 * R; m <= Math.max(p.x, q.x) + 8 * R; m += R) out.push([p, { x: m, y: p.y }, { x: m, y: q.y }, q]);
  for (let m = Math.min(p.y, q.y) - 8 * R; m <= Math.max(p.y, q.y) + 8 * R; m += R) out.push([p, { x: p.x, y: m }, { x: q.x, y: m }, q]);
  return out.map(simplify).filter((r) => r.every((pt) => pt.x >= 0 && pt.y >= 0));
}

interface Scene {
  /** bodies of the parts, shrunk a little so pins on their edge do not count */
  bodies: { id: string; r: Rect }[];
  wires: LineItem[];
}

const scene = (doc: Doc): Scene => ({
  bodies: symbols(doc).map((s) => ({ id: s.id, r: inflate(itemBounds(s, noParts), -3) })),
  wires: doc.items.filter((i): i is LineItem => i.kind === 'line'),
});

/** Lower is better: short, few bends, not through parts, few crossings. */
function cost(path: Pt[], sc: Scene, own: Set<string>): { cost: number; through: string[] } {
  let c = 0;
  const through = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    c += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    for (const body of sc.bodies) {
      if (!crossesRect(a, b, body.r)) continue;
      c += own.has(body.id) ? 400 : 3000;
      if (!own.has(body.id)) through.add(body.id);
    }
    for (const w of sc.wires) if (crosses(a, b, w)) c += 60;
  }
  return { cost: c + 24 * (path.length - 2), through: [...through] };
}

/**
 * Adds the items to a copy of the document and checks that the net of
 * `anchor` then holds exactly the expected pins: nothing else got connected.
 * Returns the pins that would have been connected by mistake.
 */
function strayPins(doc: Doc, add: Item[], anchor: string, expected: Set<string>): string[] {
  const test: Doc = { ...doc, items: [...doc.items, ...add] };
  const conn = computeConnectivity(test);
  const net = conn.netOfPin.get(anchor);
  const stray: string[] = [];
  for (const [k, v] of conn.netOfPin) {
    if (v !== net || expected.has(k)) continue;
    const [id, i] = k.split(':');
    const s = test.items.find((x) => x.id === id);
    if (s?.kind === 'symbol') stray.push(isLabel(s) ? `label ${s.name}` : pinName(s, Number(i)));
  }
  return stray;
}

function sameNetResult(doc: Doc, anchor: string) {
  const { conn, names, pinsOf, byId } = namedNets(doc);
  const n = conn.netOfPin.get(anchor);
  const pins = [...pinsOf(n)].flatMap((k) => {
    const [id, i] = k.split(':');
    const s = byId.get(id);
    return s?.kind === 'symbol' ? [isLabel(s) ? `label ${s.name}` : pinName(s, Number(i))] : [];
  });
  return { net: n === undefined ? null : names[n], net_pins: pins };
}

export interface ConnectInput {
  from: string;
  to: string;
  via?: Pt[];
}

export function connect(doc: Doc, layer: string, input: ConnectInput) {
  const a = pinOf(doc, input.from);
  const b = pinOf(doc, input.to);
  if (a.item === b.item && a.index === b.index) fail('Both ends are the same pin.');
  const ka = pinKey(a.item.id, a.index);
  const kb = pinKey(b.item.id, b.index);
  const { conn, pinsOf } = namedNets(doc);
  const na = conn.netOfPin.get(ka);
  const nb = conn.netOfPin.get(kb);
  if (na !== undefined && na === nb && isConnected(conn, na)) return { already_connected: true, ...sameNetResult(doc, ka) };
  const expected = new Set([...pinsOf(na), ...pinsOf(nb), ka, kb]);
  const sc = scene(doc);
  const own = new Set([a.item.id, b.item.id]);
  const build = (path: Pt[]) => path.slice(1).map((pt, i) => wire(layer, path[i], pt));

  if (input.via?.length) {
    const path = simplify([a.at, ...input.via.map(snapPt), b.at]);
    for (let i = 0; i < path.length - 1; i++) {
      if (path[i].x !== path[i + 1].x && path[i].y !== path[i + 1].y) fail(`The segment from (${path[i].x}, ${path[i].y}) to (${path[i + 1].x}, ${path[i + 1].y}) is not horizontal or vertical.`);
    }
    const add = build(path);
    const stray = strayPins(doc, add, ka, expected);
    if (stray.length) fail(`Nothing drawn: this route would also connect ${stray.join(', ')}.`);
    doc.items.push(...add);
    growDoc(doc);
    return { wires: add.map((w) => w.id), path, ...sameNetResult(doc, ka) };
  }

  const ranked = routes(a.at, b.at)
    .map((path) => ({ path, ...cost(path, sc, own) }))
    .sort((x, y) => x.cost - y.cost);
  let firstStray: string[] | undefined;
  for (const r of ranked.slice(0, 80)) {
    const add = build(r.path);
    const stray = strayPins(doc, add, ka, expected);
    if (stray.length) {
      firstStray ??= stray;
      continue;
    }
    doc.items.push(...add);
    growDoc(doc);
    const through = r.through.map((id) => (doc.items.find((i) => i.id === id) as SymbolItem).name);
    return {
      wires: add.map((w) => w.id),
      path: r.path,
      ...sameNetResult(doc, ka),
      warning: through.length ? `the wire runs across ${through.join(', ')}; better move the parts apart or use labels` : undefined,
    };
  }
  return fail(
    `No route found that touches only these two nets${firstStray ? ` (the best one would also connect ${firstStray.join(', ')})` : ''}. Move a part with update_part, give a route with "via", or connect both pins to the same net label with add_label.`,
  );
}

// ---- add_label --------------------------------------------------------------------------------

const GROUND = /^(gnd|ground|masse|0)$/i;
const SUPPLY = /^([+-]\d+([.,]\d+)?V\d*|[+-]?V(CC|DD|EE|SS|BAT|IN)\w*)$/i;

/** The symbol for a label name: ground, a supply symbol or a net label. */
function labelSymbol(defs: SymbolDef[], name: string, layer: string): { s: SymbolItem; kind: 'ground' | 'supply' | 'label' } {
  if (GROUND.test(name)) {
    const def = defs.find((d) => d.name === 'GND' && d.pins.length === 1) ?? fail('The library has no GND symbol.');
    return { s: symbolItemFromDef(def, 0, 0, layer, 'GND'), kind: 'ground' };
  }
  const supply = LABEL_DEFS.find((d) => d.properties?.power === 'true' && d.name.toLowerCase() === name.toLowerCase());
  if (supply || SUPPLY.test(name)) {
    const s = symbolItemFromDef(supply ?? LABEL_DEFS.find((d) => d.name === '+5V')!, 0, 0, layer, name);
    s.value = name;
    if (!supply) s.symbolName = name;
    return { s, kind: 'supply' };
  }
  if (!/^[\w.+\-/]{1,24}$/.test(name)) fail(`"${name}" is no good net name (letters, digits, + - _ . /, at most 24).`);
  const def = LABEL_DEFS.find((d) => d.properties?.netlabel === 'true')!;
  return { s: symbolItemFromDef(def, 0, 0, layer, name), kind: 'label' };
}

/** The direction a pin points to, away from the body of its part. */
function outward(s: SymbolItem, at: Pt): Pt {
  const r = itemBounds(s, noParts);
  const dx = at.x - (r.x + r.w / 2);
  const dy = at.y - (r.y + r.h / 2);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { x: 0, y: 1 };
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

export function addLabel(doc: Doc, defs: SymbolDef[], layer: string, input: { pin: string; name: string }) {
  const a = pinOf(doc, input.pin);
  const name = input.name.trim();
  if (!name) fail('Give the label a name.');
  const { s: proto, kind } = labelSymbol(defs, name, layer);
  const key = globalNetKey(proto);
  const ka = pinKey(a.item.id, a.index);
  const { conn, pinsOf, byId } = namedNets(doc);
  const na = conn.netOfPin.get(ka);
  // already on that net?
  if ([...pinsOf(na)].some((k) => {
    const it = byId.get(k.split(':')[0]);
    return it?.kind === 'symbol' && it.id !== a.item.id && globalNetKey(it) === key;
  }))
    return { already_connected: true, ...sameNetResult(doc, ka) };
  // the pins of the net that label joins
  const other = symbols(doc).find((s) => globalNetKey(s) === key);
  const expected = new Set([...pinsOf(na), ...(other ? pinsOf(conn.netOfPin.get(pinKey(other.id, 0))) : []), ka]);

  const sc = scene(doc);
  const d = outward(a.item, a.at);
  const perp = { x: d.y, y: d.x };
  // where the label's pin may go: out from the pin, a little to the side
  const spots: Pt[] = [];
  for (let k = 1; k <= 4; k++) for (let j = -3; j <= 3; j++) spots.push({ x: a.at.x + (d.x * k + perp.x * j) * R, y: a.at.y + (d.y * k + perp.y * j) * R });
  // ground hangs below, supplies stand above, labels point away from the part
  const rotations = kind === 'label' ? [d.x < 0 ? 180 : 0, d.x < 0 ? 0 : 180] : [0];
  const own = new Set([a.item.id]);
  const options = spots.flatMap((spot) =>
    rotations.flatMap((rotation, ri) =>
      [
        [a.at, { x: spot.x, y: a.at.y }, spot],
        [a.at, { x: a.at.x, y: spot.y }, spot],
      ].map((raw) => {
        const path = simplify(raw);
        const s: SymbolItem = { ...structuredClone(proto), id: uid(), rotation };
        moveTo(s, String(s.pins[0].num), spot);
        const body = itemBounds(s, noParts);
        let c = cost(path, sc, own).cost + ri * 80;
        if (sc.bodies.some((b) => b.r.x < body.x + body.w && body.x < b.r.x + b.r.w && b.r.y < body.y + body.h && body.y < b.r.y + b.r.h)) c += 2500;
        if (sc.wires.some((w) => crossesRect({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }, inflate(body, -1)))) c += 1500;
        if (kind === 'ground' && spot.y <= a.at.y) c += 300;
        if (kind === 'supply' && spot.y >= a.at.y) c += 300;
        if (kind === 'label' && d.x === 0 && spot.y === a.at.y) c += 100;
        return { path, s, c };
      }),
    ),
  );
  options.sort((x, y) => x.c - y.c);
  for (const o of options.slice(0, 60)) {
    if (o.s.x < 0 || o.s.y < 0) continue;
    const add: Item[] = [...o.path.slice(1).map((pt, i) => wire(layer, o.path[i], pt)), o.s];
    if (strayPins(doc, add, ka, new Set([...expected, pinKey(o.s.id, 0)])).length) continue;
    doc.items.push(...add);
    growDoc(doc);
    return { label: o.s.name, id: o.s.id, at: snapPt(itemPins(o.s, noParts)[0]), ...sameNetResult(doc, ka) };
  }
  return fail(`No free place for the label next to ${input.pin}. Move the part to free space with update_part.`);
}

// ---- update_part ------------------------------------------------------------------------------

export interface UpdateInput {
  ref: string;
  value?: string;
  properties?: Record<string, string>;
  new_ref?: string;
  rotation?: number;
  x?: number;
  y?: number;
  pin?: string;
}

export function updatePart(doc: Doc, input: UpdateInput) {
  const s = findPart(doc, input.ref);
  if (input.new_ref !== undefined) {
    checkRef(doc, input.new_ref, s);
    s.name = input.new_ref;
  }
  if (input.value !== undefined) s.value = input.value;
  if (input.properties) s.properties = { ...(s.properties ?? {}), ...input.properties };
  let bent: string[] = [];
  if (input.rotation !== undefined || input.x !== undefined || input.y !== undefined) {
    const attached = collectAttachments(doc, new Set([s.id]));
    const pin = input.pin ?? String(s.pins[0].num);
    const before = findPin(s, pin).at;
    const target = { x: input.x ?? before.x, y: input.y ?? before.y };
    checkPoint(target.x, target.y);
    if (input.rotation !== undefined) s.rotation = ((Math.round(input.rotation / 90) * 90) % 360 + 360) % 360;
    moveTo(s, pin, target);
    applyAttachments(doc, attached);
    bent = attached
      .map((at) => doc.items.find((i) => i.id === at.lineId))
      .filter((w): w is LineItem => w?.kind === 'line' && w.x1 !== w.x2 && w.y1 !== w.y2)
      .map((w) => w.id);
    growDoc(doc);
  }
  return { ref: s.name, value: s.value || undefined, rotation: s.rotation, properties: shortProps(s.properties), pins: pinList(s), slanted_wires: bent.length ? bent : undefined };
}

// ---- delete -----------------------------------------------------------------------------------

const PIN_TOL = 3;
const WIRE_TOL = 4;

export function deleteItems(doc: Doc, input: { refs?: string[]; ids?: string[] }) {
  const gone = new Set<string>();
  const parts = (input.refs ?? []).map((r) => findPart(doc, r));
  for (const id of input.ids ?? []) {
    const it = doc.items.find((i) => i.id === id);
    if (!it) fail(`There is no item with the id ${id}.`);
    gone.add(id);
  }
  const removed = [...parts, ...doc.items.filter((i): i is SymbolItem => gone.has(i.id) && i.kind === 'symbol')];
  for (const p of parts) gone.add(p.id);
  // wires of the nets of the deleted parts that end in nothing afterwards go, too
  const { conn } = namedNets(doc);
  const nets = new Set(removed.flatMap((s) => s.pins.map((_, i) => conn.netOfPin.get(pinKey(s.id, i))).filter((n): n is number => n !== undefined)));
  const candidates = new Set([...nets].flatMap((n) => conn.nets[n].wires));
  doc.items = doc.items.filter((i) => !gone.has(i.id));
  let wiresGone = 0;
  const ends = (w: LineItem): [Pt, Pt] => [
    { x: w.x1, y: w.y1 },
    { x: w.x2, y: w.y2 },
  ];
  for (let changed = true; changed; ) {
    changed = false;
    const pins = doc.items.flatMap((i) => itemPins(i, noParts));
    const lines = doc.items.filter((i): i is LineItem => i.kind === 'line');
    /** an end with no pin and no other wire on it */
    const free = (w: LineItem, p: Pt) => !pins.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= PIN_TOL) && !lines.some((o) => o !== w && distToSegment(p, ...ends(o)) <= WIRE_TOL);
    /** a wire with other wires or pins hanging on its middle still connects them */
    const inside = (e: Pt, w: LineItem) => distToSegment(e, ...ends(w)) <= WIRE_TOL && ends(w).every((x) => Math.hypot(x.x - e.x, x.y - e.y) > WIRE_TOL);
    const carries = (w: LineItem) => lines.some((o) => o !== w && ends(o).some((e) => inside(e, w))) || pins.some((q) => inside(q, w));
    const loose = lines.find((w) => candidates.has(w.id) && ends(w).some((p) => free(w, p)) && !carries(w));
    if (loose) {
      doc.items = doc.items.filter((i) => i !== loose);
      wiresGone++;
      changed = true;
    }
  }
  return { deleted: [...parts.map((p) => p.name), ...(input.ids ?? [])], dangling_wires_removed: wiresGone };
}
