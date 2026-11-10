import { useMemo, useState } from 'react';
import { Activity, ChevronDown, X } from 'lucide-react';
import { activeDoc, useStore } from '../store/store.ts';
import { setLiveValues, useLive } from '../store/live.ts';
import { checkSimulation, isBlocking } from '../spice/readiness.ts';
import { explainSpiceError } from '../spice/explain.ts';
import { isSchematicDoc } from '../model/types.ts';
import { SimChecklist } from './SimChecklist.tsx';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { cx } from './primitives.tsx';

/**
 * While live values are on but cannot be computed, says why on the canvas
 * (instead of silently showing nothing) and offers the fixes.
 */
export function LiveProblems() {
  const t = useT();
  const on = useLive((s) => s.on);
  const status = useLive((s) => s.status);
  const error = useLive((s) => s.error);
  const doc = useStore((s) => activeDoc(s)?.doc);
  const models = useStore((s) => s.library.models);
  const [open, setOpen] = useState(true);
  const blocking = useMemo(() => (on && doc && isSchematicDoc(doc) ? isBlocking(checkSimulation(doc, models).issues) : false), [on, doc, models]);
  const failed = status === 'error' && !!error && !blocking;
  if (!on || !doc || !isSchematicDoc(doc) || (!blocking && !failed)) return null;
  const kind = failed ? explainSpiceError(error).kind : undefined;
  return (
    <div className="bb-pop absolute left-3 top-3 z-30 w-[min(380px,calc(100%-24px))] rounded-xl border border-amber-500/40 bg-panel/95 shadow-xl backdrop-blur">
      <header className="flex items-center gap-2 px-3 py-2">
        <Activity size={14} className="text-amber-500" />
        <span className="flex-1 text-[12.5px] font-semibold">{t('live.blocked')}</span>
        <button className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg" onClick={() => setOpen(!open)} aria-label={t('live.details')} aria-expanded={open}>
          <ChevronDown size={14} className={cx('transition-transform', !open && '-rotate-90')} />
        </button>
        <button className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg" onClick={() => setLiveValues(false)} aria-label={t('live.off')} title={t('live.off')}>
          <X size={14} />
        </button>
      </header>
      {open && (
        <div className="bb-scroll max-h-[50vh] overflow-y-auto border-t border-line px-3 py-2">
          {kind ? <p className="text-[12px] leading-relaxed">{t(`err.${kind}` as I18nKey, { name: '' })}</p> : <SimChecklist compact />}
        </div>
      )}
    </div>
  );
}
