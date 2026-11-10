import { describe, expect, it } from 'vitest';
import { blankOut, callAt, scanProgram, splitParams } from './codeIntel.ts';

const SKETCH = `#include <LiquidCrystal.h>
#include <Servo.h>
#define LED 13
#define SQUARE(x) ((x) * (x))

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
Servo arm;
unsigned long last = 0;
const int pins[] = {8, 9, 10};

struct Ampel {
  int rot;
  int gruen;
  void schalten(int phase);
};
Ampel ampel;

// void notAFunction(int x) {
int blinken(int pin, unsigned long ms) {
  digitalWrite(pin, HIGH);
  return 0;
}

void setup() {
  lcd.begin(16, 2);
  String text = "void nope(int a) {";
}
`;

describe('scanProgram', () => {
  const info = scanProgram([
    { name: 'sketch.ino', content: SKETCH },
    { name: 'hilfe.h', content: 'void hilfe(uint8_t n);\nextern volatile int zaehler;\n' },
  ]);
  const byName = (n: string) => info.symbols.find((s) => s.name === n);

  it('finds functions with their parameters, also prototypes in other files', () => {
    expect(byName('blinken')).toMatchObject({ kind: 'function', type: 'int', params: 'int pin, unsigned long ms', file: 'sketch.ino', line: 19 });
    expect(byName('setup')).toMatchObject({ kind: 'function', type: 'void', params: '' });
    expect(byName('hilfe')).toMatchObject({ kind: 'function', file: 'hilfe.h', line: 1 });
    expect(byName('notAFunction')).toBeUndefined();
    expect(byName('nope')).toBeUndefined();
  });

  it('knows objects and variables by their type', () => {
    expect(byName('lcd')).toMatchObject({ kind: 'variable', type: 'LiquidCrystal', line: 6 });
    expect(info.varTypes.get('lcd')).toBe('LiquidCrystal');
    expect(info.varTypes.get('arm')).toBe('Servo');
    expect(info.varTypes.get('ampel')).toBe('Ampel');
    expect(info.varTypes.get('text')).toBe('String');
    expect(byName('last')).toMatchObject({ type: 'unsigned long' });
    expect(byName('pins')?.type).toBe('const int[]');
    expect(byName('pin')).toMatchObject({ kind: 'variable', type: 'int' });
    expect(byName('zaehler')).toMatchObject({ kind: 'variable', file: 'hilfe.h' });
  });

  it('reads macros and struct members', () => {
    expect(byName('LED')).toMatchObject({ kind: 'macro', type: '13' });
    expect(byName('SQUARE')).toMatchObject({ kind: 'macro', params: 'x' });
    expect(info.types.get('Ampel')?.map((s) => [s.name, s.line])).toEqual([
      ['schalten', 14],
      ['rot', 12],
      ['gruen', 13],
    ]);
  });
});

describe('callAt', () => {
  it('names the call and the argument the cursor is in', () => {
    expect(callAt('  digitalWrite(13, ')).toMatchObject({ name: 'digitalWrite', arg: 1 });
    expect(callAt('lcd.setCursor(')).toMatchObject({ name: 'setCursor', object: 'lcd', arg: 0 });
    expect(callAt('analogWrite(9, map(analogRead(A0), 0, 1023, ')).toMatchObject({ name: 'map', arg: 3 });
    expect(callAt('analogWrite(9, analogRead(A0) / 4')).toMatchObject({ name: 'analogWrite', arg: 1 });
    expect(callAt('Serial.print("a, b (c", ')).toMatchObject({ name: 'print', object: 'Serial', arg: 1 });
  });

  it('is quiet outside calls and in if/for', () => {
    expect(callAt('digitalWrite(13, HIGH);\n  ')).toBeNull();
    expect(callAt('if (x > ')).toBeNull();
    expect(callAt('void loop() {\n  ')).toBeNull();
  });
});

it('splits parameters at the top level only', () => {
  expect(splitParams('uint8_t interrupt, void (*isr)(), int mode')).toEqual(['uint8_t interrupt', 'void (*isr)()', 'int mode']);
  expect(splitParams('')).toEqual([]);
});

it('blanks comments and strings but keeps the lines', () => {
  const s = blankOut('int a; // x(\n/* y\n */ char* t = "(,)";');
  expect(s.split('\n')).toHaveLength(3);
  expect(s).not.toMatch(/[xy(,)]\W*$/m);
  expect(s).toContain('"   "');
});
