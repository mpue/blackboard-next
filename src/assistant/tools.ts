// The tools of the design assistant (server/assistantTools.ts), run on the
// schematic in the editor: checks Claude's input, calls circuit.ts or the
// simulation and answers with JSON for Claude. Errors in the input come back
// as tool errors, so Claude can correct itself.

import type { Doc, SpiceModel, SymbolDef, SymbolItem } from '../model/types.ts';
import { isSchematicDoc } from '../model/types.ts';
import { addLabel, connect, deleteItems, describe, namedNets, pinOf, placePart, searchSymbols, ToolError, updatePart } from './circuit.ts';
import { liveValues, opNetlist } from '../spice/live.ts';
import { buildNetlist, type NetlistResult } from '../spice/netlist.ts';
import { checkSimulation } from '../spice/readiness.ts';
import { explainSpiceError } from '../spice/explain.ts';
import { pinKey } from '../spice/connectivity.ts';
import { globalNetKey } from '../spice/labels.ts';
import { formatEng, parseEng } from '../model/ops.ts';

export type Vector = { name: string; values: number[] };

/** Where the tools work: the editor (state.ts) or a document in the tests. */
export interface Bench {
  /** the schematic the tools work on; undefined when there is none */
  doc(): Doc | undefined;
  fileName(): string;
  /** changes it; `fn` throws to leave it as it was */
  edit(fn: (d: Doc) => void): void;
  layer(): string;
  symbols(): SymbolDef[];
  models(): SpiceModel[];
  /** opens a new empty schematic, which the tools work on from then on */
  newSchematic(name?: string): void;
  /** runs ngspice: the vectors with their values */
  simulate(netlist: string, timeoutMs: number): Promise<Vector[]>;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

const fail = (msg: string): never => {
  throw new ToolError(msg);
};

// ---- input -------------------------------------------------------------------------------------

type Input = Record<string, unknown>;

function str(i: Input, key: string): string;
function str(i: Input, key: string, optional: true): string | undefined;
function str(i: Input, key: string, optional = false): string | undefined {
  const v = i[key];
  if (v === undefined || v === null) return optional ? undefined : fail(`"${key}" is missing.`);
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' ? v : fail(`"${key}" must be a string.`);
}

function num(i: Input, key: string): number;
function num(i: Input, key: string, optional: true): number | undefined;
function num(i: Input, key: string, optional = false): number | undefined {
  const v = i[key];
  if (v === undefined || v === null) return optional ? undefined : fail(`"${key}" is missing.`);
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fail(`"${key}" must be a number.`);
}

function rotation(i: Input): number | undefined {
  const r = num(i, 'rotation', true);
  if (r !== undefined && ![0, 90, 180, 270].includes(((r % 360) + 360) % 360)) fail('"rotation" must be 0, 90, 180 or 270.');
  return r;
}

function props(i: Input): Record<string, string> | undefined {
  const v = i.properties;
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) fail('"properties" must be an object of strings.');
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x)]));
}

