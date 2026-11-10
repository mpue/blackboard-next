// Lesson tests: complete texts in both languages, clean start schematics that
// simulate, tasks that still have to be done at the start and pass once solved.

import { describe, expect, it } from 'vitest';
import type { Doc, LineItem, SymbolItem } from '../../model/types.ts';
import { RASTER } from '../../model/types.ts';
import { itemPins } from '../../geometry/geom.ts';
import { buildNetlist } from '../../spice/netlist.ts';
import type { LiveValues } from '../../spice/live.ts';
import { extractPcbNetlist } from '../../pcb/fromSchematic.ts';
import { footprintById } from '../../pcb/footprints/index.ts';
import { evaluate, needsLive } from '../checks.ts';
import { libraryModels, librarySymbols, operatingPoint } from '../testing.ts';
import type { L10n, Lesson, LessonCheck } from '../types.ts';
import { LESSONS } from './index.ts';
import type { LessonDef } from './kit.ts';

const lib = librarySymbols();
const models = libraryModels();

const IDS = [
  'first-circuit',
  'ohms-law',
  'series-parallel',
  'voltage-divider',
  'potentiometer',
  'diode',
  'led-resistor',
  'zener',
  'transistor-switch',
  'rc-time-constant',
  'rc-lowpass-bench',
  'schematic-to-pcb',
];

/** netlist warnings a start document may have on purpose (parts still to be wired) */
const EXPECTED_WARNINGS: Record<string, string[]> = {
  'series-parallel': ['unconnected:R4'],
  'transistor-switch': ['unconnected:Q1'],
};

/** wire ends that are left open on purpose (the gap for the base resistor) */
const OPEN_ENDS: Record<string, number> = { 'transistor-switch': 2 };

type Quiz = Extract<LessonCheck, { kind: 'quiz' }>;

const children = (c: LessonCheck): LessonCheck[] => (c.kind === 'all' || c.kind === 'any' ? c.checks : []);
const flatten = (c: LessonCheck): LessonCheck[] => [c, ...children(c).flatMap(flatten)];
const quizzesOf = (c: LessonCheck): Quiz[] => flatten(c).filter((x): x is Quiz => x.kind === 'quiz');
const usesPcb = (c: LessonCheck) => flatten(c).some((x) => x.kind === 'isPcb' || x.kind === 'pcbRouted' || x.kind === 'drcClean');
const onlyQuiz = (c: LessonCheck) => flatten(c).every((x) => x.kind === 'quiz' || x.kind === 'all' || x.kind === 'any');

/** answer the lesson panel would record for the (first) quiz of a check */
const answers = (c: LessonCheck, wrong = false): Record<string, number> => {
  const q = quizzesOf(c)[0];
  if (!q) return {};
  return { k: wrong ? (q.answer + 1) % q.options.length : q.answer };
};

const l10nOf = (lesson: Lesson): [string, L10n][] => {
  const out: [string, L10n][] = [
    ['title', lesson.title],
    ['summary', lesson.summary],
  ];
  lesson.steps.forEach((s, i) => {
    out.push([`step ${i} text`, s.text]);
    if (s.hint) out.push([`step ${i} hint`, s.hint]);
    if (s.explain) out.push([`step ${i} explain`, s.explain]);
    if (s.check) {
      for (const q of quizzesOf(s.check)) {
        out.push([`step ${i} question`, q.question]);
        q.options.forEach((o, j) => out.push([`step ${i} option ${j}`, o]));
      }
    }
  });
  return out;
};

const symbols = (doc: Doc) => doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
const wires = (doc: Doc) => doc.items.filter((i): i is LineItem => i.kind === 'line');
const onRaster = (v: number) => Math.abs(v - Math.round(v / RASTER) * RASTER) < 1e-6;

const opCache = new Map<Doc, Promise<LiveValues>>();
const live = (doc: Doc) => {
  let p = opCache.get(doc);
  if (!p) opCache.set(doc, (p = operatingPoint(doc, models)));
  return p;
};

describe('lesson catalogue', () => {
  it('has exactly the twelve lessons in learning order', () => {
    expect(LESSONS.map((l) => l.id)).toEqual(IDS);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: texts, steps and quizzes are complete', (_, lesson) => {
    expect(lesson.minutes).toBeGreaterThan(0);
    expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
    expect(lesson.steps.length).toBeLessThanOrEqual(7);
    for (const [where, text] of l10nOf(lesson)) {
      expect(text.de.trim(), `${where} (de)`).not.toBe('');
      expect(text.en.trim(), `${where} (en)`).not.toBe('');
    }
    for (const step of lesson.steps) {
      if (!step.check) continue;
      const qs = quizzesOf(step.check);
      // the panel shows one quiz per step
      expect(qs.length).toBeLessThanOrEqual(1);
      for (const q of qs) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).toBe(true);
      }
      if (needsLive(step.check)) expect(step.live, 'voltage/current checks need live values').toBe(true);
    }
  });
});

