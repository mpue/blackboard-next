// Virtual bench instruments: oscilloscope, multimeter and function generator.
// They are placed as symbols; their settings live in the symbol properties
// (string map, saved in .bb files). The function generator is an ordinary
// voltage source for the netlist, oscilloscope and multimeter are probes.
// Like real bench instruments the generator's COM and the oscilloscope's GND
// are earthed (circuit ground); the battery powered multimeter floats.

import type { BoxGeom, Doc, EllipseGeom, LineGeom, Pin, SymbolDef, SymbolItem, SymbolShape, TextGeom } from '../model/types.ts';

export type InstrumentKind = 'scope' | 'dmm' | 'fgen';
export type Waveform = 'SIN' | 'SQUARE' | 'TRI' | 'SAW';
export type DmmMode = 'VDC' | 'VAC' | 'ADC' | 'AAC';

export const instrumentOf = (s: { kind: string; properties?: Record<string, string> }): InstrumentKind | undefined => {
  const k = s.kind === 'symbol' ? s.properties?.instrument : undefined;
  return k === 'scope' || k === 'dmm' || k === 'fgen' ? k : undefined;
};

export const isInstrument = (s: { kind: string; properties?: Record<string, string> }) => instrumentOf(s) !== undefined;

const num = (p: Record<string, string> | undefined, k: string, d: number) => {
  const v = parseFloat(p?.[k] ?? '');
  return Number.isFinite(v) ? v : d;
};

// ---- settings ------------------------------------------------------------------------------

export interface ScopeSettings {
  timeDiv: number;
  ch: [ChannelSettings, ChannelSettings];
  trigSource: 1 | 2;
  trigLevel: number;
  trigEdge: 'rise' | 'fall';
  run: boolean;
}

export interface ChannelSettings {
  on: boolean;
  voltsDiv: number;
  /** vertical position in divisions */
  pos: number;
  coupling: 'DC' | 'AC';
}

export function scopeSettings(s: SymbolItem): ScopeSettings {
  const p = s.properties;
  const ch = (n: 1 | 2): ChannelSettings => ({
    on: (p?.[`ch${n}On`] ?? 'true') !== 'false',
    voltsDiv: num(p, `ch${n}Div`, n === 1 ? 1 : 1),
    pos: num(p, `ch${n}Pos`, n === 1 ? 1 : -2),
    coupling: p?.[`ch${n}Coupling`] === 'AC' ? 'AC' : 'DC',
  });
  return {
    timeDiv: num(p, 'timeDiv', 2e-4),
    ch: [ch(1), ch(2)],
    trigSource: p?.trigSource === '2' ? 2 : 1,
    trigLevel: num(p, 'trigLevel', 0),
    trigEdge: p?.trigEdge === 'fall' ? 'fall' : 'rise',
    run: (p?.run ?? 'true') !== 'false',
  };
}

export interface FgenSettings {
  shape: Waveform;
  frequency: number;
  /** peak amplitude in volts */
  amplitude: number;
  offset: number;
  duty: number;
}

export function fgenSettings(s: SymbolItem): FgenSettings {
  const p = s.properties;
  const raw = (p?.shape ?? 'SIN').toUpperCase();
  const shape: Waveform = raw === 'SQUARE' || raw === 'PULSE' ? 'SQUARE' : raw === 'TRI' ? 'TRI' : raw === 'SAW' ? 'SAW' : 'SIN';
  const unit = { HZ: 1, KHZ: 1e3, MHZ: 1e6 }[(p?.frequencyUnit ?? 'HZ').toUpperCase()] ?? 1;
  return {
    shape,
    frequency: num(p, 'frequency', 1000) * unit,
    amplitude: num(p, 'acAmplitude', 1),
    offset: num(p, 'dcOffset', 0),
    duty: num(p, 'duty', 50),
  };
}

export const dmmMode = (s: SymbolItem): DmmMode => {
  const m = s.properties?.dmmMode;
  return m === 'VAC' || m === 'ADC' || m === 'AAC' ? m : 'VDC';
};

export const fmtNum = (v: number) => String(parseFloat(v.toPrecision(10)));

