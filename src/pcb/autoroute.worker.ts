/// <reference lib="webworker" />
// Runs the autorouter off the UI thread. Post { doc, opts }; the worker answers
// with throttled progress messages and finally { type: 'done', result }.

import type { Doc } from '../model/types.ts';
import { autoroute, type AutorouteOptions, type AutorouteResult } from './autoroute.ts';

export type AutorouteRequest = { doc: Doc; opts?: AutorouteOptions };
export type AutorouteResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: AutorouteResult }
  | { type: 'error'; error: string };

self.onmessage = (e: MessageEvent<AutorouteRequest>) => {
  const { doc, opts } = e.data;
  let last = 0;
  try {
    const result = autoroute(doc, opts, (done, total) => {
      const now = performance.now();
      if (done < total && now - last < 50) return;
      last = now;
      postMessage({ type: 'progress', done, total } satisfies AutorouteResponse);
    });
    postMessage({ type: 'done', result } satisfies AutorouteResponse);
  } catch (err) {
    postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) } satisfies AutorouteResponse);
  }
};
