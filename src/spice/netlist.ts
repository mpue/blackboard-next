// SPICE netlist generation for schematics (successor of SpiceUtil in 1.x).

import type { Doc, SpiceModel, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey } from './connectivity.ts';
import { globalNetKey } from './labels.ts';
import { parseEng } from '../model/ops.ts';
import { dmmMode, earthedPinIndex, fgenSettings, fgenSource, instrumentOf, type Probes } from './instruments.ts';
import { ESP32_3V3_PIN, ESP32_5V_PIN, ESP32_GND_PINS, MODELS, mcuKind, usbPowered, type Drives, type McuKind } from '../mcu/pinout.ts';

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
  /** SPICE node of every connectivity net index ("0" = ground) */
  nodeOfNet: Map<number, string>;
  /** supply symbols (+5V, VCC …) that drive their net; `assumed` when the voltage is not in the name or value */
  supplies: { name: string; volts: number; assumed: boolean; node: string; element: string }[];
  /** emitted elements: symbol, SPICE element name and its terminals in SPICE order (symbol pin index + node) */
  elements: { symbolId: string; name: string; type: NonNullable<SymbolItem['spiceType']>; pins: { index: number; node: string }[] }[];
  /** microcontrollers: SPICE node of every connected pin (by pin number), of their supply and ground (when powered) */
  mcus: { symbolId: string; ref: string; kind: McuKind; nodes: Record<number, string>; vdd?: string; gnd?: string }[];
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
  // some library subcircuits have a ".SUCKT" typo or lack their ".ENDS"
  let text = content.replace(/\r\n?/g, '\n').trim().replace(/^(\s*)\.suckt\b/im, '$1.SUBCKT');
  if (/^\s*\.subckt\b/im.test(text)) {
    if (!/^\s*\.ends\b/im.test(text)) text += '\n.ENDS';
    return text;
  }
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
  /** pins of running microcontrollers (symbol id -> drives); without, their pins are inputs */
  mcu?: Map<string, Drives>;
}

// ---- built-in models ----------------------------------------------------------------------------

/**
 * Many library symbols (all LEDs, Zener diodes, generic transistors) come
 * without a SPICE model and used to be left out of the simulation. They get
 * plain textbook models instead: LEDs by colour (forward voltage at 20 mA),
 * Zener diodes by the voltage in their value ("C5V6" -> 5.6 V).
 */
const LED_VF: [RegExp, string, number][] = [
  [/infrarot|infrared|\bir\b/i, 'IR', 1.25],
  [/blau|blue|wei(ß|ss)|white|uv/i, 'BLUE', 3.1],
  [/gr(ü|u)n|green/i, 'GREEN', 2.1],
  [/gelb|yellow|orange/i, 'YELLOW', 2.0],
];

function ledModel(s: SymbolItem): { name: string; text: string } {
  const txt = `${s.symbolName} ${s.value} ${s.filename ?? ''}`;
  const [, color, vf] = LED_VF.find(([re]) => re.test(txt)) ?? [/./, 'RED', 1.9];
  // I = IS * exp(V / (N * Vt)) with N = 2 gives 20 mA at the nominal forward voltage
  const nVt = 2 * 0.025852;
  const is = 0.02 / Math.exp(vf / nVt);
  const name = `LED_${color}`;
  return { name, text: `.model ${name} D(IS=${is.toPrecision(3)} N=2 RS=2 BV=5 IBV=10u CJO=20p)` };
}

