import type { Doc, Item, PartDef, Pin, SymbolDef } from '../model/types.ts';
import { RASTER, isBoardLayer } from '../model/types.ts';
import { uid } from '../model/id.ts';
import { nextDesignator } from '../model/ops.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { snapTo, type Pt } from '../geometry/geom.ts';
import type { Placement } from '../store/store.ts';
import { INSTRUMENT_PREFIX, instrumentOf } from '../spice/instruments.ts';
import { makeFootprintItem, sideForLayer } from '../pcb/place.ts';

export function partsLayer(doc: Doc, current: string): string {
  if (doc.type === 'SCHEMATICS') return current;
  return doc.layers.find((l) => l.name.toLowerCase() === 'parts')?.id ?? current;
}

function anchorOffset(pins: Pin[], w: number, h: number): Pt {
  // the first pin lands on the raster so parts drop into the holes
  if (pins.length) return { x: pins[0].x, y: pins[0].y };
  return { x: snapTo(w / 2, RASTER), y: snapTo(h / 2, RASTER) };
}

export function designatorForSymbol(def: SymbolDef): string {
  const instrument = instrumentOf({ kind: 'symbol', properties: def.properties });
  if (instrument) return INSTRUMENT_PREFIX[instrument];
  const fromName = /^([A-Z]{1,3})\d*$/.exec(def.name)?.[1];
  if (fromName && fromName !== 'GND' && fromName !== 'VCC') return fromName;
  switch (def.spiceType) {
    case 'RESISTOR':
      return 'R';
    case 'CAPACITOR':
      return 'C';
    case 'INDUCTOR':
      return 'L';
    case 'DIODE':
      return 'D';
    case 'NPN':
    case 'PNP':
    case 'MOSFET':
      return 'Q';
    case 'VOLTAGE_SOURCE':
      return 'V';
    case 'SUBCIRCUIT':
      return 'X';
    case 'VOLTAGE_CONTROLLED_SWITCH':
      return 'S';
    default:
      return 'U';
  }
}

export function makePlacedItem(
  doc: Doc,
  placement: Placement,
  at: Pt,
  layer: string,
  snap: boolean,
  parts: (ref: string) => PartDef | undefined,
  snapStep = RASTER,
): Item | undefined {
  const s = (v: number) => (snap ? snapTo(v, RASTER) : Math.round(v));
  if (placement.kind === 'footprint') {
    const fine = (v: number) => (snap ? snapTo(v, snapStep) : v);
    return makeFootprintItem(doc, placement.def, fine(at.x), fine(at.y), sideForLayer(doc, layer));
  }
  if (placement.kind === 'part') {
    const def = parts(placement.ref);
    if (!def) return undefined;
    const o = anchorOffset(def.pins, def.width, def.height);
    return {
      id: uid(),
      kind: 'part',
      layer: partsLayer(doc, layer),
      x: s(at.x) - o.x,
      y: s(at.y) - o.y,
      rotation: 0,
      name: nextDesignator(doc, def.designator || 'U'),
      ref: def.file,
    };
  }
  const def = placement.def;
  const o = anchorOffset(def.pins, def.width, def.height);
  const special = /^(gnd|vcc|vdd|vss)$/i.test(def.name);
  const name = special ? def.name.toUpperCase() : nextDesignator(doc, designatorForSymbol(def));
  return symbolItemFromDef(def, s(at.x) - o.x, s(at.y) - o.y, layer, name);
}

export function editableLayer(doc: Doc, current: string): string | undefined {
  const l = doc.layers.find((x) => x.id === current);
  if (l && l.visible && !l.locked && !isBoardLayer(l)) return l.id;
  return doc.layers.find((x) => x.visible && !x.locked && !isBoardLayer(x))?.id;
}
