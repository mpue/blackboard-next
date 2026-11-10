// Runs one ESP32 in real time, off the main thread (the counterpart of
// mcu.worker.ts): the same messages, with the firmware as a flash image or a
// MicroPython script. The emulator files come from public/esp32.

import { Esp32Chip, Esp32Runtime, MicroPythonRunner } from './esp32chip.ts';
import { MICROPYTHON_OFFSET, unpackImage } from './esp32Firmware.ts';
import type { McuRequest, McuResponse } from './mcu.worker.ts';
import type { IoPin } from './pinout.ts';

export type Esp32Request =
  | {
      type: 'load';
      /** URL of the directory with esp32sim.wasm, the ROM and MicroPython */
      base: string;
      io: IoPin[];
      /** packed flash image (esp32Firmware.ts) and its offset; without it MicroPython runs `script` */
      firmware?: string;
      offset?: number;
      script?: string;
    }
  | Exclude<McuRequest, { type: 'load' }>;

const REPORT_MS = 25;
const STATS_MS = 500;
const MAX_STEP_S = 0.05;
const BUDGET_MS = 30;
/** bytes into UART0 per millisecond of emulated time (~100 kbaud; the FIFO holds 128) */
const UART_BYTES_PER_MS = 10;
/** strapping pins are sampled by the ROM at reset: the circuit takes them over after that */
const STRAPS = new Set([0, 2, 5, 12, 15]);
const STRAP_S = 0.1;

let rt: Esp32Runtime | null = null;
let rom: Uint8Array | null = null;
let image: Uint8Array | null = null;
let offset = 0;
let script: string | undefined;
let io: IoPin[] = [];
let ready: Promise<void> | null = null;
let chip: Esp32Chip | null = null;
let runner: MicroPythonRunner | null = null;
let powered = false;
let inputs: Extract<McuRequest, { type: 'inputs' }> | null = null;
let applied = '';
const tx: number[] = [];
let serialOut = '';
/** boot messages of the ROM and the firmware so far (until the program itself runs) */
let quiet = true;
let lastTick = 0;
let lastReport = 0;
let lastStats = 0;
let lastDrives = '';
let simulated = 0;
let wall = 0;

const post = (m: McuResponse) => (self as unknown as Worker).postMessage(m);
const fail = (err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) });

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function load(m: Extract<Esp32Request, { type: 'load' }>) {
  io = m.io;
  script = m.script;
  const [wasm, romBytes, mp] = await Promise.all([
    rt ? null : fetchBytes(`${m.base}esp32sim.wasm`),
    rom ? rom : fetchBytes(`${m.base}esp32_rev300_rom.elf`),
    m.firmware ? null : fetchBytes(`${m.base}micropython-esp32.bin`),
  ]);
  if (wasm) rt = await Esp32Runtime.create(wasm);
  rom = romBytes;
  image = m.firmware ? unpackImage(m.firmware) : mp;
  offset = m.firmware ? (m.offset ?? 0) : MICROPYTHON_OFFSET;
}

function applyInputs(force = false) {
  if (!chip || !inputs) return;
  const early = chip.seconds < STRAP_S;
  const key = JSON.stringify([inputs.digital, inputs.analog, inputs.open, early]);
  if (!force && key === applied) return;
  applied = key;
  const open = new Set(inputs.open ?? []);
  for (const p of io) {
    if (open.has(p.num) || (early && STRAPS.has(p.key))) chip.setInput(p.key, undefined);
    else if (p.num in inputs.digital) chip.setInput(p.key, inputs.digital[p.num]);
    if (p.analog && p.num in inputs.analog) chip.setAnalog(p.key, inputs.analog[p.num]);
  }
}

function boot() {
  chip?.dispose();
  chip = null;
  if (!rt || !rom || !image) return;
  try {
    chip = new Esp32Chip(rt, rom, image, offset);
  } catch (err) {
    fail(err);
    return;
  }
  tx.length = 0;
  quiet = true;
  runner = script !== undefined ? new MicroPythonRunner(script, (text) => tx.push(...new TextEncoder().encode(text))) : null;
  applyInputs(true);
  lastTick = performance.now();
  lastDrives = '';
  simulated = wall = 0;
}

function report(force = false) {
  if (!chip) return;
  const drives = chip.drives(io);
  const key = JSON.stringify(drives);
  if (force || key !== lastDrives) {
    lastDrives = key;
    post({ type: 'drives', drives });
  }
}

function tick() {
  const now = performance.now();
  if (chip && powered) {
    const hz = chip.hz;
    const due = Math.min(MAX_STEP_S, (now - lastTick) / 1000) * hz;
    let done = 0;
    while (done < due && performance.now() - now < BUDGET_MS) {
      const n = Math.min(hz / 1000, due - done);
      const rc = chip.run(n);
      done += n;
      if (rc !== 0) {
        fail(`esp32sim stopped (${rc}): ${rt?.log.slice(-2).join(' ') ?? ''}`);
        chip.dispose();
        chip = null;
        break;
      }
      if (tx.length) chip.serialIn(Uint8Array.from(tx.splice(0, UART_BYTES_PER_MS)));
      const text = chip.serialOut();
      if (text) {
        const shown = runner ? runner.feed(text) : text;
        // MicroPython: everything before the script runs; an image: its first second
        const booting = runner ? !runner.running : chip.seconds < 1;
        if (booting !== quiet && serialOut) {
          post({ type: 'serial', text: serialOut, quiet });
          serialOut = '';
        }
        quiet = booting;
        serialOut += shown;
      }
    }
    if (chip) {
      applyInputs();
      simulated += done / hz;
      wall += (now - lastTick) / 1000;
      if (now - lastReport >= REPORT_MS) {
        lastReport = now;
        report();
        if (serialOut) {
          post({ type: 'serial', text: serialOut, quiet });
          serialOut = '';
        }
      }
      if (now - lastStats >= STATS_MS) {
        lastStats = now;
        post({ type: 'stats', speed: wall > 0 ? Math.min(1, simulated / wall) : 1, seconds: chip.seconds, baud: 115200 });
        simulated = wall = 0;
      }
    }
  }
  lastTick = now;
  setTimeout(tick, 4);
}

self.onmessage = async (e: MessageEvent<Esp32Request>) => {
  const m = e.data;
  switch (m.type) {
    case 'load':
      ready = load(m).catch(fail);
      await ready;
      if (powered) {
        boot();
        report(true);
      }
      break;
    case 'power':
      if (m.on === powered) break;
      powered = m.on;
      await ready;
      if (powered) {
        boot();
        report(true);
      } else {
        chip?.dispose();
        chip = null;
        post({ type: 'drives', drives: {} });
      }
      break;
    case 'reset':
      await ready;
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
      // the MicroPython REPL takes Enter as CR, Arduino sketches mostly read up to LF
      tx.push(...new TextEncoder().encode(runner ? m.text.replace(/\n/g, '\r') : m.text));
      break;
  }
};

tick();