export function builtinModel(s: SymbolItem): { name: string; text: string } | undefined {
  const txt = `${s.symbolName} ${s.value} ${s.filename ?? ''}`;
  switch (s.spiceType) {
    case 'DIODE': {
      if (/led/i.test(txt)) return ledModel(s);
      const z = /(?:^|[^\d])(\d+)[v,.](\d*)/i.exec(s.value);
      if (/z-?diode|zener|zd|bzx|bzy/i.test(txt) && z) {
        const bv = parseFloat(`${z[1]}.${z[2] || '0'}`);
        const name = `DZ${String(bv).replace('.', 'V')}`;
        return { name, text: `.model ${name} D(IS=1e-14 N=1 RS=1 BV=${bv} IBV=5m CJO=50p)` };
      }
      return { name: 'D_GENERIC', text: '.model D_GENERIC D(IS=2.52n N=1.752 RS=0.568 BV=100 IBV=100u CJO=4p)' };
    }
    case 'NPN':
      return { name: 'NPN_GENERIC', text: '.model NPN_GENERIC NPN(IS=1.8e-14 BF=300 VAF=80 BR=5 RB=50 RC=1 RE=0.5 CJE=11p CJC=5p TF=0.4n TR=50n)' };
    case 'PNP':
      return { name: 'PNP_GENERIC', text: '.model PNP_GENERIC PNP(IS=2e-14 BF=250 VAF=60 BR=5 RB=50 RC=1 RE=0.5 CJE=11p CJC=7p TF=0.5n TR=50n)' };
    case 'MOSFET':
      return /p-?(channel|kanal)|pmos|bs250/i.test(txt)
        ? { name: 'PMOS_GENERIC', text: '.model PMOS_GENERIC PMOS(LEVEL=1 VTO=-2 KP=0.1 LAMBDA=0.01)' }
        : { name: 'NMOS_GENERIC', text: '.model NMOS_GENERIC NMOS(LEVEL=1 VTO=2 KP=0.1 LAMBDA=0.01)' };
    default:
      return undefined;
  }
}

// ---- interactive parts ----------------------------------------------------------------------

const SWITCH_RE = /schalter|taster|switch|button|reed/i;

/**
 * Switch symbols (no SPICE type): "toggle" = on/off with two pins,
 * "changeover" = common pin 1 connected to pin 2 or 3.
 */
export function switchOf(s: SymbolItem): 'toggle' | 'changeover' | undefined {
  if (s.spiceType || !SWITCH_RE.test(`${s.symbolName} ${s.filename ?? ''}`)) return undefined;
  if (s.pins.length === 2) return 'toggle';
  if (s.pins.length === 3 && s.pins.some((p) => p.num === 1) && s.pins.some((p) => p.num === 2) && s.pins.some((p) => p.num === 3)) return 'changeover';
  return undefined;
}

export const switchClosed = (s: SymbolItem) => s.properties?.closed === 'true';
/** pin a changeover switch connects pin 1 to */
export const switchThrow = (s: SymbolItem) => (s.properties?.throw === '3' ? 3 : 2);

