// SPICE netlist generation for schematics (successor of SpiceUtil in 1.x).

import type { Doc, SpiceModel, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey } from './connectivity.ts';
import { parseEng } from '../model/ops.ts';
import { dmmMode, earthedPinIndex, fgenSettings, fgenSource, instrumentOf, type Probes } from './instruments.ts';

export interface NetlistResult {
  netlist: string;
  /** translated by the caller */
  errors: { key: 'noGround' | 'noSymbols' }[];
  warnings: NetlistWarning[];
  /** vectors requested with "plot ..." control texts */
  plots: string[];
  defaultAnalysisAdded: boolean;
  /** where oscilloscopes and multimeters are connected */
  probes: Probes;
}

export type NetlistWarning = {
  key: 'pins2' | 'value' | 'diode' | 'bjt' | 'mosfet' | 'source' | 'subckt' | 'unconnected';
  name: string;
  value?: string;
};

const PREFIX: Partial<Record<NonNullable<SymbolItem['spiceType']>, string>> = {
  RESISTOR: 'R',
  CAPACITOR: 'C',
  INDUCTOR: 'L',
  DIODE: 'D',
  NPN: 'Q',
  PNP: 'Q',
  MOSFET: 'M',
  VOLTAGE_SOURCE: 'V',
  SUBCIRCUIT: 'X',
};

export const isGround = (s: SymbolItem) => /^(gnd|ground|masse|0)$/i.test(s.name.trim()) || /gnd/i.test(s.symbolName) || /gnd/i.test(s.filename ?? '');

const sanitizeModelName = (n: string) => n.replace(/\//g, '').replace(/\s+/g, '_');

function elementName(s: SymbolItem, prefix: string, used: Set<string>): string {
  let n = s.name.replace(/\s+/g, '_') || prefix;
  if (n[0].toUpperCase() !== prefix) n = prefix + n;
  let unique = n;
  for (let i = 2; used.has(unique.toUpperCase()); i++) unique = `${n}_${i}`;
  used.add(unique.toUpperCase());
  return unique;
}

/** Converts engineering values into SPICE numbers ("4k7" -> 4700, "1M" on resistors -> 1e6). */
export function spiceValue(raw: string, kind: 'R' | 'C' | 'L'): string | undefined {
  let s = raw.trim().replace(/[Ω]/g, '').replace(/ohm$/i, '');
  if (kind === 'R' && /^\d+([.,]\d+)?M$/.test(s)) s = s.replace('M', 'meg');
  s = s.replace(/(\d)\s*[Ff]$/, '$1').replace(/(\d)\s*[Hh]$/, '$1');
  const v = parseEng(s);
  if (v === undefined || !Number.isFinite(v)) return undefined;
  return String(parseFloat(v.toPrecision(6)));
}

function num(props: Record<string, string> | undefined, key: string, fallback = 0): number {
  const v = parseFloat(props?.[key] ?? '');
  return Number.isFinite(v) ? v : fallback;
}

const FREQ_UNIT: Record<string, number> = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };
const TIME_UNIT: Record<string, number> = { S: 1, MS: 1e-3, US: 1e-6, NS: 1e-9, PS: 1e-12 };

