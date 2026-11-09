// Built-in footprint library: parametric THT and SMD footprints, generated once
// on first import, grouped by category and searchable.

import type { FootprintDef } from '../../model/types.ts';
import { smdFootprints } from './smd.ts';
import { thtFootprints } from './tht.ts';

export const FOOTPRINT_CATEGORIES: string[] = [
  'Resistors',
  'Capacitors',
  'Inductors',
  'Diodes',
  'LEDs',
  'Transistors',
  'ICs DIP',
  'ICs SMD',
  'Connectors',
  'Crystals',
  'Potentiometers',
  'Switches',
  'Mechanical',
  'Misc',
];

const order = (f: FootprintDef) => {
  const i = FOOTPRINT_CATEGORIES.indexOf(f.category);
  return i < 0 ? FOOTPRINT_CATEGORIES.length : i;
};

/**
 * Diodes and LEDs have the cathode on pad 1 (KiCad convention) while their
 * schematic symbols number the anode 1: naming the pads makes the schematic
 * to PCB mapping go by name (A/K) instead of by number.
 */
function namePolarity(fp: FootprintDef): FootprintDef {
  if (fp.category !== 'Diodes' && fp.category !== 'LEDs') return fp;
  const pads = fp.pads.filter((p) => !p.npth && p.num);
  if (pads.length !== 2 || !pads.some((p) => p.num === '1') || !pads.some((p) => p.num === '2')) return fp;
  for (const p of pads) p.name = p.num === '1' ? 'K' : 'A';
  return fp;
}

/** all footprints, grouped by category (THT before SMD within a group) */
export const FOOTPRINTS: FootprintDef[] = [...thtFootprints(), ...smdFootprints()].map(namePolarity).sort((a, b) => order(a) - order(b));

const byId = new Map(FOOTPRINTS.map((f) => [f.id, f]));

export function footprintById(id: string): FootprintDef | undefined {
  return byId.get(id);
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

interface Indexed {
  fp: FootprintDef;
  text: string;
  idTokens: Set<string>;
  tokens: Set<string>;
}

let index: Indexed[] | undefined;

function searchIndex(): Indexed[] {
  return (index ??= FOOTPRINTS.map((fp) => {
    const all = [fp.id, fp.name, fp.description, ...(fp.tags ?? [])].join(' ');
    return { fp, text: all.toLowerCase(), idTokens: new Set(tokens(fp.id)), tokens: new Set(tokens(all)) };
  }));
}

/**
 * Footprints whose id, name, description or tags contain every word of the
 * query (case insensitive). Whole word matches, in the id above all, rank first.
 */
export function searchFootprints(query: string): FootprintDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return FOOTPRINTS.slice();
  const hits: { fp: FootprintDef; score: number }[] = [];
  for (const e of searchIndex()) {
    if (!words.every((w) => e.text.includes(w))) continue;
    let score = 0;
    for (const w of words) score += e.idTokens.has(w) ? 3 : e.tokens.has(w) ? 2 : 0;
    if (e.fp.id.toLowerCase() === query.trim().toLowerCase()) score += 100;
    hits.push({ fp: e.fp, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.fp);
}