function list(i: Input, key: string): string[] | undefined {
  const v = i[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(`"${key}" must be a list of strings.`);
  return v as string[];
}

// ---- the schematic -----------------------------------------------------------------------------

function sheet(bench: Bench): Doc {
  const d = bench.doc() ?? fail('No schematic is open. Open one with new_schematic.');
  if (d.type !== 'SCHEMATICS' && !isSchematicDoc(d)) fail('The open document is a board, not a schematic. Open a new schematic with new_schematic.');
  return d;
}

/** Runs a change on the schematic and returns its result; a ToolError leaves it unchanged. */
function change<T>(bench: Bench, fn: (d: Doc) => T): T {
  sheet(bench);
  let out: T | undefined;
  bench.edit((d) => {
    out = fn(d);
  });
  return out as T;
}

// ---- simulation --------------------------------------------------------------------------------

const V = (v: number) => formatEng(v, 'V');
const A = (v: number) => formatEng(v, 'A');

const issueList = (doc: Doc, models: SpiceModel[]) =>
  checkSimulation(doc, models)
    .issues.filter((i) => i.severity !== 'info')
    .map((i) => `${i.kind}${i.ref ? ` ${i.ref}` : ''}${i.value ? ` (${i.value})` : ''}${i.suggestion ? `, try ${i.suggestion}` : ''}`);

async function runSpice(bench: Bench, doc: Doc, nl: NetlistResult, timeoutMs: number): Promise<Vector[]> {
  if (nl.errors.length) fail(`The simulation cannot start: ${nl.errors.map((e) => (e.key === 'noGround' ? 'there is no ground (GND)' : 'there are no simulated parts')).join(', ')}.`);
  try {
    return await bench.simulate(nl.netlist, timeoutMs);
  } catch (e) {
    const msg = (e as Error).message;
    const ex = explainSpiceError(msg, nl, doc);
    return fail(`ngspice failed (${ex.kind}${ex.parts.length ? `, parts ${ex.parts.map((p) => p.ref).join(', ')}` : ''}): ${msg.slice(0, 400)}`);
  }
}

/** Nets worth reporting: those with a label or more than one pin. */
function reportable(doc: Doc) {
  const named = namedNets(doc);
  const keep = named.conn.nets.map((n, i) => n.pins.length > 1 || !/^N\d+$/.test(named.names[i]));
  return { ...named, keep };
}

async function operatingPoint(bench: Bench, doc: Doc) {
  const models = bench.models();
  const nl = opNetlist(doc, bench.fileName(), models);
  const data = await runSpice(bench, doc, nl, 20_000);
  const vectors = new Map(data.map((d) => [d.name.toLowerCase(), Number(d.values[0])]));
  const { conn, names, keep } = reportable(doc);
  const live = liveValues(doc, nl, vectors, conn);
  const nets: Record<string, string> = {};
  for (const [n, volts] of live.netVoltage) if (keep[n]) nets[names[n]] = V(volts);
  const volt = (s: SymbolItem, i: number) => live.netVoltage.get(conn.netOfPin.get(pinKey(s.id, i)) ?? -1);
  const parts = doc.items
    .filter((i): i is SymbolItem => i.kind === 'symbol' && i.pins.length > 0 && !globalNetKey(i))
    .flatMap((s): Record<string, unknown>[] => {
      const i = live.deviceCurrent.get(s.id);
      if (s.pins.length === 2 && i !== undefined) {
        const u = (volt(s, 0) ?? NaN) - (volt(s, 1) ?? NaN);
        return [{ ref: s.name, current: A(i), voltage: Number.isFinite(u) ? V(u) : undefined, power: Number.isFinite(u) ? formatEng(Math.abs(u * i), 'W') : undefined }];
      }
      const pins = Object.fromEntries(
        s.pins.flatMap((p, k) => {
          const u = volt(s, k);
          const c = live.pinCurrent.get(pinKey(s.id, k));
          if (u === undefined && c === undefined) return [];
          return [[p.name && !/^\d+$/.test(p.name) ? p.name : String(p.num), [u !== undefined ? V(u) : undefined, c !== undefined ? `${A(c)} in` : undefined].filter(Boolean).join(', ')]];
        }),
      );
      return Object.keys(pins).length ? [{ ref: s.name, pins }] : [];
    });
  const warnings = issueList(doc, models);
  return { analysis: 'op', nets, parts, warnings: warnings.length ? warnings : undefined };
}

/** Minimum, maximum, average and (for periodic signals) the frequency of a waveform. */
export function waveStats(time: number[], v: number[]) {
  let min = Infinity;
  let max = -Infinity;
  let area = 0;
  for (let i = 0; i < v.length; i++) {
    min = Math.min(min, v[i]);
    max = Math.max(max, v[i]);
    if (i) area += ((v[i] + v[i - 1]) / 2) * (time[i] - time[i - 1]);
  }
  const span = time[time.length - 1] - time[0];
  // frequency from the rising crossings of the middle level in the second half (after start-up)
  const from = time[0] + span / 2;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < v.length; i++) if (time[i] >= from) [lo, hi] = [Math.min(lo, v[i]), Math.max(hi, v[i])];
  const mid = (lo + hi) / 2;
  const rises: number[] = [];
  for (let i = 1; i < v.length; i++) if (time[i] >= from && v[i - 1] < mid && v[i] >= mid && hi - lo > 1e-3 * Math.max(1, Math.abs(hi))) rises.push(time[i]);
  const frequency = rises.length >= 3 ? (rises.length - 1) / (rises[rises.length - 1] - rises[0]) : undefined;
  return { min, max, avg: span > 0 ? area / span : v[0], end: v[v.length - 1], frequency };
}

