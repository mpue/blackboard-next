// Shared helpers of the lesson definitions: bilingual texts, the title block
// of start documents, common parts and small document edits for the
// test-only solutions.

import type { Doc, SymbolDef, SymbolItem, TextItem } from '../../model/types.ts';
import type { Pt } from '../../geometry/geom.ts';
import { RASTER } from '../../model/types.ts';
import { CircuitBuilder, type PlaceOptions } from '../build.ts';
import type { L10n, Lesson, LessonCheck, PinRef, SymbolMatch } from '../types.ts';

export type Lang = 'de' | 'en';
export type Solver = (doc: Doc, library: SymbolDef[]) => Doc;

/** Text in both languages. */
export const t = (de: string, en: string): L10n => ({ de, en });

/** A lesson plus test-only data. */
export interface LessonDef extends Lesson {
  /**
   * For tests only: steps whose check holds in an intermediate state that a
   * later step changes again ("first 9 mA, then 3 mA"), as step index ->
   * solver of that state. All other steps are verified on `solve`.
   */
  stages?: Record<number, Solver>;
}

// ---- checks --------------------------------------------------------------------------------

const pinRef = (ref: string, pin: number | string): PinRef => ({ ref, pin });

export const connected = (a: string, pa: number | string, b: string, pb: number | string): LessonCheck => ({ kind: 'connected', a: pinRef(a, pa), b: pinRef(b, pb) });
export const notConnected = (a: string, pa: number | string, b: string, pb: number | string): LessonCheck => ({ kind: 'notConnected', a: pinRef(a, pa), b: pinRef(b, pb) });
export const value = (ref: string, min: number, max: number): LessonCheck => ({ kind: 'value', ref, min, max });
export const current = (ref: string, min: number, max: number): LessonCheck => ({ kind: 'current', ref, min, max });
export const property = (ref: string, key: string, equals: string): LessonCheck => ({ kind: 'property', ref, key, equals });
export const all = (...checks: LessonCheck[]): LessonCheck => ({ kind: 'all', checks });
export const any = (...checks: LessonCheck[]): LessonCheck => ({ kind: 'any', checks });

/** Voltage of a pin against ground, or against `ref` when given. */
export function voltage(at: [string, number | string], min: number, max: number, ref?: [string, number | string]): LessonCheck {
  return { kind: 'voltage', at: pinRef(...at), ref: ref ? pinRef(...ref) : undefined, min, max };
}

export const quiz = (question: L10n, options: L10n[], answer: number): LessonCheck => ({ kind: 'quiz', question, options, answer });

/** Two terminal part `ref` connected between the nets of `a` and `b`, either way round. */
export function between(ref: string, a: [string, number | string], b: [string, number | string]): LessonCheck {
  return any(all(connected(ref, 1, ...a), connected(ref, 2, ...b)), all(connected(ref, 2, ...a), connected(ref, 1, ...b)));
}

/**
 * Some part matching `match` between the nets of `a` and `b` (either way round),
 * optionally with its value in [min, max] – whatever the learner named it.
 */
export function anyBetween(a: [string, number | string], b: [string, number | string], match: SymbolMatch, min?: number, max?: number): LessonCheck {
  return { kind: 'between', a: pinRef(...a), b: pinRef(...b), match, min, max };
}

/** The product of component values (e.g. R · C of a time constant) within [min, max]. */
export const product = (refs: string[], min: number, max: number): LessonCheck => ({ kind: 'product', refs, min, max });

/** Bold title and a one line task at the top left of a start document. */
export function heading(b: CircuitBuilder, lang: Lang, title: L10n, task: L10n): void {
  b.text(48, 48, title[lang], 16, true);
  b.text(48, 72, task[lang], 12);
}

/**
 * SPICE directive text, e.g. ".tran 1m 600m": the slow motion view plays back
 * the schematic's own transient analysis instead of the default 20 ms.
 */
export function spiceDirective(b: CircuitBuilder, x: number, y: number, text: string): TextItem {
  const d = b.text(x, y, text, 12);
  d.textType = 'SPICE_DIRECTIVE';
  return d;
}

/**
 * Upright electrolytic capacitor, + (pin 1) on top, - (pin 2) 80 below. The
 * library symbol prints a fixed range ("470..4700u") next to the value, which
 * would contradict the value of the lesson, so that text is left out.
 */
export function elko(b: CircuitBuilder, ref: string, plus: Pt, value: string): SymbolItem {
  const s = b.add('C21-Elko-stehend_1a.xml', ref, plus, { pin: 1, value });
  s.shapes = s.shapes.filter((g) => !(g.kind === 'text' && g.textType === 'TEXT'));
  return s;
}

