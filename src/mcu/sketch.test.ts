import { describe, expect, it } from 'vitest';
import type { SymbolItem } from '../model/types.ts';
import { encodeSketch, exampleOf, FILE_NAME, mainFile, sketchFiles, templateFiles, TEMPLATES } from './sketch.ts';

describe('templates', () => {
  it('have names the compiler takes and a main file', () => {
    for (const id of TEMPLATES) {
      const files = templateFiles(id);
      expect(files.length, id).toBeGreaterThan(0);
      for (const f of files) expect(f.name, id).toMatch(FILE_NAME);
      expect(files.map((f) => f.name)).toContain(mainFile(files));
    }
  });

  it('put the wiring hint of an example on top', () => {
    expect(templateFiles('blink', 'LED an D13')[0].content).toMatch(/^\/\/ LED an D13\n\nvoid setup\(\)/);
    expect(exampleOf('blink')).toBe('blink');
    expect(exampleOf('clock')).toBeUndefined();
  });

  it('include the clock with its own timer and summer time', () => {
    const [clock] = templateFiles('clock');
    expect(clock.name).toBe('uhr.ino');
    for (const part of ['#include <LiquidCrystal.h>', 'ISR(TIMER1_COMPA_vect)', 'sommerzeitNachUtc()', 'void setup()', 'void loop()']) expect(clock.content).toContain(part);
  });
});

it('reads the files back that it stores in the chip', () => {
  const files = [
    { name: 'a.ino', content: 'void setup() {}\nvoid loop() {}\n' },
    { name: 'b.h', content: '#pragma once\n' },
  ];
  const chip = { kind: 'symbol', properties: { code: encodeSketch(files) } } as unknown as SymbolItem;
  expect(sketchFiles(chip)).toEqual(files);
  expect(sketchFiles({ ...chip, properties: { code: 'kaputt' } })).toBeUndefined();
});