function voltageSource(s: SymbolItem): string {
  const p = s.properties;
  if (!p || (p.mode ?? 'DC').toUpperCase() === 'DC') {
    const dc = p?.dcVoltage !== undefined ? num(p, 'dcVoltage') : parseEng(s.value.replace(/v$/i, '')) ?? 0;
    return `DC ${dc}`;
  }
  const shape = (p.shape ?? 'SIN').toUpperCase();
  const offset = num(p, 'dcOffset');
  const amp = num(p, 'acAmplitude');
  const freq = num(p, 'frequency') * (FREQ_UNIT[(p.frequencyUnit ?? 'HZ').toUpperCase()] ?? 1);
  const phase = num(p, 'acPhase');
  if (shape === 'PULSE') {
    const period = freq > 0 ? 1 / freq : 1;
    const duty = num(p, 'duty', 50);
    const rise = num(p, 'riseTime') * (TIME_UNIT[(p.riseTimeUnit ?? 'S').toUpperCase()] ?? 1);
    const fall = num(p, 'fallTime') * (TIME_UNIT[(p.fallTimeUnit ?? 'S').toUpperCase()] ?? 1);
    const width = (period * duty) / 100;
    const f = (v: number) => String(parseFloat(v.toPrecision(10)));
    return `DC 0 AC 1 PULSE(${f(offset - amp)} ${f(offset + amp)} 0 ${f(rise)} ${f(fall)} ${f(width)} ${f(period)})`;
  }
  return `DC ${offset} AC 1 SIN(${offset} ${amp} ${freq} 0 0 ${phase})`;
}

/**
 * .MODEL cards of the 1.x library span several lines without SPICE "+"
 * continuations, so (like SpiceUtil did) each statement is folded into one line.
 * Subcircuits keep their line structure.
 */
export function normalizeModel(content: string): string {
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (/^\s*\.subckt\b/im.test(text)) return text;
  const statements: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('*')) continue;
    if (line.startsWith('.') || !statements.length) statements.push(line);
    else statements[statements.length - 1] += ' ' + line.replace(/^\+\s*/, '');
  }
  return statements.map((st) => st.replace(/\s+/g, ' ')).join('\n');
}

function modelText(m: SpiceModel): { name: string; text: string } {
  const name = sanitizeModelName(m.name);
  let text = normalizeModel(m.content);
  if (m.name !== name) text = text.split(m.name).join(name);
  return { name, text };
}

/**
 * The ngspice wasm input pipe counts characters, not bytes: any non-ASCII
 * character (even in a comment) stalls the simulation, so netlists are folded.
 */