async function transient(bench: Bench, doc: Doc, input: Input) {
  const stop = parseEng(str(input, 'stop', true) ?? '20m');
  if (stop === undefined || !(stop >= 1e-6 && stop <= 60)) fail('"stop" must be a time between 1u and 60 (seconds), e.g. "10m".');
  const models = bench.models();
  const nl = buildNetlist(doc, bench.fileName(), models, { analysis: `.tran ${(stop! / 2000).toPrecision(4)} ${stop!.toPrecision(6)}`, uic: true });
  // half connected parts must not make the matrix singular
  nl.netlist = nl.netlist.replace(/^(\.tran\b.*)$/m, '.options rshunt=1e12\n$1');
  const { conn, names, keep } = reportable(doc);
  const wanted = list(input, 'nets');
  const nets = wanted?.length
    ? wanted.map((w) => {
        if (w.includes('.')) {
          const p = pinOf(doc, w);
          return { label: w, net: conn.netOfPin.get(pinKey(p.item.id, p.index)) ?? -1 };
        }
        const n = names.findIndex((x) => x.toLowerCase() === w.toLowerCase());
        return n >= 0 ? { label: names[n], net: n } : fail(`There is no net "${w}". Nets: ${names.filter((_, i) => keep[i]).join(', ')}.`);
      })
    : names.flatMap((label, net) => (keep[net] && label !== 'GND' ? [{ label, net }] : [])).slice(0, 12);
  const data = await runSpice(bench, doc, nl, 30_000);
  const [time, ...rest] = data;
  const vectors = new Map(rest.map((d) => [d.name.toLowerCase(), d.values.map(Number)]));
  const out: Record<string, unknown> = {};
  for (const { label, net } of nets) {
    const node = nl.nodeOfNet.get(net);
    const v = node === '0' ? time.values.map(() => 0) : node ? vectors.get(`v(${node})`) : undefined;
    if (!v) {
      out[label] = 'not simulated (the net has no part in the simulation)';
      continue;
    }
    const s = waveStats(time.values.map(Number), v);
    out[label] = { min: V(s.min), max: V(s.max), average: V(s.avg), end: V(s.end), frequency: s.frequency ? formatEng(s.frequency, 'Hz') : undefined };
  }
  const warnings = issueList(doc, models);
  return { analysis: 'tran', stop: formatEng(stop!, 's'), nets: out, warnings: warnings.length ? warnings : undefined };
}

// ---- dispatch ---------------------------------------------------------------------------------

