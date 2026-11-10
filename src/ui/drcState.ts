// Results of the design rule check (PCBs) and electrical rule check
// (schematics) per document; the canvas shows their markers.

import { create } from 'zustand';
import type { Item } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';

/** One finding, already translated. */
export interface CheckRow {
  id: string;
  severity: 'error' | 'warning';
  at: Pt;
  items: string[];
  text: string;
}

interface DrcState {
  open: boolean;
  results: Record<string, { items: Item[]; violations: CheckRow[] }>;
  focused?: string;
}

export const useDrc = create<DrcState>()(() => ({ open: false, results: {} }));

export function setDrcOpen(open: boolean) {
  useDrc.setState({ open });
}

export function setDrcResult(docId: string, items: Item[], violations: CheckRow[]) {
  useDrc.setState((s) => ({ results: { ...s.results, [docId]: { items, violations } }, focused: undefined }));
}

export function focusViolation(id: string | undefined) {
  useDrc.setState({ focused: id });
}
