import { create } from 'zustand';
import { isSchematicDoc } from '../model/types.ts';
import { activeDoc, useStore } from './store.ts';
import { simulate } from '../spice/simulator.ts';
import { liveValues, opNetlist, type LiveValues } from '../spice/live.ts';

// "Live values": while switched on, every edit of a schematic re-runs the DC
// operating point and the editor shows voltages, currents and current flow.

interface LiveState {
  on: boolean;
  status: 'idle' | 'running' | 'done' | 'error';
  error: string;
  docId: string | null;
  /** netlist of the last run; unchanged netlists are not simulated again */
  key: string;
  values: LiveValues | null;
}

export const useLive = create<LiveState>()(() => ({ on: false, status: 'idle', error: '', docId: null, key: '', values: null }));

let running = false;
let again = false;

export async function runLive(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  const ds = activeDoc();
  if (!ds || !isSchematicDoc(ds.doc) || !useLive.getState().on) return;
  const nl = opNetlist(ds.doc, ds.fileName, useStore.getState().library.models);
  const st = useLive.getState();
  if (st.docId === ds.id && st.key === nl.netlist && st.status === 'done') return;
  if (nl.errors.length) {
    useLive.setState({ status: 'error', error: nl.errors.map((e) => e.key).join(', '), docId: ds.id, key: nl.netlist, values: null });
    return;
  }
  running = true;
  useLive.setState({ status: 'running', docId: ds.id, key: nl.netlist, ...(st.docId === ds.id ? {} : { values: null }) });
  try {
    const res = await simulate(nl.netlist, 20_000);
    const vectors = new Map(res.result.data.map((d) => [d.name.toLowerCase(), Number((d.values as number[])[0])]));
    // the document may have changed meanwhile: map onto the version that was simulated
    useLive.setState({ status: 'done', error: '', values: liveValues(ds.doc, nl, vectors) });
  } catch (e) {
    useLive.setState({ status: 'error', error: (e as Error).message, values: null });
  } finally {
    running = false;
  }
  if (again) {
    again = false;
    void runLive();
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleLive(delay = 200) {
  if (!useLive.getState().on) return;
  clearTimeout(timer);
  timer = setTimeout(() => void runLive(), delay);
}

export function setLiveValues(on: boolean) {
  useLive.setState({ on, ...(on ? {} : { values: null, status: 'idle', key: '' }) });
  if (on) void runLive();
}

/** Re-runs the operating point whenever the active schematic changes. */
export function installLiveUpdates(): () => void {
  return useStore.subscribe((s, prev) => {
    if (!useLive.getState().on) return;
    const cur = s.docs.find((d) => d.id === s.active);
    const before = prev.docs.find((d) => d.id === prev.active);
    if (cur && (cur !== before || s.active !== prev.active) && (cur.doc !== before?.doc || s.active !== prev.active)) scheduleLive();
  });
}
