// "Will this simulate?" – a check of a schematic in the words of a beginner,
// each finding with what can be done about it. Shared by the analysis, the
// instrument bench and the live values.

import type { Doc, SpiceModel, SpiceType, SymbolItem } from '../model/types.ts';
import { buildNetlist, isGround, lampOf, spiceValue, switchOf, type NetlistResult, type NetlistWarning } from './netlist.ts';
import { instrumentOf } from './instruments.ts';
import { globalNetKey } from './labels.ts';
import { GND_PINS, isMcu, mcuFirmware, VCC_PIN } from '../mcu/pinout.ts';

export type IssueKind =
  | 'empty'
  | 'noGround'
  | 'noSource'
  | 'badValue'
  | 'notSimulated'
  | 'pins'
  | 'noModel'
  | 'unconnected'
  | 'supplyAssumed'
  | 'mcuFirmware'
  | 'mcuPower'
  | 'mcuLiveOnly';

export interface SimIssue {
  kind: IssueKind;
  severity: 'error' | 'warning' | 'info';
  /** symbol concerned */
  id?: string;
  ref?: string;
  value?: string;
  /** badValue: a value that would work */
  suggestion?: string;
  /** notSimulated: the SPICE type the symbol most likely is */
  guess?: SpiceType;
  /** pins: what the netlist complained about */
  detail?: NetlistWarning['key'];
  volts?: number;
}

const RLC: Partial<Record<SpiceType, 'R' | 'C' | 'L'>> = { RESISTOR: 'R', CAPACITOR: 'C', INDUCTOR: 'L' };
export const DEFAULT_VALUE: Record<'R' | 'C' | 'L', string> = { R: '1k', C: '100n', L: '1m' };

/**
 * A value SPICE understands, derived from what the library symbol says:
 * "C220nF" -> "220n", "4,7..100p" -> "4.7p" (first of a range), "1u..1000u" -> "1u".
 */
export function suggestValue(raw: string, kind: 'R' | 'C' | 'L'): string {
  const s = raw.replace(/,/g, '.').replace(/µ/g, 'u');
  const range = /(\d+(?:\.\d+)?)\s*(meg|[pnumkg])?\s*\.\.\s*(\d+(?:\.\d+)?)\s*(meg|[pnumkg])?/i.exec(s);
  let candidate = '';
  if (range) candidate = `${range[1]}${range[2] ?? range[4] ?? ''}`;
  else {
    const m = /(\d+(?:\.\d+)?)\s*(meg|[pnumkg])?/i.exec(s);
    if (m) candidate = `${m[1]}${m[2] ?? ''}`;
  }
  return candidate && spiceValue(candidate, kind) ? candidate : DEFAULT_VALUE[kind];
}

const CONNECTOR = /stecker|buchse|klemme|connector|header|jack|l(ö|oe)tstift|anschluss|terminal|sub-?d|usb|xlr|scart|cinch/i;

/** SPICE type a drawing-only symbol most likely stands for, when that is clear enough. */
export function guessType(s: SymbolItem): SpiceType | undefined {
  const txt = `${s.symbolName} ${s.filename ?? ''}`.toLowerCase();
  const prefix = /^([A-Za-z]+)\d+$/.exec(s.name.trim())?.[1].toUpperCase();
  if (s.pins.length === 2) {
    if (/widerstand|resistor|\bntc\b|\bptc\b|\bldr\b|shunt/.test(txt) || prefix === 'R') return 'RESISTOR';
    if (/kondensator|capacitor|elko|tantal|keramik|ceramic|folie|styroflex/.test(txt) || prefix === 'C') return 'CAPACITOR';
    if (/spule|inductor|drossel|coil/.test(txt) || prefix === 'L') return 'INDUCTOR';
    if (/diode|\bled\b/.test(txt) || prefix === 'D' || prefix === 'LED') return 'DIODE';
  }
  const names = s.pins.map((p) => (p.name ?? '').trim().toUpperCase()).sort().join('');
  if (s.pins.length === 3 && names === 'BCE') return /pnp/.test(txt) ? 'PNP' : 'NPN';
  return undefined;
}

/** Symbols that are meant to be electrical parts (not marks, labels, instruments or plugs). */
function isPart(s: SymbolItem): boolean {
  if (s.pins.length < 2 || isGround(s) || instrumentOf(s) || globalNetKey(s) || switchOf(s) || lampOf(s) || isMcu(s)) return false;
  return true;
}

export interface Readiness {
  issues: SimIssue[];
  /** netlist the checks were made on (also tells which nodes exist) */
  netlist: NetlistResult;
}

export function checkSimulation(doc: Doc, models: SpiceModel[] = []): Readiness {
  const net = buildNetlist(doc, 'check', models);
  const issues: SimIssue[] = [];
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const parts = symbols.filter(isPart);
  const byName = new Map<string, SymbolItem[]>();
  for (const s of symbols) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
  const symbolOf = (name: string) => byName.get(name)?.shift();

  if (!parts.length && !symbols.some((s) => instrumentOf(s) || switchOf(s) || lampOf(s) || isMcu(s))) {
    issues.push({ kind: 'empty', severity: 'info' });
    return { issues, netlist: net };
  }
  if (net.errors.some((e) => e.key === 'noGround')) issues.push({ kind: 'noGround', severity: 'error' });
  const hasSource = net.elements.some((e) => e.type === 'VOLTAGE_SOURCE') || net.supplies.length > 0;
  if (!hasSource) issues.push({ kind: 'noSource', severity: 'warning' });

  for (const s of parts) {
    const kind = s.spiceType ? RLC[s.spiceType] : undefined;
    if (kind && !spiceValue(s.value, kind)) {
      issues.push({ kind: 'badValue', severity: 'error', id: s.id, ref: s.name, value: s.value, suggestion: suggestValue(s.value, kind) });
    }
    if (!s.spiceType && !CONNECTOR.test(`${s.symbolName} ${s.filename ?? ''}`) && !/^(J|K|X|CN|P)\d+$/i.test(s.name)) {
      issues.push({ kind: 'notSimulated', severity: 'warning', id: s.id, ref: s.name, guess: guessType(s) });
    }
  }

  for (const w of net.warnings) {
    if (w.key === 'value') continue; // reported as badValue with a suggestion
    const s = symbolOf(w.name);
    if (w.key === 'unconnected') issues.push({ kind: 'unconnected', severity: 'warning', id: s?.id, ref: w.name });
    else if (w.key === 'subckt') issues.push({ kind: 'noModel', severity: 'error', id: s?.id, ref: w.name });
    else issues.push({ kind: 'pins', severity: 'error', id: s?.id, ref: w.name, detail: w.key });
  }

  for (const m of net.mcus) {
    const s = symbols.find((x) => x.id === m.symbolId);
    if (!s) continue;
    if (m.nodes[VCC_PIN] === undefined || !GND_PINS.some((g) => m.nodes[g] !== undefined)) issues.push({ kind: 'mcuPower', severity: 'warning', id: s.id, ref: s.name });
    if (!mcuFirmware(s)) issues.push({ kind: 'mcuFirmware', severity: 'warning', id: s.id, ref: s.name });
    issues.push({ kind: 'mcuLiveOnly', severity: 'info', id: s.id, ref: s.name });
  }

  for (const sup of net.supplies) if (sup.assumed) issues.push({ kind: 'supplyAssumed', severity: 'info', ref: sup.name, volts: sup.volts });

  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, netlist: net };
}

export const isBlocking = (issues: SimIssue[]) => issues.some((i) => i.severity === 'error');
