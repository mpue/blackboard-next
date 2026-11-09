import { create } from 'zustand';
import { activeDoc, setCurrentLayer, useStore } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { cx } from './primitives.tsx';

/** Figures the canvas derives from the board (ratsnest length). */
export const usePcbStats = create<{ unrouted: number }>()(() => ({ unrouted: 0 }));

/** Active copper layer and routing progress in the status bar. */
export function PcbStatus() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const unrouted = usePcbStats((s) => s.unrouted);
  if (!ds) return null;
  const copper = ds.doc.layers.filter((l) => l.role === 'top-copper' || l.role === 'bottom-copper');
  const current = copper.find((l) => l.id === ds.currentLayer);
  return (
    <>
      <span className={cx('whitespace-nowrap', unrouted ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
        {unrouted ? t('pcb.unrouted', { count: unrouted }) : t('pcb.routed')}
      </span>
      <label className="flex items-center gap-1 whitespace-nowrap">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: current?.color ?? 'transparent' }} />
        <select className="rounded bg-transparent text-fg outline-none" value={current?.id ?? ''} onChange={(e) => setCurrentLayer(e.target.value)} aria-label={t('props.layer')}>
          {!current && <option value="">–</option>}
          {copper.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
