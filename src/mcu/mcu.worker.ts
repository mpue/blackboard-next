// Runs one ATmega328P in real time, off the main thread. The page sends the
// firmware, the supply state and the input levels and voltages; the worker
// reports what the pins do, what the firmware writes to the serial port and
// how fast it keeps up.

import { Atmega328p } from './atmega328p.ts';
import { HexError, parseHex, type HexProblem } from './hex.ts';
import { IO_PINS, type Drives } from './pinout.ts';
import { LcdBus, type LcdLink } from './lcdBus.ts';
import type { LcdState } from './hd44780.ts';

export type McuRequest =
  | { type: 'load'; hex: string; frequency: number }
  | { type: 'power'; on: boolean }
  | { type: 'reset' }
  /** levels and ADC voltages by symbol pin number; `open` pins have nothing attached */
  | { type: 'inputs'; digital: Record<number, boolean>; analog: Record<number, number>; avcc: number; aref: number; open?: number[] }
  | { type: 'serial'; text: string }
  /** character displays on the chip's pins */
  | { type: 'lcds'; lcds: LcdLink[] };

export type McuResponse =
  | { type: 'drives'; drives: Drives }
  /** `quiet`: boot messages, which do not open the serial monitor by themselves */
  | { type: 'serial'; text: string; quiet?: boolean }
  | { type: 'stats'; speed: number; seconds: number; baud: number }
  | { type: 'error'; message: string; problem?: HexProblem; line?: number }
  /** what a character display shows now */
  | { type: 'lcd'; id: string; state: LcdState };

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

const lcds = new LcdBus();
let lcdLinks: LcdLink[] = [];
const level = (num: number | undefined) => (num === undefined || !chip ? 0 : chip.level(num));
/** DIP pin number of each port bit, for the displays */
const dipOf = (port: string, bit: number) => IO_PINS.find((p) => p.port === port && p.bit === bit)?.num;

function applyInputs() {
  if (!chip || !inputs) return;
  for (const [num, high] of Object.entries(inputs.digital)) chip.setInput(Number(num), high);
  for (const [num, volts] of Object.entries(inputs.analog)) {
    const channel = IO_PINS.find((p) => p.num === Number(num))?.adc;
    if (channel !== undefined) chip.setAnalog(channel, volts);
  }
  chip.setReferences(inputs.avcc, inputs.aref);
}

function boot() {
  if (!flash) return;
  chip = new Atmega328p(flash, frequency);
  chip.usart.onByteTransmit = (b) => (serialOut += String.fromCharCode(b));
  chip.watch((port, value, changed) => {
    if (!lcds.size) return;
    for (let bit = 0; bit < 8; bit++) {
      if (!(changed & (1 << bit))) continue;
      const num = dipOf(port, bit);
      if (num !== undefined && lcds.pins.has(num)) lcds.edge(num, (value >> bit) & 1 ? 1 : 0, level);
    }
  });
  lcds.update(lcdLinks, level);
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
  for (const { id, state } of lcds.changed()) post({ type: 'lcd', id, state });
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
    case 'lcds':
      lcdLinks = m.lcds;
      lcds.update(lcdLinks, level);
      for (const { id, state } of lcds.changed()) post({ type: 'lcd', id, state });
      break;
  }
};

tick();
