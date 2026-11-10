// Runs the microcontrollers of the active schematic while live values are on
// (DC mode): one worker per chip. After every operating point the chips get
// their supply voltage, input levels and analog voltages; when a chip changes
// what its pins do, the operating point is calculated again.

import { create } from 'zustand';
import { isSchematicDoc, type Doc, type SymbolItem } from '../model/types.ts';
import { activeDoc, useStore } from '../store/store.ts';
import { runLive, setLiveCoupling, useLive } from '../store/live.ts';
import type { NetlistResult } from '../spice/netlist.ts';
import { readInputs } from './coupling.ts';
import { BROWN_OUT_VOLTS, isMcu, mcuClock, mcuFirmware, type Drives } from './pinout.ts';
import type { McuRequest, McuResponse } from './mcu.worker.ts';
import type { HexProblem } from './hex.ts';

export type ChipStatus = 'off' | 'noFirmware' | 'unpowered' | 'running' | 'error';

export interface ChipState {
  status: ChipStatus;
  error?: { message: string; problem?: HexProblem; line?: number };
  /** simulated / real time, 0..1 */
  speed: number;
  seconds: number;
  baud: number;
  vcc: number;
  drives: Drives;
}

interface McuState {
  chips: Record<string, ChipState>;
  /** serial output per chip */
  serial: Record<string, string>;
  /** chip whose serial monitor is open */
  monitor: string | null;
  /** chips whose monitor the user closed (it opens by itself on the first output otherwise) */
  dismissed: Record<string, boolean>;
}

export const useMcu = create<McuState>()(() => ({ chips: {}, serial: {}, monitor: null, dismissed: {} }));

const IDLE: ChipState = { status: 'off', speed: 0, seconds: 0, baud: 0, vcc: 0, drives: {} };
const SERIAL_KEEP = 20_000;
/** brown-out hysteresis: a running chip only stops below this */
const BROWN_OUT_OFF = BROWN_OUT_VOLTS - 0.1;

interface Runner {
  worker: Worker;
  docId: string;
  hex: string;
  frequency: number;
  powered: boolean;
  digital: Record<number, boolean>;
  lastInputs: string;
}

const runners = new Map<string, Runner>();

function patch(id: string, p: Partial<ChipState>) {
  useMcu.setState((s) => ({ chips: { ...s.chips, [id]: { ...IDLE, ...s.chips[id], ...p } } }));
}

function start(id: string, docId: string, hex: string, frequency: number): Runner {
  const worker = new Worker(new URL('./mcu.worker.ts', import.meta.url), { type: 'module', name: 'atmega328p' });
  const r: Runner = { worker, docId, hex, frequency, powered: false, digital: {}, lastInputs: '' };
  worker.onmessage = (e: MessageEvent<McuResponse>) => {
    if (runners.get(id) !== r) return;
    const m = e.data;
    switch (m.type) {
      case 'drives':
        patch(id, { drives: m.drives, ...(r.powered ? { status: 'running' } : {}) });
        void runLive();
        break;
      case 'serial':
        useMcu.setState((s) => ({
          serial: { ...s.serial, [id]: ((s.serial[id] ?? '') + m.text).slice(-SERIAL_KEEP) },
          monitor: s.monitor ?? (s.dismissed[id] ? null : id),
        }));
        break;
      case 'stats':
        patch(id, { speed: m.speed, seconds: m.seconds, baud: m.baud });
        break;
      case 'error':
        patch(id, { status: 'error', error: { message: m.message, problem: m.problem, line: m.line }, drives: {} });
        break;
    }
  };
  worker.onerror = (e) => patch(id, { status: 'error', error: { message: e.message || 'worker failed' }, drives: {} });
  send(r, { type: 'load', hex, frequency });
  patch(id, { status: 'unpowered', drives: {}, error: undefined, seconds: 0 });
  return r;
}

const send = (r: Runner, m: McuRequest) => r.worker.postMessage(m);

function stop(id: string) {
  const r = runners.get(id);
  if (!r) return;
  r.worker.terminate();
  runners.delete(id);
}

/** Starts, reloads and stops the chip workers to match the active schematic and the live values. */
export function syncMcus() {
  const live = useLive.getState();
  const ds = activeDoc();
  const chips = live.on && live.mode === 'dc' && ds && isSchematicDoc(ds.doc) ? ds.doc.items.filter((i): i is SymbolItem => isMcu(i)) : [];
  const keep = new Set<string>();
  for (const s of chips) {
    const hex = mcuFirmware(s);
    if (!hex) {
      stop(s.id);
      patch(s.id, { ...IDLE, status: 'noFirmware' });
      continue;
    }
    keep.add(s.id);
    const frequency = mcuClock(s);
    const r = runners.get(s.id);
    if (r && r.docId === ds!.id && r.hex === hex && r.frequency === frequency) continue;
    stop(s.id);
    runners.set(s.id, start(s.id, ds!.id, hex, frequency));
  }
  for (const id of [...runners.keys()]) {
    if (keep.has(id)) continue;
    stop(id);
    patch(id, { ...IDLE });
  }
  // chips that are not running show their reason
  const present = new Set(chips.map((s) => s.id));
  useMcu.setState((s) => {
    const next = { ...s.chips };
    for (const id of Object.keys(next)) if (!present.has(id) && !runners.has(id)) next[id] = { ...IDLE };
    return { chips: next };
  });
}