/** SPICE source specification of the function generator. */
export function fgenSource(f: FgenSettings): string {
  const period = f.frequency > 0 ? 1 / f.frequency : 1;
  const lo = fmtNum(f.offset - f.amplitude);
  const hi = fmtNum(f.offset + f.amplitude);
  const t = (x: number) => fmtNum(x * period);
  switch (f.shape) {
    case 'SQUARE': {
      const edge = 1e-3;
      const width = Math.max(edge, Math.min(1 - 2 * edge, f.duty / 100) - edge);
      return `DC 0 AC 1 PULSE(${lo} ${hi} 0 ${t(edge)} ${t(edge)} ${t(width)} ${t(1)})`;
    }
    case 'TRI':
      return `DC 0 AC 1 PULSE(${lo} ${hi} 0 ${t(0.5)} ${t(0.5)} ${t(1e-6)} ${t(1)})`;
    case 'SAW':
      return `DC 0 AC 1 PULSE(${lo} ${hi} 0 ${t(0.998)} ${t(0.001)} ${t(1e-6)} ${t(1)})`;
    default:
      return `DC ${fmtNum(f.offset)} AC 1 SIN(${fmtNum(f.offset)} ${fmtNum(f.amplitude)} ${fmtNum(f.frequency)} 0 0 0)`;
  }
}

/** Pins that are earthed like on a real bench (generator COM, scope GND). */
export function earthedPinIndex(s: SymbolItem): number | undefined {
  const k = instrumentOf(s);
  const num = k === 'fgen' ? 2 : k === 'scope' ? 3 : undefined;
  if (num === undefined) return undefined;
  const i = s.pins.findIndex((p) => p.num === num);
  return i >= 0 ? i : undefined;
}

// ---- analysis --------------------------------------------------------------------------------

export interface BenchAnalysis {
  /** visible time window of the instruments */
  window: number;
  tstop: number;
  tmax: number;
  directive: string;
}

const PREROLL = 2;

/** Transient analysis long enough to settle and to show one triggered screen. */
export function benchAnalysis(doc: Doc, uic: boolean): BenchAnalysis {
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const scope = symbols.find((s) => instrumentOf(s) === 'scope');
  const gens = symbols.filter((s) => instrumentOf(s) === 'fgen').map(fgenSettings);
  const fastest = gens.reduce((m, g) => Math.max(m, g.frequency), 0);
  const slowest = gens.reduce((m, g) => (g.frequency > 0 ? Math.min(m, g.frequency) : m), Infinity);
  let window = 0.02;
  if (scope) window = 10 * scopeSettings(scope).timeDiv;
  else if (Number.isFinite(slowest)) window = 5 / slowest;
  const tstop = window * (PREROLL + 1);
  let tmax = window / 1000;
  if (fastest > 0) tmax = Math.min(tmax, 1 / fastest / 50);
  tmax = Math.max(tmax, tstop / 30000);
  const directive = `.tran ${fmtNum(tmax)} ${fmtNum(tstop)} 0 ${fmtNum(tmax)}${uic ? ' uic' : ''}`;
  return { window, tstop, tmax, directive };
}

// ---- reading results -------------------------------------------------------------------------

export interface SimData {
  time: number[];
  vectors: Map<string, number[]>;
}

export interface Probes {
  /** symbol id -> pin number -> SPICE node */
  nodes: Record<string, Record<number, string>>;
  /** multimeter id -> current vector (ammeter modes) */
  currents: Record<string, string>;
}

export function nodeVoltage(data: SimData, node: string | undefined): number[] | undefined {
  if (node === undefined) return undefined;
  if (node === '0') return data.time.map(() => 0);
  return data.vectors.get(`v(${node})`);
}

function sub(a: number[] | undefined, b: number[] | undefined): number[] | undefined {
  if (!a) return undefined;
  if (!b) return a;
  return a.map((v, i) => v - (b[i] ?? 0));
}

/** index range of the samples within [t0, t1] */
function range(time: number[], t0: number, t1: number): [number, number] {
  let i0 = 0;
  while (i0 < time.length - 1 && time[i0] < t0) i0++;
  let i1 = i0;
  while (i1 < time.length - 1 && time[i1] < t1) i1++;
  return [i0, i1];
}

