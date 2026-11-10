// The analysis in words instead of SPICE syntax: "voltages over time for
// 10 ms", "frequency response from 10 Hz to 100 kHz", "operating point".

import type { Doc, SymbolItem } from '../model/types.ts';
import { fgenSettings, fmtNum, instrumentOf } from './instruments.ts';

export type AnalysisKind = 'schematic' | 'tran' | 'ac' | 'op';

export interface AnalysisSetup {
  kind: AnalysisKind;
  /** transient: simulated time in seconds */
  duration: number;
  /** AC sweep in Hz */
  from: number;
  to: number;
}

const ANALYSIS = /^\.(tran|ac|dc|op|noise|disto|tf|sens|pz)\b.*$/im;

/** Analysis directive written in the schematic as SPICE text, if any. */
export function schematicAnalysis(doc: Doc): string | undefined {
  for (const it of doc.items) {
    if (it.kind !== 'text' || it.textType !== 'SPICE_DIRECTIVE') continue;
    const m = ANALYSIS.exec(it.text.replace(/<[^>]*>/g, ''));
    if (m) return m[0].trim();
  }
  return undefined;
}

/** Frequencies of the signal sources (function generators and AC voltage sources). */
function sourceFrequencies(doc: Doc): number[] {
  const out: number[] = [];
  for (const it of doc.items) {
    if (it.kind !== 'symbol') continue;
    const s = it as SymbolItem;
    if (instrumentOf(s) === 'fgen') out.push(fgenSettings(s).frequency);
    else if (s.spiceType === 'VOLTAGE_SOURCE' && (s.properties?.mode ?? 'DC').toUpperCase() !== 'DC') {
      const f = parseFloat(s.properties?.frequency ?? '');
      const unit = { HZ: 1, KHZ: 1e3, MHZ: 1e6 }[(s.properties?.frequencyUnit ?? 'HZ').toUpperCase()] ?? 1;
      if (f > 0) out.push(f * unit);
    }
  }
  return out;
}

/** A sensible start: the schematic's own analysis, else five periods of the slowest source, else 10 ms. */
export function defaultSetup(doc: Doc): AnalysisSetup {
  const freqs = sourceFrequencies(doc).filter((f) => f > 0);
  const slowest = freqs.length ? Math.min(...freqs) : 0;
  const duration = slowest ? niceTime(5 / slowest) : 0.01;
  return { kind: schematicAnalysis(doc) ? 'schematic' : 'tran', duration, from: 10, to: 100e3 };
}

/** Rounds up to 1, 2 or 5 times a power of ten. */
export function niceTime(t: number): number {
  const e = Math.floor(Math.log10(t));
  for (const m of [1, 2, 5, 10]) if (m * 10 ** e >= t * 0.999) return parseFloat((m * 10 ** e).toPrecision(3));
  return t;
}

/** The SPICE directive for a setup; undefined keeps the one written in the schematic. */
export function analysisDirective(s: AnalysisSetup): string | undefined {
  switch (s.kind) {
    case 'tran':
      return `.tran ${fmtNum(s.duration / 1000)} ${fmtNum(s.duration)}`;
    case 'ac':
      return `.ac dec 50 ${fmtNum(Math.max(1e-3, s.from))} ${fmtNum(Math.max(s.from * 10, s.to))}`;
    case 'op':
      return '.op';
    default:
      return undefined;
  }
}

/** A frequency response needs a source with an AC magnitude (generators and AC sources have one). */
export const hasAcSource = (netlist: string) => /^V\S*\s+\S+\s+\S+\s.*\bAC\s+1\b/im.test(netlist);
