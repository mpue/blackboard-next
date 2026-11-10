// An ESP32 running real firmware: esp32sim (MIT, github.com/mikroverk/esp32sim)
// compiled to WebAssembly with scripts/esp32sim.patch, which adds the exports
// the circuit needs. The classic ESP32 boots from Espressif's mask ROM into a
// flash image (an Arduino ".merged.bin", or MicroPython).

import type { Drive, Drives, IoPin } from './pinout.ts';

interface Exports {
  memory: WebAssembly.Memory;
  __indirect_function_table: WebAssembly.Table;
  esp32sim_alloc(len: number): number;
  esp32sim_free(ptr: number, len: number): void;
  esp32sim_new(board: number, len: number, flashMb: number, psramMb: number): number;
  esp32sim_delete(e: number): void;
  esp32sim_load(e: number, kind: number, ptr: number, len: number): number;
  esp32sim_load_at(e: number, offset: number, ptr: number, len: number): number;
  esp32sim_boot(e: number, appDirect: number): number;
  esp32sim_run(e: number, cycles: number, unixMs: number): number;
  esp32sim_cpu_hz(e: number): number;
  esp32sim_cycles(e: number): number;
  esp32sim_out_take(e: number): number;
  esp32sim_out_kind(e: number, i: number): number;
  esp32sim_out_ptr(e: number, i: number): number;
  esp32sim_out_len(e: number, i: number): number;
  esp32sim_gpio_input(e: number, pin: number, level: number): void;
  esp32sim_gpio_state(e: number, pin: number): number;
  esp32sim_pwm_duty(e: number, pin: number): number;
  esp32sim_analog(e: number, pin: number, volts: number): void;
  esp32sim_uart_in(e: number, n: number, ptr: number, len: number): void;
  esp32sim_gpio_observe(e: number, on: number): void;
  esp32sim_gpio_events(e: number): number;
  esp32sim_gpio_events_ptr(): number;
}

/** load kinds of esp32sim_load */
const ROM = 0;
const BOARD = 'esp32dev';
const FLASH_MB = 4;

/**
 * The WebAssembly instance with the host side of esp32sim's block JIT (hot
 * guest blocks become small WebAssembly modules in its function table; after
 * web/wasm/jit.mjs of esp32sim, MIT).
 */
export class Esp32Runtime {
  readonly w: Exports;
  /** the emulator's own messages (unimplemented registers, boot problems) */
  readonly log: string[];

  private constructor(w: Exports, log: string[]) {
    this.w = w;
    this.log = log;
  }

  static async create(wasm: BufferSource | WebAssembly.Module): Promise<Esp32Runtime> {
    let w: Exports | undefined;
    const free: number[] = [];
    const log: string[] = [];
    const imports = {
      env: {
        host_log: (p: number, n: number) => {
          log.push(new TextDecoder().decode(new Uint8Array(w!.memory.buffer, p, n)));
          if (log.length > 200) log.shift();
        },
        host_jit_compile: (ptr: number, len: number) => {
          try {
            const module = new WebAssembly.Module(new Uint8Array(w!.memory.buffer, ptr, len).slice());
            const instance = new WebAssembly.Instance(module, { env: { memory: w!.memory, table: w!.__indirect_function_table } });
            const slot = free.length ? free.pop()! : w!.__indirect_function_table.grow(1);
            w!.__indirect_function_table.set(slot, instance.exports.run);
            return slot;
          } catch {
            // safe: the block is interpreted instead
            return 0;
          }
        },
        host_jit_release: (slot: number) => {
          w!.__indirect_function_table.set(slot, null);
          free.push(slot);
        },
      },
    };
    const instance = wasm instanceof WebAssembly.Module ? await WebAssembly.instantiate(wasm, imports) : (await WebAssembly.instantiate(wasm, imports)).instance;
    w = instance.exports as unknown as Exports;
    return new Esp32Runtime(w, log);
  }

  withBytes<T>(bytes: Uint8Array, f: (ptr: number, len: number) => T): T {
    const p = this.w.esp32sim_alloc(bytes.length);
    new Uint8Array(this.w.memory.buffer).set(bytes, p);
    try {
      return f(p, bytes.length);
    } finally {
      this.w.esp32sim_free(p, bytes.length);
    }
  }
}

export class Esp32Chip {
  private readonly rt: Esp32Runtime;
  private readonly e: number;
  readonly hz: number;
  private readonly dec = new TextDecoder();

  /** A booted ESP32 DevKit: mask ROM plus a flash image at `offset`. */
  constructor(rt: Esp32Runtime, rom: Uint8Array, image: Uint8Array, offset: number) {
    this.rt = rt;
    const w = rt.w;
    this.e = rt.withBytes(new TextEncoder().encode(BOARD), (p, n) => w.esp32sim_new(p, n, FLASH_MB, 0));
    if (!this.e) throw new Error(`esp32sim: ${rt.log.slice(-3).join(' ')}`);
    this.hz = w.esp32sim_cpu_hz(this.e);
    const check = (rc: number, what: string) => {
      if (rc !== 0) throw new Error(`esp32sim ${what}: ${rt.log.slice(-3).join(' ')}`);
    };
    check(rt.withBytes(rom, (p, n) => w.esp32sim_load(this.e, ROM, p, n)), 'ROM');
    check(rt.withBytes(image, (p, n) => w.esp32sim_load_at(this.e, offset, p, n)), 'firmware');
    check(w.esp32sim_boot(this.e, 0), 'boot');
  }

