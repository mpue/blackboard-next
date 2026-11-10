import { useState } from 'react';
import { BookOpen, ChevronDown, GraduationCap } from 'lucide-react';
import type { SymbolItem } from '../model/types.ts';
import { useStore } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { cx } from '../ui/primitives.tsx';
import { componentFor } from './components.ts';
import { LESSONS } from './lessons/index.ts';
import { RichText } from './RichText.tsx';
import { startLesson } from './state.ts';

/** "What is this?" for the selected symbol, from the component guide. */
export function ComponentInfoCard({ item }: { item: SymbolItem }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [open, setOpen] = useState(false);
  const info = componentFor(item);
  if (!info) return null;
  const tr = (x: { de: string; en: string }) => x[lang] || x.de;
  const lessons = (info.lessons ?? []).map((id) => LESSONS.find((l) => l.id === id)).filter((l) => !!l);
  return (
    <div className="mt-1 rounded-lg border border-line bg-panel-2 p-2.5 text-[12px] leading-relaxed">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <BookOpen size={12} /> {t('info.title')}
      </div>
      <div className="font-semibold">{tr(info.title)}</div>
      <RichText text={tr(info.summary)} className="text-muted" />
      {open && (
        <div className="mt-2 space-y-2">
          <RichText text={tr(info.body)} />
          {!!info.formulas?.length && (
            <div>
              <div className="text-[11px] font-semibold text-muted">{t('info.formulas')}</div>
              {info.formulas.map((f, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted">{tr(f.label)}:</span>
                  <RichText text={`$${f.formula}$`} />
                </div>
              ))}
            </div>
          )}
          {!!info.facts?.length && (
            <div>
              <div className="text-[11px] font-semibold text-muted">{t('info.facts')}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                {info.facts.map((f, i) => (
                  <span key={i} className="contents">
                    <dt className="text-muted">{tr(f.label)}</dt>
                    <dd>
                      <RichText text={tr(f.value)} />
                    </dd>
                  </span>
                ))}
              </dl>
            </div>
          )}
          {!!info.pitfalls?.length && (
            <div>
              <div className="text-[11px] font-semibold text-muted">{t('info.pitfalls')}</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {info.pitfalls.map((p, i) => (
                  <li key={i}>
                    <RichText text={tr(p)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lessons.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted">{t('info.lessons')}</div>
              {lessons.map((l) => (
                <button key={l.id} className="flex items-center gap-1 text-accent hover:underline" onClick={() => startLesson(l)}>
                  <GraduationCap size={12} /> {tr(l.title)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button className="mt-1.5 flex items-center gap-1 text-[12px] text-accent hover:underline" onClick={() => setOpen(!open)}>
        <ChevronDown size={13} className={cx('transition-transform', open && 'rotate-180')} />
        {t(open ? 'info.less' : 'info.more')}
      </button>
    </div>
  );
}