/** Wiper position of a potentiometer, 0 = at pin 1, 1 = at pin 3. */
export function potPosition(s: SymbolItem): number {
  const v = parseFloat(s.properties?.wiper ?? '');
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

export const isPot = (s: SymbolItem) => s.spiceType === 'RESISTOR' && s.pins.length === 3;

/** Incandescent lamps (no SPICE type in the library): a resistor from their rating. */
export function lampOf(s: SymbolItem): { ohms: number; watts: number } | undefined {
  if (s.spiceType || s.pins.length !== 2 || !/gl(ü|u)hl(a|ä)mp|lamp|bulb/i.test(`${s.symbolName} ${s.filename ?? ''}`) || /glimm/i.test(s.symbolName)) return undefined;
  const v = /(\d+(?:[.,]\d+)?)\s*v/i.exec(s.value);
  const a = /(\d+(?:[.,]\d+)?)\s*(m?)a\b/i.exec(s.value);
  const w = /(\d+(?:[.,]\d+)?)\s*w\b/i.exec(s.value);
  const volts = v ? parseFloat(v[1].replace(',', '.')) : 6;
  const amps = a ? parseFloat(a[1].replace(',', '.')) * (a[2] ? 1e-3 : 1) : undefined;
  const watts = w ? parseFloat(w[1].replace(',', '.')) : amps !== undefined ? volts * amps : 0.6;
  return { ohms: (volts * volts) / watts, watts };
}

/** Rail voltage written in a supply name or value: "+5V" 5, "+3V3" 3.3, "-12V" -12, "9 V" 9. */
export function supplyVolts(text: string): number | undefined {
  const m = /([+-]?)\s*(\d+)(?:[.,](\d+))?\s*V(\d*)/i.exec(text.trim());
  if (!m) return undefined;
  const frac = m[3] ?? m[4] ?? '';
  const v = parseFloat(`${m[2]}${frac ? `.${frac}` : ''}`);
  return Number.isFinite(v) ? (m[1] === '-' ? -v : v) : undefined;
}

export function withUic(directive: string): string {
  return /^\.tran\b/i.test(directive) && !/\buic\b/i.test(directive) ? `${directive} uic` : directive;
}

export function buildNetlist(doc: Doc, title: string, library: SpiceModel[] = [], opts: NetlistOptions = {}): NetlistResult {
  const res: NetlistResult = {
    netlist: '',
    errors: [],
    warnings: [],
    plots: [],
    defaultAnalysisAdded: false,
    probes: { nodes: {}, currents: {} },
    nodeOfNet: new Map(),
    supplies: [],
    elements: [],
    mcus: [],
  };
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
    // an ESP32 board is the reference of its circuit, like a USB powered Arduino
    if (mcuKind(s) === 'esp32') {
      s.pins.forEach((p, i) => {
        const n = conn.netOfPin.get(pinKey(s.id, i));
        if (n !== undefined && ESP32_GND_PINS.includes(p.num)) groundNets.add(n);
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
  // unconnected pins get a node of their own, the same one every time it is asked for
  const floating = new Map<string, string>();
  const node = (s: SymbolItem, pinIndex: number): string => {
    const n = conn.netOfPin.get(pinKey(s.id, pinIndex));
    if (n === undefined) {
      const key = pinKey(s.id, pinIndex);
      let f = floating.get(key);
      if (!f) floating.set(key, (f = String(next++)));
      return f;
    }
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
    if (!m || !m.content) {
      const fallback = builtinModel(s);
      if (!fallback) return undefined;
      models.set(fallback.name.toLowerCase(), fallback.text);
      return fallback.name;
    }
    const { name, text } = modelText(m);
    models.set(name.toLowerCase(), text);
    return name;
  };

  const emitted = (s: SymbolItem, name: string, pins: number[]) => {
    res.elements.push({ symbolId: s.id, name, type: s.spiceType!, pins: pins.map((index) => ({ index, node: node(s, index) })) });
  };
  for (const s of devices) {
    const type = s.spiceType!;
    const prefix = PREFIX[type]!;
    const unconnected = s.pins.some((_, i) => conn.netOfPin.get(pinKey(s.id, i)) === undefined || conn.nets[conn.netOfPin.get(pinKey(s.id, i))!].pins.length < 2);
    switch (type) {
      case 'RESISTOR':
      case 'CAPACITOR':
      case 'INDUCTOR': {
        // potentiometer: pins 1 and 3 are the ends, pin 2 the wiper
        const wiper = type === 'RESISTOR' && s.pins.length === 3 ? byNum(s, 2) : -1;
        if (wiper >= 0 && byNum(s, 1) >= 0 && byNum(s, 3) >= 0) {
          const total = parseFloat(spiceValue(s.value, 'R') ?? '');
          if (!Number.isFinite(total)) {
            res.warnings.push({ key: 'value', name: s.name, value: s.value });
            continue;
          }
          const pos = potPosition(s);
          const base = elementName(s, prefix, used);
          const nameB = elementName({ ...s, name: `${base}_B` }, prefix, used);
          const ra = Math.max(1e-3, total * pos);
          const rb = Math.max(1e-3, total * (1 - pos));
          lines.push(`${base} ${node(s, byNum(s, 1))} ${node(s, wiper)} ${parseFloat(ra.toPrecision(6))}`);
          lines.push(`${nameB} ${node(s, wiper)} ${node(s, byNum(s, 3))} ${parseFloat(rb.toPrecision(6))}`);
          emitted(s, base, [byNum(s, 1), wiper]);
          emitted(s, nameB, [wiper, byNum(s, 3)]);
          break;
        }
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
        const name = elementName(s, prefix, used);
        lines.push(`${name} ${node(s, a)} ${node(s, b)} ${value}`);
        emitted(s, name, [a, b]);
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
        const name = elementName(s, 'D', used);
        lines.push(`${name} ${node(s, a)} ${node(s, k)} ${model}`);
        emitted(s, name, [a, k]);
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
        const name = elementName(s, 'Q', used);
        lines.push(`${name} ${node(s, c)} ${node(s, b)} ${node(s, e)} ${model}`);
        emitted(s, name, [c, b, e]);
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
        const name = elementName(s, 'M', used);
        lines.push(`${name} ${node(s, d)} ${node(s, g)} ${node(s, src)} ${node(s, bulk >= 0 ? bulk : src)} ${model}`);
        emitted(s, name, bulk >= 0 ? [d, g, src, bulk] : [d, g, src]);
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
        const name = elementName(s, 'V', used);
        lines.push(`${name} ${node(s, plus)} ${node(s, minus)} ${spec}`);
        emitted(s, name, [plus, minus]);
        break;
      }
      case 'SUBCIRCUIT': {
        const model = modelFor(s);
        if (!model) {
          res.warnings.push({ key: 'subckt', name: s.name });
          continue;
        }
        // terminals in the order of the .SUBCKT port list when it names the pin numbers, else by pin number
        const ports = /^\s*\.subckt\s+\S+\s+([^\n]*)$/im.exec(models.get(model.toLowerCase()) ?? '')?.[1].trim().split(/\s+/) ?? [];
        const byPort = ports.length === s.pins.length && s.pins.every((p) => ports.includes(String(p.num)));
        const pins = s.pins
          .map((p, i) => ({ p, i }))
          .sort((x, y) => (byPort ? ports.indexOf(String(x.p.num)) - ports.indexOf(String(y.p.num)) : x.p.num - y.p.num));
        const name = elementName(s, 'X', used);
        lines.push(`${name} ${pins.map(({ i }) => node(s, i)).join(' ')} ${model}`);
        emitted(s, name, pins.map(({ i }) => i));
        break;
      }
    }
    if (unconnected) res.warnings.push({ key: 'unconnected', name: s.name });
  }

  // switches and push buttons are resistors: almost nothing when closed, almost infinite when open
  for (const s of symbols) {
    const sw = switchOf(s);
    if (!sw) continue;
    const common = byNum(s, 1);
    const to = sw === 'toggle' ? byNum(s, 2) : byNum(s, switchThrow(s));
    if (common < 0 || to < 0) continue;
    const name = elementName(s, 'R', used);
    lines.push(`${name} ${node(s, common)} ${node(s, to)} ${sw === 'toggle' && !switchClosed(s) ? '1e9' : '0.01'}`);
    res.elements.push({ symbolId: s.id, name, type: 'RESISTOR', pins: [common, to].map((index) => ({ index, node: node(s, index) })) });
  }

  for (const s of symbols) {
    const lamp = lampOf(s);
    if (!lamp) continue;
    const name = elementName(s, 'R', used);
    lines.push(`${name} ${node(s, 0)} ${node(s, 1)} ${parseFloat(lamp.ohms.toPrecision(6))}`);
    res.elements.push({ symbolId: s.id, name, type: 'RESISTOR', pins: [0, 1].map((index) => ({ index, node: node(s, index) })) });
  }

  // supply symbols drive their rail like a lab supply, unless a real source already does
  const driven = new Set(res.elements.filter((e) => e.type === 'VOLTAGE_SOURCE').flatMap((e) => e.pins.map((p) => p.node)));
  const rails = new Map<string, SymbolItem>();
  for (const s of symbols) {
    const key = globalNetKey(s);
    if (key?.startsWith('supply:') && !rails.has(key)) rails.set(key, s);
  }
  for (const s of rails.values()) {
    const n = node(s, 0);
    if (n === '0' || driven.has(n)) continue;
    const parsed = supplyVolts(s.value) ?? supplyVolts(s.name);
    const volts = parsed ?? 5;
    let name = `VSUPPLY${res.supplies.length + 1}`;
    while (used.has(name)) name += '_';
    used.add(name);
    lines.push(`${name} ${n} 0 DC ${volts}`);
    driven.add(n);
    res.supplies.push({ name: s.name, volts, assumed: parsed === undefined, node: n, element: name });
  }

  // microcontrollers draw their supply current; while the firmware runs, the pins drive the circuit
  for (const s of symbols) {
    const kind = mcuKind(s);
    if (!kind) continue;
    const model = MODELS[kind];
    // pins with something attached (every pin has a net of its own, even an open one)
    const nodes: Record<number, string> = {};
    s.pins.forEach((p, i) => {
      const n = conn.netOfPin.get(pinKey(s.id, i));
      if (n !== undefined && (conn.nets[n].pins.length > 1 || conn.nets[n].wires.length > 0)) nodes[p.num] = node(s, i);
    });
    // a resistor from a (a pin of the symbol, if `pins[0]` is one) to b; only real pins are reported to the live values
    const resistor = (suffix: string, a: string, b: string, ohms: number, pins: (number | undefined)[]) => {
      const name = elementName({ ...s, name: `${s.name}_${suffix}` }, 'R', used);
      lines.push(`${name} ${a} ${b} ${ohms}`);
      const known = pins.filter((num): num is number => num !== undefined && nodes[num] !== undefined);
      if (known.length) res.elements.push({ symbolId: s.id, name, type: 'RESISTOR', pins: known.map((num) => ({ index: byNum(s, num), node: nodes[num] })) });
    };
    let vdd: string | undefined;
    let gnd: string | undefined;
    let gndPin: number | undefined;
    if (kind === 'esp32') {
      // the board: GND is the reference; 3V3 comes from its regulator, fed over USB or from the 5V pin
      gnd = '0';
      vdd = nodes[ESP32_3V3_PIN] ?? String(next++);
      const v5 = nodes[ESP32_5V_PIN];
      const source = (suffix: string, prefix: 'V' | 'B', spec: string, out: string, ohms: number, pin: number) => {
        const mid = String(next++);
        lines.push(`${elementName({ ...s, name: `${s.name}_${suffix}` }, prefix, used)} ${mid} 0 ${spec}`);
        resistor(suffix, out, mid, ohms, [pin]);
        driven.add(out);
      };
      if (usbPowered(s)) {
        if (!driven.has(vdd)) source('REG', 'V', 'DC 3.3', vdd, 0.5, ESP32_3V3_PIN);
        if (v5 !== undefined && !driven.has(v5)) source('USB', 'V', 'DC 5', v5, 0.2, ESP32_5V_PIN);
      } else if (v5 !== undefined && !driven.has(vdd)) {
        // AMS1117-3.3 style regulator: 3.3 V once the input is above about 4.4 V; its quiescent
        // current (about 5 mA) loads the input, which also keeps an open 5V pin in the matrix
        source('LDO', 'B', `V=max(0,min(3.3,V(${v5})-1.1))`, vdd, 0.5, ESP32_3V3_PIN);
        resistor('LDOIN', v5, '0', 1000, [ESP32_5V_PIN]);
      }
      resistor('VDD', vdd, '0', model.supplyOhms, [ESP32_3V3_PIN]);
    } else {
      gndPin = model.gndPins.find((n) => nodes[n] !== undefined);
      if (nodes[model.vddPin] !== undefined && gndPin !== undefined) {
        vdd = nodes[model.vddPin];
        gnd = nodes[gndPin];
        resistor('VCC', vdd, gnd, model.supplyOhms, [model.vddPin, gndPin]);
        // both GND pins are connected inside the chip
        for (const g of model.gndPins) if (g !== gndPin && nodes[g] !== undefined && nodes[g] !== gnd) resistor(`GND${g}`, nodes[g], gnd, 0.01, [g, gndPin]);
      }
    }
    res.mcus.push({ symbolId: s.id, ref: s.name, kind, nodes, vdd, gnd });
    if (vdd === undefined || gnd === undefined) continue;
    for (const [key, d] of Object.entries(opts.mcu?.get(s.id) ?? {})) {
      const num = Number(key);
      const at = nodes[num];
      if (at === undefined || d === 'Z') continue;
      // the state is in the name, so averaged operating points (PWM) keep high and low apart
      if (d === 'H') resistor(`P${num}H`, at, vdd, model.pinOhms, [num, model.vddPin]);
      else if (d === 'L') resistor(`P${num}L`, at, gnd, model.pinOhms, [num, gndPin]);
      else if (d === 'PU') resistor(`P${num}U`, at, vdd, model.pullupOhms, [num, model.vddPin]);
      else if (d === 'PD') resistor(`P${num}D`, at, gnd, model.pulldownOhms, [num, gndPin]);
      else {
        // PWM switches faster than the circuit is recalculated: its average, duty x VDD behind the pin driver
        const mid = String(next++);
        lines.push(`${elementName({ ...s, name: `${s.name}_P${num}` }, 'E', used)} ${mid} ${gnd} ${vdd} ${gnd} ${d}`);
        resistor(`P${num}`, at, mid, model.pinOhms, [num]);
      }
    }
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

  res.nodeOfNet = new Map(nodeOfNet);
  for (const n of groundNets) res.nodeOfNet.set(n, '0');
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
