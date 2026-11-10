// Runs the autorouter in a worker and adds its tracks and vias as one undo step.

import { showNextUnrouted } from '../ui/PcbStatus.tsx';
import { create } from 'zustand';
import type { Draft } from 'immer';
import type { Item } from '../model/types.ts';
import { activeDoc, commit, toast, useStore } from '../store/store.ts';
import { t } from '../i18n/i18n.ts';
import type { AutorouteRequest, AutorouteResponse } from '../pcb/autoroute.worker.ts';

export const useAutoroute = create<{ running: boolean; done: number; total: number }>()(() => ({ running: false, done: 0, total: 0 }));

let worker: Worker | null = null;

export function cancelAutoroute() {
  worker?.terminate();
  worker = null;
  useAutoroute.setState({ running: false });
}

export function runAutorouter() {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB' || worker) return;
  const docId = ds.id;
  const base = ds.doc;
  worker = new Worker(new URL('../pcb/autoroute.worker.ts', import.meta.url), { type: 'module', name: 'autorouter' });
  useAutoroute.setState({ running: true, done: 0, total: 0 });
  worker.onmessage = (e: MessageEvent<AutorouteResponse>) => {
    const m = e.data;
    if (m.type === 'progress') {
      useAutoroute.setState({ done: m.done, total: m.total });
      return;
    }
    cancelAutoroute();
    if (m.type === 'error') {
      toast(t('route.error', { msg: m.error }), 'error');
      return;
    }
    const cur = useStore.getState().docs.find((d) => d.id === docId);
    // the board was edited meanwhile: the routes may no longer fit
    if (!cur || cur.doc.items !== base.items || useStore.getState().active !== docId) {
      toast(t('route.changed'), 'error');
      return;
    }
    const { tracks, vias, routed, failed } = m.result;
    if (tracks.length || vias.length) {
      commit((d) => {
        d.items.push(...([...tracks, ...vias] as Draft<Item>[]));
      });
    }
    toast(failed.length ? t('route.partial', { routed, failed: failed.length }) : t('route.done', { routed }), failed.length ? 'info' : 'success');
    // the canvas publishes the new ratsnest after rendering the routed board
    if (failed.length) setTimeout(showNextUnrouted, 150);
  };
  worker.onerror = (e) => {
    cancelAutoroute();
    toast(t('route.error', { msg: e.message }), 'error');
  };
  worker.postMessage({ doc: base } satisfies AutorouteRequest);
}
