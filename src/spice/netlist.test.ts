import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readBoardArchive } from '../io/bbfile.ts';
import { buildNetlist, spiceValue } from './netlist.ts';
import { computeConnectivity } from './connectivity.ts';
import type { SpiceModel } from '../model/types.ts';

const samples = join(import.meta.dirname, '..', '..', 'library', 'samples');
const models: SpiceModel[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'library', 'models.json'), 'utf8'));
const load = (group: string, file: string) => readBoardArchive(new Uint8Array(readFileSync(join(samples, group, file))), file, () => undefined).doc;

describe('spice values', () => {
  it('understands engineering notation', () => {
    expect(spiceValue('4.7k', 'R')).toBe('4700');
    expect(spiceValue('4k7', 'R')).toBe('4700');
    expect(spiceValue('1M', 'R')).toBe('1000000');
    expect(spiceValue('100n', 'C')).toBe('1e-7');
    expect(spiceValue('10µF', 'C')).toBe('0.00001');
    expect(spiceValue('1..470u', 'C')).toBeUndefined();
  });
});

describe('netlists of the shipped schematics', () => {
  const files = readdirSync(join(samples, 'schematics')).filter((f) => f.endsWith('.bb'));
  it.each(files)('%s produces a netlist', (file) => {
    const r = buildNetlist(load('schematics', file), file, models);
    expect(r.netlist).toMatch(/\.end\n$/);
    expect(r.netlist).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });

  it.each(['ne555_multivibrator.bb', 'sawtooth.bb', 'noise.bb', 'ota_vcf.bb'])('%s is grounded and has devices', (file) => {
    expect(buildNetlist(load('schematics', file), file, models).errors).toEqual([]);
  });

  it('wires the NE555 multivibrator like the original', () => {
    const doc = load('schematics', 'ne555_multivibrator.bb');
    const r = buildNetlist(doc, 'ne555', models);
    expect(r.netlist).toContain('.SUBCKT NE555');
    expect(r.netlist).toMatch(/^X1 (\d+ ){8}NE555$/m);
    expect(r.netlist).toMatch(/^VCC \d+ 0 DC 5$/m);
    expect(r.plots).toEqual(['v(5)']);
    expect(r.defaultAnalysisAdded).toBe(false);
  });
});

describe('stripboards', () => {
  it('connects pins sharing a copper stripe until a break', () => {
    const doc = load('boards', 'tutorial.bb');
    doc.type = 'STRIPES';
    const c = computeConnectivity(doc);
    expect(c.nets.length).toBeGreaterThan(0);
  });
});

describe('ngspice (wasm)', () => {
  it(
    'simulates the sawtooth generator (multi-line library models)',
    async () => {
      const { netlist } = buildNetlist(load('schematics', 'sawtooth.bb'), 'sawtooth', models, { uic: true });
      expect(netlist).toMatch(/^\.MODEL BC548CSIE NPN\( ?AF= 1\.00E00 .*\)$/m);
      const { Simulation } = await import('eecircuit-engine');
      const sim = new Simulation();
      await sim.start();
      sim.setNetList(netlist);
      const result = await sim.runSim();
      expect(sim.getError().filter((e) => e.trim() && !/^warning/i.test(e))).toEqual([]);
      expect(result.numPoints).toBeGreaterThan(100);
    },
    120_000,
  );

  it(
    'simulates the NE555 astable multivibrator',
    async () => {
      const doc = load('schematics', 'ne555_multivibrator.bb');
      const { netlist } = buildNetlist(doc, 'ne555', models, { uic: true });
      const { Simulation } = await import('eecircuit-engine');
      const sim = new Simulation();
      await sim.start();
      sim.setNetList(netlist);
      const result = await sim.runSim();
      expect(sim.getError().filter((e) => !/^warning/i.test(e))).toEqual([]);
      expect(result.numPoints).toBeGreaterThan(100);
      const out = result.data.find((d) => d.name === 'v(5)');
      expect(out).toBeDefined();
      const values = out!.values as number[];
      // the output toggles between ~0 V and ~5 V
      expect(Math.max(...values)).toBeGreaterThan(3);
      expect(Math.min(...values)).toBeLessThan(1);
    },
    120_000,
  );
});

describe('engineering format', () => {
  it('rounds before choosing the prefix', async () => {
    const { formatEng } = await import('../model/ops.ts');
    expect(formatEng(999.996, 'Hz')).toBe('1kHz');
    expect(formatEng(0.0009999, 'V')).toBe('1mV');
    expect(formatEng(4730, 'Hz')).toBe('4.73kHz');
    expect(formatEng(-0.5, 'V')).toBe('-500mV');
  });
});
