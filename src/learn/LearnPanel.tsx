import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleDashed, GraduationCap, Lightbulb, Loader2, RotateCcw, X, Trophy, ExternalLink } from 'lucide-react';
import { activeDoc, useStore } from '../store/store.ts';
import { useLive } from '../store/live.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, IconButton, cx } from '../ui/primitives.tsx';
import { usePcbStats } from '../ui/PcbStatus.tsx';
import { runDrc } from '../pcb/drc.ts';
import { zoneFillsOf } from '../editor/zoneFills.ts';
import { evaluate, needsLive, type CheckResult } from './checks.ts';
import { RichText } from './RichText.tsx';
import { LESSONS } from './lessons/index.ts';
import { answerQuiz, goToStep, leaveLesson, liveForChecks, quizKey, setLearnOpen, showLessonDoc, startLesson, useLearn } from './state.ts';
import type { L10n, Lesson, LessonCheck, LessonStep, LessonTopic } from './types.ts';

const TOPICS: LessonTopic[] = ['basics', 'semiconductors', 'analog', 'digital', 'pcb'];

function useL10n() {
  const lang = useStore((s) => s.settings.lang);
  return (t: L10n) => t[lang] || t.de;
}

const usesPcb = (c: LessonCheck | undefined): boolean =>
  !!c && (c.kind === 'isPcb' || c.kind === 'pcbRouted' || c.kind === 'drcClean' || ((c.kind === 'all' || c.kind === 'any') && c.checks.some(usesPcb)));
const usesDrc = (c: LessonCheck | undefined): boolean => !!c && (c.kind === 'drcClean' || ((c.kind === 'all' || c.kind === 'any') && c.checks.some(usesDrc)));

/** Result of the current step's check on the lesson document (or the active PCB). */
function useStepResult(lesson: Lesson, index: number, step: LessonStep | undefined): CheckResult | undefined {
  const docId = useLearn((s) => s.docId);
  const answers = useLearn((s) => s.answers);
  const active = useStore((s) => activeDoc(s));
  const lessonDoc = useStore((s) => s.docs.find((d) => d.id === docId));
  const pcbStep = usesPcb(step?.check);
  const ds = pcbStep ? active : (lessonDoc ?? active);
  const live = useLive((s) => (s.on && ds && s.docId === ds.id ? s.values : null));
  const unrouted = usePcbStats((s) => s.unrouted);
  const items = ds?.doc.items;
  const drcErrors = useMemo(() => {
    if (!ds || ds.doc.type !== 'PCB' || !usesDrc(step?.check)) return undefined;
    return runDrc(ds.doc, { zoneFills: zoneFillsOf(ds.doc) }).filter((v) => v.severity === 'error').length;
  }, [items, step]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!step?.check || !ds) return undefined;
  return evaluate(step.check, { doc: ds.doc, live, answers, quizKey: quizKey(lesson.id, index), pcb: { unrouted, drcErrors } });
}

