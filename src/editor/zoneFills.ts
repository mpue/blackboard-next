// Copper zone fills, cached per item list. Tracks and vias get the nets they
// are connected to first, so freely drawn tracks join the pour of their net.

import { useEffect, useMemo, useState } from 'react';
import type { Doc, Item, PcbSettings } from '../model/types.ts';
import { computePcbConnectivity } from '../pcb/connectivity.ts';
import { fillAllZones, zoneFillPath, type MultiPolygon } from '../pcb/zones.ts';

const cache = new WeakMap<Item[], { pcb: PcbSettings | undefined; fills: Map<string, MultiPolygon> }>();

/** Copy of the document with derived nets on tracks and vias. */
export function withDerivedNets(doc: Doc): Doc {
  const conn = computePcbConnectivity(doc);
  const items = doc.items.map((it) => {
    if (it.kind !== 'track' && it.kind !== 'via') return it;
    const net = conn.netOfItem.get(it.id);
    return net && net !== it.net ? { ...it, net } : it;
  });
  return { ...doc, items };
}

export function zoneFillsOf(doc: Doc): Map<string, MultiPolygon> | undefined {
  if (doc.type !== 'PCB' || !doc.items.some((i) => i.kind === 'zone')) return undefined;
  const hit = cache.get(doc.items);
  if (hit && hit.pcb === doc.pcb) return hit.fills;
  const fills = fillAllZones(withDerivedNets(doc));
  cache.set(doc.items, { pcb: doc.pcb, fills });
  return fills;
}

/** Zone fills for the canvas, recomputed shortly after the edits settle. */
export function useZoneFills(doc: Doc | undefined): { fills?: Map<string, MultiPolygon>; paths?: Map<string, string> } {
  const [fills, setFills] = useState<Map<string, MultiPolygon> | undefined>(undefined);
  const items = doc?.items;
  const pcb = doc?.pcb;
  useEffect(() => {
    if (!doc || doc.type !== 'PCB') {
      setFills(undefined);
      return;
    }
    const cached = cache.get(doc.items);
    if (cached && cached.pcb === doc.pcb) {
      setFills(cached.fills);
      return;
    }
    const timer = setTimeout(() => setFills(zoneFillsOf(doc)), 150);
    return () => clearTimeout(timer);
  }, [items, pcb]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => (fills ? new Map([...fills].map(([id, mp]) => [id, zoneFillPath(mp)])) : undefined), [fills]);
  return { fills, paths };
}
