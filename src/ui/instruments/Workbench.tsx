import { useEffect, useMemo } from 'react';
import { Loader2, Play, AlertTriangle } from 'lucide-react';
import { activeDoc, startPlacement, useStore } from '../../store/store.ts';
import { runBench, scheduleBench, setLive, setUic, useSim } from '../../store/sim.ts';
import { INSTRUMENT_DEFS, instrumentOf, type InstrumentKind } from '../../spice/instruments.ts';
import type { SymbolItem } from '../../model/types.ts';
import { Oscilloscope } from './Oscilloscope.tsx';
import { Multimeter } from './Multimeter.tsx';
import { FunctionGenerator } from './FunctionGenerator.tsx';
import { SymbolThumb } from '../LibraryPanel.tsx';
import { Button, Check } from '../primitives.tsx';
import { useT, type I18nKey } from '../../i18n/i18n.ts';
import { SimChecklist } from '../SimChecklist.tsx';
import { explainSpiceError } from '../../spice/explain.ts';

const ORDER: InstrumentKind[] = ['fgen', 'scope', 'dmm'];

export function Workbench() {
  const t = useT();
  const doc = useStore((s) => activeDoc(s)?.doc);
  const docId = useStore((s) => s.active);
  const sim = useSim();
  const instruments = useMemo(
    () =>
      (doc?.items.filter((i): i is SymbolItem => i.kind === 'symbol' && !!instrumentOf(i)) ?? []).sort(
        (a, b) => ORDER.indexOf(instrumentOf(a)!) - ORDER.indexOf(instrumentOf(b)!),
      ),
    [doc?.items],
  );

  // live: every edit of the circuit or an instrument re-runs the simulation
  useEffect(() => {
    void runBench();
    return useStore.subscribe((s, prev) => {
      const a = activeDoc(s);
      const b = activeDoc(prev);
      if (a && (a.doc !== b?.doc || a.id !== b?.id)) scheduleBench();
    });
  }, [docId]);

  const result = sim.docId === docId ? sim.result : null;

  if (!instruments.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-xl text-[13px] text-muted">{t('inst.empty')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {ORDER.map((k) => (
            <button
              key={k}
              onClick={() => startPlacement({ kind: 'symbol', def: INSTRUMENT_DEFS[k] })}
              className="flex w-44 flex-col items-center gap-2 rounded-xl border border-line bg-panel-2 p-3 hover:border-accent/60 hover:bg-hover"
            >
              <div className="h-20 w-full rounded-lg bg-white p-2">
                <SymbolThumb def={INSTRUMENT_DEFS[k]} />
              </div>
              <span className="text-[12.5px] font-medium">{t(`inst.${k}`)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3 text-[12px]">
        <Check checked={sim.live} onChange={setLive} label={t('inst.live')} />
        <Check checked={sim.uic} onChange={setUic} label={t('sim.uic')} />
        <Button variant="ghost" icon={Play} onClick={() => void runBench(true)} className="h-7">
          {t('sim.run')}
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-muted">
          {sim.status === 'running' && (
            <>
              <Loader2 size={13} className="animate-spin" /> {result ? t('sim.running') : t('sim.loading')}
            </>
          )}
          {sim.status === 'done' && result && (
            <span>
              {t('inst.window')} {result.analysis.window * 1e3 < 1 ? `${(result.analysis.window * 1e6).toPrecision(3)} µs` : `${(result.analysis.window * 1e3).toPrecision(3)} ms`} ·{' '}
              {t('sim.points', { n: result.data.time.length })}
            </span>
          )}
        </span>
      </div>
      <SimChecklist compact className="bb-scroll max-h-40 shrink-0 overflow-y-auto border-b border-line px-3 py-1.5" />
      {sim.status === 'error' && sim.error && !sim.errors.length && (
        <div className="flex shrink-0 items-start gap-1.5 border-b border-line px-3 py-1.5 text-[11.5px] text-red-600 dark:text-red-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{t(`err.${explainSpiceError(sim.error).kind}` as I18nKey, { name: '' })}</span>
        </div>
      )}
      <div className="bb-scroll flex min-h-0 flex-1 items-start gap-4 overflow-auto bg-[radial-gradient(circle_at_30%_0%,#3f3f46,#18181b_70%)] p-4">
        {instruments.some((i) => instrumentOf(i) !== 'scope') && (
          <div className="flex shrink-0 flex-col gap-4">
            {instruments.map((it) => {
              const kind = instrumentOf(it);
              if (kind === 'dmm') return <Multimeter key={it.id} item={it} result={result} />;
              if (kind === 'fgen') return <FunctionGenerator key={it.id} item={it} />;
              return null;
            })}
          </div>
        )}
        {instruments
          .filter((i) => instrumentOf(i) === 'scope')
          .map((it) => (
            <Oscilloscope key={it.id} item={it} result={result} />
          ))}
      </div>
    </div>
  );
}
