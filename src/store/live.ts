import { create } from 'zustand';
import { isSchematicDoc, type Doc } from '../model/types.ts';
import { activeDoc, useStore } from './store.ts';
import { simulate } from '../spice/simulator.ts';
import { averageOperatingPoints, liveValues, opNetlist, tranNetlist, type LiveValues } from '../spice/live.ts';
import type { NetlistResult } from '../spice/netlist.ts';
import type { Drives } from '../mcu/pinout.ts';

// "Live values": while switched on, every edit of a schematic re-runs the
// simulation and the editor shows voltages, currents and current flow -
// either the DC operating point or, in slow motion, a transient analysis that
// is played back over a few seconds (blinking LEDs, charging capacitors).

export type LiveMode = 'dc' | 'tran';

export interface LiveSeries {
  doc: Doc;
  nl: NetlistResult;
  time: number[];
  /** ngspice vector name (lower case) -> values over time */
  vectors: Map<string, number[]>;
}

interface LiveState {
  on: boolean;
  mode: LiveMode;
  status: 'idle' | 'running' | 'done' | 'error';
  error: string;
  docId: string | null;
  /** netlist of the last run; unchanged netlists are not simulated again */
  key: string;
  /** DC operating point */
  values: LiveValues | null;
  /** transient result for the slow motion playback */
  series: LiveSeries | null;
}

export const useLive = create<LiveState>()(() => ({ on: false, mode: 'dc', status: 'idle', error: '', docId: null, key: '', values: null, series: null }));

/** Microcontrollers taking part in the operating point (see src/mcu/controller.ts). */
export interface LiveCoupling {
  /**
   * Pin drives of the running chips of a document: one set, or several with
   * their weights when PWM pins are taken high and low in turn.
   */
  variants(docId: string): { mcu: Map<string, Drives>; weight: number }[] | undefined;
  /** the operating point that was just calculated */
  result(docId: string, doc: Doc, nl: NetlistResult, vectors: Map<string, number>): void;
}

let coupling: LiveCoupling | undefined;

export function setLiveCoupling(c: LiveCoupling | undefined) {
  coupling = c;
}

let running = false;
let again = false;

export async function runLive(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  const ds = activeDoc();
  if (!ds || !isSchematicDoc(ds.doc) || !useLive.getState().on) return;
  const { mode } = useLive.getState();
  const models = useStore.getState().library.models;
  const variants = mode === 'dc' ? (coupling?.variants(ds.id) ?? [{ mcu: undefined, weight: 1 }]) : [{ mcu: undefined, weight: 1 }];
  const nls = variants.map((v) => (mode === 'tran' ? tranNetlist(ds.doc, ds.fileName, models) : opNetlist(ds.doc, ds.fileName, models, v.mcu)));
  const nl = nls[0];
  const key = nls.map((n) => n.netlist).join('\n');
  const st = useLive.getState();
  if (st.docId === ds.id && st.key === key && st.status === 'done') return;
  if (nl.errors.length) {
    useLive.setState({ status: 'error', error: nl.errors.map((e) => e.key).join(', '), docId: ds.id, key, values: null, series: null });
    return;
  }
  running = true;
  useLive.setState({ status: 'running', docId: ds.id, key, ...(st.docId === ds.id ? {} : { values: null, series: null }) });
  try {
    if (mode === 'dc') {
      const runs: { nl: NetlistResult; vectors: Map<string, number>; weight: number }[] = [];
      for (let i = 0; i < nls.length; i++) {
        const res = await simulate(nls[i].netlist, 20_000);
        runs.push({ nl: nls[i], weight: variants[i].weight, vectors: new Map(res.result.data.map((d) => [d.name.toLowerCase(), Number((d.values as number[])[0])])) });
      }
      const avg = averageOperatingPoints(runs);
      // the document may have changed meanwhile: map onto the version that was simulated
      useLive.setState({ status: 'done', error: '', values: liveValues(ds.doc, avg.nl, avg.vectors), series: null });
      coupling?.result(ds.id, ds.doc, avg.nl, avg.vectors);
    } else {
      const res = await simulate(nl.netlist, 30_000);
      const [x, ...rest] = res.result.data;
      const vectors = new Map(rest.map((d) => [d.name.toLowerCase(), (d.values as number[]).map(Number)]));
      useLive.setState({ status: 'done', error: '', values: null, series: { doc: ds.doc, nl, time: (x.values as number[]).map(Number), vectors } });
    }
  } catch (e) {
    useLive.setState({ status: 'error', error: (e as Error).message, values: null, series: null });
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
  useLive.setState({ on, ...(on ? {} : { values: null, series: null, status: 'idle', key: '' }) });
  if (on) void runLive();
}

export function setLiveMode(mode: LiveMode) {
  useLive.setState({ mode, key: '', values: null, series: null });
  if (useLive.getState().on) void runLive();
}

/** Re-runs the simulation whenever the active schematic changes. */
export function installLiveUpdates(): () => void {
  return useStore.subscribe((s, prev) => {
    if (!useLive.getState().on) return;
    const cur = s.docs.find((d) => d.id === s.active);
    const before = prev.docs.find((d) => d.id === prev.active);
    if (cur && (cur.doc !== before?.doc || s.active !== prev.active)) scheduleLive();
  });
}

/** Item under the mouse while live values are shown (for the measurement tooltip). */
export const useLiveHover = create<{ itemId?: string; at?: { x: number; y: number } }>()(() => ({}));