/** Battery as a DC source, + pin on `plus`, - pin 80 below. */
export function battery(b: CircuitBuilder, ref: string, plus: Pt, volts: number): SymbolItem {
  return b.add('Battery', ref, plus, { pin: 1, value: `${volts}V`, props: { mode: 'DC', dcVoltage: String(volts) } });
}

/** Vertical resistor (pin 1 on top, pin 2 96 below). */
export function resistorV(b: CircuitBuilder, ref: string, top: Pt, value: string): SymbolItem {
  return b.add('R#', ref, top, { pin: 1, rotation: 90, value });
}

/**
 * On/off switch, pin 1 on top and pin 2 80 below. The library symbol prints a
 * fixed "S1" next to its designator, which would label every switch "S1", so
 * that text is left out.
 */
export function switchV(b: CircuitBuilder, ref: string, top: Pt, closed: boolean): SymbolItem {
  const s = b.add('elektor-EIN-Schalter-klein', ref, top, { pin: 1, props: { closed: String(closed) } });
  s.shapes = s.shapes.filter((g) => !(g.kind === 'text' && g.textType === 'TEXT'));
  return s;
}

/** Horizontal resistor (pin 1 left, pin 2 96 to the right). */
export function resistorH(b: CircuitBuilder, ref: string, left: Pt, value: string): SymbolItem {
  return b.add('R#', ref, left, { pin: 1, value });
}

/**
 * The basic LED circuit: battery V1 on the left, R1 along the top, the red
 * LED D1 and below it the on/off switch S1 on the right, ground at the bottom left.
 */
export function ledLoop(b: CircuitBuilder, opts: { volts: number; r: string; closed: boolean }): void {
  const top = 160;
  const bottom = 416;
  const x = 352;
  const v1 = battery(b, 'V1', { x: 96, y: 240 }, opts.volts);
  const r1 = resistorH(b, 'R1', { x: 160, y: top }, opts.r);
  const d1 = ledV(b, 'D1', { x, y: 192 });
  const s1 = switchV(b, 'S1', { x, y: 304 }, opts.closed);
  b.wire(b.pin(v1, '+'), { x: 96, y: top }, b.pin(r1, 1));
  b.wire(b.pin(r1, 2), { x, y: top }, b.pin(d1, 'A'));
  b.wire(b.pin(d1, 'K'), b.pin(s1, 1));
  b.wire(b.pin(s1, 2), { x, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
  b.ground({ x: 96, y: bottom });
}

/** Vertical red LED (anode on top, cathode 80 below); its label reads upright, unlike the horizontal LED symbols. */
export function ledV(b: CircuitBuilder, ref: string, anode: Pt): SymbolItem {
  return b.add('LED-rot', ref, anode, { pin: 1, value: '5mm' });
}

/** Places a symbol like `CircuitBuilder.add`, optionally mirrored horizontally before the rotation. */
export function place(b: CircuitBuilder, name: string, ref: string, at: Pt, opts: PlaceOptions & { mirrorH?: boolean } = {}): SymbolItem {
  const s = b.add(name, ref, at, opts);
  if (opts.mirrorH) {
    s.mirrorH = true;
    const p = b.pin(s, opts.pin ?? s.pins[0].num);
    const snap = (v: number) => Math.round(v / RASTER) * RASTER;
    s.x += snap(at.x) - p.x;
    s.y += snap(at.y) - p.y;
  }
  return s;
}

// ---- edits for the solutions -----------------------------------------------------------------

/** The symbol with designator `ref` (throws when it is missing). */
export function symbol(doc: Doc, ref: string): SymbolItem {
  const s = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === ref);
  if (!s) throw new Error(`no symbol ${ref}`);
  return s;
}

/** Copy of `doc` changed by `fn`. */
export function edit(doc: Doc, fn: (d: Doc) => void): Doc {
  const d = structuredClone(doc);
  fn(d);
  return d;
}

/** Copy of `doc` with new values and properties. */
export function change(doc: Doc, changes: Record<string, { value?: string; props?: Record<string, string>; mirrorH?: boolean }>): Doc {
  return edit(doc, (d) => {
    for (const [ref, c] of Object.entries(changes)) {
      const s = symbol(d, ref);
      if (c.value !== undefined) s.value = c.value;
      if (c.props) s.properties = { ...(s.properties ?? {}), ...c.props };
      if (c.mirrorH !== undefined) s.mirrorH = c.mirrorH;
    }
  });
}

/** Copy of `doc` with symbols and wires added through a builder. */
export function extend(doc: Doc, library: SymbolDef[], fn: (b: CircuitBuilder, find: (ref: string) => SymbolItem) => void): Doc {
  return edit(doc, (d) => {
    const b = new CircuitBuilder(library);
    fn(b, (ref) => symbol(d, ref));
    d.items.push(...b.items.map((i) => ({ ...i, layer: d.layers[0].id })));
  });
}
