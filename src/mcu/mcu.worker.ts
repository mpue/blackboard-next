// Runs one ATmega328P in real time, off the main thread. The page sends the
// firmware, the supply state and the input levels and voltages; the worker
// reports what the pins do, what the firmware writes to the serial port and
// how fast it keeps up.

import { Atmega328p } from './atmega328p.ts';
import { HexError, parseHex, type HexProblem } from './hex.ts';
import type { Drives } from './pinout.ts';

export type McuRequest =
  | { type: 'load'; hex: string; frequency: number }
  | { type: 'power'; on: boolean }
  | { type: 'reset' }
  | { type: 'inputs'; digital: Record<number, boolean>; analog: Record<number, number>; avcc: number; aref: number }
  | { type: 'serial'; text: string };

export type McuResponse =
  | { type: 'drives'; drives: Drives }
  | { type: 'serial'; text: string }
  | { type: 'stats'; speed: number; seconds: number; baud: number }
  | { type: 'error'; message: string; problem?: HexProblem; line?: number };

/** how often the pins are reported (the circuit is recalculated about as often) */
const REPORT_MS = 25;
const STATS_MS = 500;
/** never catch up more than this after a stall (tab in the background) */
const MAX_STEP_S = 0.05;
/** time budget per tick, so messages keep being handled */
const BUDGET_MS = 30;

let flash: Uint8Array | null = null;
let frequency = 16e6;
let chip: Atmega328p | null = null;
let powered = false;
let inputs: Extract<McuRequest, { type: 'inputs' }> | null = null;
const rx: number[] = [];
let serialOut = '';
let lastTick = 0;
let lastReport = 0;
let lastStats = 0;
let lastDrives = '';
let simulated = 0;
let wall = 0;

const post = (m: McuResponse) => (self as unknown as Worker).postMessage(m);

function applyInputs() {
  if (!chip || !inputs) return;
  for (const [num, high] of Object.entries(inputs.digital)) chip.setInput(Number(num), high);
  for (const [ch, volts] of Object.entries(inputs.analog)) chip.setAnalog(Number(ch), volts);
  chip.setReferences(inputs.avcc, inputs.aref);
}

function boot() {
  if (!flash) return;
  chip = new Atmega328p(flash, frequency);
  chip.usart.onByteTransmit = (b) => (serialOut += String.fromCharCode(b));
  applyInputs();
  lastTick = performance.now();
  lastDrives = '';
  simulated = wall = 0;
}

function report(force = false) {
  if (!chip) return;
  const drives = chip.drives();
  const key = JSON.stringify(drives);
  if (force || key !== lastDrives) {
    lastDrives = key;
    post({ type: 'drives', drives });
  }
}

function tick() {
  const now = performance.now();
  if (chip && powered) {
    const due = Math.min(MAX_STEP_S, (now - lastTick) / 1000) * frequency;
    let done = 0;
    const slice = frequency / 1000;
    while (done < due && performance.now() - now < BUDGET_MS) {
      const n = Math.min(slice, due - done);
      chip.run(n);
      done += n;
      if (rx.length && chip.receive(rx[0])) rx.shift();
    }
    simulated += done / frequency;
    wall += (now - lastTick) / 1000;
    if (now - lastReport >= REPORT_MS) {
      lastReport = now;
      report();
      if (serialOut) {
        post({ type: 'serial', text: serialOut });
        serialOut = '';
      }
    }
    if (now - lastStats >= STATS_MS) {
      lastStats = now;
      post({ type: 'stats', speed: wall > 0 ? Math.min(1, simulated / wall) : 1, seconds: chip.seconds, baud: chip.usart.txEnable ? Math.round(chip.usart.baudRate) : 0 });
      simulated = wall = 0;
    }
  }
  lastTick = now;
  setTimeout(tick, 4);
}

self.onmessage = (e: MessageEvent<McuRequest>) => {
  const m = e.data;
  switch (m.type) {
    case 'load':
      try {
        flash = parseHex(m.hex).flash;
        frequency = m.frequency;
        if (powered) boot();
      } catch (err) {
        flash = null;
        chip = null;
        post(err instanceof HexError ? { type: 'error', message: err.message, problem: err.problem, line: err.line } : { type: 'error', message: String(err) });
      }
      break;
    case 'power':
      if (m.on === powered) break;
      powered = m.on;
      if (powered) {
        boot();
        report(true);
      } else {
        chip = null;
        post({ type: 'drives', drives: {} });
      }
      break;
    case 'reset':
      if (powered) {
        boot();
        report(true);
      }
      break;
    case 'inputs':
      inputs = m;
      applyInputs();
      break;
    case 'serial':
      for (const c of m.text) rx.push(c.charCodeAt(0) & 0xff);
      break;
  }
};

tick();
