import { useCallback, useEffect } from 'react';
import { AlertTriangle, CircleX, ShieldCheck, RefreshCw, X } from 'lucide-react';
import { activeDoc, select, setView, useStore } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { runDrc, type DrcViolation } from '../pcb/drc.ts';
import { runErc, type ErcViolation } from '../spice/erc.ts';
import { fmtMm } from '../pcb/units.ts';
import { zoneFillsOf } from '../editor/zoneFills.ts';
import { isSchematicDoc } from '../model/types.ts';
import { t as translate } from '../i18n/i18n.ts';
import { focusViolation, setDrcOpen, setDrcResult, useDrc, type CheckRow } from './drcState.ts';
import { Button, IconButton, cx } from './primitives.tsx';

type T = ReturnType<typeof useT>;

export function drcMessage(t: T, v: DrcViolation): string {
  const f = (u?: number) => (u === undefined ? '' : fmtMm(u, 3));
  return t(`drc.${v.kind}`, { actual: f(v.actual), required: f(v.required), nets: (v.nets ?? []).join(', ') });
}

export function ercMessage(t: T, v: ErcViolation): string {
  return t(`erc.${v.kind}`, { ref: v.ref ?? '', pin: v.pin ?? '', value: v.value ?? '' });
}

/** Runs the DRC on PCBs and the ERC on schematics. */
export function runDrcForActive() {
  const ds = activeDoc();
  if (!ds) return;
  let rows: CheckRow[] = [];
  if (ds.doc.type === 'PCB') {
    rows = runDrc(ds.doc, { zoneFills: zoneFillsOf(ds.doc) }).map((v) => ({ id: v.id, severity: v.severity, at: v.at, items: v.items, text: drcMessage(translate, v) }));
  } else if (isSchematicDoc(ds.doc)) {
    rows = runErc(ds.doc).map((v) => ({ id: v.id, severity: v.severity, at: v.at, items: v.items, text: ercMessage(translate, v) }));
  } else return;
  setDrcResult(ds.id, ds.doc.items, rows);
}

/** Centres the view on a violation and selects the items involved. */
function showViolation(v: CheckRow) {
  const ds = activeDoc();
  const el = document.querySelector('.bb-canvas');
  if (!ds || !el) return;
  const r = el.getBoundingClientRect();
  const zoom = Math.max(ds.view.zoom, 4);
  const x = ds.mirror ? ds.doc.width - v.at.x : v.at.x;
  setView({ zoom, panX: r.width / 2 - x * zoom, panY: r.height / 2 - v.at.y * zoom });
  select(v.items.filter((id) => ds.doc.items.some((i) => i.id === id)));
  focusViolation(v.id);
}

export function DrcPanel() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const res = useDrc((s) => (ds ? s.results[ds.id] : undefined));
  const focused = useDrc((s) => s.focused);
  const run = useCallback(runDrcForActive, []);

  const pcb = ds?.doc.type === 'PCB';
  const schematic = !!ds && isSchematicDoc(ds.doc);
  useEffect(() => {
    if ((pcb || schematic) && !res) run();
  }, [ds?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ds || (!pcb && !schematic)) return null;
  const violations = res?.violations ?? [];
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.length - errors;
  const stale = !!res && res.items !== ds.doc.items;

  return (
    <section className="flex h-56 shrink-0 flex-col border-t border-line bg-panel" aria-label={t(pcb ? 'drc.title' : 'erc.title')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <ShieldCheck size={15} className={violations.length ? 'text-amber-500' : 'text-emerald-500'} />
        <h2 className="text-[12.5px] font-semibold">{t(pcb ? 'drc.title' : 'erc.title')}</h2>
        {res && <span className="text-[11.5px] text-muted">{t('drc.summary', { errors, warnings })}</span>}
        {stale && <span className="text-[11.5px] text-amber-600 dark:text-amber-400">· {t('drc.stale')}</span>}
        <Button variant={stale ? 'primary' : 'ghost'} icon={RefreshCw} onClick={run} className="ml-2">
          {t('drc.run')}
        </Button>
        <IconButton icon={X} label={t('common.close')} className="ml-auto" onClick={() => setDrcOpen(false)} />
      </header>
      <ul className="bb-scroll min-h-0 flex-1 overflow-auto py-1 text-[12px]">
        {res && !violations.length && (
          <li className="flex items-center gap-2 px-3 py-2 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={14} /> {t('drc.ok')}
          </li>
        )}
        {violations.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => showViolation(v)}
              className={cx('flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-hover', focused === v.id && 'bg-accent-soft')}
            >
              {v.severity === 'error' ? <CircleX size={14} className="shrink-0 text-red-500" /> : <AlertTriangle size={14} className="shrink-0 text-amber-500" />}
              <span className="flex-1 truncate">{v.text}</span>
              {pcb && (
                <span className="shrink-0 tabular-nums text-muted">
                  {fmtMm(v.at.x, 1)} / {fmtMm(v.at.y, 1)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