function Quiz({ lesson, index, check }: { lesson: Lesson; index: number; check: Extract<LessonCheck, { kind: 'quiz' }> }) {
  const tr = useL10n();
  const t = useT();
  const key = quizKey(lesson.id, index);
  const chosen = useLearn((s) => s.answers[key]);
  return (
    <div className="mt-2 rounded-lg border border-line bg-panel-2 p-2.5">
      <RichText text={tr(check.question)} className="mb-2 font-medium" />
      <div className="grid gap-1">
        {check.options.map((o, i) => {
          const picked = chosen === i;
          const right = picked && i === check.answer;
          return (
            <button
              key={i}
              onClick={() => answerQuiz(key, i)}
              className={cx(
                'rounded-md border px-2.5 py-1.5 text-left text-[12px] transition-colors',
                right ? 'border-emerald-500 bg-emerald-500/15' : picked ? 'border-red-500 bg-red-500/10' : 'border-line bg-panel hover:border-accent/60',
              )}
            >
              <RichText text={tr(o)} />
            </button>
          );
        })}
      </div>
      {chosen !== undefined && <p className={cx('mt-1.5 text-[12px] font-medium', chosen === check.answer ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{t(chosen === check.answer ? 'learn.correct' : 'learn.wrong')}</p>}
    </div>
  );
}

function quizOf(c: LessonCheck | undefined): Extract<LessonCheck, { kind: 'quiz' }> | undefined {
  if (!c) return undefined;
  if (c.kind === 'quiz') return c;
  if (c.kind === 'all' || c.kind === 'any') for (const x of c.checks) if (quizOf(x)) return quizOf(x);
  return undefined;
}

function StepView({ lesson, index }: { lesson: Lesson; index: number }) {
  const t = useT();
  const tr = useL10n();
  const step = lesson.steps[index];
  const result = useStepResult(lesson, index, step);
  const [hint, setHint] = useState(false);
  const passed = !step.check || result === 'pass';
  useEffect(() => {
    if (needsLive(step.check)) liveForChecks();
  }, [step]);
  const quiz = quizOf(step.check);
  return (
    <div className="rounded-xl border border-accent/40 bg-panel p-3 shadow-sm">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">{t('learn.step', { i: index + 1, n: lesson.steps.length })}</div>
      <RichText text={tr(step.text)} className="text-[12.5px] leading-relaxed" />
      {quiz && <Quiz lesson={lesson} index={index} check={quiz} />}
      {step.check && !quiz && (
        <div
          className={cx(
            'mt-2 flex items-center gap-1.5 text-[12px] font-medium',
            result === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : result === 'pending' ? 'text-muted' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {result === 'pass' ? <Check size={14} /> : result === 'pending' ? <Loader2 size={14} className="animate-spin" /> : <CircleDashed size={14} />}
          {t(result === 'pass' ? 'learn.done' : result === 'pending' ? 'learn.pending' : 'learn.notYet')}
        </div>
      )}
      {step.hint && !passed && (
        <div className="mt-2">
          <button className="flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={() => setHint(!hint)}>
            <Lightbulb size={13} /> {t('learn.hint')}
          </button>
          {hint && <RichText text={tr(step.hint)} className="mt-1 rounded-md bg-amber-500/10 p-2 text-[12px] leading-relaxed" />}
        </div>
      )}
      {passed && step.explain && <RichText text={tr(step.explain)} className="mt-2 rounded-md bg-emerald-500/10 p-2 text-[12px] leading-relaxed" />}
      <div className="mt-3 flex justify-end">
        <Button variant="primary" icon={ChevronRight} disabled={!passed} onClick={() => goToStep(lesson, index + 1)}>
          {t('learn.next')}
        </Button>
      </div>
    </div>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const t = useT();
  const tr = useL10n();
  const step = useLearn((s) => s.step);
  const docId = useLearn((s) => s.docId);
  const onLessonDoc = useStore((s) => s.active === docId);
  const next = LESSONS[LESSONS.indexOf(lesson) + 1];
  const finished = step >= lesson.steps.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <button className="mb-2 flex items-center gap-1 text-[12px] text-muted hover:text-fg" onClick={leaveLesson}>
          <ArrowLeft size={13} /> {t('learn.allLessons')}
        </button>
        <h3 className="text-[14px] font-semibold leading-snug">{tr(lesson.title)}</h3>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(Math.min(step, lesson.steps.length) / lesson.steps.length) * 100}%` }} />
        </div>
        {!onLessonDoc && docId && !finished && (
          <button className="mt-2 flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={showLessonDoc}>
            <ExternalLink size={12} /> {t('learn.openLessonDoc')}
          </button>
        )}
      </div>
      <div className="bb-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {lesson.steps.slice(0, Math.min(step, lesson.steps.length)).map((s, i) => (
          <div key={i} className="flex gap-2 rounded-lg px-1 py-0.5 text-[12px] text-muted">
            <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
            <RichText text={tr(s.text).split('\n')[0]} className="line-clamp-2" />
          </div>
        ))}
        {finished ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
            <Trophy size={28} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-[14px] font-semibold">{t('learn.finished')}</div>
            <div className="mt-3 flex justify-center gap-2">
              <Button icon={RotateCcw} onClick={() => startLesson(lesson)}>
                {t('learn.restart')}
              </Button>
              {next && (
                <Button variant="primary" icon={ChevronRight} onClick={() => startLesson(next)}>
                  {t('learn.nextLesson')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <StepView key={`${lesson.id}:${step}`} lesson={lesson} index={step} />
        )}
      </div>
    </div>
  );
}

function LessonList() {
  const t = useT();
  const tr = useL10n();
  const done = useLearn((s) => s.done);
  const count = LESSONS.filter((l) => done[l.id]).length;
  return (
    <div className="bb-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <p className="mb-3 text-[12px] text-muted">{t('learn.completed', { n: count, total: LESSONS.length })}</p>
      {TOPICS.map((topic) => {
        const list = LESSONS.filter((l) => l.topic === topic);
        if (!list.length) return null;
        return (
          <section key={topic} className="mb-4">
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t(`learn.topic.${topic}` as I18nKey)}</h4>
            <div className="grid gap-1.5">
              {list.map((l) => (
                <button key={l.id} onClick={() => startLesson(l)} className="group rounded-lg border border-line bg-panel-2 p-2.5 text-left transition hover:border-accent/60 hover:bg-hover">
                  <div className="flex items-start gap-2">
                    <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', done[l.id] ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line')}>
                      {done[l.id] && <Check size={11} />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[12.5px] font-medium leading-snug">{tr(l.title)}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{tr(l.summary)}</span>
                      <span className="mt-1 flex gap-2 text-[10.5px] text-muted">
                        <span>{t('learn.level', { n: l.level })}</span>
                        <span>·</span>
                        <span>{t('learn.minutes', { n: l.minutes })}</span>
                      </span>
                    </span>
                    <ChevronRight size={14} className="mt-0.5 text-muted group-hover:text-accent" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function LearnPanel() {
  const t = useT();
  const lessonId = useLearn((s) => s.lessonId);
  const lesson = LESSONS.find((l) => l.id === lessonId);
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel" aria-label={t('learn.title')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <GraduationCap size={16} className="text-accent" />
        <h2 className="flex-1 text-[12.5px] font-semibold">{t('learn.title')}</h2>
        <IconButton icon={X} label={t('common.close')} onClick={() => setLearnOpen(false)} />
      </header>
      {lesson ? <LessonView lesson={lesson} /> : <LessonList />}
    </aside>
  );
}
