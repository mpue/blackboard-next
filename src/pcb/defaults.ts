// Defaults for new PCB documents: layer stack and design rules suitable for
// hobby fabs (JLCPCB/PCBWay/Aisler class) and home etching.

import type { DesignRules, Doc, Layer, LayerRole } from '../model/types.ts';
import { mm } from './units.ts';

export function defaultRules(): DesignRules {
  return {
    clearance: mm(0.2),
    trackWidth: mm(0.3),
    powerTrackWidth: mm(0.6),
    viaDiameter: mm(0.8),
    viaDrill: mm(0.4),
    minTrackWidth: mm(0.15),
    minDrill: mm(0.3),
    minAnnularRing: mm(0.13),
    edgeClearance: mm(0.3),
    copperLayers: 2,
  };
}

/** Layer colours follow the usual EDA conventions. */
export function pcbLayers(): Layer[] {
  const mk = (id: string, name: string, color: string, role: LayerRole): Layer => ({ id, name, visible: true, locked: false, opacity: 1, color, role });
  return [
    mk('L0', 'Top Silk', '#f2f2f2', 'top-silk'),
    mk('L1', 'Top', '#d6453d', 'top-copper'),
    mk('L2', 'Bottom', '#3d7fd6', 'bottom-copper'),
    mk('L3', 'Bottom Silk', '#e3c76b', 'bottom-silk'),
    mk('L4', 'Board', '#000000', 'outline'),
  ];
}

export function createPcbDoc(width = mm(100), height = mm(80)): Doc {
  return { width, height, type: 'PCB', layers: pcbLayers(), items: [], parts: {}, pcb: { rules: defaultRules() } };
}
