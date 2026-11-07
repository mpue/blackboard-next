import { create } from 'zustand';

// High frequency pointer state lives in its own store so that pointer moves
// only re-render the status bar, not the whole editor.
export interface CursorState {
  x: number;
  y: number;
  inside: boolean;
  measure: null | { dx: number; dy: number; len: number };
}

export const useCursor = create<CursorState>()(() => ({ x: 0, y: 0, inside: false, measure: null }));
