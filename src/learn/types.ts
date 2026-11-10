// Learning content: lessons made of steps whose tasks are checked
// automatically against the document the learner edits (structure, values,
// connections, simulated voltages and currents, PCB routing state).

import type { Doc, SpiceType, SymbolDef } from '../model/types.ts';

/** Text in both UI languages. Supports a small markdown subset: paragraphs,
 * **bold**, *italic*, `code`, lines starting with "- " (bullets) and $formulas$. */
export type L10n = { de: string; en: string };

/** A pin of a component in the lesson document: designator plus pin number or pin name. */
export interface PinRef {
  ref: string;
  pin: number | string;
}

export interface SymbolMatch {
  spiceType?: SpiceType;
  /** regular expression (source, case insensitive) on the library name of the symbol */
  name?: string;
}

export type LessonCheck =
  /** number of symbols matching (default: at least 1) */
  | { kind: 'symbol'; match: SymbolMatch; min?: number; max?: number }
  /** both pins on the same net */
  | { kind: 'connected'; a: PinRef; b: PinRef }
  | { kind: 'notConnected'; a: PinRef; b: PinRef }
  /** simulated DC voltage (live values) of `at` against `ref` (default ground), volts */
  | { kind: 'voltage'; at: PinRef; ref?: PinRef; min: number; max: number }
  /** simulated DC current through a component (magnitude), amperes */
  | { kind: 'current'; ref: string; min: number; max: number }
  /** component value (engineering notation parsed), e.g. ohms of R1 */
  | { kind: 'value'; ref: string; min: number; max: number }
  /** product of component values, e.g. R·C of a time constant */
  | { kind: 'product'; refs: string[]; min: number; max: number }
  /**
   * a component matching `match` sits between the nets of `a` and `b` (either way
   * round), optionally with its value in [min, max] — whatever its designator
   */
  | { kind: 'between'; a: PinRef; b: PinRef; match: SymbolMatch; min?: number; max?: number }
  /** symbol property, e.g. a switch being closed */
  | { kind: 'property'; ref: string; key: string; equals: string }
  /** multiple choice question answered in the lesson panel */
  | { kind: 'quiz'; question: L10n; options: L10n[]; answer: number }
  /** the active document is a PCB */
  | { kind: 'isPcb' }
  /** PCB without unrouted connections */
  | { kind: 'pcbRouted' }
  /** PCB without DRC errors */
  | { kind: 'drcClean' }
  | { kind: 'all'; checks: LessonCheck[] }
  | { kind: 'any'; checks: LessonCheck[] };

export interface LessonStep {
  /** what to do */
  text: L10n;
  /** done when this check passes; steps without a check are read and confirmed */
  check?: LessonCheck;
  /** shown on request */
  hint?: L10n;
  /** background shown once the step is done */
  explain?: L10n;
  /** switches the live values on (voltages and currents in the schematic) */
  live?: boolean;
}

export type LessonTopic = 'basics' | 'semiconductors' | 'analog' | 'digital' | 'pcb';

export interface Lesson {
  id: string;
  topic: LessonTopic;
  level: 1 | 2 | 3;
  minutes: number;
  title: L10n;
  summary: L10n;
  /** document the lesson starts with (opened as a new tab); empty schematic when absent */
  start?: (library: SymbolDef[], lang: 'de' | 'en') => Doc;
  steps: LessonStep[];
  /**
   * For tests only: turns the start document into a solution of every step,
   * so the test suite can prove the lesson is solvable.
   */
  solve?: (doc: Doc, library: SymbolDef[]) => Doc;
}

/** Encyclopedia entry for a kind of component. */
export interface ComponentInfo {
  id: string;
  title: L10n;
  /** which symbols this entry explains */
  match: SymbolMatch;
  summary: L10n;
  body: L10n;
  formulas?: { label: L10n; formula: string }[];
  /** typical values / ratings */
  facts?: { label: L10n; value: L10n }[];
  pitfalls?: L10n[];
  /** lesson ids that practise this component */
  lessons?: string[];
}
