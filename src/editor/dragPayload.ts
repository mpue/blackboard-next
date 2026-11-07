import type { Placement } from '../store/store.ts';

// HTML5 drag data can only carry strings; library entries are handed over in memory.
let payload: Placement | null = null;

export function setDragPayload(p: Placement | null) {
  payload = p;
}

export function takeDragPayload(): Placement | null {
  const p = payload;
  payload = null;
  return p;
}
