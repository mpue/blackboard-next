import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Atmega328p } from './atmega328p.ts';
import { parseHex } from './hex.ts';
import { exampleHex } from './examples.ts';
import { esp32ExampleById } from './esp32Examples.ts';
import { Esp32Chip, Esp32Runtime, MicroPythonRunner } from './esp32chip.ts';
import { MICROPYTHON_OFFSET } from './esp32Firmware.ts';
import { IO_PINS, MODELS } from './pinout.ts';
import { LcdBus, type LcdLink } from './lcdBus.ts';
import { lcdText } from './hd44780.ts';
import type { SymbolDef, SymbolItem } from '../model/types.ts';
import { opNetlist } from '../spice/live.ts';
import { checkSimulation } from '../spice/readiness.ts';
import { buildEsp32LcdDemo, buildLcdDemo } from './mcuDemo.ts';
import { wireDisplays } from './lcdWiring.ts';

const lib: SymbolDef[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8'));

async function op(netlist: string) {
  const { Simulation } = await import('eecircuit-engine');
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(netlist);
  const res = await sim.runSim();
  return new Map(res.data.map((d) => [d.name.toLowerCase(), Number((d.values as number[])[0])]));
}

const dip = (arduino: string) => IO_PINS.find((p) => p.arduino === arduino)!.num;
const espNum = (label: string) => MODELS.esp32.io.find((p) => p.label === label)!.num;
const espDir = join(import.meta.dirname, '..', '..', 'public', 'esp32');
const esp = (f: string) => new Uint8Array(readFileSync(join(espDir, f)));

describe('LCD on a microcontroller', () => {
  it('shows the text of the ATmega example', async () => {
    const chip = new Atmega328p(parseHex(await exampleHex('lcd')).flash);
    const bus = new LcdBus();
    const link: LcdLink = { id: 'lcd', powered: true, rs: dip('D2'), rw: dip('D3'), e: dip('D4'), d: [undefined, undefined, undefined, undefined, dip('D8'), dip('D9'), dip('D10'), dip('D11')] };
    const level = (num: number | undefined) => (num === undefined ? 0 : chip.level(num));
    chip.watch((port, value, changed) => {
      for (let bit = 0; bit < 8; bit++) {
        if (!(changed & (1 << bit))) continue;
        const num = IO_PINS.find((p) => p.port === port && p.bit === bit)?.num;
        if (num !== undefined && bus.pins.has(num)) bus.edge(num, (value >> bit) & 1 ? 1 : 0, level);
      }
    });
    bus.update([link], level);
    chip.run(0.5 * chip.frequency);
    let shown = bus.changed().at(-1)!.state;
    expect(lcdText(shown, 16, 2)).toEqual(['Hallo BlackBoard', 'Zeit:    0 s'.padEnd(16)]);
    expect(shown.cursor).toBe(false);
    chip.run(2.1 * chip.frequency);
    shown = bus.changed().at(-1)!.state;
    expect(lcdText(shown, 16, 2)[1]).toBe('Zeit:    2 s'.padEnd(16));
  });

  it(
    'shows the text of the ESP32 MicroPython example',
    async () => {
      const rt = await Esp32Runtime.create(esp('esp32sim.wasm'));
      const chip = new Esp32Chip(rt, esp('esp32_rev300_rom.elf'), esp('micropython-esp32.bin'), MICROPYTHON_OFFSET);
      const tx: number[] = [];
      const runner = new MicroPythonRunner(esp32ExampleById('lcd')!.script, (t) => tx.push(...new TextEncoder().encode(t)));
      const bus = new LcdBus();
      const link: LcdLink = { id: 'lcd', powered: true, rs: espNum('IO21'), e: espNum('IO19'), d: [undefined, undefined, undefined, undefined, espNum('IO4'), espNum('IO0'), espNum('IO2'), espNum('IO15')] };
      const keyOf = (num: number | undefined) => MODELS.esp32.io.find((p) => p.num === num)?.key;
      const levels = new Map<number, 0 | 1>();
      const level = (num: number | undefined): 0 | 1 => levels.get(keyOf(num) ?? -1) ?? 0;
      chip.observe(true);
      bus.update([link], level);
      const ms = (n: number) => {
        for (let i = 0; i < n; i++) {
          chip.run(chip.hz / 1000);
          for (const ev of chip.edges()) {
            const g = ev & 0xff;
            const now: 0 | 1 = (ev >> 8) & 1 ? 1 : 0;
            levels.set(g, now);
            const num = MODELS.esp32.io.find((p) => p.key === g)?.num;
            if (num !== undefined && bus.pins.has(num)) bus.edge(num, now, level);
          }
          if (tx.length) chip.serialIn(Uint8Array.from(tx.splice(0, 10)));
          runner.feed(chip.serialOut());
        }
      };
      for (let t = 0; t < 5000 && !runner.running; t += 10) ms(10);
      ms(1500);
      const shown = bus.changed().at(-1)!.state;
      expect(lcdText(shown, 16, 2)).toEqual(['Hallo ESP32!    ', 'Zeit:    1 s'.padEnd(16)]);
      chip.dispose();
    },
    60_000,
  );
});

describe('LCD demos', () => {
  it(
    'ATmega328P: wired completely; the operating point finds the bus, and the firmware writes the text',
    async () => {
      const doc = await buildLcdDemo(lib, 'de');
      expect(checkSimulation(doc).issues.map((i) => i.kind)).toEqual(['mcuLiveOnly']);
      const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
      const lcd = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'LCD1')!;
      const nl = opNetlist(doc, 't', []);
      // nothing but a chip and a display: still a circuit for the live values
      expect(nl.errors).toEqual([]);
      const { links, view } = wireDisplays(nl, await op(nl.netlist));
      expect(view[lcd.id]).toMatchObject({ powered: true, contrast: 1, chip: u1.id });
      // (5 V - 2.1 V) / 100 Ω is more than full brightness
      expect(view[lcd.id].backlight).toBe(1);
      const link = links.get(u1.id)![0];
      expect(link).toMatchObject({ rs: dip('D2'), rw: dip('D3'), e: dip('D4') });
      expect(link.d.slice(4)).toEqual([dip('D8'), dip('D9'), dip('D10'), dip('D11')]);

      const chip = new Atmega328p(parseHex(u1.properties!.firmware).flash);
      const bus = new LcdBus();
      const level = (num: number | undefined) => (num === undefined ? 0 : chip.level(num));
      chip.watch((port, value, changed) => {
        for (let bit = 0; bit < 8; bit++) {
          const num = IO_PINS.find((p) => p.port === port && p.bit === bit)?.num;
          if (changed & (1 << bit) && num !== undefined && bus.pins.has(num)) bus.edge(num, (value >> bit) & 1 ? 1 : 0, level);
        }
      });
      bus.update([link], level);
      chip.run(1.2 * chip.frequency);
      expect(lcdText(bus.changed().at(-1)!.state, 16, 2)).toEqual(['Hallo BlackBoard', 'Zeit:    1 s'.padEnd(16)]);
    },
    120_000,
  );

  it(
    'ESP32: wired completely, RW on the GND pin, the bus found by the operating point',
    async () => {
      const doc = buildEsp32LcdDemo(lib, 'en');
      expect(checkSimulation(doc).issues.map((i) => i.kind)).toEqual(['mcuLiveOnly']);
      const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
      const lcd = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'LCD1')!;
      const nl = opNetlist(doc, 't', []);
      const { links, view } = wireDisplays(nl, await op(nl.netlist));
      expect(view[lcd.id]).toMatchObject({ powered: true, contrast: 1, chip: u1.id });
      const link = links.get(u1.id)![0];
      expect(link).toMatchObject({ rs: espNum('IO21'), e: espNum('IO19'), rw: undefined });
      expect(link.d.slice(4)).toEqual([espNum('IO4'), espNum('IO0'), espNum('IO2'), espNum('IO15')]);
    },
    120_000,
  );
});
