// Footprints by id: the user's own footprints first, then the built-in library,
// then footprints made from the classic part library ("Part:<file>").

import type { FootprintDef } from '../model/types.ts';
import { useStore } from '../store/store.ts';
import { footprintById } from '../pcb/footprints/index.ts';
import { footprintFromPart } from '../pcb/fromParts.ts';

const PART_PREFIX = 'Part:';

export function findFootprint(id: string): FootprintDef | undefined {
  const { userFootprints, parts } = useStore.getState().library;
  const own = userFootprints.find((f) => f.id === id) ?? footprintById(id);
  if (own || !id.startsWith(PART_PREFIX)) return own;
  const file = id.slice(PART_PREFIX.length);
  const part = parts.find((p) => p.file === file);
  return part && footprintFromPart(part);
}