export interface Stats {
  min: number;
  max: number;
  mean: number;
  rms: number;
  /** AC rms (mean removed) */
  acRms: number;
  freq: number | undefined;
}

/** time weighted statistics (ngspice uses variable time steps) */
export function stats(time: number[], v: number[], i0: number, i1: number): Stats {
  let min = Infinity;
  let max = -Infinity;
  let area = 0;
  let area2 = 0;
  let dur = 0;
  for (let i = i0; i < i1; i++) {
    const dt = time[i + 1] - time[i];
    const a = v[i];
    const b = v[i + 1];
    min = Math.min(min, a, b);
    max = Math.max(max, a, b);
    area += ((a + b) / 2) * dt;
    area2 += ((a * a + a * b + b * b) / 3) * dt;
    dur += dt;
  }
  if (!(dur > 0)) {
    const x = v[i0] ?? 0;
    return { min: x, max: x, mean: x, rms: Math.abs(x), acRms: 0, freq: undefined };
  }
  const mean = area / dur;
  const ms = area2 / dur;
  const acRms = Math.sqrt(Math.max(0, ms - mean * mean));
  // frequency from rising crossings of the mean with a little hysteresis
  const hyst = (max - min) * 0.1;
  const crossings: number[] = [];
  let armed = false;
  for (let i = i0; i < i1; i++) {
    if (v[i] < mean - hyst) armed = true;
    if (armed && v[i] < mean && v[i + 1] >= mean) {
      const f = (mean - v[i]) / (v[i + 1] - v[i] || 1);
      crossings.push(time[i] + f * (time[i + 1] - time[i]));
      armed = false;
    }
  }
  const freq = crossings.length >= 2 && max - min > 1e-9 ? (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0]) : undefined;
  return { min, max, mean, rms: Math.sqrt(Math.max(0, ms)), acRms, freq };
}

export interface ScopeView {
  /** start time of the screen */
  t0: number;
  triggered: boolean;
  channels: ({ t: number[]; v: number[]; stats: Stats } | undefined)[];
}

/** Triggered screen of an oscilloscope. */
export function scopeView(data: SimData, probes: Probes, scope: SymbolItem, analysis: BenchAnalysis): ScopeView {
  const st = scopeSettings(scope);
  const nodes = probes.nodes[scope.id] ?? {};
  const ref = nodeVoltage(data, nodes[3] ?? '0');
  const raw = [1, 2].map((n) => (nodes[n] !== undefined ? sub(nodeVoltage(data, nodes[n]), ref) : undefined));
  const window = 10 * st.timeDiv;
  const div = st.timeDiv;
  const { time } = data;
  // AC coupling removes the mean of the settled part
  const settled = range(time, analysis.tstop - window, analysis.tstop);
  const sig = raw.map((v, i) => {
    if (!v || st.ch[i].coupling === 'DC') return v;
    const m = stats(time, v, settled[0], settled[1]).mean;
    return v.map((x) => x - m);
  });
  // trigger: first matching edge after the pre-roll that leaves room for a full screen
  const trig = sig[st.trigSource - 1];
  let t0 = analysis.tstop - window;
  let triggered = false;
  if (trig) {
    const [a, b] = range(time, analysis.tstop - 2 * window + div, analysis.tstop - window + div);
    const lvl = st.trigLevel;
    for (let i = a; i < b; i++) {
      const rising = trig[i] < lvl && trig[i + 1] >= lvl;
      const falling = trig[i] > lvl && trig[i + 1] <= lvl;
      if ((st.trigEdge === 'rise' && rising) || (st.trigEdge === 'fall' && falling)) {
        const f = (lvl - trig[i]) / (trig[i + 1] - trig[i] || 1);
        t0 = time[i] + f * (time[i + 1] - time[i]) - div;
        triggered = true;
        break;
      }
    }
  }
  const [i0, i1] = range(time, t0, t0 + window);
  const channels = sig.map((v, i) => {
    if (!v || !st.ch[i].on) return undefined;
    const s0 = Math.max(0, i0 - 1);
    const s1 = Math.min(time.length - 1, i1 + 1);
    return { t: time.slice(s0, s1 + 1).map((t) => t - t0), v: v.slice(s0, s1 + 1), stats: stats(time, v, i0, i1) };
  });
  return { t0, triggered, channels };
}

