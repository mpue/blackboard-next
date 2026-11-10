// 3D view of a printed circuit board: textured board, parametric component
// bodies, orbit controls and a small toolbar. Loaded lazily, so three.js is
// only fetched when the view is opened.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Box, Cpu, Loader2, X } from 'lucide-react';
import type { Doc } from '../model/types.ts';
import { IconButton } from '../ui/primitives.tsx';
import { createViewer, type Viewer } from './viewer.ts';

export interface Board3DLabels {
  top: string;
  bottom: string;
  iso: string;
  parts: string;
  close: string;
  /** shown instead of the view when no WebGL context can be created */
  noWebgl?: string;
}

const DEFAULT_LABELS: Required<Board3DLabels> = {
  top: 'Top view',
  bottom: 'Bottom view',
  iso: 'Isometric view',
  parts: 'Show components',
  close: 'Close',
  noWebgl: 'WebGL is not available',
};

/** cheap identity of the zone fills, so that an equal new Map does not rebuild the scene */
function fillsKey(fills: Map<string, string> | undefined): string {
  if (!fills) return '';
  let k = '';
  for (const [id, d] of fills) k += `${id}:${d.length}:${d.slice(0, 24)}|`;
  return k;
}

export default function Board3DView({ doc, zoneFills, onClose, labels }: { doc: Doc; zoneFills?: Map<string, string>; onClose: () => void; labels?: Board3DLabels }) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fillsRef = useRef(zoneFills);
  fillsRef.current = zoneFills;
  const key = useMemo(() => fillsKey(zoneFills), [zoneFills]);
  const [parts, setParts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let v: Viewer;
    try {
      v = createViewer(hostRef.current!);
    } catch {
      setFailed(true);
      return;
    }
    viewerRef.current = v;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      viewerRef.current = null;
      v.dispose();
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    let live = true;
    setLoading(true);
    v.setBoard(doc, fillsRef.current)
      .catch((e: unknown) => console.warn('3D board view:', e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [doc, key]);

  useEffect(() => {
    viewerRef.current?.setPartsVisible(parts);
  }, [parts]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="absolute inset-0 overflow-hidden bg-app outline-none"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, var(--bb-panel-2), var(--bb-bg) 75%)' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {failed && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted">{l.noWebgl}</div>}
      {loading && !failed && <Loader2 size={16} className="pointer-events-none absolute left-3 top-3 animate-spin text-muted" />}
      <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-lg border border-line bg-panel/90 p-1 shadow-lg backdrop-blur-sm">
        <IconButton icon={ArrowDownToLine} label={l.top} disabled={failed} onClick={() => viewerRef.current?.view('top')} />
        <IconButton icon={ArrowUpFromLine} label={l.bottom} disabled={failed} onClick={() => viewerRef.current?.view('bottom')} />
        <IconButton icon={Box} label={l.iso} disabled={failed} onClick={() => viewerRef.current?.view('iso')} />
        <div className="mx-0.5 h-5 w-px bg-line" />
        <IconButton icon={Cpu} label={l.parts} active={parts} disabled={failed} onClick={() => setParts((p) => !p)} />
        <div className="mx-0.5 h-5 w-px bg-line" />
        <IconButton icon={X} label={l.close} onClick={onClose} />
      </div>
    </div>
  );
}