export function toAscii(s: string): string {
  return s
    .replace(/[µμ]/g, 'u')
    .replace(/Ω/g, 'Ohm')
    .replace(/[ÄÖÜäöüß]/g, (c) => ({ Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?');
}

export interface NetlistOptions {
  /** start transient analyses from zero (".tran … uic"), so oscillators start reliably */
  uic?: boolean;
  /** replaces the analyses of the schematic (used by the instrument bench) */
  analysis?: string;
}

export function withUic(directive: string): string {
  return /^\.tran\b/i.test(directive) && !/\buic\b/i.test(directive) ? `${directive} uic` : directive;
}

export function buildNetlist(doc: Doc, title: string, library: SpiceModel[] = [], opts: NetlistOptions = {}): NetlistResult {
  const res: NetlistResult = { netlist: '', errors: [], warnings: [], plots: [], defaultAnalysisAdded: false, probes: { nodes: {}, currents: {} } };
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const conn = computeConnectivity(doc);

  // net numbering: ground nets become node 0
  const groundNets = new Set<number>();
  for (const s of symbols) {
    if (isGround(s)) {
      s.pins.forEach((_, i) => {
        const n = conn.netOfPin.get(pinKey(s.id, i));
        if (n !== undefined) groundNets.add(n);
      });
    }
    // bench instruments are earthed like their real counterparts
    const earthed = earthedPinIndex(s);
    if (earthed !== undefined) {
      const n = conn.netOfPin.get(pinKey(s.id, earthed));
      if (n !== undefined) groundNets.add(n);
    }
  }
  const devices = symbols.filter((s) => s.spiceType && PREFIX[s.spiceType]);
  if (!devices.length) res.errors.push({ key: 'noSymbols' });
  if (!groundNets.size) res.errors.push({ key: 'noGround' });

  // BlackBoard 1.x numbered nets in the order their first wire appears (layer
  // by layer); ground keeps its slot. Reproducing that keeps "plot v(5)" and
  // similar directives of existing schematics pointing at the same signal.
  const nodeOfNet = new Map<number, string>();
  let next = 1;
  for (const layer of doc.layers) {
    for (const it of doc.items) {
      if (it.layer !== layer.id || it.kind !== 'line') continue;
      const n = conn.netOfWire.get(it.id);
      if (n !== undefined && !nodeOfNet.has(n)) nodeOfNet.set(n, String(next++));
    }
  }
  const node = (s: SymbolItem, pinIndex: number): string => {
    const n = conn.netOfPin.get(pinKey(s.id, pinIndex));
    if (n === undefined) return String(next++);
    if (groundNets.has(n)) return '0';
    let id = nodeOfNet.get(n);
    if (!id) {
      id = String(next++);
      nodeOfNet.set(n, id);
    }
    return id;
  };
  const pinIndex = (s: SymbolItem, test: (name: string, num: number) => boolean) => s.pins.findIndex((p) => test((p.name ?? '').trim().toLowerCase(), p.num));
  const byNum = (s: SymbolItem, n: number) => s.pins.findIndex((p) => p.num === n);

  const lines: string[] = [];
  const models = new Map<string, string>();
  const used = new Set<string>();
  const libByName = new Map(library.map((m) => [m.name.toLowerCase(), m]));

  const modelFor = (s: SymbolItem): string | undefined => {
    let m = s.model;
    if (m && !m.content) m = libByName.get(m.name.toLowerCase());
    if (!m) {
      const guess = libByName.get(s.value.trim().toLowerCase());
      if (guess) m = guess;
    }
    if (!m || !m.content) return undefined;
    const { name, text } = modelText(m);
    models.set(name.toLowerCase(), text);
    return name;
  };

  for (const s of devices) {
    const type = s.spiceType!;
    const prefix = PREFIX[type]!;
    const unconnected = s.pins.some((_, i) => conn.netOfPin.get(pinKey(s.id, i)) === undefined || conn.nets[conn.netOfPin.get(pinKey(s.id, i))!].pins.length < 2);
    switch (type) {
      case 'RESISTOR':
      case 'CAPACITOR':
      case 'INDUCTOR': {
        const a = byNum(s, 1);
        const b = byNum(s, 2);
        if (a < 0 || b < 0) {
          res.warnings.push({ key: 'pins2', name: s.name });
          continue;
        }
        const model = type === 'INDUCTOR' && s.customModel ? modelFor(s) : undefined;
        const value = model ?? spiceValue(s.value, prefix as 'R' | 'C' | 'L');
        if (!value) {
          res.warnings.push({ key: 'value', name: s.name, value: s.value });
          continue;
        }
        lines.push(`${elementName(s, prefix, used)} ${node(s, a)} ${node(s, b)} ${value}`);
        break;
      }
      case 'DIODE': {
        const a = pinIndex(s, (n, k) => n === 'a' || (n !== 'k' && k === 1));
        const k = pinIndex(s, (n, num) => n === 'k' || (n !== 'a' && num === 2));
        const model = modelFor(s);
        if (a < 0 || k < 0 || !model) {
          res.warnings.push({ key: 'diode', name: s.name });
          continue;
        }
        lines.push(`${elementName(s, 'D', used)} ${node(s, a)} ${node(s, k)} ${model}`);
        break;
      }
      case 'NPN':
      case 'PNP': {
        const c = pinIndex(s, (n) => n === 'c');
        const b = pinIndex(s, (n) => n === 'b');
        const e = pinIndex(s, (n) => n === 'e');
        const model = modelFor(s);
        if (c < 0 || b < 0 || e < 0 || !model) {
          res.warnings.push({ key: 'bjt', name: s.name });
          continue;
        }
        lines.push(`${elementName(s, 'Q', used)} ${node(s, c)} ${node(s, b)} ${node(s, e)} ${model}`);
        break;
      }
      case 'MOSFET': {
        const d = pinIndex(s, (n) => n === 'd');
        const g = pinIndex(s, (n) => n === 'g');
        const src = pinIndex(s, (n) => n === 's');
        const bulk = pinIndex(s, (n) => n === 'b');
        const model = modelFor(s);
        if (d < 0 || g < 0 || src < 0 || !model) {
          res.warnings.push({ key: 'mosfet', name: s.name });
          continue;
        }
        lines.push(`${elementName(s, 'M', used)} ${node(s, d)} ${node(s, g)} ${node(s, src)} ${node(s, bulk >= 0 ? bulk : src)} ${model}`);
        break;
      }
      case 'VOLTAGE_SOURCE': {
        const plus = pinIndex(s, (n, k) => n === '+' || (n !== '-' && k === 1));
        const minus = pinIndex(s, (n, k) => n === '-' || (n !== '+' && k === 2));
        if (plus < 0 || minus < 0) {
          res.warnings.push({ key: 'source', name: s.name });
          continue;
        }
        const spec = instrumentOf(s) === 'fgen' ? fgenSource(fgenSettings(s)) : voltageSource(s);
        lines.push(`${elementName(s, 'V', used)} ${node(s, plus)} ${node(s, minus)} ${spec}`);
        break;
      }
      case 'SUBCIRCUIT': {
        const model = modelFor(s);
        if (!model) {
          res.warnings.push({ key: 'subckt', name: s.name });
          continue;
        }
        const pins = s.pins.map((p, i) => ({ p, i })).sort((x, y) => x.p.num - y.p.num);
        lines.push(`${elementName(s, 'X', used)} ${pins.map(({ i }) => node(s, i)).join(' ')} ${model}`);
        break;
      }
    }
    if (unconnected) res.warnings.push({ key: 'unconnected', name: s.name });
  }

  // probes: oscilloscopes and voltmeters only read nodes, ammeters are 0 V sources in series
  for (const s of symbols) {
    const kind = instrumentOf(s);
    if (kind !== 'scope' && kind !== 'dmm') continue;
    const nodes: Record<number, string> = {};
    s.pins.forEach((p, i) => {
      if (conn.netOfPin.get(pinKey(s.id, i)) !== undefined) nodes[p.num] = node(s, i);
    });
    res.probes.nodes[s.id] = nodes;
    const mode = kind === 'dmm' ? dmmMode(s) : undefined;
    if ((mode === 'ADC' || mode === 'AAC') && nodes[1] !== undefined && nodes[2] !== undefined) {
      const name = elementName(s, 'V', used);
      lines.push(`${name} ${nodes[1]} ${nodes[2]} DC 0`);
      res.probes.currents[s.id] = `i(${name.toLowerCase()})`;
    }
  }

  const directives: string[] = [];
  for (const it of doc.items) {
    if (it.kind !== 'text') continue;
    const txt = it.text.replace(/<[^>]*>/g, '').trim();
    if (it.textType === 'SPICE_DIRECTIVE') directives.push(...txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    if (it.textType === 'CONTROL') {
      for (const l of txt.split(/\r?\n/)) {
        const m = /^\s*plot\s+(.+)$/i.exec(l);
        if (m) res.plots.push(...m[1].split(/\s+/).filter((v) => v && !/^(vs|ylimit|xlimit)$/i.test(v)));
      }
    }
  }
  const ANALYSIS = /^\.(tran|ac|dc|op|noise|disto|tf|sens|pz)\b/i;
  if (opts.analysis) {
    for (let i = directives.length - 1; i >= 0; i--) if (ANALYSIS.test(directives[i])) directives.splice(i, 1);
    directives.push(opts.analysis);
  }
  const hasAnalysis = directives.some((d) => ANALYSIS.test(d));
  if (!hasAnalysis) {
    directives.push('.tran 10u 10m');
    res.defaultAnalysisAdded = true;
  }

  res.netlist = toAscii([
    `* ${title} - BlackBoard`,
    ...[...models.values()],
    ...lines,
    ...directives.filter((d) => !/^\.end\s*$/i.test(d)).map((d) => (opts.uic ? withUic(d) : d)),
    '.end',
    '',
  ].join('\n'));
  return res;
}
