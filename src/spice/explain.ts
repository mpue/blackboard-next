// NGSpice error messages in plain words, with the parts they are about.

import type { Doc, SymbolItem } from '../model/types.ts';
import type { NetlistResult } from './netlist.ts';

export type ErrorKind = 'floating' | 'timestep' | 'model' | 'subckt' | 'syntax' | 'timeout' | 'vsourceLoop' | 'unknown';

export interface Explained {
  kind: ErrorKind;
  /** symbols the message names (element names mapped back to parts) */
  parts: { id: string; ref: string }[];
  /** name of a missing model / subcircuit */
  name?: string;
}

const RULES: [RegExp, ErrorKind][] = [
  [/singular matrix|gmin stepping failed|source stepping failed|no convergence in dc|iteration limit/i, 'floating'],
  [/timestep too small|time step too small|simulation\(s\) aborted/i, 'timestep'],
  [/unknown subckt|subcircuit .* not found|could not find .*subcircuit/i, 'subckt'],
  [/unable to find definition of model|could not find a valid modelname|unknown model|model .* not found/i, 'model'],
  [/voltage source loop|loop of voltage sources|inductor\/voltage source loop/i, 'vsourceLoop'],
  [/^timeout|took too long/i, 'timeout'],
  [/syntax error|unknown parameter|too few nodes|error on line|unrecognized/i, 'syntax'],
];

/** Classifies an ngspice error and finds the parts it mentions. */
export function explainSpiceError(message: string, net?: NetlistResult, doc?: Doc): Explained {
  const kind = RULES.find(([re]) => re.test(message))?.[1] ?? 'unknown';
  const parts: Explained['parts'] = [];
  if (net && doc) {
    const byId = new Map(doc.items.filter((i): i is SymbolItem => i.kind === 'symbol').map((s) => [s.id, s]));
    const words = new Set((message.toLowerCase().match(/[a-z][a-z0-9_.]*/g) ?? []).map((w) => w.replace(/^.*\./, '')));
    for (const e of net.elements) {
      const s = byId.get(e.symbolId);
      if (s && words.has(e.name.toLowerCase()) && !parts.some((p) => p.id === s.id)) parts.push({ id: s.id, ref: s.name });
    }
  }
  const name = /(?:model|subckt|subcircuit)\s+['"]?([\w/.-]+)/i.exec(message)?.[1];
  return { kind, parts, ...(name && (kind === 'model' || kind === 'subckt') ? { name } : {}) };
}
