import { describe, expect, it } from 'vitest';
import { HexError, parseHex, toHex } from './hex.ts';
import { EXAMPLES, exampleHex, type ExampleId } from './examples.ts';
import { Atmega328p } from './atmega328p.ts';

const MHZ16 = 16_000_000;

async function chip(id: ExampleId) {
  return new Atmega328p(parseHex(await exampleHex(id)).flash, MHZ16);
}

/** runs `seconds` in steps of `step` seconds and collects the drive of one pin after each step */
function trace(mcu: Atmega328p, pin: number, seconds: number, step = 0.01) {
  const out: (string | number)[] = [];
  for (let t = 0; t < seconds; t += step) {
    mcu.run(step * mcu.frequency);
    out.push(mcu.drives()[pin]);
  }
  return out;
}

const edges = (xs: (string | number)[]) => xs.slice(1).filter((x, i) => x !== xs[i]).length;

describe('Intel HEX', () => {
  it('writes and reads back the same bytes', () => {
    const bytes = Uint8Array.from({ length: 40 }, (_, i) => (i * 7) & 0xff);
    const text = toHex(bytes);
    expect(text.split('\n')[0]).toMatch(/^:10000000/);
    const fw = parseHex(text);
    expect(fw.used).toBe(40);
    expect([...fw.flash.subarray(0, 40)]).toEqual([...bytes]);
    expect(fw.flash[40]).toBe(0xff);
  });

  it('follows extended addresses and rejects broken files', () => {
    // two data bytes at 0x0010 + segment 0x0100 * 16 = 0x1010
    const fw = parseHex(':020000020100FB\n:02001000AABB89\n:00000001FF\n');
    expect(fw.flash[0x1010]).toBe(0xaa);
    expect(fw.flash[0x1011]).toBe(0xbb);
    expect(() => parseHex(':02001000AABB88\n')).toThrow(HexError);
    expect(() => parseHex('hello')).toThrow(/format/);
    expect(() => parseHex(':00000001FF\n')).toThrow(/empty/);
  });
});

describe('ATmega328P examples', () => {
  it('all assemble', async () => {
    for (const ex of EXAMPLES) await expect(exampleHex(ex.id)).resolves.toMatch(/^:/);
  });

  it('blink toggles D13 (pin 19) twice a second', async () => {
    const mcu = await chip('blink');
    const t = trace(mcu, 19, 2.05);
    expect(edges(t)).toBe(4);
    expect(new Set(t)).toEqual(new Set(['H', 'L']));
  });

  it('button: D13 follows D2 with the internal pull-up', async () => {
    const mcu = await chip('button');
    mcu.run(1000);
    let d = mcu.drives();
    expect(d[4]).toBe('PU');
    mcu.setInput(4, true);
    mcu.run(1000);
    expect(mcu.drives()[19]).toBe('L');
    mcu.setInput(4, false);
    mcu.run(1000);
    d = mcu.drives();
    expect(d[19]).toBe('H');
  });

  it('chaser walks through D8..D13', async () => {
    const mcu = await chip('chaser');
    const seen: number[] = [];
    // sample in the middle of each 150 ms step
    mcu.run(0.075 * MHZ16);
    for (let k = 0; k < 7; k++) {
      mcu.run(0.15 * MHZ16);
      const d = mcu.drives();
      seen.push([14, 15, 16, 17, 18, 19].find((p) => d[p] === 'H') ?? 0);
    }
    expect(seen).toEqual([15, 16, 17, 18, 19, 14, 15]);
  });

  it('dimmer: the voltage on A0 sets the PWM duty on D9', async () => {
    const mcu = await chip('dimmer');
    mcu.setReferences(5, 5);
    for (const [volts, duty] of [
      [2.5, 0.5],
      [1.25, 0.25],
      [5, 1],
    ] as const) {
      mcu.setAnalog(0, volts);
      mcu.run(0.02 * MHZ16);
      mcu.drives();
      mcu.run(0.02 * MHZ16);
      const d = mcu.drives()[15];
      if (duty === 1) expect(d).toBe('H');
      else expect(d).toBeCloseTo(duty, 1);
    }
  });

  it('serial: greets and echoes at 9600 baud', async () => {
    const mcu = await chip('serial');
    let text = '';
    mcu.usart.onByteTransmit = (b) => (text += String.fromCharCode(b));
    mcu.run(0.05 * MHZ16);
    expect(text).toBe('Hallo von BlackBoard!\r\n');
    // UBRR = 103 at 16 MHz gives 9615 baud, as on the real chip
    expect(Math.abs(mcu.usart.baudRate - 9600) / 9600).toBeLessThan(0.01);
    for (const c of 'Hi') {
      while (!mcu.receive(c.charCodeAt(0))) mcu.run(100);
      mcu.run(0.002 * MHZ16);
    }
    mcu.run(0.01 * MHZ16);
    expect(text.endsWith('Hi')).toBe(true);
  });

  it('demo: blinks four times faster while the button is pressed', async () => {
    const mcu = await chip('demo');
    mcu.setReferences(5, 5);
    mcu.setAnalog(0, 2.5);
    mcu.setInput(4, true);
    expect(edges(trace(mcu, 19, 2.05))).toBe(4);
    mcu.setInput(4, false);
    const fast = edges(trace(mcu, 19, 2.0));
    expect(fast).toBeGreaterThanOrEqual(15);
    expect(fast).toBeLessThanOrEqual(17);
    mcu.run(0.01 * MHZ16);
    expect(mcu.drives()[15]).toBeCloseTo(0.5, 1);
  });

  it('runs faster than real time', async () => {
    const mcu = await chip('demo');
    const t0 = performance.now();
    mcu.run(MHZ16 / 2);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
  });
});
