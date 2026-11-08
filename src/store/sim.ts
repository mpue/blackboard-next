import { create } from 'zustand';
import { activeDoc, useStore } from './store.ts';
import { buildNetlist, type NetlistWarning } from '../spice/netlist.ts';
import { benchAnalysis, isInstrument, type BenchAnalysis, type Probes, type SimData } from '../spice/instruments.ts';
import { simulate } from '../spice/simulator.ts';

// State of the instrument bench: the latest transient result of the active
// document and whether every edit re-runs the simulation ("live").

export interface BenchResult {
  data: SimData;
  probes: Probes;
  analysis: BenchAnalysis;
  /** increments with every new result, drives the sweep animation */
  seq: number;
}

interface SimState {
  live: boolean;
  uic: boolean;
  status: 'idle' | 'running' | 'done' | 'error';
  error: string;
  docId: string | null;
  /** netlist of the last run; unchanged netlists are not simulated again */
  key: string;
  result: BenchResult | null;
  errors: ('noGround' | 'noSymbols')[];
  warnings: NetlistWarning[];
}

export const useSim = create<SimState>()(() => ({
  live: true,
  uic: true,
  status: 'idle',
  error: '',
  docId: null,
  key: '',
  result: null,
  errors: [],
  warnings: [],
}));

let running: Promise<void> | null = null;
let again = false;
let seq = 0;

export function docHasInstruments(): boolean {
  return !!activeDoc()?.doc.items.some(isInstrument);
}

/** Simulates the active document for the instruments (skipped when nothing changed). */
export async function runBench(force = false): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  const ds = activeDoc();
  if (!ds) return;
  const st = useSim.getState();
  const analysis = benchAnalysis(ds.doc, st.uic);
  const net = buildNetlist(ds.doc, ds.fileName, useStore.getState().library.models, { analysis: analysis.directive });
  const sameDoc = st.docId === ds.id;
  if (!force && sameDoc && net.netlist === st.key && st.status !== 'error') return;
  useSim.setState({
    status: 'running',
    docId: ds.id,
    key: net.netlist,
    errors: net.errors.map((e) => e.key),
    warnings: net.warnings,
    ...(sameDoc ? {} : { result: null }),
  });
  if (net.errors.length) {
    useSim.setState({ status: 'error', error: '', result: null });
    return;
  }
  running = (async () => {
    try {
      const res = await simulate(net.netlist);
      const [x, ...rest] = res.result.data;
      const real = res.result.dataType === 'real';
      if (!real) throw new Error('unexpected AC result');
      const data: SimData = { time: x.values as number[], vectors: new Map(rest.map((d) => [d.name.toLowerCase(), d.values as number[]])) };
      useSim.setState({ status: 'done', error: '', result: { data, probes: net.probes, analysis, seq: ++seq } });
    } catch (e) {
      useSim.setState({ status: 'error', error: (e as Error).message });
    } finally {
      running = null;
    }
  })();
  await running;
  if (again) {
    again = false;
    await runBench();
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Debounced re-run after edits, only while live mode is on. */
export function scheduleBench(delay = 250) {
  if (!useSim.getState().live) return;
  clearTimeout(timer);
  timer = setTimeout(() => void runBench(), delay);
}

export function setLive(live: boolean) {
  useSim.setState({ live });
  if (live) void runBench();
}

export function setUic(uic: boolean) {
  useSim.setState({ uic });
  void runBench(true);
}
