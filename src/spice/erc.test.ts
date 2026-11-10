import { describe, expect, it } from 'vitest';
import { CircuitBuilder } from '../learn/build.ts';
import { librarySymbols } from '../learn/testing.ts';
import { runErc } from './erc.ts';

const lib = librarySymbols();

describe('electrical rule check', () => {
  it('reports open pins, duplicate designators, bad values and a missing ground', () => {
    const b = new CircuitBuilder(lib);
    const bat = b.add('Battery', 'V1', { x: 96, y: 160 }, { props: { mode: 'DC', dcVoltage: '9' } });
    const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: '1k' });
    b.add('R#', 'R1', { x: 192, y: 256 }, { value: 'abc' });
    b.wire(b.pin(bat, '+'), { x: b.pin(bat, '+').x, y: 96 }, b.pin(r1, 1));
    const v = runErc(b.doc());
    const kinds = v.map((x) => x.kind);
    expect(kinds).toContain('duplicateRef');
    expect(kinds).toContain('noValue');
    expect(kinds).toContain('noGround');
    // R1 pin 2, the second R1 (both pins) and the battery's minus pin are open
    expect(v.filter((x) => x.kind === 'unconnectedPin')).toHaveLength(4);
  });

  it('is quiet for a complete circuit', () => {
    const b = new CircuitBuilder(lib);
    const bat = b.add('Battery', 'V1', { x: 96, y: 160 }, { props: { mode: 'DC', dcVoltage: '9' } });
    const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: '1k' });
    b.wire(b.pin(bat, '+'), { x: b.pin(bat, '+').x, y: 96 }, b.pin(r1, 1));
    const minus = b.pin(bat, '-');
    b.wire(b.pin(r1, 2), { x: b.pin(r1, 2).x, y: minus.y }, minus);
    b.ground(minus);
    expect(runErc(b.doc())).toEqual([]);
  });
});

describe('net labels and supply symbols', () => {
  it('connect by name without wires', async () => {
    const { LABEL_DEFS } = await import('./labels.ts');
    const { computeConnectivity, pinKey } = await import('./connectivity.ts');
    const { symbolItemFromDef } = await import('../io/legacy.ts');
    const b = new CircuitBuilder(lib);
    const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: '1k' });
    const r2 = b.add('R#', 'R2', { x: 192, y: 256 }, { value: '1k' });
    const label = (name: string, at: { x: number; y: number }) => {
      const s = symbolItemFromDef(LABEL_DEFS[0], 0, 0, b.layer, name);
      s.x = at.x;
      s.y = at.y - 8;
      b.items.push(s);
      return s;
    };
    const l1 = label('SIG', b.pin(r1, 2));
    const l2 = label('sig', b.pin(r2, 1));
    const doc = b.doc();
    const c = computeConnectivity(doc);
    expect(c.netOfPin.get(pinKey(l1.id, 0))).toBe(c.netOfPin.get(pinKey(l2.id, 0)));
    expect(c.netOfPin.get(pinKey(r1.id, 1))).toBe(c.netOfPin.get(pinKey(r2.id, 0)));
    // labels are not components: no "unconnected pin" for them
    expect(runErc(doc).filter((v) => v.ref === 'SIG' || v.ref === 'sig')).toEqual([]);
  });
});