async function dispatch(bench: Bench, name: string, input: Input): Promise<unknown> {
  switch (name) {
    case 'get_circuit':
      return describe(sheet(bench), bench.fileName(), bench.models());
    case 'search_symbols':
      return searchSymbols(bench.symbols(), str(input, 'query'), num(input, 'limit', true) ?? 8);
    case 'place_part': {
      const p = {
        symbol: str(input, 'symbol'),
        x: num(input, 'x'),
        y: num(input, 'y'),
        pin: str(input, 'pin', true),
        rotation: rotation(input),
        mirror: input.mirror === true,
        ref: str(input, 'ref', true),
        value: str(input, 'value', true),
        properties: props(input),
      };
      return change(bench, (d) => placePart(d, bench.symbols(), bench.layer(), p));
    }
    case 'connect': {
      const via = input.via;
      if (via !== undefined && (!Array.isArray(via) || via.some((p) => !p || typeof p !== 'object' || !Number.isFinite((p as { x: unknown }).x) || !Number.isFinite((p as { y: unknown }).y))))
        fail('"via" must be a list of points {x, y}.');
      const c = { from: str(input, 'from'), to: str(input, 'to'), via: via as { x: number; y: number }[] | undefined };
      return change(bench, (d) => connect(d, bench.layer(), c));
    }
    case 'add_label': {
      const l = { pin: str(input, 'pin'), name: str(input, 'name') };
      return change(bench, (d) => addLabel(d, bench.symbols(), bench.layer(), l));
    }
    case 'update_part': {
      const u = {
        ref: str(input, 'ref'),
        value: str(input, 'value', true),
        properties: props(input),
        new_ref: str(input, 'new_ref', true),
        rotation: rotation(input),
        x: num(input, 'x', true),
        y: num(input, 'y', true),
        pin: str(input, 'pin', true),
      };
      return change(bench, (d) => updatePart(d, u));
    }
    case 'delete': {
      const del = { refs: list(input, 'refs'), ids: list(input, 'ids') ?? list(input, 'wires') };
      if (!del.refs?.length && !del.ids?.length) fail('Give "refs" or "ids" to delete.');
      return change(bench, (d) => deleteItems(d, del));
    }
    case 'simulate': {
      const doc = sheet(bench);
      const analysis = str(input, 'analysis');
      if (analysis === 'op') return operatingPoint(bench, doc);
      if (analysis === 'tran') return transient(bench, doc, input);
      return fail('"analysis" must be "op" or "tran".');
    }
    case 'new_schematic': {
      const n = str(input, 'name', true)?.replace(/[\\/:*?"<>|]+/g, '').trim();
      bench.newSchematic(n || undefined);
      const d = sheet(bench);
      return { document: bench.fileName(), size: { w: d.width, h: d.height }, note: 'The new schematic is empty and open in the editor. Start placing at about (96, 96).' };
    }
    default:
      return fail(`There is no tool "${name}".`);
  }
}

/** Runs one tool call of Claude's. */
export async function runTool(bench: Bench, name: string, input: unknown): Promise<ToolOutcome> {
  try {
    const out = await dispatch(bench, name, input && typeof input === 'object' ? (input as Input) : {});
    return { content: JSON.stringify(out), isError: false };
  } catch (e) {
    if (e instanceof ToolError) return { content: e.message, isError: true };
    return { content: `The tool failed: ${(e as Error).message}`, isError: true };
  }
}

/** The part a tool call is about, for the activity lines of the panel. */
export function toolSubject(name: string, input: unknown, content?: string): string {
  const i = (input && typeof input === 'object' ? input : {}) as Input;
  const s = (k: string) => (typeof i[k] === 'string' || typeof i[k] === 'number' ? String(i[k]) : '');
  switch (name) {
    case 'place_part': {
      let ref = s('ref');
      try {
        ref = (JSON.parse(content ?? '{}') as { ref?: string }).ref ?? ref;
      } catch {
        /* an error text */
      }
      return [ref, s('symbol')].filter(Boolean).join(' · ');
    }
    case 'connect':
      return `${s('from')} → ${s('to')}`;
    case 'add_label':
      return `${s('pin')} → ${s('name')}`;
    case 'update_part':
      return s('ref');
    case 'delete':
      return [...((i.refs as string[]) ?? []), ...(((i.ids as string[]) ?? []).length ? [`${(i.ids as string[]).length}×`] : [])].join(', ');
    case 'search_symbols':
      return s('query');
    case 'simulate':
      return s('analysis') === 'tran' ? `tran ${s('stop')}`.trim() : 'op';
    case 'new_schematic':
      return s('name');
    default:
      return '';
  }
}

