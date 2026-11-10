// Lesson progress: which lesson runs in which tab, the current step, quiz
// answers and completed lessons (kept in localStorage per browser).

import { create } from 'zustand';
import { openDoc, setActive, useStore } from '../store/store.ts';
import { createDoc } from '../store/store.ts';
import { RASTER } from '../model/types.ts';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import type { Lesson } from './types.ts';

const KEY = 'blackboard.learn.v1';

interface Saved {
  done: Record<string, boolean>;
  answers: Record<string, number>;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { done: {}, answers: {}, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* storage unavailable */
  }
  return { done: {}, answers: {} };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

interface LearnState extends Saved {
  open: boolean;
  lessonId: string | null;
  /** tab the lesson schematic was opened in */
  docId: string | null;
  step: number;
}

export const useLearn = create<LearnState>()(() => ({ open: false, lessonId: null, docId: null, step: 0, ...load() }));

const persist = () => {
  const { done, answers } = useLearn.getState();
  save({ done, answers });
};

export function setLearnOpen(open: boolean) {
  useLearn.setState({ open });
}

export const quizKey = (lessonId: string, step: number) => `${lessonId}#${step}`;

export function startLesson(lesson: Lesson) {
  const st = useStore.getState();
  const doc = lesson.start ? lesson.start(st.library.symbols, st.settings.lang) : createDoc('SCHEMATICS', 65 * RASTER, 41 * RASTER);
  const docId = openDoc(doc, `${lesson.id}.bb`, undefined, false);
  // answers of an earlier run are cleared, so quizzes are asked again
  useLearn.setState((s) => ({
    open: true,
    lessonId: lesson.id,
    docId,
    step: 0,
    answers: Object.fromEntries(Object.entries(s.answers).filter(([k]) => !k.startsWith(`${lesson.id}#`))),
  }));
  persist();
  if (lesson.steps[0]?.live) liveForChecks();
}

/** Voltage and current checks read the DC operating point. */
export function liveForChecks() {
  if (useLive.getState().mode !== 'dc') setLiveMode('dc');
  setLiveValues(true);
}

export function leaveLesson() {
  useLearn.setState({ lessonId: null, docId: null, step: 0 });
}

export function goToStep(lesson: Lesson, step: number) {
  useLearn.setState({ step });
  if (step >= lesson.steps.length) {
    useLearn.setState((s) => ({ done: { ...s.done, [lesson.id]: true } }));
    persist();
    return;
  }
  if (lesson.steps[step].live) liveForChecks();
}

export function answerQuiz(key: string, answer: number) {
  useLearn.setState((s) => ({ answers: { ...s.answers, [key]: answer } }));
  persist();
}

/** Brings the lesson's tab to the front (if it is still open). */
export function showLessonDoc() {
  const id = useLearn.getState().docId;
  if (id && useStore.getState().docs.some((d) => d.id === id)) setActive(id);
}
