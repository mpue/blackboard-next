import type { ResultType } from 'eecircuit-engine';
import type { WorkerRequest, WorkerResponse } from './spice.worker.ts';
import { toAscii } from './netlist.ts';

export type SimResult = { result: ResultType; info: string; warnings: string[] };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: SimResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./spice.worker.ts', import.meta.url), { type: 'module', name: 'ngspice' });
    const current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (worker !== current) return;
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve({ result: e.data.result, info: e.data.info, warnings: e.data.warnings });
      else {
        if (e.data.restart) {
          worker?.terminate();
          worker = null;
        }
        p.reject(Object.assign(new Error(e.data.error), { info: e.data.info }));
      }
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'NGSpice worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/** Runs a netlist; a stuck simulation is aborted after `timeoutMs` and the engine restarted. */
export function simulate(netlist: string, timeoutMs = 60_000): Promise<SimResult> {
  const id = ++seq;
  const w = getWorker();
  return new Promise<SimResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      reject(new Error(`Timeout (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ id, netlist: toAscii(netlist) } satisfies WorkerRequest);
  });
}

export function isEngineLoaded() {
  return worker !== null;
}
