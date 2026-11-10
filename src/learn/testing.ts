// Test helpers (node only): the shipped library and a direct ngspice run of
// the operating point, so lesson tests can prove that solutions pass.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, SpiceModel, SymbolDef } from '../model/types.ts';
import { liveValues, opNetlist, type LiveValues } from '../spice/live.ts';

const lib = join(import.meta.dirname, '..', '..', 'public', 'library');

export const librarySymbols = (): SymbolDef[] => JSON.parse(readFileSync(join(lib, 'symbols.json'), 'utf8')) as SymbolDef[];
export const libraryModels = (): SpiceModel[] => JSON.parse(readFileSync(join(lib, 'models.json'), 'utf8')) as SpiceModel[];

let engine: Promise<{ setNetList(n: string): void; runSim(): Promise<{ data: { name: string; values: unknown[] }[] }> }> | undefined;

async function sim() {
  engine ??= (async () => {
    const { Simulation } = await import('eecircuit-engine');
    const s = new Simulation();
    await s.start();
    return s as unknown as { setNetList(n: string): void; runSim(): Promise<{ data: { name: string; values: unknown[] }[] }> };
  })();
  return engine;
}

/** Operating point of a schematic as the editor's live values compute it. */
export async function operatingPoint(doc: Doc, models: SpiceModel[] = libraryModels()): Promise<LiveValues> {
  const nl = opNetlist(doc, 'test', models);
  if (nl.errors.length) throw new Error(`netlist errors: ${nl.errors.map((e) => e.key).join(', ')}`);
  const s = await sim();
  s.setNetList(nl.netlist);
  const r = await s.runSim();
  const vectors = new Map(r.data.map((d) => [d.name.toLowerCase(), Number(d.values[0])]));
  return liveValues(doc, nl, vectors);
}
