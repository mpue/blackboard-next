// Derived PCB state for the canvas: copper connectivity, ratsnest and net
// highlighting. Recomputed when the items change.

import { useMemo } from 'react';
import type { Doc } from '../model/types.ts';
import { computePcbConnectivity, ratsnest, type PcbConnectivity, type RatsLine, type ZoneFills } from '../pcb/connectivity.ts';

export interface PcbDerived {
  conn: PcbConnectivity;
  rats: RatsLine[];
  /** net of every copper object key (pads: `${id}:${index}`, others: item id) */
  netOfKey: Map<string, string>;
}

export function derivePcb(doc: Doc, zoneFills?: ZoneFills): PcbDerived {
  const conn = computePcbConnectivity(doc, zoneFills);
  const netOfKey = new Map<string, string>();
  conn.objects.forEach((o, i) => {
    const pads = conn.islandNets.get(conn.island[i]);
    const net = o.kind === 'pad' ? o.net : (conn.netOfItem.get(o.itemId) ?? (pads?.size === 1 ? [...pads][0] : o.net));
    if (net) netOfKey.set(o.key, net);
  });
  return { conn, rats: ratsnest(doc, conn), netOfKey };
}

export function usePcbDerived(doc: Doc | undefined, zoneFills?: ZoneFills): PcbDerived | undefined {
  const items = doc?.items;
  const layers = doc?.layers;
  return useMemo(
    () => (doc && doc.type === 'PCB' ? derivePcb(doc, zoneFills) : undefined),
    [items, layers, zoneFills], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** Keys of all copper of `net`, for highlighting. */
export function netKeys(derived: PcbDerived | undefined, net: string | undefined): Set<string> | undefined {
  if (!derived || !net) return undefined;
  const keys = new Set<string>();
  for (const [k, n] of derived.netOfKey) if (n === net) keys.add(k);
  return keys;
}
