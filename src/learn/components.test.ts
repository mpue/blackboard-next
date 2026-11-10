// Component guide: content completeness, symbol matching against the shipped
// library and the resolution order of `componentFor`.

import { describe, expect, it } from 'vitest';
import { symbolItemFromDef } from '../io/legacy.ts';
import type { SymbolItem } from '../model/types.ts';
import { matches } from './checks.ts';
import { COMPONENTS, componentFor } from './components.ts';
import { LESSONS } from './lessons/index.ts';
import { librarySymbols } from './testing.ts';
import type { ComponentInfo, L10n } from './types.ts';

// links must point to lessons that exist
const LESSON_IDS = new Set(LESSONS.map((l) => l.id));

const items: SymbolItem[] = librarySymbols().map((d, i) => symbolItemFromDef(d, 0, 0, 'schematic', `X${i}`));

function symbol(name: string): SymbolItem {
  const s = items.find((i) => i.symbolName === name);
  if (!s) throw new Error(`library symbol "${name}" not found`);
  return s;
}

/** every text of an entry with a path for error messages */
function texts(c: ComponentInfo): [string, L10n][] {
  return [
    ['title', c.title],
    ['summary', c.summary],
    ['body', c.body],
    ...(c.formulas ?? []).map((f, i): [string, L10n] => [`formulas[${i}].label`, f.label]),
    ...(c.facts ?? []).flatMap((f, i): [string, L10n][] => [
      [`facts[${i}].label`, f.label],
      [`facts[${i}].value`, f.value],
    ]),
    ...(c.pitfalls ?? []).map((p, i): [string, L10n] => [`pitfalls[${i}]`, p]),
  ];
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

describe('component guide', () => {
  it('has unique ids', () => {
    const ids = COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every text in both languages with balanced markup', () => {
    for (const c of COMPONENTS) {
      for (const [path, t] of texts(c)) {
        for (const lang of ['de', 'en'] as const) {
          const where = `${c.id}.${path}.${lang}`;
          expect(t[lang].trim(), where).not.toBe('');
          // RichText pairs these markers; an odd count breaks the rendering
          expect(count(t[lang], '$') % 2, `${where}: unbalanced $`).toBe(0);
          expect(count(t[lang], '`') % 2, `${where}: unbalanced \``).toBe(0);
          expect(count(t[lang], '*') % 2, `${where}: unbalanced *`).toBe(0);
        }
      }
      for (const f of c.formulas ?? []) {
        expect(f.formula.trim(), `${c.id} formula`).not.toBe('');
        expect(f.formula, `${c.id} formula`).not.toContain('$');
      }
    }
  });

  it('links only existing lessons', () => {
    for (const c of COMPONENTS) for (const id of c.lessons ?? []) expect(LESSON_IDS.has(id), `${c.id} → ${id}`).toBe(true);
  });

  it('has valid match expressions', () => {
    for (const c of COMPONENTS) {
      expect(c.match.spiceType || c.match.name, c.id).toBeTruthy();
      if (c.match.name) expect(() => new RegExp(c.match.name!, 'i'), c.id).not.toThrow();
    }
  });

  it('explains at least one library symbol with every entry', () => {
    for (const c of COMPONENTS) {
      expect(items.some((s) => matches(s, c.match)), `${c.id} matches no library symbol`).toBe(true);
      // not shadowed completely by an earlier entry
      expect(items.some((s) => componentFor(s) === c), `${c.id} is never chosen`).toBe(true);
    }
  });

  it('resolves library symbols to the expected entry', () => {
    const expected: [string, string][] = [
      ['R#', 'resistor'],
      ['Pot', 'potentiometer'],
      ['LDR1', 'ldr'],
      ['-R7-NTC-Widerstand', 'thermistor'],
      ['L1', 'inductor'],
      ['Elko klein', 'electrolytic'],
      ['Tantal', 'electrolytic'],
      ['Capacitor', 'capacitor'],
      ['Keramik', 'capacitor'],
      ['Led rot', 'led'],
      ['Diode', 'diode'],
      ['ZD# Z-Diode', 'zener'],
      ['D#-Schottky-Diode', 'schottky'],
      ['1A Brückengleichrichter', 'rectifier'],
      ['D# Diac', 'thyristor'],
      ['-D91-Fotodiode BPW34', 'photo'],
      ['-Fototransistor-LED-Geh.', 'photo'],
      ['elektor-npn', 'npn'],
      ['-Transistor (Schalt)', 'npn'],
      ['elektor-pnp', 'pnp'],
      ['MOSFETenh.N-channel', 'mosfet'],
      ['Trans.MOSFETenh.N-Kanal', 'mosfet'],
      ['FET-npn', 'jfet'],
      ['LM741', 'opamp'],
      ['LF444-Quad-Low-Power-JFET-OpAmp', 'opamp'],
      ['Timer-IC', 'timer-555'],
      ['7805', 'regulator'],
      ['-Spannungsregel-IC', 'regulator'],
      ['Battery', 'battery'],
      ['Sine Voltage Source', 'battery'],
      ['GND', 'ground'],
      ['Masse-Symbol', 'ground'],
      ['VCC', 'ground'],
      ['elektor-EIN-Taster', 'push-button'],
      ['elektor-EIN-Schalter-klein', 'switch'],
      ['elektor-UM-Schalter-st-klein', 'switch'],
      ['elektor-Relais', 'relay'],
      ['Crystal', 'crystal'],
      ['elektor-Quarz', 'crystal'],
      ['Speaker', 'speaker'],
      ['-Buzzer-Piezo', 'speaker'],
      ['-Si-Feinsicherung-träge', 'fuse'],
      ['-OC5-Optokoppler-', 'optocoupler'],
      ['-Optokoppler-Transistor', 'optocoupler'],
      ['AND Gate', 'logic-gate'],
      ['-U77-Dualer Monostabiler Multivibrator 4538', 'logic-gate'],
      ['-U47-SN74LS74  Dual D-Typ Flip-Flop', 'flipflop'],
      ['ATMega32', 'microcontroller'],
      ["TR'  Trafo 230Vac", 'transformer'],
      ['-K27-Hohlstecker 2,5mm mit Schalter', 'connector'],
      ['Gleichstrom-Motor', 'motor'],
      ['-Glühlampe-klein', 'lamp'],
    ];
    for (const [name, id] of expected) expect(componentFor(symbol(name))?.id, name).toBe(id);
  });

  it('does not explain unijunction transistors as bipolar ones', () => {
    expect(componentFor(symbol('UJT-npn'))).toBeUndefined();
  });

  it('covers most of the library', () => {
    const covered = items.filter((s) => componentFor(s)).length;
    const withPins = items.filter((s) => s.pins.length);
    const coveredWithPins = withPins.filter((s) => componentFor(s)).length;
    console.info(`component guide covers ${covered}/${items.length} library symbols (${coveredWithPins}/${withPins.length} with pins)`);
    expect(covered / items.length).toBeGreaterThan(0.85);
  });
});
