import type { Draft } from 'immer';
import { beginGesture, commit, endGesture, gestureUpdate } from '../store/store.ts';
import type { Doc, SymbolItem } from '../model/types.ts';
import type { EditPhase } from '../ui/instruments/controls.tsx';

function patchRecipe(id: string, patch: Record<string, string>, value?: string) {
  return (d: Draft<Doc>) => {
    const it = d.items.find((i) => i.id === id) as Draft<SymbolItem> | undefined;
    if (!it || it.kind !== 'symbol') return;
    it.properties = { ...(it.properties ?? {}), ...patch };
    if (value !== undefined) it.value = value;
  };
}

/**
 * Changes instrument settings. A knob drag (start/move/end) becomes one undo
 * step, single clicks and wheel steps are committed immediately.
 */
export function setInstrumentProps(id: string, patch: Record<string, string>, phase: EditPhase = 'step', value?: string) {
  const recipe = patchRecipe(id, patch, value);
  switch (phase) {
    case 'start':
      beginGesture();
      return;
    case 'move':
      gestureUpdate(recipe);
      return;
    case 'end':
      endGesture();
      return;
    default:
      commit(recipe);
  }
}
