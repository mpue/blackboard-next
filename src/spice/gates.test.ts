import { describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../learn/build.ts';
import { librarySymbols, operatingPoint } from '../learn/testing.ts';
import { computeConnectivity, pinKey } from './connectivity.ts';
import { findRef } from '../learn/checks.ts';

const lib = librarySymbols();

/** AND gate of the library driven by two DC sources, output loaded with 10 kΩ. */
async function andGate(a: number, b: number) {
  const k = new CircuitBuilder(lib);
  const g = k.add('AND Gate', 'U1', { x: 320, y: 160 }, { pin: 8 });
  const va = k.add('Battery', 'V1', { x: 96, y: 128 }, { props: { mode: 'DC', dcVoltage: String(a) } });
  const vb = k.add('Battery', 'V2', { x: 192, y: 256 }, { props: { mode: 'DC', dcVoltage: String(b) } });
  const r = k.add('R#', 'R1', { x: 512, y: 192 }, { value: '10k', rotation: 90 });
  k.wire(k.pin(va, '+'), { x: k.pin(va, '+').x, y: k.pin(g, 8).y }, k.pin(g, 8));
  k.wire(k.pin(vb, '+'), { x: k.pin(vb, '+').x, y: k.pin(g, 10).y }, k.pin(g, 10));
  k.wire(k.pin(g, 3), { x: k.pin(r, 1).x, y: k.pin(g, 3).y }, k.pin(r, 1));
  const gnd = { x: 96, y: 448 };
  for (const p of [k.pin(va, '-'), k.pin(vb, '-'), k.pin(r, 2)]) k.wire(p, { x: p.x, y: gnd.y }, gnd);
  k.ground(gnd);
  const doc = k.doc();
  const live = await operatingPoint(doc);
  const conn = computeConnectivity(doc);
  const u1 = findRef(doc, 'U1')!;
  const out = conn.netOfPin.get(pinKey(u1.id, u1.pins.findIndex((p) => p.num === 3)))!;
  return live.netVoltage.get(out)!;
}

describe('library logic gates', () => {
  it('simulates the AND gate with its ports in .SUBCKT order', async () => {
    const both = await andGate(5, 5);
    const one = await andGate(5, 0);
    expect(both).toBeGreaterThan(one + 1);
  }, 60_000);
});
