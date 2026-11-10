import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, SymbolDef, SymbolItem } from '../model/types.ts';
import { buildNetlist } from '../spice/netlist.ts';
import { averageOperatingPoints, opNetlist } from '../spice/live.ts';
import { checkSimulation } from '../spice/readiness.ts';
import { readInputs } from './coupling.ts';
import { buildEsp32Demo } from './mcuDemo.ts';
import { Esp32Chip, Esp32Runtime, MicroPythonRunner } from './esp32chip.ts';
import { MICROPYTHON_OFFSET } from './esp32Firmware.ts';
import { MODELS, type Drives } from './pinout.ts';

const lib: SymbolDef[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'symbols.json'), 'utf8'));
const esp = (f: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'esp32', f)));
const io = MODELS.esp32.io;
const num = (label: string) => io.find((p) => p.label === label)!.num;

async function op(netlist: string) {
  const { Simulation } = await import('eecircuit-engine');
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(netlist);
  const res = await sim.runSim();
  return new Map(res.data.map((d) => [d.name.toLowerCase(), Number((d.values as number[])[0])]));
}

const withProps = (doc: Doc, name: string, props: Record<string, string>): Doc => ({
  ...doc,
  items: doc.items.map((i) => (i.kind === 'symbol' && i.name === name ? { ...i, properties: { ...(i.properties ?? {}), ...props } } : i)),
});

describe('ESP32 in a saved schematic', () => {
  it('keeps the MicroPython code and a firmware image through .bb', async () => {
    const { readBoardArchive, writeBoardArchive } = await import('../io/bbfile.ts');
    const doc = withProps(buildEsp32Demo(lib, 'de'), 'U1', { firmware: 'eJzLSM3JyVcozy/KSQEAGgQEXQ==', firmwareOffset: '4096' });
    const bytes = await writeBoardArchive(doc, 'esp32.bb', async () => new Uint8Array());
    const back = readBoardArchive(bytes, 'esp32.bb', () => undefined).doc;
    const before = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
    const after = back.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
    // the XML reader trims text: the final newline goes, which Python does not mind
    expect(after.properties).toEqual({ ...before.properties, script: before.properties!.script.trimEnd() });
    expect(after.properties!.script).toContain('\n    dimmed.duty_u16(pot.read_u16())\n');
  });
});

