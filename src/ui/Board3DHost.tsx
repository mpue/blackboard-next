import { lazy, Suspense, useMemo } from 'react';
import { create } from 'zustand';
import { Loader2 } from 'lucide-react';
import { activeDoc, useStore } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { zoneFillsOf } from '../editor/zoneFills.ts';
import { zoneFillPath } from '../pcb/zones.ts';

// three.js is only loaded when the 3D view is opened
const Board3DView = lazy(() => import('../pcb3d/Board3DView.tsx'));

export const useView3d = create<{ open: boolean }>()(() => ({ open: false }));

export function setView3d(open: boolean) {
  useView3d.setState({ open });
}

/** 3D view of the active PCB, drawn over the canvas. */
export function Board3DHost() {
  const t = useT();
  const open = useView3d((s) => s.open);
  const doc = useStore((s) => activeDoc(s)?.doc);
  const zoneFills = useMemo(() => {
    const fills = doc?.type === 'PCB' ? zoneFillsOf(doc) : undefined;
    return fills ? new Map([...fills].map(([id, mp]) => [id, zoneFillPath(mp)])) : undefined;
  }, [doc]);
  if (!open || doc?.type !== 'PCB') return null;
  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-panel text-[13px] text-muted">
          <Loader2 size={16} className="animate-spin" /> {t('view3d.loading')}
        </div>
      }
    >
      <div className="absolute inset-0 z-10">
        <Board3DView
          doc={doc}
          zoneFills={zoneFills}
          onClose={() => setView3d(false)}
          labels={{ top: t('view3d.top'), bottom: t('view3d.bottom'), iso: t('view3d.iso'), parts: t('view3d.parts'), close: t('common.close') }}
        />
      </div>
    </Suspense>
  );
}
