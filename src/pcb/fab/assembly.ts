// Assembly outputs: pick and place (centroid) file and bill of materials.

import type { Doc, FootprintItem } from '../../model/types.ts';
import type { Pt } from '../../geometry/geom.ts';
import { footprintToWorld } from '../geometry.ts';
import { toMm } from '../units.ts';
import { footprintsOf } from './layers.ts';

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const fix = (v: number, d: number) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);

/** Counter clockwise degrees in [0, 360) as most assembly houses expect. */
export function placementRotation(rotation: number): number {
  const r = (((360 - rotation) % 360) + 360) % 360;
  const rounded = Math.round(r * 1000) / 1000;
  return rounded >= 360 ? 0 : rounded;
}

/**
 * Part centre (centre of the pads; the origin for parts without pads) in
 * world coordinates: assembly houses place by centroid, while THT
 * footprints have their origin on pad 1.
 */
export function placementCentre(fp: FootprintItem): Pt {
  const pads = fp.footprint.pads.filter((p) => !p.npth).map((p) => footprintToWorld(fp, p));
  if (!pads.length) return { x: fp.x, y: fp.y };
  const xs = pads.map((p) => p.x);
  const ys = pads.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Part centres in mm, origin at the lower left board corner (Y up). */
export function pickAndPlaceCsv(doc: Doc): string {
  const rows = footprintsOf(doc)
    .slice()
    .sort((a, b) => natural.compare(a.name, b.name))
    .map((fp) => {
      const c = placementCentre(fp);
      return [q(fp.name), q(fp.value ?? ''), q(fp.footprint.id), fix(toMm(c.x), 4), fix(toMm(doc.height - c.y), 4), String(placementRotation(fp.rotation)), fp.side].join(',');
    });
  return ['Designator,Value,Package,PosX,PosY,Rotation,Side', ...rows].join('\n') + '\n';
}

/** One line per value + footprint. */
export function bomCsv(doc: Doc): string {
  const groups = new Map<string, { refs: string[]; value: string; footprint: string }>();
  for (const fp of footprintsOf(doc)) {
    const value = fp.value ?? '';
    const key = `${value}\u0000${fp.footprint.id}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { refs: [], value, footprint: fp.footprint.id }));
    g.refs.push(fp.name);
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, refs: g.refs.sort(natural.compare) }))
    .sort((a, b) => natural.compare(a.refs[0] ?? '', b.refs[0] ?? ''))
    .map((g) => [q(g.refs.join(', ')), String(g.refs.length), q(g.value), q(g.footprint)].join(','));
  return ['"Designators","Quantity","Value","Footprint"', ...rows].join('\n') + '\n';
}
