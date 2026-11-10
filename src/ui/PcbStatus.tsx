import { create } from 'zustand';
import { Crosshair } from 'lucide-react';
import { activeDoc, setCurrentLayer, setView, updateSettings, useStore } from '../store/store.ts';
import type { RatsLine } from '../pcb/connectivity.ts';
import { useT } from '../i18n/i18n.ts';
import { cancelAutoroute, useAutoroute } from '../editor/autorouteAction.ts';

/** Figures the canvas derives from the board: the ratsnest and the airwire shown last. */
export const usePcbStats = create<{ unrouted: number; rats: RatsLine[]; focus?: number }>()(() => ({ unrouted: 0, rats: [] }));

/** Zooms to the next unrouted connection (cycling) and highlights it. */
export function showNextUnrouted() {
  const ds = activeDoc();
  const el = document.querySelector('.bb-canvas');
  const { rats, focus } = usePcbStats.getState();
  if (!ds || !el || !rats.length) return;
  const index = focus === undefined ? 0 : (focus + 1) % rats.length;
  const r = rats[index];
  const box = el.getBoundingClientRect();
  // the airwire fills about half of the view, but never zooms out below the board overview
  const w = Math.max(Math.abs(r.b.x - r.a.x), 64);
  const h = Math.max(Math.abs(r.b.y - r.a.y), 64);
  const zoom = Math.min(8, Math.max(0.5, Math.min((box.width * 0.5) / w, (box.height * 0.5) / h)));
  const cx = (r.a.x + r.b.x) / 2;
  const x = ds.mirror ? ds.doc.width - cx : cx;
  setView({ zoom, panX: box.width / 2 - x * zoom, panY: box.height / 2 - ((r.a.y + r.b.y) / 2) * zoom });
  if (!useStore.getState().settings.showRatsnest) updateSettings({ showRatsnest: true });
  usePcbStats.setState({ focus: index });
}

/** Active copper layer and routing progress in the status bar. */
export function PcbStatus() {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const unrouted = usePcbStats((s) => s.unrouted);
  const routing = useAutoroute();
  if (!ds) return null;
  const copper = ds.doc.layers.filter((l) => l.role === 'top-copper' || l.role === 'bottom-copper');
  const current = copper.find((l) => l.id === ds.currentLayer);
  return (
    <>
      {routing.running && (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-accent">
          {t('route.running', { done: routing.done, total: routing.total || '…' })}
          <button className="underline hover:text-fg" onClick={cancelAutoroute}>
            {t('route.cancel')}
          </button>
        </span>
      )}
      {unrouted ? (
        <button
          className="flex items-center gap-1 whitespace-nowrap rounded px-1 text-amber-600 hover:bg-hover hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          onClick={showNextUnrouted}
          title={t('pcb.showUnrouted')}
        >
          <Crosshair size={12} />
          {t(unrouted === 1 ? 'pcb.unroutedOne' : 'pcb.unrouted', { count: unrouted })}
        </button>
      ) : (
        <span className="whitespace-nowrap text-emerald-600 dark:text-emerald-400">{t('pcb.routed')}</span>
      )}
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
