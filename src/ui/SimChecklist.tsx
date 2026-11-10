import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleX, Cpu, Info, Crosshair, Plus, Wand2 } from 'lucide-react';
import type { Draft } from 'immer';
import { activeDoc, startPlacement, updateItems, useStore } from '../store/store.ts';
import type { Item, SpiceType, SymbolDef } from '../model/types.ts';
import { checkSimulation, DEFAULT_VALUE, type SimIssue } from '../spice/readiness.ts';
import { spiceValue } from '../spice/netlist.ts';
import { LABEL_DEFS } from '../spice/labels.ts';
import { INSTRUMENT_DEFS } from '../spice/instruments.ts';
import { showItem } from '../editor/showItem.ts';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import { loadEsp32Example, loadExample } from '../mcu/firmwareActions.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { cx } from './primitives.tsx';

const RLC: Partial<Record<SpiceType, 'R' | 'C' | 'L'>> = { RESISTOR: 'R', CAPACITOR: 'C', INDUCTOR: 'L' };

function setValue(id: string, value: string) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind === 'symbol') it.value = value;
  });
}

function simulateAs(id: string, type: SpiceType) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind !== 'symbol') return;
    it.spiceType = type;
    const k = RLC[type];
    if (k && !spiceValue(it.value, k)) it.value = DEFAULT_VALUE[k];
  });
}

function groundDef(symbols: SymbolDef[]): SymbolDef | undefined {
  return symbols.find((s) => s.filename === 'GND.xml') ?? symbols.find((s) => /gnd/i.test(s.filename ?? '') && s.pins.length === 1);
}

function FixButton({ icon: Icon = Wand2, children, onClick }: { icon?: typeof Wand2; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-panel px-2 text-[11.5px] font-medium hover:border-accent/60 hover:bg-hover">
      <Icon size={12} />
      {children}
    </button>
  );
}

function ValueFix({ issue }: { issue: SimIssue }) {
  const t = useT();
  const [v, setV] = useState(issue.suggestion ?? '');
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (issue.id && v.trim()) setValue(issue.id, v.trim());
      }}
    >
      <input className="bb-input h-6 w-20 px-1.5 text-[11.5px]" value={v} onChange={(e) => setV(e.target.value)} aria-label={t('props.value')} />
      <button type="submit" className="inline-flex h-6 items-center rounded-md bg-accent px-2 text-[11.5px] font-medium text-white dark:text-slate-950">
        {t('fix.apply')}
      </button>
    </form>
  );
}

function IssueRow({ issue, symbols }: { issue: SimIssue; symbols: SymbolDef[] }) {
  const t = useT();
  const liveDc = useLive((s) => s.on && s.mode === 'dc');
  const Icon = issue.severity === 'error' ? CircleX : issue.severity === 'warning' ? AlertTriangle : Info;
  const typeName = issue.guess ? t(`type.${issue.guess}` as I18nKey) : '';
  const text =
    issue.kind === 'pins'
      ? t(`sim.w.${issue.detail ?? 'pins2'}` as I18nKey, { name: issue.ref ?? '' })
      : issue.kind === 'notSimulated' && issue.guess
        ? t('check.notSimulatedGuess', { ref: issue.ref ?? '', type: typeName })
        : issue.kind === 'mcuPower' && issue.detail === 'esp32'
          ? t('check.mcuPowerEsp32', { ref: issue.ref ?? '' })
          : t(`check.${issue.kind}` as I18nKey, { ref: issue.ref ?? '', value: issue.value ?? '', volts: issue.volts ?? '' });
  const gnd = issue.kind === 'noGround' ? groundDef(symbols) : undefined;
  return (
    <li className="flex gap-2 py-1.5">
      <Icon
        size={14}
        className={cx('mt-0.5 shrink-0', issue.severity === 'error' ? 'text-red-500' : issue.severity === 'warning' ? 'text-amber-500' : 'text-sky-500')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="leading-snug">{text}</span>
        <div className="flex flex-wrap items-center gap-1">
          {issue.kind === 'badValue' && <ValueFix key={`${issue.id}:${issue.value}`} issue={issue} />}
          {issue.kind === 'notSimulated' && issue.guess && issue.id && (
            <FixButton onClick={() => simulateAs(issue.id!, issue.guess!)}>{t('fix.asType', { type: typeName })}</FixButton>
          )}
          {gnd && (
            <FixButton icon={Plus} onClick={() => startPlacement({ kind: 'symbol', def: gnd })}>
              {t('fix.placeGnd')}
            </FixButton>
          )}
          {issue.kind === 'noSource' && (
            <>
              <FixButton icon={Plus} onClick={() => startPlacement({ kind: 'symbol', def: LABEL_DEFS.find((d) => d.name === '+5V')! })}>
                {t('fix.placeSupply')}
              </FixButton>
              <FixButton icon={Plus} onClick={() => startPlacement({ kind: 'symbol', def: INSTRUMENT_DEFS.fgen })}>
                {t('fix.placeFgen')}
              </FixButton>
            </>
          )}
          {issue.kind === 'mcuFirmware' && issue.id && (
            <FixButton icon={Cpu} onClick={() => (issue.detail === 'esp32' ? loadEsp32Example(issue.id!, 'blink') : void loadExample(issue.id!, 'blink'))}>
              {t('fix.mcuExample')}
            </FixButton>
          )}
          {issue.kind === 'mcuLiveOnly' && !liveDc && (
            <FixButton
              icon={Activity}
              onClick={() => {
                setLiveMode('dc');
                setLiveValues(true);
              }}
            >
              {t('fix.liveOn')}
            </FixButton>
          )}
          {issue.id && issue.kind !== 'mcuLiveOnly' && (
            <FixButton icon={Crosshair} onClick={() => showItem(issue.id!)}>
              {t('fix.show')}
            </FixButton>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * What stands between the schematic and a working simulation, in plain words,
 * with one-click fixes. `compact` hides the "all good" line.
 */
export function SimChecklist({ compact, className }: { compact?: boolean; className?: string }) {
  const t = useT();
  const doc = useStore((s) => activeDoc(s)?.doc);
  const models = useStore((s) => s.library.models);
  const symbols = useStore((s) => s.library.symbols);
  const issues = useMemo(() => (doc ? checkSimulation(doc, models).issues : []), [doc, models]);
  if (!doc) return null;
  if (!issues.length) {
    return compact ? null : (
      <div className={cx('flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400', className)}>
        <CheckCircle2 size={14} /> {t('check.ready')}
      </div>
    );
  }
  return (
    <section className={cx('text-[12px]', className)} aria-label={t('check.title')}>
      <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('check.title')}</h3>
      <ul className="divide-y divide-line/60">
        {issues.map((issue, i) => (
          <IssueRow key={`${issue.kind}:${issue.id ?? i}`} issue={issue} symbols={symbols} />
        ))}
      </ul>
    </section>
  );
}
