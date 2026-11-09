// Design rule check results per document; the canvas shows their markers.

import { create } from 'zustand';
import type { Item } from '../model/types.ts';
import type { DrcViolation } from '../pcb/drc.ts';

interface DrcState {
  open: boolean;
  results: Record<string, { items: Item[]; violations: DrcViolation[] }>;
  focused?: string;
}

export const useDrc = create<DrcState>()(() => ({ open: false, results: {} }));

export function setDrcOpen(open: boolean) {
  useDrc.setState({ open });
}

export function setDrcResult(docId: string, items: Item[], violations: DrcViolation[]) {
  useDrc.setState((s) => ({ results: { ...s.results, [docId]: { items, violations } }, focused: undefined }));
}

export function focusViolation(id: string | undefined) {
  useDrc.setState({ focused: id });
}
