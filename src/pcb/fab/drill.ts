// Excellon drill files (metric, decimal coordinates) for plated and non plated
// holes. Same origin and orientation as the Gerber files (Y flipped).

import type { Doc } from '../../model/types.ts';
import { toMm } from '../units.ts';
import { holes, type Hole } from './layers.ts';
import { GENERATOR, safeProjectName, type FabFile } from './types.ts';

const mm3 = (u: number) => {
  const v = toMm(u);
  return (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
};

export function excellon(doc: Doc, hs: Hole[], fileFunction: string): string {
  const sizes = [...new Set(hs.map((h) => mm3(h.d)))].sort((a, b) => parseFloat(a) - parseFloat(b));
  const out = [
    'M48',
    '; DRILL file {BlackBoard Next 3.0}',
    '; FORMAT={-:-/ absolute / metric / decimal}',
    `; #@! TF.GenerationSoftware,${GENERATOR}`,
    `; #@! TF.FileFunction,${fileFunction}`,
    'FMAT,2',
    'METRIC,TZ',
    ...sizes.map((s, i) => `T${i + 1}C${s}`),
    '%',
    'G90',
    'G05',
  ];
  sizes.forEach((s, i) => {
    out.push(`T${i + 1}`);
    for (const h of hs) if (mm3(h.d) === s) out.push(`X${mm3(h.x)}Y${mm3(doc.height - h.y)}`);
  });
  out.push('M30');
  return out.join('\n') + '\n';
}

/** `<project>-PTH.drl` (plated pads and vias) and `<project>-NPTH.drl`. */
export function drillFiles(doc: Doc, project: string): FabFile[] {
  const p = safeProjectName(project);
  const hs = holes(doc);
  const layers = doc.pcb?.rules.copperLayers ?? 2;
  return [
    { name: `${p}-PTH.drl`, content: excellon(doc, hs.filter((h) => h.plated), `Plated,1,${layers},PTH`) },
    { name: `${p}-NPTH.drl`, content: excellon(doc, hs.filter((h) => !h.plated), `NonPlated,1,${layers},NPTH`) },
  ];
}