  /** Runs `cycles` clock cycles; 0 while the chip can go on, else esp32sim's stop code. */
  run(cycles: number): number {
    return this.rt.w.esp32sim_run(this.e, Math.max(1, Math.round(cycles)), Date.now());
  }

  get seconds() {
    return this.rt.w.esp32sim_cycles(this.e) / this.hz;
  }

  /** What every pin does to the circuit, by symbol pin number. */
  drives(io: IoPin[]): Drives {
    const w = this.rt.w;
    const out: Drives = {};
    for (const p of io) {
      const s = w.esp32sim_gpio_state(this.e, p.key);
      if (!(s & 1)) continue;
      const level = (s >> 1) & 1;
      const enabled = (s >> 2) & 1;
      let d: Drive;
      if (enabled) {
        const duty = w.esp32sim_pwm_duty(this.e, p.key);
        d = duty < 0 ? (level ? 'H' : 'L') : duty < 0.005 ? 'L' : duty > 0.995 ? 'H' : Math.round(duty * 1000) / 1000;
      } else d = (s >> 3) & 1 ? 'PU' : (s >> 4) & 1 ? 'PD' : 'Z';
      out[p.num] = d;
    }
    return out;
  }

  /** Level the circuit puts on a GPIO; undefined releases it. */
  setInput(gpio: number, high: boolean | undefined) {
    this.rt.w.esp32sim_gpio_input(this.e, gpio, high === undefined ? 2 : high ? 1 : 0);
  }

  setAnalog(gpio: number, volts: number) {
    this.rt.w.esp32sim_analog(this.e, gpio, volts);
  }

  /** Level a GPIO drives: its output when enabled, else 1 with a pull-up. */
  level(gpio: number): 0 | 1 {
    const s = this.rt.w.esp32sim_gpio_state(this.e, gpio);
    if (!(s & 1)) return 0;
    return (s >> 2) & 1 ? ((s >> 1) & 1 ? 1 : 0) : (s >> 3) & 1 ? 1 : 0;
  }

  /** Start or stop recording GPIO edges (for `edges`). */
  observe(on: boolean) {
    this.rt.w.esp32sim_gpio_observe(this.e, on ? 1 : 0);
  }

  /** GPIO edges since the last call in the order they happened, as gpio | level << 8. */
  edges(): Uint32Array {
    const w = this.rt.w;
    const n = w.esp32sim_gpio_events(this.e);
    return n ? new Uint32Array(w.memory.buffer, w.esp32sim_gpio_events_ptr(), n).slice() : new Uint32Array(0);
  }

  /** Bytes into UART0 (more than the 128 byte FIFO holds are dropped, as on the chip). */
  serialIn(bytes: Uint8Array) {
    if (bytes.length) this.rt.withBytes(bytes, (p, n) => this.rt.w.esp32sim_uart_in(this.e, 0, p, n));
  }

  /** What the firmware wrote to its console since the last call. */
  serialOut(): string {
    const w = this.rt.w;
    let text = '';
    const n = w.esp32sim_out_take(this.e);
    for (let i = 0; i < n; i++) {
      if (w.esp32sim_out_kind(this.e, i) !== 1) continue;
      const p = w.esp32sim_out_ptr(this.e, i);
      try {
        const m = JSON.parse(this.dec.decode(new Uint8Array(w.memory.buffer, p, w.esp32sim_out_len(this.e, i))));
        if (m.t === 'serial' && typeof m.data === 'string') text += m.data;
      } catch {
        // not a message for us
      }
    }
    return text;
  }

  dispose() {
    this.rt.w.esp32sim_delete(this.e);
  }
}

/**
 * Runs a MicroPython script on a freshly booted chip through the raw REPL
 * (what Thonny's "run" does): waits for the prompt, sends the script, and
 * hides the protocol from the serial output, so the monitor shows the boot
 * messages, what the script prints and its errors. When the script ends, the
 * normal REPL comes back for typing.
 */
export class MicroPythonRunner {
  private state: 'boot' | 'raw' | 'sent' | 'running' | 'done' = 'boot';
  private buf = '';
  private eots = 0;
  private readonly script: string;
  private readonly send: (text: string) => void;

  constructor(script: string, send: (text: string) => void) {
    this.script = script.replace(/\r\n?/g, '\n');
    this.send = send;
  }

  get running() {
    return this.state === 'running';
  }

  /** Filters console output; returns what the user should see. */
  feed(text: string): string {
    if (this.state === 'done') return text;
    if (this.state === 'running') return this.output(text);
    this.buf += text;
    if (this.state === 'boot') {
      const at = this.buf.indexOf('>>> ');
      if (at < 0) return '';
      const shown = this.buf.slice(0, at);
      this.buf = '';
      this.state = 'raw';
      this.send('\x01');
      return shown;
    }
    if (this.state === 'raw') {
      if (!/raw REPL; CTRL-B to exit\r?\n>/.test(this.buf)) return '';
      this.buf = '';
      this.state = 'sent';
      this.send(`${this.script}\x04`);
      return '';
    }
    // sent: the script's own output starts after "OK"
    const at = this.buf.indexOf('OK');
    if (at < 0) return '';
    const rest = this.buf.slice(at + 2);
    this.buf = '';
    this.state = 'running';
    return this.output(rest);
  }

  /** Program output; the raw REPL ends it with \x04 (stdout) \x04 (stderr) ">" */
  private output(text: string): string {
    let out = '';
    for (const c of text) {
      if (c === '\x04') {
        this.eots++;
        continue;
      }
      if (this.eots >= 2) {
        if (c === '>') {
          this.state = 'done';
          this.send('\x02');
        }
        continue;
      }
      out += c;
    }
    return out;
  }
}
