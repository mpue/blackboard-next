import { describe, expect, it } from 'vitest';
import { CircuitBuilder } from './build.ts';
import { evaluate } from './checks.ts';
import { librarySymbols, operatingPoint } from './testing.ts';

const lib = librarySymbols();

/** 9 V battery, series resistor and a red LED to ground. */
function ledCircuit(r = '470') {
  const b = new CircuitBuilder(lib);
  const bat = b.add('Battery', 'V1', { x: 96, y: 160 }, { pin: 1, props: { mode: 'DC', dcVoltage: '9' }, value: '9V' });
  const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: r });
  const led = b.add('Led rot', 'D1', { x: 352, y: 96 });
  b.wire(b.pin(bat, '+'), { x: b.pin(bat, '+').x, y: 96 }, b.pin(r1, 1));
  b.wire(b.pin(r1, 2), b.pin(led, 'A'));
  const k = b.pin(led, 'K');
  const minus = b.pin(bat, '-');
  b.wire(k, { x: k.x + 32, y: k.y }, { x: k.x + 32, y: minus.y + 32 }, { x: minus.x, y: minus.y + 32 }, minus);
  b.ground({ x: minus.x, y: minus.y + 32 });
  return b.doc();
}

describe('lesson checks', () => {
  it('evaluates structure and values without a simulation', () => {
    const doc = ledCircuit();
    expect(evaluate({ kind: 'symbol', match: { spiceType: 'DIODE', name: 'led' } }, { doc })).toBe('pass');
    expect(evaluate({ kind: 'value', ref: 'R1', min: 400, max: 500 }, { doc })).toBe('pass');
    expect(evaluate({ kind: 'value', ref: 'R1', min: 1000, max: 2000 }, { doc })).toBe('fail');
    expect(evaluate({ kind: 'connected', a: { ref: 'R1', pin: 2 }, b: { ref: 'D1', pin: 'A' } }, { doc })).toBe('pass');
    expect(evaluate({ kind: 'connected', a: { ref: 'R1', pin: 1 }, b: { ref: 'D1', pin: 'A' } }, { doc })).toBe('fail');
    expect(evaluate({ kind: 'current', ref: 'D1', min: 0.01, max: 0.02 }, { doc })).toBe('pending');
    expect(evaluate({ kind: 'quiz', question: { de: '', en: '' }, options: [], answer: 1 }, { doc, quizKey: 'q', answers: { q: 1 } })).toBe('pass');
    expect(evaluate({ kind: 'product', refs: ['R1', 'R1'], min: 2e5, max: 2.3e5 }, { doc })).toBe('pass');
    // R1 sits between the battery + and the LED anode, whatever it is called
    const between = { kind: 'between', a: { ref: 'V1', pin: '+' }, b: { ref: 'D1', pin: 'A' }, match: { spiceType: 'RESISTOR' } } as const;
    expect(evaluate(between, { doc })).toBe('pass');
    expect(evaluate({ ...between, min: 400, max: 500 }, { doc })).toBe('pass');
    expect(evaluate({ ...between, min: 1000, max: 2000 }, { doc })).toBe('fail');
    expect(evaluate({ ...between, b: { ref: 'D1', pin: 'K' } }, { doc })).toBe('fail');
  });

  it('measures the LED current with the built-in LED model', async () => {
    const doc = ledCircuit();
    const live = await operatingPoint(doc);
    // (9 V - ~1.9 V) / 470 Ω ≈ 15 mA
    expect(evaluate({ kind: 'current', ref: 'D1', min: 0.013, max: 0.017 }, { doc, live })).toBe('pass');
    expect(evaluate({ kind: 'voltage', at: { ref: 'D1', pin: 'A' }, ref: { ref: 'D1', pin: 'K' }, min: 1.7, max: 2.1 }, { doc, live })).toBe('pass');
    expect(evaluate({ kind: 'voltage', at: { ref: 'V1', pin: '+' }, min: 8.99, max: 9.01 }, { doc, live })).toBe('pass');
  }, 60_000);
});