export interface DmmReading {
  value: number | undefined;
  unit: 'V' | 'A';
}

export function dmmReading(data: SimData, probes: Probes, dmm: SymbolItem, analysis: BenchAnalysis): DmmReading {
  const mode = dmmMode(dmm);
  const amps = mode === 'ADC' || mode === 'AAC';
  let v: number[] | undefined;
  if (amps) {
    const name = probes.currents[dmm.id];
    v = name ? data.vectors.get(name) : undefined;
  } else {
    const n = probes.nodes[dmm.id] ?? {};
    v = n[1] !== undefined && n[2] !== undefined ? sub(nodeVoltage(data, n[1]), nodeVoltage(data, n[2])) : undefined;
  }
  if (!v) return { value: undefined, unit: amps ? 'A' : 'V' };
  const [i0, i1] = range(data.time, analysis.tstop - analysis.window, analysis.tstop);
  const st = stats(data.time, v, i0, i1);
  return { value: mode === 'VDC' || mode === 'ADC' ? st.mean : st.acRms, unit: amps ? 'A' : 'V' };
}

// ---- schematic symbols -------------------------------------------------------------------------

const line = (x1: number, y1: number, x2: number, y2: number, color = '#111827', thickness = 2): LineGeom => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
  color,
  thickness,
  startType: 'STRAIGHT',
  endType: 'STRAIGHT',
});
const box = (x: number, y: number, w: number, h: number, color: string, style: BoxGeom['style'] = 'FILLED', thickness = 1.5): BoxGeom => ({
  kind: 'box',
  x,
  y,
  w,
  h,
  color,
  thickness,
  style,
});
const circle = (cx: number, cy: number, r: number, color: string, style: EllipseGeom['style'] = 'FILLED'): EllipseGeom => ({
  kind: 'ellipse',
  x: cx - r,
  y: cy - r,
  w: 2 * r,
  h: 2 * r,
  color,
  thickness: 1.5,
  style,
  startAngle: 0,
  arcAngle: 360,
});
const label = (x: number, y: number, text: string, fontSize = 8, color = '#111827', textType: TextGeom['textType'] = 'TEXT'): TextGeom => ({
  kind: 'text',
  x,
  y,
  text,
  font: 'Arial',
  fontSize,
  rotation: 0,
  textType,
  color,
});
/** a polyline approximating y = f(x) */
function curve(x0: number, x1: number, f: (x: number) => number, color: string, steps = 16): LineGeom[] {
  const out: LineGeom[] = [];
  for (let i = 0; i < steps; i++) {
    const a = x0 + ((x1 - x0) * i) / steps;
    const b = x0 + ((x1 - x0) * (i + 1)) / steps;
    out.push(line(a, f(a), b, f(b), color, 1.5));
  }
  return out;
}
const pin = (num: number, x: number, y: number, name: string): Pin => ({ num, x, y, name, orientation: 'TOP_LEFT' });

function scopeDef(): SymbolDef {
  const shapes: SymbolShape[] = [
    line(0, 16, 16, 16, '#ca8a04'),
    line(0, 32, 16, 32, '#0891b2'),
    line(0, 64, 16, 64),
    box(16, 0, 112, 80, '#1f2937'),
    box(16, 0, 112, 80, '#0f172a', 'OUTLINED'),
    box(24, 8, 64, 48, '#052e16'),
    ...[40, 56, 72].map((x) => line(x, 8, x, 56, '#14532d', 0.6)),
    ...[20, 32, 44].map((y) => line(24, y, 88, y, '#14532d', 0.6)),
    ...curve(24, 88, (x) => 32 - 12 * Math.sin(((x - 24) / 64) * 4 * Math.PI), '#facc15'),
    circle(102, 16, 6, '#6b7280'),
    circle(118, 16, 4, '#6b7280'),
    circle(102, 34, 4, '#ca8a04'),
    circle(118, 34, 4, '#0891b2'),
    box(96, 48, 26, 10, '#16a34a'),
    label(24, 72, 'OSC', 9, '#e5e7eb'),
    label(3, 13, 'CH1', 7, '#ca8a04'),
    label(3, 29, 'CH2', 7, '#0891b2'),
    label(3, 61, 'GND', 7),
    label(56, 72, 'OSC1', 8, '#9ca3af', 'NAME'),
  ];
  return {
    name: 'Oscilloscope',
    filename: 'instrument-oscilloscope.xml',
    category: 'Instruments',
    width: 128,
    height: 80,
    value: '',
    customModel: false,
    properties: { instrument: 'scope', timeDiv: '0.0002', ch1Div: '1', ch2Div: '1', ch1Pos: '1', ch2Pos: '-2', trigSource: '1', trigLevel: '0', trigEdge: 'rise' },
    pins: [pin(1, 0, 16, 'CH1'), pin(2, 0, 32, 'CH2'), pin(3, 0, 64, 'GND')],
    shapes,
  };
}