describe('ESP32 board in the circuit', () => {
  it('is the reference and powers itself over USB', () => {
    const doc = buildEsp32Demo(lib, 'de');
    const nl = buildNetlist(doc, 't');
    const m = nl.mcus[0];
    expect(m.kind).toBe('esp32');
    expect(m.gnd).toBe('0');
    expect(nl.netlist).toMatch(/^VU1_REG \d+ 0 DC 3.3$/m);
    expect(nl.netlist).toMatch(new RegExp(`^RU1_VDD ${m.vdd} 0 100$`, 'm'));
    // a pin driven high goes through the 40 Ω driver to 3V3
    const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
    const high = buildNetlist(doc, 't', [], { mcu: new Map<string, Drives>([[u1.id, { [num('IO2')]: 'H', [num('IO18')]: 'PU' }]]) });
    expect(high.netlist).toMatch(new RegExp(`^RU1_P${num('IO2')}H ${m.nodes[num('IO2')]} ${m.vdd} 40$`, 'm'));
    expect(high.netlist).toMatch(new RegExp(`^RU1_P${num('IO18')}U \\d+ ${m.vdd} 45000$`, 'm'));
  });

  it('is wired completely in the demo and asks for power without USB', () => {
    const doc = buildEsp32Demo(lib, 'en');
    expect(checkSimulation(doc).issues.map((i) => i.kind)).toEqual(['mcuLiveOnly']);
    // without USB the demo has its board unpowered: 3V3 only feeds the potentiometer
    const noUsb = withProps(doc, 'U1', { usb: 'false' });
    expect(buildNetlist(noUsb, 't').netlist).not.toMatch(/VU1_REG/);
    const bare = withProps(noUsb, 'U1', { script: '' });
    const kinds = checkSimulation({ ...bare, items: bare.items.filter((i) => i.kind !== 'line') }).issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['mcuPower', 'mcuFirmware']));
  });

  it(
    'regulates 3.3 V from a 5 V supply when USB is off (real ngspice)',
    async () => {
      const doc = withProps(buildEsp32Demo(lib, 'en'), 'U1', { usb: 'false' });
      const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
      const { LABEL_DEFS } = await import('../spice/labels.ts');
      const { placeWithPin, pinOf } = await import('../spice/benchDemo.ts');
      const v5 = pinOf(u1, 19);
      const plus5 = placeWithPin(LABEL_DEFS.find((d) => d.name === '+5V')!, '+5V', 1, { x: v5.x - 64, y: v5.y }, doc.layers[0].id);
      plus5.value = '+5V';
      const fed: Doc = {
        ...doc,
        items: [...doc.items, plus5, { id: 'w5', kind: 'line', layer: doc.layers[0].id, x1: v5.x - 64, y1: v5.y, x2: v5.x, y2: v5.y, color: '#00f', thickness: 2, startType: 'STRAIGHT', endType: 'STRAIGHT' }],
      };
      const nl = opNetlist(fed, 't', []);
      expect(nl.netlist).toMatch(/^BU1_LDO \d+ 0 V=max\(0,min\(3.3,V\(\d+\)-1.1\)\)$/m);
      expect(nl.netlist).toMatch(/^RU1_LDOIN \d+ 0 1000$/m);
      const v = await op(nl.netlist);
      expect(readInputs(nl.mcus[0], v).vcc).toBeCloseTo(3.3, 1);
    },
    120_000,
  );

  it(
    'runs the demo in a closed loop: potentiometer -> ADC -> PWM, button -> IO18',
    async () => {
      const doc = buildEsp32Demo(lib, 'en');
      const u1 = doc.items.find((i): i is SymbolItem => i.kind === 'symbol' && i.name === 'U1')!;
      const rt = await Esp32Runtime.create(esp('esp32sim.wasm'));
      const chip = new Esp32Chip(rt, esp('esp32_rev300_rom.elf'), esp('micropython-esp32.bin'), MICROPYTHON_OFFSET);
      const tx: number[] = [];
      const runner = new MicroPythonRunner(u1.properties!.script, (t) => tx.push(...new TextEncoder().encode(t)));
      const ms = (n: number) => {
        for (let i = 0; i < n; i++) {
          chip.run(chip.hz / 1000);
          if (tx.length) chip.serialIn(Uint8Array.from(tx.splice(0, 10)));
          runner.feed(chip.serialOut());
        }
      };
      for (let t = 0; t < 5000 && !runner.running; t += 10) ms(10);
      expect(runner.running).toBe(true);

      let drives: Drives = {};
      let digital: Record<number, boolean> = {};
      const step = async (d: Doc) => {
        // PWM pins high and low in turn, weighted (as the live values do)
        const pwm = Object.entries(drives).filter(([, x]) => typeof x === 'number');
        const variants = pwm.length
          ? [true, false].map((high) => ({ mcu: new Map([[u1.id, { ...drives, [pwm[0][0]]: high ? 'H' : 'L' } as Drives]]), weight: high ? (pwm[0][1] as number) : 1 - (pwm[0][1] as number) }))
          : [{ mcu: new Map([[u1.id, drives]]), weight: 1 }];
        const runs = [];
        for (const v of variants) {
          const nl = opNetlist(d, 't', [], v.mcu);
          runs.push({ nl, weight: v.weight, vectors: await op(nl.netlist) });
        }
        const avg = averageOperatingPoints(runs);
        const inp = readInputs(avg.nl.mcus[0], avg.vectors, digital, drives);
        digital = inp.digital;
        for (const p of io) {
          if (avg.nl.mcus[0].nodes[p.num] !== undefined) chip.setInput(p.key, inp.digital[p.num]);
          if (p.analog && p.num in inp.analog) chip.setAnalog(p.key, inp.analog[p.num]);
        }
        ms(100);
        drives = chip.drives(io);
        return { inp, avg };
      };
      let r = await step(doc);
      expect(r.inp.vcc).toBeCloseTo(3.3, 1);
      // wiper in the middle: about half of 3.3 V on IO34, about half brightness on IO4
      expect(r.inp.analog[num('IO34')]).toBeGreaterThan(1.3);
      expect(r.inp.analog[num('IO34')]).toBeLessThan(2);
      r = await step(doc);
      const duty = drives[num('IO4')];
      expect(typeof duty).toBe('number');
      expect(duty as number).toBeGreaterThan(0.3);
      expect(duty as number).toBeLessThan(0.7);
      // the LED on IO4 carries the duty-weighted current
      const led2 = doc.items.find((i) => i.kind === 'symbol' && i.name === 'LED2')!;
      const ledEl = r.avg.nl.elements.find((e) => e.symbolId === led2.id)!;
      const id = r.avg.vectors.get(`@${ledEl.name.toLowerCase()}[id]`) ?? r.avg.vectors.get(`i(@${ledEl.name.toLowerCase()}[id])`)!;
      expect(id).toBeGreaterThan(0.001);
      expect(drives[num('IO18')]).toBe('PU');
      expect(r.inp.digital[num('IO18')]).toBe(true);
      // pressing S1 pulls IO18 low
      r = await step(withProps(doc, 'S1', { closed: 'true' }));
      expect(r.inp.digital[num('IO18')]).toBe(false);
      chip.dispose();
    },
    120_000,
  );
});
