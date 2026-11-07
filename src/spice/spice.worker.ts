/// <reference lib="webworker" />
// NGSpice (WebAssembly) runs in its own worker: the ~20 MB engine is loaded on
// first use only and long simulations never block the editor.

import { Simulation, type ResultType } from 'eecircuit-engine';

export type WorkerRequest = { id: number; netlist: string };
export type WorkerResponse =
  | { id: number; ok: true; result: ResultType; info: string; warnings: string[] }
  | { id: number; ok: false; error: string; info: string; restart?: boolean };

let sim: Simulation | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function engine(): Promise<Simulation> {
  if (!sim) {
    const s = new Simulation();
    await s.start();
    sim = s;
  }
  return sim;
}

const ABORT_RE = /simulation\(s\) aborted|no writable vector|there aren't any circuits loaded/i;

/** When ngspice aborts a run the engine never resolves runSim(); detect that from its log. */
function abortWatch(s: Simulation): { promise: Promise<never>; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      if (ABORT_RE.test(s.getError().join('\n'))) reject(Object.assign(new Error('aborted'), { aborted: true }));
    }, 150);
  });
  return { promise, stop: () => clearInterval(timer) };
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, netlist } = e.data;
  queue = queue.then(async () => {
    try {
      const s = await engine();
      s.setNetList(netlist);
      const watch = abortWatch(s);
      let result: ResultType;
      try {
        result = await Promise.race([s.runSim(), watch.promise]);
      } finally {
        watch.stop();
      }
      const messages = s.getError().filter((m) => m.trim());
      const errors = messages.filter((m) => !/^warning/i.test(m.trim()));
      const warnings = messages.filter((m) => /^warning/i.test(m.trim()));
      if (errors.length && result.numPoints <= 1) {
        postMessage({ id, ok: false, error: errors.join('\n'), info: s.getInfo() } satisfies WorkerResponse);
        return;
      }
      postMessage({ id, ok: true, result, info: s.getInfo(), warnings: [...warnings, ...errors] } satisfies WorkerResponse);
    } catch (err) {
      // the engine throws while parsing an empty result; ngspice's own messages say why
      const spice = sim?.getError().filter((m) => m.trim() && !/^warning/i.test(m.trim())) ?? [];
      const error = spice.length ? spice.join('\n') : String((err as Error)?.message ?? err);
      const restart = !!(err as { aborted?: boolean }).aborted;
      postMessage({ id, ok: false, error, info: sim?.getInfo() ?? '', restart } satisfies WorkerResponse);
      // a stuck engine cannot be reused: the main thread starts a fresh worker
      if (restart) self.close();
    }
  });
};
