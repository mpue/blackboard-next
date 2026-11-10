// An ATmega328P running real firmware: the avr8js CPU with the peripherals of
// the chip (ports, timers with PWM, USART, ADC, SPI, TWI, EEPROM, watchdog),
// plus what the circuit needs: the level or PWM duty cycle of every pin, and
// input levels and analog voltages coming back from the circuit.

import {
  AVRADC,
  AVRClock,
  AVREEPROM,
  AVRIOPort,
  AVRSPI,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  AVRWatchdog,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  adcConfig,
  avrInstruction,
  clockConfig,
  eepromConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
  watchdogConfig,
} from 'avr8js';
import { DEFAULT_CLOCK, IO_PINS, type Drive, type Drives, type PortName } from './pinout.ts';

const SRAM_BYTES = 2048;

interface PinTrack {
  /** cycle the pin last went high, while it is high */
  highSince: number;
  /** cycles spent high in the current window */
  highCycles: number;
  edges: number;
  high: boolean;
}

export class Atmega328p {
  readonly cpu: CPU;
  readonly ports: Record<PortName, AVRIOPort>;
  readonly adc: AVRADC;
  readonly usart: AVRUSART;
  private readonly track = new Map<string, PinTrack>();
  private windowStart = 0;
  readonly frequency: number;

  constructor(flash: Uint8Array, frequency = DEFAULT_CLOCK) {
    this.frequency = frequency;
    const program = new Uint16Array(0x4000);
    new Uint8Array(program.buffer).set(flash.subarray(0, 0x8000));
    this.cpu = new CPU(program, SRAM_BYTES);
    const clock = new AVRClock(this.cpu, frequency, clockConfig);
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.usart = new AVRUSART(this.cpu, usart0Config, frequency);
    this.adc = new AVRADC(this.cpu, adcConfig);
    new AVRSPI(this.cpu, spiConfig, frequency);
    new AVRTWI(this.cpu, twiConfig, frequency);
    new AVREEPROM(this.cpu, new EEPROMMemoryBackend(1024), eepromConfig);
    new AVRWatchdog(this.cpu, watchdogConfig, clock);

    for (const [name, port] of Object.entries(this.ports) as [PortName, AVRIOPort][]) {
      port.addListener((value, old) => {
        const changed = value ^ old;
        if (!changed) return;
        for (let bit = 0; bit < 8; bit++) {
          if (!(changed & (1 << bit))) continue;
          const t = this.pin(name, bit);
          const high = !!(value & (1 << bit));
          if (high === t.high) continue;
          t.edges++;
          if (high) t.highSince = this.cpu.cycles;
          else t.highCycles += this.cpu.cycles - t.highSince;
          t.high = high;
        }
      });
    }
  }

  private pin(port: PortName, bit: number): PinTrack {
    const k = `${port}${bit}`;
    let t = this.track.get(k);
    if (!t) this.track.set(k, (t = { highSince: 0, highCycles: 0, edges: 0, high: false }));
    return t;
  }

  /** Calls `fn` whenever output levels of a port change, with the mask of the changed pins. */
  watch(fn: (port: PortName, value: number, changed: number) => void) {
    for (const [name, port] of Object.entries(this.ports) as [PortName, AVRIOPort][]) {
      port.addListener((value, old) => {
        if (value !== old) fn(name, value, value ^ old);
      });
    }
  }

  /** Level a pin drives: 1 for output high or an input with pull-up. */
  level(num: number): 0 | 1 {
    const p = IO_PINS.find((x) => x.num === num);
    if (!p) return 0;
    const s = this.ports[p.port].pinState(p.bit);
    return s === PinState.High || s === PinState.InputPullUp ? 1 : 0;
  }

  /** Runs the firmware for the given number of clock cycles. */
  run(cycles: number) {
    const cpu = this.cpu;
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  /** simulated time since reset */
  get seconds() {
    return this.cpu.cycles / this.frequency;
  }

  /**
   * What every pin does to the circuit since the last call: its level, or
   * the duty cycle when it switched more than once in that time (PWM).
   */
  drives(): Drives {
    const now = this.cpu.cycles;
    const window = now - this.windowStart;
    const out: Drives = {};
    for (const p of IO_PINS) {
      const port = this.ports[p.port];
      const state = port.pinState(p.bit);
      const t = this.pin(p.port, p.bit);
      let d: Drive;
      if (state === PinState.Input) d = 'Z';
      else if (state === PinState.InputPullUp) d = 'PU';
      else if (t.edges >= 2 && window > 0) {
        const duty = (t.highCycles + (t.high ? now - t.highSince : 0)) / window;
        d = duty < 0.005 ? 'L' : duty > 0.995 ? 'H' : Math.round(duty * 1000) / 1000;
      } else d = state === PinState.High ? 'H' : 'L';
      out[p.num] = d;
      t.edges = 0;
      t.highCycles = 0;
      if (t.high) t.highSince = now;
    }
    this.windowStart = now;
    return out;
  }

  /** Input level the circuit puts on a pin (DIP pin number). */
  setInput(num: number, high: boolean) {
    const p = IO_PINS.find((x) => x.num === num);
    if (p) this.ports[p.port].setPin(p.bit, high);
  }

  /** Voltage on an analog input (channel 0..5 = A0..A5) and the references. */
  setAnalog(channel: number, volts: number) {
    this.adc.channelValues[channel] = volts;
  }

  setReferences(avcc: number, aref: number) {
    this.adc.avcc = avcc;
    this.adc.aref = aref;
  }

  /** Feeds a byte into the serial receiver; false while it is still busy. */
  receive(byte: number): boolean {
    return this.usart.rxEnable ? !!this.usart.writeByte(byte) : true;
  }
}