function dmmDef(): SymbolDef {
  const shapes: SymbolShape[] = [
    line(16, 80, 16, 96, '#dc2626'),
    line(48, 80, 48, 96),
    box(0, 0, 64, 80, '#f59e0b'),
    box(0, 0, 64, 80, '#92400e', 'OUTLINED'),
    box(5, 5, 54, 70, '#1f2937'),
    box(9, 9, 46, 20, '#c7d2b0'),
    circle(32, 50, 12, '#374151'),
    line(32, 50, 40, 42, '#e5e7eb'),
    circle(16, 70, 3, '#dc2626'),
    circle(48, 70, 3, '#111827'),
    label(22, 92, 'V', 8, '#dc2626'),
    label(52, 92, 'COM', 7),
    label(9, 41, 'DMM1', 7, '#9ca3af', 'NAME'),
  ];
  return {
    name: 'Multimeter',
    filename: 'instrument-multimeter.xml',
    category: 'Instruments',
    width: 64,
    height: 96,
    value: '',
    customModel: false,
    properties: { instrument: 'dmm', dmmMode: 'VDC' },
    pins: [pin(1, 16, 96, 'V'), pin(2, 48, 96, 'COM')],
    shapes,
  };
}

function fgenDef(): SymbolDef {
  const shapes: SymbolShape[] = [
    line(112, 16, 128, 16, '#dc2626'),
    line(112, 48, 128, 48),
    box(0, 0, 112, 64, '#e5e7eb'),
    box(0, 0, 112, 64, '#374151', 'OUTLINED'),
    box(8, 8, 60, 28, '#0f172a'),
    ...curve(12, 64, (x) => 22 - 9 * Math.sin(((x - 12) / 52) * 2 * Math.PI), '#22d3ee', 12),
    circle(86, 20, 9, '#6b7280'),
    circle(86, 20, 9, '#374151', 'OUTLINED'),
    box(8, 44, 12, 8, '#0ea5e9'),
    box(24, 44, 12, 8, '#94a3b8'),
    box(40, 44, 12, 8, '#94a3b8'),
    circle(102, 48, 3, '#dc2626'),
    label(114, 12, 'OUT', 7, '#dc2626'),
    label(114, 60, 'COM', 7),
    label(60, 58, 'FG1', 8, '#6b7280', 'NAME'),
  ];
  return {
    name: 'Function generator',
    filename: 'instrument-function-generator.xml',
    category: 'Instruments',
    width: 128,
    height: 64,
    value: '1 kHz',
    customModel: false,
    spiceType: 'VOLTAGE_SOURCE',
    properties: { instrument: 'fgen', mode: 'AC', shape: 'SIN', frequency: '1000', frequencyUnit: 'HZ', acAmplitude: '1', dcOffset: '0', duty: '50', acPhase: '0' },
    pins: [pin(1, 128, 16, '+'), pin(2, 128, 48, '-')],
    shapes,
  };
}

export const INSTRUMENT_DEFS: Record<InstrumentKind, SymbolDef> = { scope: scopeDef(), dmm: dmmDef(), fgen: fgenDef() };

export const INSTRUMENT_PREFIX: Record<InstrumentKind, string> = { scope: 'OSC', dmm: 'DMM', fgen: 'FG' };
