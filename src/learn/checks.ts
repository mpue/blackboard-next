// Evaluation of lesson checks against the learner's document.

import type { Doc, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey, type Connectivity } from '../spice/connectivity.ts';
import type { LiveValues } from '../spice/live.ts';
import { spiceValue } from '../spice/netlist.ts';
import { parseEng } from '../model/ops.ts';
import type { LessonCheck, PinRef, SymbolMatch } from './types.ts';

export interface CheckContext {
  doc: Doc;
  conn?: Connectivity;
  /** operating point of `doc`; voltage/current checks stay pending without it */
  live?: LiveValues | null;
  /** answers given to quiz checks, by `quizKey` */
  answers?: Record<string, number>;
  /** key of the step being evaluated (for quizzes) */
  quizKey?: string;
  /** PCB state of the active document */
  pcb?: { unrouted: number; drcErrors?: number };
}

/** pending: the check needs data that is not there yet (live values, a quiz answer) */
export type CheckResult = 'pass' | 'fail' | 'pending';

const symbols = (doc: Doc) => doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');

export function findRef(doc: Doc, ref: string): SymbolItem | undefined {
  const r = ref.trim().toLowerCase();
  return symbols(doc).find((s) => s.name.trim().toLowerCase() === r);
}

export function matches(s: SymbolItem, m: SymbolMatch): boolean {
  if (m.spiceType && s.spiceType !== m.spiceType) return false;
  if (m.name && !new RegExp(m.name, 'i').test(`${s.symbolName} ${s.filename ?? ''}`)) return false;
  return true;
}

function pinIndex(s: SymbolItem, pin: number | string): number {
  if (typeof pin === 'number') return s.pins.findIndex((p) => p.num === pin);
  const name = pin.trim().toLowerCase();
  const byName = s.pins.findIndex((p) => (p.name ?? '').trim().toLowerCase() === name);
  if (byName >= 0) return byName;
  const n = Number(name);
  return Number.isFinite(n) ? s.pins.findIndex((p) => p.num === n) : -1;
}

/** Connectivity net of a pin reference. */
export function netOf(doc: Doc, conn: Connectivity, p: PinRef): number | undefined {
  const s = findRef(doc, p.ref);
  if (!s) return undefined;
  const i = pinIndex(s, p.pin);
  return i < 0 ? undefined : conn.netOfPin.get(pinKey(s.id, i));
}

/** Numeric value of a component ("4k7" -> 4700, "100n" -> 1e-7, "1M" on resistors -> 1e6). */
export function componentValue(s: SymbolItem): number | undefined {
  const raw = s.value.trim();
  if (s.spiceType === 'RESISTOR' || s.spiceType === 'CAPACITOR' || s.spiceType === 'INDUCTOR') {
    const v = spiceValue(raw, s.spiceType === 'RESISTOR' ? 'R' : s.spiceType === 'CAPACITOR' ? 'C' : 'L');
    return v === undefined ? undefined : parseFloat(v);
  }
  return parseEng(raw.replace(/[a-zA-Z]+$/, (u) => (/^(meg|[pnuµmkMG])$/.test(u) ? u : '')));
}

const within = (v: number, min: number, max: number) => v >= min - 1e-12 && v <= max + 1e-12;

function combine(results: CheckResult[], all: boolean): CheckResult {
  if (all) return results.includes('fail') ? 'fail' : results.includes('pending') ? 'pending' : 'pass';
  return results.includes('pass') ? 'pass' : results.includes('pending') ? 'pending' : 'fail';
}

export function evaluate(check: LessonCheck, ctx: CheckContext): CheckResult {
  const { doc } = ctx;
  const conn = (ctx.conn ??= computeConnectivity(doc));
  switch (check.kind) {
    case 'symbol': {
      const n = symbols(doc).filter((s) => matches(s, check.match)).length;
      return n >= (check.min ?? 1) && n <= (check.max ?? Infinity) ? 'pass' : 'fail';
    }
    case 'connected':
    case 'notConnected': {
      const a = netOf(doc, conn, check.a);
      const b = netOf(doc, conn, check.b);
      const same = a !== undefined && a === b;
      return (check.kind === 'connected') === same ? 'pass' : 'fail';
    }
    case 'voltage': {
      if (!ctx.live) return 'pending';
      const a = netOf(doc, conn, check.at);
      if (a === undefined) return 'fail';
      const va = ctx.live.netVoltage.get(a);
      const b = check.ref ? netOf(doc, conn, check.ref) : undefined;
      const vb = check.ref ? (b === undefined ? undefined : ctx.live.netVoltage.get(b)) : 0;
      if (va === undefined || vb === undefined) return 'fail';
      return within(va - vb, check.min, check.max) ? 'pass' : 'fail';
    }
    case 'current': {
      if (!ctx.live) return 'pending';
      const s = findRef(doc, check.ref);
      const i = s ? ctx.live.deviceCurrent.get(s.id) : undefined;
      return i !== undefined && within(Math.abs(i), check.min, check.max) ? 'pass' : 'fail';
    }
    case 'value': {
      const s = findRef(doc, check.ref);
      const v = s ? componentValue(s) : undefined;
      return v !== undefined && within(v, check.min, check.max) ? 'pass' : 'fail';
    }
    case 'property': {
      const s = findRef(doc, check.ref);
      return s?.properties?.[check.key] === check.equals ? 'pass' : 'fail';
    }
    case 'quiz': {
      const a = ctx.quizKey ? ctx.answers?.[ctx.quizKey] : undefined;
      return a === undefined ? 'pending' : a === check.answer ? 'pass' : 'fail';
    }
    case 'isPcb':
      return doc.type === 'PCB' ? 'pass' : 'fail';
    case 'pcbRouted':
      return doc.type === 'PCB' && ctx.pcb?.unrouted === 0 && doc.items.some((i) => i.kind === 'footprint') ? 'pass' : 'fail';
    case 'drcClean':
      if (doc.type !== 'PCB') return 'fail';
      if (ctx.pcb?.drcErrors === undefined) return 'pending';
      return ctx.pcb.drcErrors === 0 ? 'pass' : 'fail';
    case 'all':
      return combine(
        check.checks.map((c) => evaluate(c, ctx)),
        true,
      );
    case 'any':
      return combine(
        check.checks.map((c) => evaluate(c, ctx)),
        false,
      );
  }
}

/** Whether a check needs the simulated operating point. */
export function needsLive(check: LessonCheck | undefined): boolean {
  if (!check) return false;
  if (check.kind === 'voltage' || check.kind === 'current') return true;
  if (check.kind === 'all' || check.kind === 'any') return check.checks.some(needsLive);
  return false;
}
