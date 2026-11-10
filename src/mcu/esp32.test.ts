import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Esp32Chip, Esp32Runtime, MicroPythonRunner } from './esp32chip.ts';
import { flashOffset, MICROPYTHON_OFFSET, packImage, unpackImage } from './esp32Firmware.ts';
import { esp32ExampleById } from './esp32Examples.ts';
import { MODELS } from './pinout.ts';

const dir = join(import.meta.dirname, '..', '..', 'public', 'esp32');
const file = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
const io = MODELS.esp32.io;
const pinOf = (label: string) => io.find((p) => p.label === label)!.num;

/** boots MicroPython with a script and runs it like the worker does (UART fed at about 100 kbaud) */
async function board(script: string) {
  const rt = await Esp32Runtime.create(file('esp32sim.wasm'));
  const chip = new Esp32Chip(rt, file('esp32_rev300_rom.elf'), file('micropython-esp32.bin'), MICROPYTHON_OFFSET);
  const tx: number[] = [];
  const send = (text: string) => tx.push(...new TextEncoder().encode(text));
  const runner = new MicroPythonRunner(script, send);
  let out = '';
  const ms = (n: number) => {
    for (let i = 0; i < n; i++) {
      const rc = chip.run(chip.hz / 1000);
      if (rc !== 0) throw new Error(`stopped ${rc}: ${rt.log.slice(-3).join(' ')}`);
      if (tx.length) chip.serialIn(Uint8Array.from(tx.splice(0, 10)));
      out += runner.feed(chip.serialOut());
    }
  };
  const until = (test: () => boolean, maxMs = 5000) => {
    for (let t = 0; t < maxMs && !test(); t += 10) ms(10);
    if (!test()) throw new Error(`timeout; output:\n${out.slice(-500)}`);
  };
  return { chip, runner, send, ms, until, output: () => out };
}

describe('ESP32 firmware images', () => {
  it('finds where an image goes and packs it compactly', () => {
    const mp = file('micropython-esp32.bin');
    expect(flashOffset(mp)).toBe(MICROPYTHON_OFFSET);
    const merged = new Uint8Array(0x10000).fill(0xff);
    merged.set(mp.subarray(0, 0x8000), 0x1000);
    expect(flashOffset(merged)).toBe(0);
    expect(flashOffset(mp.subarray(0x10000 - 0x1000))).toBeUndefined();
    const packed = packImage(mp);
    expect(packed.length).toBeLessThan(mp.length);
    const back = unpackImage(packed);
    expect([...back.subarray(0, 64)]).toEqual([...mp.subarray(0, 64)]);
    expect(back.length).toBeLessThanOrEqual(mp.length);
  });
});

describe('ESP32 running MicroPython', () => {
  it(
    'blinks GPIO2 with the blink example',
    async () => {
      const b = await board(esp32ExampleById('blink')!.script);
      b.until(() => b.runner.running);
      expect(b.output()).toMatch(/rst:0x1 \(POWERON_RESET\)|ets /);
      const levels: string[] = [];
      for (let t = 0; t < 2000; t += 20) {
        b.ms(20);
        levels.push(String(b.chip.drives(io)[pinOf('IO2')]));
      }
      const edges = levels.slice(1).filter((x, i) => x !== levels[i]).length;
      expect(edges).toBeGreaterThanOrEqual(3);
      expect(edges).toBeLessThanOrEqual(5);
      expect(new Set(levels)).toEqual(new Set(['H', 'L']));
    },
    60_000,
  );

  it(
    'reads the potentiometer and dims by PWM',
    async () => {
      const b = await board(esp32ExampleById('dimmer')!.script);
      b.until(() => b.runner.running);
      const duty = (volts: number) => {
        b.chip.setAnalog(34, volts);
        b.ms(100);
        return b.chip.drives(io)[pinOf('IO4')];
      };
      const low = duty(0.6);
      const high = duty(2.4);
      expect(typeof low).toBe('number');
      expect(typeof high).toBe('number');
      expect(high as number).toBeGreaterThan((low as number) + 0.4);
    },
    60_000,
  );

  it(
    'talks over the serial port and reports errors of the script',
    async () => {
      const b = await board(esp32ExampleById('serial')!.script);
      b.until(() => b.output().includes('Hallo von BlackBoard!'));
      b.send('abc\r');
      b.until(() => b.output().includes('Echo: abc'));
      // the protocol of the raw REPL stays hidden
      expect(b.output()).not.toMatch(/raw REPL|\x04/);

      const bad = await board('print("vorher")\nx = 1 +\n');
      bad.until(() => bad.output().includes('SyntaxError'));
      bad.until(() => bad.output().includes('>>> '));
    },
    60_000,
  );

  it(
    'follows a button on GPIO18 with its pull-up',
    async () => {
      const b = await board(esp32ExampleById('button')!.script);
      b.until(() => b.runner.running);
      b.ms(50);
      expect(b.chip.drives(io)[pinOf('IO18')]).toBe('PU');
      b.chip.setInput(18, false);
      b.ms(50);
      expect(b.chip.drives(io)[pinOf('IO2')]).toBe('H');
      b.chip.setInput(18, true);
      b.ms(50);
      expect(b.chip.drives(io)[pinOf('IO2')]).toBe('L');
    },
    60_000,
  );
});
