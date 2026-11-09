// Creating footprint items: designator prefixes and the side/layer a new
// footprint goes to.

import type { CopperSide, Doc, FootprintDef, FootprintItem } from '../model/types.ts';
import { uid } from '../model/id.ts';
import { nextDesignator } from '../model/ops.ts';

const PREFIX: [RegExp, string][] = [
  [/^Resistors/i, 'R'],
  [/^Capacitors/i, 'C'],
  [/^Inductors/i, 'L'],
  [/^Diodes/i, 'D'],
  [/^LEDs/i, 'D'],
  [/^Transistors/i, 'Q'],
  [/^ICs/i, 'U'],
  [/^Connectors/i, 'J'],
  [/^Crystals/i, 'Y'],
  [/^Potentiometers/i, 'RV'],
  [/^Switches/i, 'SW'],
  [/^Mechanical/i, 'H'],
];

export function designatorForFootprint(def: FootprintDef): string {
  if (/^TestPoint/i.test(def.id)) return 'TP';
  if (/^Buzzer/i.test(def.id)) return 'BZ';
  for (const [re, p] of PREFIX) if (re.test(def.category)) return p;
  return 'U';
}

/** Side a new footprint goes to: the side of the layer being edited, top by default. */
export function sideForLayer(doc: Doc, layerId: string): CopperSide {
  const role = doc.layers.find((l) => l.id === layerId)?.role;
  return role === 'bottom-copper' || role === 'bottom-silk' ? 'bottom' : 'top';
}

export function copperLayerFor(doc: Doc, side: CopperSide): string {
  return doc.layers.find((l) => l.role === (side === 'top' ? 'top-copper' : 'bottom-copper'))?.id ?? doc.layers[0].id;
}

export function makeFootprintItem(doc: Doc, def: FootprintDef, x: number, y: number, side: CopperSide, name?: string, value = ''): FootprintItem {
  return {
    id: uid(),
    kind: 'footprint',
    layer: copperLayerFor(doc, side),
    x,
    y,
    rotation: 0,
    side,
    name: name ?? nextDesignator(doc, designatorForFootprint(def)),
    value,
    footprint: structuredClone(def),
    nets: {},
  };
}