describe.each(LESSONS.map((l) => [l.id, l as LessonDef] as const))('%s', (id, lesson) => {
  const start = lesson.start!(lib, 'de');

  it('starts with a clean, readable schematic', () => {
    for (const lang of ['de', 'en'] as const) {
      const doc = lang === 'de' ? start : lesson.start!(lib, lang);
      expect(doc.type).toBe('SCHEMATICS');
      expect(doc.items.some((i) => i.kind === 'text' && i.text === `<b>${lesson.title[lang]}</b>`), `title (${lang})`).toBe(true);
      const nl = buildNetlist(doc, id, models);
      expect(nl.errors.map((e) => e.key)).toEqual([]);
      expect(nl.warnings.map((w) => `${w.key}:${w.name}`).sort()).toEqual([...(EXPECTED_WARNINGS[id] ?? [])].sort());
    }
    // wires horizontal or vertical on the raster, pins on the raster
    for (const w of wires(start)) {
      expect(w.x1 === w.x2 || w.y1 === w.y2, `wire ${w.x1},${w.y1} – ${w.x2},${w.y2}`).toBe(true);
      for (const v of [w.x1, w.y1, w.x2, w.y2]) expect(onRaster(v), `wire ${w.x1},${w.y1} – ${w.x2},${w.y2}`).toBe(true);
    }
    const pins = symbols(start).flatMap((s) => itemPins(s, () => undefined).map((p) => ({ ...p, ref: s.name })));
    for (const p of pins) expect(onRaster(p.x) && onRaster(p.y), `pin ${p.ref}.${p.pin.num} at ${p.x},${p.y}`).toBe(true);
    // every wire end meets a pin or another wire
    const touches = (x: number, y: number, self: LineItem) =>
      pins.some((p) => Math.hypot(p.x - x, p.y - y) < 1) ||
      wires(start).some((w) => w !== self && Math.min(w.x1, w.x2) <= x && x <= Math.max(w.x1, w.x2) && Math.min(w.y1, w.y2) <= y && y <= Math.max(w.y1, w.y2));
    const open = wires(start).flatMap((w) => [
      [w.x1, w.y1, w],
      [w.x2, w.y2, w],
    ] as const).filter(([x, y, w]) => !touches(x, y, w));
    expect(open.length).toBe(OPEN_ENDS[id] ?? 0);
  });

  it('asks for every change: no task is done at the start', async () => {
    const values = lesson.steps.some((s) => s.check && needsLive(s.check)) ? await live(start) : null;
    lesson.steps.forEach((step, i) => {
      if (!step.check) return;
      if (onlyQuiz(step.check)) {
        expect(evaluate(step.check, { doc: start, live: values, answers: {}, quizKey: 'k' }), `step ${i} unanswered`).toBe('pending');
      } else {
        expect(evaluate(step.check, { doc: start, live: values, answers: answers(step.check), quizKey: 'k' }), `step ${i}`).not.toBe('pass');
      }
    });
  });

  it('is solvable: every task passes on the solution', async () => {
    const solved = lesson.solve ? lesson.solve(start, lib) : start;
    for (const [i, step] of lesson.steps.entries()) {
      if (!step.check || usesPcb(step.check)) continue;
      const doc = lesson.stages?.[i]?.(start, lib) ?? solved;
      const values = needsLive(step.check) ? await live(doc) : null;
      expect(evaluate(step.check, { doc, live: values, answers: answers(step.check), quizKey: 'k' }), `step ${i}`).toBe('pass');
      if (quizzesOf(step.check).length) {
        expect(evaluate(step.check, { doc, live: values, answers: answers(step.check, true), quizKey: 'k' }), `step ${i} wrong answer`).toBe('fail');
      }
    }
    if (lesson.solve) expect(buildNetlist(solved, id, models).errors).toEqual([]);
  }, 30_000);
});

describe('schematic-to-pcb', () => {
  it('converts the start schematic with a footprint for every part', () => {
    const lesson = LESSONS.find((l) => l.id === 'schematic-to-pcb')!;
    const nl = extractPcbNetlist(lesson.start!(lib, 'de'), footprintById);
    expect(nl.warnings.filter((w) => w.key === 'noFootprint' || w.key === 'pinMismatch')).toEqual([]);
    expect(nl.components.map((c) => c.ref).sort()).toEqual(['D1', 'R1', 'S1', 'V1']);
    expect(lesson.steps.map((s) => s.check?.kind)).toEqual(expect.arrayContaining(['isPcb', 'pcbRouted', 'drcClean']));
  });
});
