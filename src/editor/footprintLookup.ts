// Footprints by id: the user's own footprints first, then the built-in library.

import type { FootprintDef } from '../model/types.ts';
import { useStore } from '../store/store.ts';
import { footprintById } from '../pcb/footprints/index.ts';

export function findFootprint(id: string): FootprintDef | undefined {
  return useStore.getState().library.userFootprints.find((f) => f.id === id) ?? footprintById(id);
}