/** PWM pins taken high and low in turn (2^n operating points); more are averaged in the netlist */
const MAX_PWM_SPLIT = 3;

/**
 * Pin drives of the running chips of a document, for the netlist. A PWM pin
 * switches far faster than the circuit is recalculated, and what matters is
 * the mean over a period: so the operating point is calculated with the pin
 * high and with it low, weighted with the duty cycle. That is exact for
 * resistive loads and LEDs alike (a LED at 25 % glows a quarter as bright),
 * where an average voltage would leave a LED dark below its forward voltage.
 */
function variants(docId: string): { mcu: Map<string, Drives>; weight: number }[] | undefined {
  const base = new Map<string, Drives>();
  const chips = useMcu.getState().chips;
  for (const [id, r] of runners) if (r.docId === docId && r.powered) base.set(id, chips[id]?.drives ?? {});
  if (!base.size) return undefined;
  const pwm: { id: string; num: number; duty: number }[] = [];
  for (const [id, d] of base) for (const [num, v] of Object.entries(d)) if (typeof v === 'number') pwm.push({ id, num: Number(num), duty: v });
  const split = pwm.slice(0, MAX_PWM_SPLIT);
  const out: { mcu: Map<string, Drives>; weight: number }[] = [];
  for (let mask = 0; mask < 1 << split.length; mask++) {
    const mcu = new Map([...base].map(([id, d]) => [id, { ...d }]));
    let weight = 1;
    split.forEach((p, k) => {
      const high = !!(mask & (1 << k));
      mcu.get(p.id)![p.num] = high ? 'H' : 'L';
      weight *= high ? p.duty : 1 - p.duty;
    });
    out.push({ mcu, weight });
  }
  return out;
}

/** After an operating point: supply, input levels and analog voltages to every chip. */
function result(docId: string, _doc: Doc, nl: NetlistResult, vectors: Map<string, number>) {
  for (const m of nl.mcus) {
    const r = runners.get(m.symbolId);
    if (!r || r.docId !== docId) continue;
    const chip = useMcu.getState().chips[m.symbolId];
    const inp = readInputs(m, vectors, r.digital, chip?.drives);
    r.digital = inp.digital;
    const on = r.powered ? inp.vcc >= BROWN_OUT_OFF : inp.vcc >= BROWN_OUT_VOLTS;
    const key = JSON.stringify(inp);
    if (key !== r.lastInputs) {
      r.lastInputs = key;
      send(r, { type: 'inputs', digital: inp.digital, analog: inp.analog, avcc: inp.avcc, aref: inp.aref });
    }
    if (on !== r.powered) {
      r.powered = on;
      send(r, { type: 'power', on });
      if (!on) patch(m.symbolId, { status: chip?.status === 'error' ? 'error' : 'unpowered', drives: {} });
    }
    if (Math.abs((chip?.vcc ?? 0) - inp.vcc) > 0.01) patch(m.symbolId, { vcc: inp.vcc });
  }
}

export function resetMcu(id: string) {
  const r = runners.get(id);
  if (r) send(r, { type: 'reset' });
  useMcu.setState((s) => ({ serial: { ...s.serial, [id]: '' } }));
}

export function sendSerial(id: string, text: string) {
  const r = runners.get(id);
  if (r) send(r, { type: 'serial', text });
}

export function openMonitor(id: string | null) {
  useMcu.setState((s) => {
    const closing = s.monitor;
    return { monitor: id, dismissed: id === null && closing ? { ...s.dismissed, [closing]: true } : s.dismissed };
  });
}

export const clearSerial = (id: string) => useMcu.setState((s) => ({ serial: { ...s.serial, [id]: '' } }));

/** Wires the chips into the live values; returns the cleanup. */
export function installMcus(): () => void {
  setLiveCoupling({ variants, result });
  const unLive = useLive.subscribe((s, prev) => {
    if (s.on !== prev.on || s.mode !== prev.mode) syncMcus();
  });
  const unStore = useStore.subscribe((s, prev) => {
    const cur = s.docs.find((d) => d.id === s.active);
    const before = prev.docs.find((d) => d.id === prev.active);
    if (s.active !== prev.active || cur?.doc !== before?.doc) syncMcus();
  });
  syncMcus();
  return () => {
    unLive();
    unStore();
    setLiveCoupling(undefined);
    for (const id of [...runners.keys()]) stop(id);
  };
}
