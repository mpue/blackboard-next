import type { AnalysisKind, AnalysisSetup } from '../spice/analysisSetup.ts';
import { formatEng, parseEng } from '../model/ops.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { TextInput, cx } from './primitives.tsx';

/** Engineering input with a unit: "10m" or "10 ms" -> 0.01 */
function UnitInput({ value, unit, onCommit }: { value: number; unit: string; onCommit: (v: number) => void }) {
  return (
    <div className="flex w-28 items-center gap-1">
      <TextInput
        value={formatEng(value)}
        onCommit={(raw) => {
          const v = parseEng(raw.replace(new RegExp(`\\s*${unit}$`, 'i'), ''));
          if (v !== undefined && v > 0) onCommit(v);
        }}
      />
      <span className="text-[11.5px] text-muted">{unit}</span>
    </div>
  );
}

/** What to simulate, in words: time response, frequency response or operating point. */
export function AnalysisPicker({
  setup,
  onChange,
  fromSchematic,
  acWithoutSource,
}: {
  setup: AnalysisSetup;
  onChange: (s: AnalysisSetup) => void;
  /** the analysis written in the schematic, if there is one */
  fromSchematic?: string;
  acWithoutSource: boolean;
}) {
  const t = useT();
  const kinds: AnalysisKind[] = [...(fromSchematic ? (['schematic'] as const) : []), 'tran', 'ac', 'op'];
  return (
    <section className="text-[12px]" aria-label={t('an.title')}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('an.title')}</h3>
      <div className="grid gap-1" role="radiogroup">
        {kinds.map((k) => (
          <label key={k} className={cx('flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5', setup.kind === k ? 'bg-accent-soft' : 'hover:bg-hover')}>
            <input type="radio" className="mt-0.5" checked={setup.kind === k} onChange={() => onChange({ ...setup, kind: k })} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-medium">{t(`an.${k}` as I18nKey)}</span>
              <span className="text-[11px] text-muted">{k === 'schematic' ? <code className="font-mono">{fromSchematic}</code> : t(`an.${k}.hint` as I18nKey)}</span>
              {setup.kind === k && k === 'tran' && (
                <span className="flex items-center gap-2">
                  <span className="text-muted">{t('an.duration')}</span>
                  <UnitInput value={setup.duration} unit="s" onCommit={(duration) => onChange({ ...setup, duration })} />
                </span>
              )}
              {setup.kind === k && k === 'ac' && (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted">{t('an.from')}</span>
                    <UnitInput value={setup.from} unit="Hz" onCommit={(from) => onChange({ ...setup, from })} />
                    <span className="text-muted">{t('an.to')}</span>
                    <UnitInput value={setup.to} unit="Hz" onCommit={(to) => onChange({ ...setup, to })} />
                  </span>
                  {acWithoutSource && <span className="text-[11px] text-amber-700 dark:text-amber-400">{t('an.acNoSource')}</span>}
                </>
              )}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
