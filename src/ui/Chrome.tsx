// Tool rail, document tabs, status bar and toasts.

import { Plus, X, CheckCircle2, AlertTriangle, Info, Magnet } from 'lucide-react';
import { commands, runCommand, type Command } from '../editor/commands.ts';
import { activeDoc, isDirty, openDialog, setActive, updateSettings, useStore } from '../store/store.ts';
import { useCursor } from '../store/cursor.ts';
import { closeWithConfirm } from '../editor/fileActions.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { IconButton, cx } from './primitives.tsx';
import { MM_PER_UNIT, RASTER } from '../model/types.ts';
import { mm } from '../pcb/units.ts';
import { PcbStatus } from './PcbStatus.tsx';

export function ToolRail() {
  const t = useT();
  useStore((s) => s.tool);
  const hasDoc = useStore((s) => !!s.active);
  const pcb = useStore((s) => activeDoc(s)?.doc.type === 'PCB');
  const c = commands;
  const groups: Command[][] = pcb
    ? [
        [c.select, c.pan],
        [c.track, c.via, c.zone],
        [c.wire, c.box, c.ellipse, c.text],
        [c.measure, c.check, c.drc],
      ]
    : [
        [c.select, c.pan],
        [c.wire, c.resistor, c.diode],
        [c.box, c.ellipse, c.text],
        [c.measure, c.check],
      ];
  return (
    <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2" aria-label="Tools">
      {groups.map((g, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          {i > 0 && <div className="my-1 h-px w-6 bg-line" />}
          {g.map((cmd) => (
            <IconButton key={cmd.id} icon={cmd.icon!} label={t(cmd.label)} shortcut={cmd.shortcut} active={cmd.checked?.()} disabled={!hasDoc} onClick={() => runCommand(cmd)} size={17} />
          ))}
        </div>
      ))}
    </aside>
  );
}

export function TabBar() {
  const docs = useStore((s) => s.docs);
  const active = useStore((s) => s.active);
  const t = useT();
  return (
    <div className="bb-scroll flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-panel-2 px-1.5" role="tablist">
      {docs.map((d) => {
        const dirty = isDirty(d);
        return (
          <div
            key={d.id}
            role="tab"
            aria-selected={d.id === active}
            onClick={() => setActive(d.id)}
            onAuxClick={(e) => e.button === 1 && closeWithConfirm(d)}
            className={cx(
              'group flex h-8 max-w-56 shrink-0 cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 text-[12.5px]',
              d.id === active ? 'border-line bg-panel text-fg' : 'border-transparent text-muted hover:bg-hover hover:text-fg',
            )}
            title={d.fileName}
          >
            <span className={cx('h-2 w-2 shrink-0 rounded-full', d.doc.type === 'SCHEMATICS' ? 'bg-sky-500' : d.doc.type === 'STRIPES' ? 'bg-orange-500' : 'bg-amber-500')} />
            <span className="truncate">{d.fileName}</span>
            <button
              className="-mr-1.5 flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
              aria-label={t('file.close')}
              onClick={(e) => {
                e.stopPropagation();
                closeWithConfirm(d);
              }}
            >
              {dirty ? <span className="h-2 w-2 rounded-full bg-accent group-hover:hidden" /> : null}
              <X size={13} className={cx(dirty && 'hidden group-hover:block')} />
            </button>
          </div>
        );
      })}
      <IconButton icon={Plus} label={t('file.new')} className="mb-0.5 h-7 w-7" onClick={() => openDialog({ kind: 'newBoard' })} />
    </div>
  );
}

const HINTS: Record<string, I18nKey> = {
  select: 'hint.select',
  pan: 'hint.pan',
  wire: 'hint.wire',
  box: 'hint.box',
  ellipse: 'hint.ellipse',
  text: 'hint.text',
  measure: 'hint.measure',
  resistor: 'hint.resistor',
  diode: 'hint.diode',
  check: 'hint.check',
  place: 'hint.place',
  track: 'hint.track',
  via: 'hint.via',
  zone: 'hint.zone',
};

function CursorReadout() {
  const { x, y, inside, measure } = useCursor();
  const fmt = (v: number) => (v * MM_PER_UNIT).toFixed(1);
  if (measure) {
    return (
      <span className="tabular-nums text-rose-500">
        Δ {fmt(measure.dx)} / {fmt(measure.dy)} mm · {(measure.len * MM_PER_UNIT).toFixed(2)} mm
      </span>
    );
  }
  if (!inside) return <span className="text-muted max-sm:hidden">–</span>;
  return (
    <span className="whitespace-nowrap tabular-nums max-sm:hidden">
      x {Math.round(x)} · y {Math.round(y)} <span className="text-muted">({fmt(x)} / {fmt(y)} mm)</span>
    </span>
  );
}

export function StatusBar() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const tool = useStore((s) => s.tool);
  const snapStep = useStore((s) => s.settings.snapStep);
  const magnetic = useStore((s) => s.settings.magnetic);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11.5px] text-muted">
      <span className="truncate max-md:hidden">{t(HINTS[tool] ?? 'hint.select')}</span>
      <span className="ml-auto" />
      {ds && (
        <>
          <CursorReadout />
          {magnetic && (
            <button className="flex items-center gap-1 whitespace-nowrap font-medium text-accent" onClick={() => runCommand(commands.magnet)} title={t('view.magnet')}>
              <Magnet size={12} /> {t('status.magnet')}
            </button>
          )}
          <span className="whitespace-nowrap max-sm:hidden">{t('status.items', { count: ds.doc.items.length })}</span>
          <span className={cx('whitespace-nowrap max-sm:hidden', ds.mirror && 'font-semibold text-red-500')}>{ds.mirror ? t('status.solderSide') : t('status.partsSide')}</span>
          {ds.doc.type === 'PCB' && <PcbStatus />}
          <label className="flex items-center gap-1 whitespace-nowrap">
            {t('status.raster')}
            <select className="rounded bg-transparent text-fg outline-none" value={snapStep} onChange={(e) => updateSettings({ snapStep: Number(e.target.value) })}>
              <option value={RASTER}>1/1 (2.54 mm)</option>
              <option value={RASTER / 2}>1/2 (1.27 mm)</option>
              <option value={RASTER / 4}>1/4 (0.635 mm)</option>
              {ds.doc.type === 'PCB' && (
                <>
                  <option value={mm(1)}>1 mm</option>
                  <option value={mm(0.5)}>0.5 mm</option>
                  <option value={mm(0.25)}>0.25 mm</option>
                  <option value={mm(0.1)}>0.1 mm</option>
                </>
              )}
              <option value={1}>{t('status.free')}</option>
            </select>
          </label>
          <button className="whitespace-nowrap tabular-nums hover:text-fg" onClick={() => runCommand(commands.actual)} title={t('view.actual')}>
            {t('status.zoom')} {Math.round(ds.view.zoom * 100)} %
          </button>
        </>
      )}
    </footer>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? AlertTriangle : t.kind === 'success' ? CheckCircle2 : Info;
        return (
          <div
            key={t.id}
            className={cx(
              'bb-pop pointer-events-auto flex max-w-[560px] items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] shadow-lg',
              t.kind === 'error' ? 'border-red-500/30 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'border-line bg-panel text-fg',
            )}
          >
            <Icon size={15} className={t.kind === 'success' ? 'text-emerald-500' : t.kind === 'error' ? 'text-red-500' : 'text-accent'} />
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
