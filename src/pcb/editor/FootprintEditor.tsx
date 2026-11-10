// Footprint editor: a large modal with its own SVG canvas (mm grid, pan, zoom)
// to draw pads, pad arrays and silkscreen, a property panel, validation and a
// small undo history. Works on board units, shows millimetres.

import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Circle, CircleCheck, CircleDot, Copy, Grid3x3, Maximize2, MousePointer2, Redo2, RotateCw, Slash, Square, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import type { FootprintDef, FootprintGraphic, PadDef, PadShape } from '../../model/types.ts';
import type { Pt, Rect } from '../../geometry/geom.ts';
import { FOOTPRINT_CATEGORIES } from '../footprints/index.ts';
import { mm, toMm } from '../units.ts';
import { Button, Check, Field, IconButton, NumberInput, Section, Select, TextArea, TextInput, cx } from '../../ui/primitives.tsx';
import {
  autoCourtyard,
  autoRefPos,
  clipSilk,
  contentBounds,
  defaultPadTemplate,
  DEFAULT_SILK_WIDTH,
  deleteSelection,
  duplicateSelection,
  emptyFootprint,
  finalizeFootprint,
  hasCourtyard,
  hitTest,
  itemsInRect,
  moveSelection,
  nextPadNumber,
  normalizeOrigin,
  padArray,
  padKey,
  parseTags,
  rotateSelection,
  round6,
  selectionBounds,
  silkKey,
  splitSelection,
  USER_CATEGORY,
  validateFootprint,
  type ArrayPattern,
  type FootprintIssue,
  type PadArrayOptions,
  type PadTemplate,
  type SelKey,
} from './model.ts';
import { DEFAULT_LABELS, fmtLabel, type FootprintEditorLabels } from './labels.ts';

export type { FootprintEditorLabels } from './labels.ts';

export interface FootprintEditorProps {
  /** footprint to edit; a new THT footprint when missing */
  initial?: FootprintDef;
  onSave: (def: FootprintDef) => void;
  onClose: () => void;
  labels?: Partial<FootprintEditorLabels>;
  /** display name of a library category (e.g. the fpcat.* translation) */
  categoryName?: (category: string) => string;
}

type Tool = 'select' | 'pad' | 'array' | 'line' | 'rect' | 'circle';
type ArraySettings = Omit<PadArrayOptions, 'pad' | 'at' | 'anchor'>;

interface View {
  ox: number;
  oy: number;
  /** px per board unit */
  s: number;
}

interface History {
  past: FootprintDef[];
  present: FootprintDef;
  future: FootprintDef[];
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move'; start: Pt; anchor: Pt; base: FootprintDef; sel: SelKey[] }
  | { kind: 'box'; start: Pt; add: boolean }
  | { kind: 'rect' | 'circle'; start: Pt };

const GRIDS = [0.05, 0.1, 0.25, 0.5, 1, 1.27, 2.54];
const MAX_HISTORY = 200;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 800;
const RULER = 18;

const C = {
  substrate: '#0f1913',
  tht: '#c9a94a',
  smd: '#d6453d',
  silk: '#f2f2f2',
  hole: '#05080a',
  courtyard: '#d65ad0',
  select: '#7dd3fc',
};

/** mm -> board units */
const U = (v: number) => round6(mm(v));
/** board units -> mm for display */
const M = (u: number) => Math.round(toMm(u) * 1e4) / 1e4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const ARRAY_DEFAULTS: Record<ArrayPattern, Partial<ArraySettings>> = {
  single: { count: 5, pitch: U(2.54), firstShape: 'rect' },
  dip: { count: 8, pitch: U(2.54), rowSpacing: U(7.62), firstShape: 'rect' },
  zigzag: { count: 10, pitch: U(2.54), rowSpacing: U(2.54), firstShape: 'rect' },
  quad: { count: 32, pitch: U(0.8), rowSpacing: U(8.3), firstShape: undefined },
  grid: { cols: 4, rows: 4, pitch: U(1), rowSpacing: U(1), firstShape: undefined },
};

function initialTemplate(def?: FootprintDef): PadTemplate {
  const last = def?.pads.filter((p) => !p.npth).at(-1);
  if (!last) return defaultPadTemplate(def && def.pads.length && !def.pads.some((p) => p.drill) ? 'smd' : 'tht');
  const t: PadTemplate = { shape: last.shape, w: last.w, h: last.h };
  if (last.drill) t.drill = last.drill;
  if (last.roundness !== undefined) t.roundness = last.roundness;
  if (last.rotation) t.rotation = last.rotation;
  return t;
}

const isSmd = (def?: FootprintDef) => !!def && def.pads.length > 0 && !def.pads.some((p) => p.drill);

/** shape dependent defaults, drill removal clears the NPTH flag */
function normalizePad<T extends PadTemplate>(p: T): T {
  const out = { ...p };
  if (out.shape === 'roundrect' && out.roundness === undefined) out.roundness = 0.25;
  if (!out.drill) {
    delete out.drill;
    delete out.npth;
  }
  return out;
}

function anchorOf(def: FootprintDef, k: SelKey): Pt {
  const i = Number(k.slice(1));
  if (k[0] === 'p') return def.pads[i];
  const g = def.silk[i];
  switch (g.kind) {
    case 'line':
      return { x: g.x1, y: g.y1 };
    case 'rect':
      return { x: g.x, y: g.y };
    case 'circle':
    case 'arc':
      return { x: g.cx, y: g.cy };
    case 'poly':
      return g.pts[0] ?? { x: 0, y: 0 };
  }
}

const normRect = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

function unite(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// ---- drawing ------------------------------------------------------------------------------

function PadView({ p, fill, opacity, stroke }: { p: PadDef | (PadTemplate & Pt); fill: string; opacity?: number; stroke?: string }) {
  const rot = p.rotation ? `rotate(${p.rotation} ${p.x} ${p.y})` : undefined;
  const common = { fill, fillOpacity: opacity, stroke, strokeWidth: stroke ? 1.5 : undefined, vectorEffect: stroke ? ('non-scaling-stroke' as const) : undefined, transform: rot };
  if (p.shape === 'circle') return <circle cx={p.x} cy={p.y} r={Math.min(p.w, p.h) / 2} {...common} />;
  const rx = p.shape === 'oval' ? Math.min(p.w, p.h) / 2 : p.shape === 'roundrect' ? Math.min(0.5, p.roundness ?? 0.25) * Math.min(p.w, p.h) : 0;
  return <rect x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx={rx} {...common} />;
}

function PadCopper({ p, opacity }: { p: PadDef | (PadTemplate & Pt); opacity?: number }) {
  if (p.npth) return <circle cx={p.x} cy={p.y} r={(p.drill ?? p.w) / 2} fill={C.hole} fillOpacity={opacity} stroke="#8a9a90" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />;
  return (
    <>
      <PadView p={p} fill={p.drill ? C.tht : C.smd} opacity={opacity} />
      {!!p.drill && <circle cx={p.x} cy={p.y} r={p.drill / 2} fill={C.hole} fillOpacity={opacity} />}
    </>
  );
}

function SilkView({ g, color, opacity, minWidth = 0 }: { g: FootprintGraphic; color: string; opacity?: number; minWidth?: number }) {
  const sw = Math.max(g.width, minWidth);
  const common = { stroke: color, strokeWidth: sw, strokeOpacity: opacity, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (g.kind) {
    case 'line':
      return <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} {...common} />;
    case 'rect':
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none" {...common} />;
    case 'circle':
      return <circle cx={g.cx} cy={g.cy} r={g.r} fill={g.fill ? color : 'none'} fillOpacity={opacity} {...common} strokeWidth={g.fill && !g.width ? minWidth : sw} />;
    case 'poly':
      return <polygon points={g.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={g.fill ? color : 'none'} fillOpacity={opacity} {...common} />;
    case 'arc': {
      if (Math.abs(g.sweep) >= 360) return <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" {...common} />;
      const a0 = (g.start * Math.PI) / 180;
      const a1 = ((g.start + g.sweep) * Math.PI) / 180;
      return (
        <path
          d={`M${g.cx + g.r * Math.cos(a0)} ${g.cy + g.r * Math.sin(a0)}A${g.r} ${g.r} 0 ${Math.abs(g.sweep) > 180 ? 1 : 0} ${g.sweep > 0 ? 1 : 0} ${g.cx + g.r * Math.cos(a1)} ${g.cy + g.r * Math.sin(a1)}`}
          fill="none"
          {...common}
        />
      );
    }
  }
}

/** grid lines in screen space; the step grows (x5, x2, …) until lines are >= 8 px apart */
function gridPaths(view: View, w: number, h: number, step: number): { minor: string; major: string } {
  let st = step;
  for (let k = 0; st * view.s < 8 && k < 20; k++) st *= k % 2 ? 2 : 5;
  let minor = '';
  let major = '';
  const x0 = Math.ceil(-view.ox / view.s / st);
  const x1 = Math.floor((w - view.ox) / view.s / st);
  for (let i = x0; i <= x1; i++) {
    const sx = Math.round(i * st * view.s + view.ox) + 0.5;
    const seg = `M${sx} 0V${h}`;
    if (i % 5 === 0) major += seg;
    else minor += seg;
  }
  const y0 = Math.ceil(-view.oy / view.s / st);
  const y1 = Math.floor((h - view.oy) / view.s / st);
  for (let i = y0; i <= y1; i++) {
    const sy = Math.round(i * st * view.s + view.oy) + 0.5;
    const seg = `M0 ${sy}H${w}`;
    if (i % 5 === 0) major += seg;
    else minor += seg;
  }
  return { minor, major };
}

const fmtTick = (v: number) => (Math.abs(v) < 1e-9 ? '0' : String(parseFloat(v.toFixed(2))));

function Rulers({ view, w, h, cursor }: { view: View; w: number; h: number; cursor: Pt | null }) {
  const ppm = view.s * mm(1);
  const major = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((st) => st * ppm >= 56) ?? 500;
  const minor = major / (String(major)[0] === '2' ? 4 : 5);
  const ticks = (fromPx: number, toPx: number, o: number) => {
    const a = toMm((fromPx - o) / view.s);
    const b = toMm((toPx - o) / view.s);
    const out: { px: number; v: number; major: boolean }[] = [];
    for (let n = Math.ceil(a / minor); n * minor <= b; n++) {
      const v = n * minor;
      out.push({ px: Math.round(mm(v) * view.s + o) + 0.5, v, major: Math.abs(v / major - Math.round(v / major)) < 1e-6 });
    }
    return out;
  };
  const hx = ticks(RULER, w, view.ox);
  const vy = ticks(RULER, h, view.oy);
  const bg = '#0a110d';
  return (
    <g pointerEvents="none" fontSize={9.5} fontFamily="Inter, Arial, sans-serif" fill="#9db2a6">
      <rect x={0} y={0} width={w} height={RULER} fill={bg} fillOpacity={0.94} />
      <rect x={0} y={0} width={RULER} height={h} fill={bg} fillOpacity={0.94} />
      <path d={hx.map((t) => `M${t.px} ${RULER}v${t.major ? -8 : -4}`).join('') + vy.map((t) => `M${RULER} ${t.px}h${t.major ? -8 : -4}`).join('')} stroke="#5d7568" fill="none" />
      {hx.filter((t) => t.major).map((t) => (
        <text key={`h${t.v}`} x={t.px + 3} y={9}>
          {fmtTick(t.v)}
        </text>
      ))}
      {vy.filter((t) => t.major).map((t) => (
        <text key={`v${t.v}`} transform={`translate(9 ${t.px - 3}) rotate(-90)`}>
          {fmtTick(t.v)}
        </text>
      ))}
      {cursor && (
        <path d={`M${cursor.x * view.s + view.ox} 0v${RULER}M0 ${cursor.y * view.s + view.oy}h${RULER}`} stroke={C.select} strokeWidth={1.5} />
      )}
      <rect x={0} y={0} width={RULER} height={RULER} fill={bg} />
    </g>
  );
}

// ---- inputs -----------------------------------------------------------------------------------

function MmInput({ value, onCommit, min, step = 0.1 }: { value: number; onCommit: (u: number) => void; min?: number; step?: number }) {
  return <NumberInput value={M(value)} step={step} min={min} suffix="mm" onCommit={(v) => onCommit(U(v))} />;
}

/** mm value that may be empty (drill: empty = SMD) */
function OptMmInput({ value, onCommit, placeholder }: { value?: number; onCommit: (u: number | undefined) => void; placeholder?: string }) {
  const fmt = (u?: number) => (u === undefined ? '' : String(M(u)));
  const [v, setV] = useState(fmt(value));
  useEffect(() => setV(value === undefined ? '' : String(M(value))), [value]);
  const commit = () => {
    const t = v.trim().replace(',', '.');
    if (!t) {
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const n = parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) return setV(fmt(value));
    const u = U(n);
    if (u !== value) onCommit(u);
    else setV(fmt(value));
  };
  return (
    <div className="relative w-full">
      <input
        className="bb-input pr-8 tabular-nums"
        inputMode="decimal"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setV(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">mm</span>
    </div>
  );
}

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="truncate text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

// ---- editor -------------------------------------------------------------------------------------

export default function FootprintEditor({ initial, onSave, onClose, labels, categoryName }: FootprintEditorProps) {
  const L = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
  const [hist, setHist] = useState<History>(() => ({ past: [], present: initial ? structuredClone(initial) : emptyFootprint('tht'), future: [] }));
  const def = hist.present;
  const startDef = useRef(def);
  const [sel, setSel] = useState<SelKey[]>([]);
  const [tool, setToolState] = useState<Tool>('select');
  const [template, setTemplate] = useState<PadTemplate>(() => initialTemplate(initial));
  const [arr, setArr] = useState<ArraySettings>(() => ({ pattern: 'dip', count: 8, pitch: U(2.54), start: 1, naming: 'alpha', direction: 'down', ...ARRAY_DEFAULTS.dip }));
  const [silkWidth, setSilkWidth] = useState(round6(DEFAULT_SILK_WIDTH));
  const [grid, setGrid] = useState(() => (isSmd(initial) ? 0.5 : 1.27));
  const [snap, setSnap] = useState(true);
  const [rulers, setRulers] = useState(true);
  const [view, setView] = useState<View>({ ox: 0, oy: 0, s: 10 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [hover, setHover] = useState<SelKey | null>(null);
  const [lineStart, setLineStart] = useState<Pt | null>(null);
  const [ghost, setGhost] = useState<FootprintGraphic | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fitted = useRef(false);
  const idInput = useId();

  const step = U(grid);
  const snapV = (v: number) => (snap ? round6(Math.round(v / step) * step) : round6(v));
  const snapP = (p: Pt): Pt => ({ x: snapV(p.x), y: snapV(p.y) });

  // indices may vanish after undo / clipping
  const validSel = useMemo(() => sel.filter((k) => Number(k.slice(1)) < (k[0] === 'p' ? def.pads.length : def.silk.length)), [sel, def]);
  const split = useMemo(() => splitSelection(validSel), [validSel]);
  // drawing tools edit the settings for new items, the select tool the selection
  const drawing = tool !== 'select';
  const selPads = useMemo(() => (drawing ? [] : [...split.pads].sort((a, b) => a - b)), [split, drawing]);
  const selSilk = useMemo(() => (drawing ? [] : [...split.silk].sort((a, b) => a - b)), [split, drawing]);

  const deferred = useDeferredValue(def);
  const issues = useMemo(() => validateFootprint(deferred), [deferred]);

  // ---- history -------------------------------------------------------------------------------
  const edit = (fn: (d: FootprintDef) => FootprintDef) => {
    setError('');
    setHist((h) => {
      const next = fn(h.present);
      return next === h.present ? h : { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
    });
  };
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  const setTool = (t: Tool) => {
    // arrays continue the numbering
    const next = Number(nextPadNumber(def));
    if (t === 'array' && tool !== 'array' && Number.isInteger(next)) setArr((a) => ({ ...a, start: next }));
    setToolState(t);
    setLineStart(null);
    setGhost(null);
    setHover(null);
  };

  // ---- view ------------------------------------------------------------------------------------
  const fit = () => {
    if (!size.w || !size.h) return;
    let b = contentBounds(def);
    if (hasCourtyard(def)) b = unite(b, def.courtyard);
    b = unite(b, { x: 0, y: 0, w: 0, h: 0 });
    const minSize = U(6);
    if (b.w < minSize) b = { ...b, x: b.x - (minSize - b.w) / 2, w: minSize };
    if (b.h < minSize) b = { ...b, y: b.y - (minSize - b.h) / 2, h: minSize };
    const off = rulers ? RULER : 0;
    const s = clamp(Math.min((size.w - off) / (b.w * 1.3), (size.h - off) / (b.h * 1.3)), ZOOM_MIN, ZOOM_MAX);
    setView({ s, ox: off + (size.w - off) / 2 - (b.x + b.w / 2) * s, oy: off + (size.h - off) / 2 - (b.y + b.h / 2) * s });
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    el.focus({ preventScroll: true });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fitted.current && size.w > 0 && size.h > 0) {
      fitted.current = true;
      fit();
    }
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setView((v) => {
        const s = clamp(v.s * Math.pow(1.0018, -delta * (e.ctrlKey ? 3 : 1)), ZOOM_MIN, ZOOM_MAX);
        const k = s / v.s;
        return { s, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
  };

  // ---- commands ----------------------------------------------------------------------------------
  const removeSelection = () => {
    if (!validSel.length) return;
    edit((d) => deleteSelection(d, validSel));
    setSel([]);
  };

  const rotate = () => {
    if (!validSel.length) return;
    const b = selectionBounds(def, validSel);
    if (!b) return;
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    edit((d) => rotateSelection(d, validSel, 90, validSel.length > 1 ? snapP(c) : c));
  };

  const duplicate = () => {
    if (!validSel.length) return;
    const r = duplicateSelection(def, validSel, step, step);
    edit(() => r.def);
    setSel(r.sel);
  };

  const nudge = (dx: number, dy: number) => {
    if (validSel.length) edit((d) => moveSelection(d, validSel, round6(dx), round6(dy)));
  };

  const escape = () => {
    const d = drag.current;
    if (d) {
      if (d.kind === 'move') setHist((h) => ({ ...h, present: d.base }));
      drag.current = null;
      setBox(null);
      setGhost(null);
      setPanning(false);
      return;
    }
    if (lineStart) setLineStart(null);
    else if (tool !== 'select') setTool('select');
    else setSel([]);
  };

  const save = () => {
    const out = finalizeFootprint(def);
    if (!out.id) {
      setError(L.idRequired);
      document.getElementById(idInput)?.focus();
      return;
    }
    onSave(out);
  };

  const cancel = () => {
    if (def !== startDef.current && !window.confirm(L.discard)) return;
    onClose();
  };

  // ---- keyboard (capture phase: the main editor must not see these keys) ----------------------------
  const handleKey = (e: KeyboardEvent, up: boolean) => {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === 's' && !up) {
      e.preventDefault();
      e.stopPropagation();
      // commit a pending text field first
      (document.activeElement as HTMLElement | null)?.blur();
      setTimeout(() => saveRef.current());
      return;
    }
    if (typing) return;
    e.stopPropagation();
    if (e.code === 'Space') {
      e.preventDefault();
      spaceRef.current = !up;
      setSpace(!up);
      return;
    }
    if (up) return;
    if (mod) {
      if (key === 'z' && !e.shiftKey) undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) redo();
      else if (key === 'a') setSel([...def.pads.map((_, i) => padKey(i)), ...def.silk.map((_, i) => silkKey(i))]);
      else if (key === 'd') duplicate();
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;
    const k = e.shiftKey ? 10 * step : step;
    switch (key) {
      case 'escape':
        escape();
        break;
      case 'delete':
      case 'backspace':
        removeSelection();
        break;
      case 'r':
        rotate();
        break;
      case 'v':
        setTool('select');
        break;
      case 'p':
        setTool('pad');
        break;
      case 'a':
        setTool('array');
        break;
      case 'l':
        setTool('line');
        break;
      case 'b':
        setTool('rect');
        break;
      case 'c':
        setTool('circle');
        break;
      case 'f':
        fit();
        break;
      case 'arrowleft':
        nudge(-k, 0);
        break;
      case 'arrowright':
        nudge(k, 0);
        break;
      case 'arrowup':
        nudge(0, -k);
        break;
      case 'arrowdown':
        nudge(0, k);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  const keyRef = useRef(handleKey);
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    keyRef.current = handleKey;
    saveRef.current = save;
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyRef.current(e, false);
    const up = (e: KeyboardEvent) => keyRef.current(e, true);
    const blur = () => {
      spaceRef.current = false;
      setSpace(false);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ---- pointer -----------------------------------------------------------------------------------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    wrapRef.current?.focus({ preventScroll: true });
    const w = toWorld(e);
    const ws = snapP(w);
    const capture = () => e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
      setPanning(true);
      capture();
      return;
    }
    if (e.button === 2) {
      setLineStart(null);
      return;
    }
    if (e.button !== 0) return;
    switch (tool) {
      case 'select': {
        const hit = hitTest(def, w, 4 / view.s);
        if (!hit) {
          if (!e.shiftKey) setSel([]);
          drag.current = { kind: 'box', start: w, add: e.shiftKey };
          setBox({ x: w.x, y: w.y, w: 0, h: 0 });
          capture();
          return;
        }
        let next = validSel;
        if (e.shiftKey) next = validSel.includes(hit) ? validSel.filter((k) => k !== hit) : [...validSel, hit];
        else if (!validSel.includes(hit)) next = [hit];
        setSel(next);
        if (next.includes(hit)) {
          drag.current = { kind: 'move', start: w, anchor: anchorOf(def, hit), base: def, sel: next };
          capture();
        }
        return;
      }
      case 'pad': {
        const pad = normalizePad({ ...template, num: template.npth ? '' : nextPadNumber(def), x: ws.x, y: ws.y } as PadDef);
        const i = def.pads.length;
        edit((d) => ({ ...d, pads: [...d.pads, pad] }));
        setSel([padKey(i)]);
        return;
      }
      case 'array': {
        const pads = padArray({ ...arr, pad: normalizePad(template), at: ws });
        if (!pads.length) return;
        const n = def.pads.length;
        edit((d) => ({ ...d, pads: [...d.pads, ...pads] }));
        setSel(pads.map((_, k) => padKey(n + k)));
        setTool('select');
        return;
      }
      case 'line': {
        if (lineStart && (lineStart.x !== ws.x || lineStart.y !== ws.y)) {
          const line: FootprintGraphic = { kind: 'line', x1: lineStart.x, y1: lineStart.y, x2: ws.x, y2: ws.y, width: silkWidth };
          edit((d) => ({ ...d, silk: [...d.silk, line] }));
        }
        setLineStart(ws);
        return;
      }
      case 'rect':
      case 'circle':
        drag.current = { kind: tool, start: ws };
        capture();
        return;
    }
  };

  const rectGhost = (a: Pt, b: Pt): FootprintGraphic => ({ kind: 'rect', ...normRect(a, b), width: silkWidth });
  const circleGhost = (c: Pt, p: Pt): FootprintGraphic => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    return { kind: 'circle', cx: c.x, cy: c.y, r: snap ? Math.max(d > 0 ? step : 0, snapV(d)) : round6(d), width: silkWidth };
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const w = toWorld(e);
    const ws = snapP(w);
    setCursor(ws);
    const d = drag.current;
    if (!d) {
      if (tool === 'select') setHover(hitTest(def, w, 4 / view.s));
      return;
    }
    switch (d.kind) {
      case 'pan':
        setView((v) => ({ ...v, ox: d.ox + e.clientX - d.sx, oy: d.oy + e.clientY - d.sy }));
        return;
      case 'move': {
        const dx = round6(snapV(d.anchor.x + w.x - d.start.x) - d.anchor.x);
        const dy = round6(snapV(d.anchor.y + w.y - d.start.y) - d.anchor.y);
        const next = moveSelection(d.base, d.sel, dx, dy);
        setHist((h) => (h.present === next ? h : { ...h, present: next }));
        return;
      }
      case 'box':
        setBox(normRect(d.start, w));
        return;
      case 'rect':
        setGhost(rectGhost(d.start, ws));
        return;
      case 'circle':
        setGhost(circleGhost(d.start, ws));
        return;
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    switch (d.kind) {
      case 'pan':
        setPanning(false);
        return;
      case 'move':
        setHist((h) => (h.present === d.base ? h : { past: [...h.past, d.base].slice(-MAX_HISTORY), present: h.present, future: [] }));
        return;
      case 'box': {
        const r = normRect(d.start, toWorld(e));
        setBox(null);
        if (r.w * view.s < 3 && r.h * view.s < 3) return;
        const keys = itemsInRect(def, r);
        setSel(d.add ? [...new Set([...validSel, ...keys])] : keys);
        return;
      }
      case 'rect': {
        const g = rectGhost(d.start, snapP(toWorld(e)));
        setGhost(null);
        if (g.kind === 'rect' && g.w > 0 && g.h > 0) {
          const i = def.silk.length;
          edit((x) => ({ ...x, silk: [...x.silk, g] }));
          setSel([silkKey(i)]);
        }
        return;
      }
      case 'circle': {
        const g = circleGhost(d.start, snapP(toWorld(e)));
        setGhost(null);
        if (g.kind === 'circle' && g.r > 0) {
          const i = def.silk.length;
          edit((x) => ({ ...x, silk: [...x.silk, g] }));
          setSel([silkKey(i)]);
        }
        return;
      }
    }
  };

  // ---- property edits ------------------------------------------------------------------------------
  const setMeta = (patch: Partial<FootprintDef>) => edit((d) => ({ ...d, ...patch }));

  const padValues: PadTemplate & Partial<PadDef> = selPads.length ? def.pads[selPads[0]] : template;
  const setPad = (patch: Partial<PadDef>) => {
    if (!selPads.length) return setTemplate((t) => normalizePad({ ...t, ...patch }));
    const set = new Set(selPads);
    edit((d) => ({ ...d, pads: d.pads.map((p, i) => (set.has(i) ? normalizePad({ ...p, ...patch }) : p)) }));
  };

  const setSilkAt = (i: number, g: FootprintGraphic) => edit((d) => ({ ...d, silk: d.silk.map((x, k) => (k === i ? g : x)) }));
  const setSilkWidthSel = (width: number) => {
    const set = new Set(selSilk);
    edit((d) => ({ ...d, silk: d.silk.map((g, k) => (set.has(k) ? { ...g, width } : g)) }));
  };

  const selectIssue = (is: FootprintIssue) => {
    const keys = [...(is.pads ?? []).map(padKey), ...(is.silk ?? []).map(silkKey)];
    if (keys.length) {
      setTool('select');
      setSel(keys);
    }
  };

  // ---- options ---------------------------------------------------------------------------------------
  const shapeOptions: { value: PadShape; label: string }[] = [
    { value: 'circle', label: L.shapeCircle },
    { value: 'rect', label: L.shapeRect },
    { value: 'oval', label: L.shapeOval },
    { value: 'roundrect', label: L.shapeRoundrect },
  ];
  const categories = [...FOOTPRINT_CATEGORIES, USER_CATEGORY];
  if (def.category && !categories.includes(def.category)) categories.push(def.category);
  const categoryOptions = categories.map((c) => ({ value: c, label: c === USER_CATEGORY ? L.categoryUser : (categoryName?.(c) ?? c) }));
  const patternOptions: { value: ArrayPattern; label: string }[] = [
    { value: 'single', label: L.patternSingle },
    { value: 'dip', label: L.patternDip },
    { value: 'zigzag', label: L.patternZigzag },
    { value: 'quad', label: L.patternQuad },
    { value: 'grid', label: L.patternGrid },
  ];
  const tools: { id: Tool; icon: typeof MousePointer2; label: string; key: string }[] = [
    { id: 'select', icon: MousePointer2, label: L.toolSelect, key: 'V' },
    { id: 'pad', icon: CircleDot, label: L.toolPad, key: 'P' },
    { id: 'array', icon: Grid3x3, label: L.toolArray, key: 'A' },
    { id: 'line', icon: Slash, label: L.toolLine, key: 'L' },
    { id: 'rect', icon: Square, label: L.toolRect, key: 'B' },
    { id: 'circle', icon: Circle, label: L.toolCircle, key: 'C' },
  ];
  const hints: Record<Tool, string> = { select: L.hintSelect, pad: L.hintPad, array: L.hintArray, line: L.hintLine, rect: L.hintRect, circle: L.hintCircle };

  // ---- canvas content --------------------------------------------------------------------------------
  const lines = size.w ? gridPaths(view, size.w, size.h, step) : { minor: '', major: '' };
  const showNumbers = (p: PadDef) => !p.npth && !!p.num && Math.min(p.w, p.h) * 0.5 * view.s >= 6;
  const preview: ReactNode = (() => {
    if (!cursor || panning) return null;
    if (tool === 'pad') return <PadCopper p={{ ...normalizePad(template), x: cursor.x, y: cursor.y }} opacity={0.5} />;
    if (tool === 'array') return padArray({ ...arr, pad: normalizePad(template), at: cursor }).map((p, i) => <PadCopper key={i} p={p} opacity={0.4} />);
    if (tool === 'line' && lineStart) return <SilkView g={{ kind: 'line', x1: lineStart.x, y1: lineStart.y, x2: cursor.x, y2: cursor.y, width: silkWidth }} color={C.silk} opacity={0.6} />;
    return null;
  })();
  const ox = view.ox;
  const oy = view.oy;
  const hoverIdx = hover ? Number(hover.slice(1)) : -1;
  const hoverPad = hover?.[0] === 'p' && !split.pads.has(hoverIdx) ? def.pads[hoverIdx] : undefined;
  const hoverSilk = hover?.[0] === 's' && !split.silk.has(hoverIdx) ? def.silk[hoverIdx] : undefined;
  const canvasCursor = space || panning ? (panning ? 'grabbing' : 'grab') : tool === 'select' ? (hover ? 'move' : 'default') : 'crosshair';

  // ---- panel sections ---------------------------------------------------------------------------------
  const padSection = (
    <Section title={selPads.length === 1 ? `${L.pad} ${def.pads[selPads[0]].num}` : selPads.length ? fmtLabel(L.padsSelected, { count: selPads.length }) : L.newPads}>
      {selPads.length === 1 && (
        <Pair>
          <Small label={L.number}>
            <TextInput value={def.pads[selPads[0]].num} onCommit={(v) => setPad({ num: v.trim() })} mono />
          </Small>
          <Small label={L.padName}>
            <TextInput value={def.pads[selPads[0]].name ?? ''} onCommit={(v) => setPad({ name: v.trim() || undefined })} />
          </Small>
        </Pair>
      )}
      <Field label={L.shape}>
        <Select value={padValues.shape} options={shapeOptions} onChange={(shape) => setPad({ shape })} />
      </Field>
      <Pair>
        <Small label={L.width}>
          <MmInput value={padValues.w} min={0.01} onCommit={(w) => setPad({ w })} />
        </Small>
        <Small label={L.height}>
          <MmInput value={padValues.h} min={0.01} onCommit={(h) => setPad({ h })} />
        </Small>
      </Pair>
      <Pair>
        <Small label={L.drill}>
          <OptMmInput value={padValues.drill} placeholder={L.drillHint} onCommit={(drill) => setPad({ drill })} />
        </Small>
        <Small label={L.rotation}>
          <NumberInput value={padValues.rotation ?? 0} step={90} suffix="°" onCommit={(rotation) => setPad({ rotation: ((rotation % 360) + 360) % 360 || undefined })} />
        </Small>
      </Pair>
      {padValues.shape === 'roundrect' && (
        <Field label={L.roundness}>
          <NumberInput value={Math.round((padValues.roundness ?? 0.25) * 100)} min={0} max={50} step={5} suffix="%" onCommit={(v) => setPad({ roundness: v / 100 })} />
        </Field>
      )}
      {selPads.length === 1 && (
        <Pair>
          <Small label={L.posX}>
            <MmInput value={def.pads[selPads[0]].x} step={grid} onCommit={(x) => setPad({ x })} />
          </Small>
          <Small label={L.posY}>
            <MmInput value={def.pads[selPads[0]].y} step={grid} onCommit={(y) => setPad({ y })} />
          </Small>
        </Pair>
      )}
      {!!padValues.drill && <Check checked={!!padValues.npth} onChange={(npth) => setPad(!npth ? { npth: undefined } : selPads.length === 1 ? { npth, num: '' } : { npth })} label={L.npth} />}
    </Section>
  );

  const silkOne = selSilk.length === 1 ? def.silk[selSilk[0]] : undefined;
  const coord = (g: FootprintGraphic, key: string, label: string, min?: number) => (
    <Small key={key} label={label}>
      <MmInput value={(g as unknown as Record<string, number>)[key]} min={min} step={grid} onCommit={(v) => setSilkAt(selSilk[0], { ...g, [key]: v } as FootprintGraphic)} />
    </Small>
  );
  const silkSection = (
    <Section title={silkOne ? L.silk : selSilk.length ? fmtLabel(L.silkSelected, { count: selSilk.length }) : L.newSilk}>
      <Field label={L.lineWidth}>
        <MmInput value={silkOne ? silkOne.width : selSilk.length ? def.silk[selSilk[0]].width : silkWidth} min={0} step={0.05} onCommit={(w) => (selSilk.length ? setSilkWidthSel(w) : setSilkWidth(w))} />
      </Field>
      {silkOne?.kind === 'line' && (
        <>
          <Pair>
            {coord(silkOne, 'x1', L.x1)}
            {coord(silkOne, 'y1', L.y1)}
          </Pair>
          <Pair>
            {coord(silkOne, 'x2', L.x2)}
            {coord(silkOne, 'y2', L.y2)}
          </Pair>
        </>
      )}
      {silkOne?.kind === 'rect' && (
        <>
          <Pair>
            {coord(silkOne, 'x', L.posX)}
            {coord(silkOne, 'y', L.posY)}
          </Pair>
          <Pair>
            {coord(silkOne, 'w', L.width, 0)}
            {coord(silkOne, 'h', L.height, 0)}
          </Pair>
        </>
      )}
      {(silkOne?.kind === 'circle' || silkOne?.kind === 'arc') && (
        <>
          <Pair>
            {coord(silkOne, 'cx', L.centerX)}
            {coord(silkOne, 'cy', L.centerY)}
          </Pair>
          <Pair>{coord(silkOne, 'r', L.radius, 0)}</Pair>
        </>
      )}
      {silkOne?.kind === 'arc' && (
        <Pair>
          <Small label={L.startAngle}>
            <NumberInput value={silkOne.start} step={15} suffix="°" onCommit={(start) => setSilkAt(selSilk[0], { ...silkOne, start })} />
          </Small>
          <Small label={L.sweep}>
            <NumberInput value={silkOne.sweep} step={15} suffix="°" onCommit={(sweep) => setSilkAt(selSilk[0], { ...silkOne, sweep })} />
          </Small>
        </Pair>
      )}
      {silkOne?.kind === 'poly' && <p className="text-[11.5px] text-muted">{fmtLabel(L.points, { count: silkOne.pts.length })}</p>}
      {(silkOne?.kind === 'circle' || silkOne?.kind === 'poly') && <Check checked={!!silkOne.fill} onChange={(v) => setSilkAt(selSilk[0], { ...silkOne, fill: v || undefined })} label={L.fill} />}
    </Section>
  );

  const arraySection = (
    <Section title={L.array}>
      <Field label={L.pattern}>
        <Select value={arr.pattern} options={patternOptions} onChange={(pattern) => setArr((a) => ({ ...a, ...ARRAY_DEFAULTS[pattern], pattern }))} />
      </Field>
      {arr.pattern === 'grid' ? (
        <Pair>
          <Small label={L.cols}>
            <NumberInput value={arr.cols ?? 4} min={1} max={64} onCommit={(v) => setArr((a) => ({ ...a, cols: Math.round(v) }))} />
          </Small>
          <Small label={L.rows}>
            <NumberInput value={arr.rows ?? 4} min={1} max={64} onCommit={(v) => setArr((a) => ({ ...a, rows: Math.round(v) }))} />
          </Small>
        </Pair>
      ) : (
        <Field label={L.count}>
          <NumberInput
            value={arr.count}
            min={arr.pattern === 'single' ? 1 : arr.pattern === 'quad' ? 4 : 2}
            max={1024}
            step={arr.pattern === 'single' ? 1 : arr.pattern === 'quad' ? 4 : 2}
            onCommit={(v) => setArr((a) => ({ ...a, count: Math.round(v) }))}
          />
        </Field>
      )}
      <Pair>
        <Small label={L.pitch}>
          <MmInput value={arr.pitch} min={0.01} step={0.05} onCommit={(pitch) => setArr((a) => ({ ...a, pitch }))} />
        </Small>
        {arr.pattern === 'single' ? (
          <Small label={L.direction}>
            <Select
              value={arr.direction ?? 'down'}
              options={[
                { value: 'down', label: L.directionDown },
                { value: 'right', label: L.directionRight },
              ]}
              onChange={(direction) => setArr((a) => ({ ...a, direction }))}
            />
          </Small>
        ) : (
          <Small label={arr.pattern === 'quad' ? L.rowSpacingQuad : L.rowSpacing}>
            <MmInput value={arr.rowSpacing ?? arr.pitch} min={0.01} step={0.05} onCommit={(rowSpacing) => setArr((a) => ({ ...a, rowSpacing }))} />
          </Small>
        )}
      </Pair>
      <Pair>
        <Small label={L.startNumber}>
          <NumberInput value={arr.start ?? 1} min={0} onCommit={(v) => setArr((a) => ({ ...a, start: Math.round(v) }))} />
        </Small>
        {arr.pattern === 'grid' && (
          <Small label={L.naming}>
            <Select
              value={arr.naming ?? 'alpha'}
              options={[
                { value: 'alpha', label: L.namingAlpha },
                { value: 'numeric', label: L.namingNumeric },
              ]}
              onChange={(naming) => setArr((a) => ({ ...a, naming }))}
            />
          </Small>
        )}
      </Pair>
      <Check checked={arr.firstShape === 'rect'} onChange={(v) => setArr((a) => ({ ...a, firstShape: v ? 'rect' : undefined }))} label={L.firstRect} />
      <p className="text-[11px] leading-snug text-muted">{L.arrayHint}</p>
    </Section>
  );

  const issueText = (is: FootprintIssue) => {
    const key = `issue${is.code[0].toUpperCase()}${is.code.slice(1)}` as keyof FootprintEditorLabels;
    return fmtLabel(L[key] ?? is.code, { detail: is.detail ?? '' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={L.title} className="bb-pop flex h-full max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="min-w-0 truncate text-[14px] font-semibold">
            {L.title}
            {def.id && <span className="ml-2 font-mono text-[12px] font-normal text-muted">{def.id}</span>}
          </h2>
          <IconButton icon={X} label={L.close} onClick={cancel} />
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1 border-b border-line bg-panel-2 px-2 py-1">
              {tools.map((t) => (
                <IconButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.id} onClick={() => setTool(t.id)} />
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
              <IconButton icon={Undo2} label={L.undo} shortcut="Ctrl+Z" disabled={!hist.past.length} onClick={undo} />
              <IconButton icon={Redo2} label={L.redo} shortcut="Ctrl+Y" disabled={!hist.future.length} onClick={redo} />
              <IconButton icon={RotateCw} label={L.rotate} shortcut="R" disabled={!validSel.length} onClick={rotate} />
              <IconButton icon={Copy} label={L.duplicate} shortcut="Ctrl+D" disabled={!validSel.length} onClick={duplicate} />
              <IconButton icon={Trash2} label={L.delete} shortcut="Del" disabled={!validSel.length} onClick={removeSelection} />
              <span className="mx-1 h-5 w-px bg-line" />
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                {L.grid}
                <span className="w-[92px]">
                  <Select value={grid} options={GRIDS.map((g) => ({ value: g, label: `${g} mm` }))} onChange={setGrid} />
                </span>
              </label>
              <span className="ml-2">
                <Check checked={snap} onChange={setSnap} label={L.snap} />
              </span>
              <span className="ml-2">
                <Check checked={rulers} onChange={setRulers} label={L.rulers} />
              </span>
              <IconButton icon={Maximize2} label={L.fit} shortcut="F" onClick={fit} className="ml-auto" />
            </div>

            <div ref={wrapRef} tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden outline-none" style={{ background: C.substrate }}>
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none select-none"
                style={{ cursor: canvasCursor }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => {
                  if (!drag.current) {
                    setCursor(null);
                    setHover(null);
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
                onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                onAuxClick={(e) => e.preventDefault()}
              >
                <path d={lines.minor} stroke="#ffffff" strokeOpacity={0.06} />
                <path d={lines.major} stroke="#ffffff" strokeOpacity={0.13} />
                <path d={`M${Math.round(ox) + 0.5} 0V${size.h}M0 ${Math.round(oy) + 0.5}H${size.w}`} stroke="#ffffff" strokeOpacity={0.22} />

                <g transform={`translate(${ox} ${oy}) scale(${view.s})`}>
                  {hasCourtyard(def) && (
                    <rect x={def.courtyard.x} y={def.courtyard.y} width={def.courtyard.w} height={def.courtyard.h} fill="none" stroke={C.courtyard} strokeOpacity={0.75} strokeWidth={1} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                  )}
                  {def.silk.map((g, i) => (
                    <SilkView key={i} g={g} color={split.silk.has(i) ? C.select : C.silk} minWidth={1 / view.s} />
                  ))}
                  {def.pads.map((p, i) => (
                    <PadCopper key={i} p={p} />
                  ))}
                  {def.pads.map((p, i) => (split.pads.has(i) ? <PadView key={`s${i}`} p={p} fill="#ffffff" opacity={0.25} stroke={C.select} /> : null))}
                  {hoverPad && <PadView p={hoverPad} fill="none" stroke="#ffffff" />}
                  {hoverSilk && <SilkView g={hoverSilk} color={C.select} opacity={0.55} minWidth={1 / view.s} />}
                  {def.pads.map((p, i) =>
                    showNumbers(p) ? (
                      <text key={`n${i}`} x={p.x} y={p.y} fontSize={Math.min(p.w, p.h) * 0.5} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontFamily="Inter, Arial, sans-serif" fontWeight={700} pointerEvents="none">
                        {p.num}
                      </text>
                    ) : null,
                  )}
                  {def.refPos && (
                    <text x={def.refPos.x} y={def.refPos.y} fontSize={mm(1)} fill={C.silk} fillOpacity={0.45} textAnchor="middle" dominantBaseline="central" fontFamily="Inter, Arial, sans-serif" pointerEvents="none">
                      REF**
                    </text>
                  )}
                  {preview}
                  {ghost && <SilkView g={ghost} color={C.silk} opacity={0.6} minWidth={1 / view.s} />}
                  {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={C.select} fillOpacity={0.08} stroke={C.select} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                </g>

                <g pointerEvents="none" stroke="#ffffff" strokeOpacity={0.7} fill="none">
                  <circle cx={ox} cy={oy} r={5} />
                  <path d={`M${ox - 9} ${oy}h18M${ox} ${oy - 9}v18`} />
                </g>
                {cursor && tool !== 'select' && (
                  <path d={`M${cursor.x * view.s + ox - 6} ${cursor.y * view.s + oy}h12M${cursor.x * view.s + ox} ${cursor.y * view.s + oy - 6}v12`} stroke={C.select} pointerEvents="none" />
                )}
                {rulers && size.w > 0 && <Rulers view={view} w={size.w} h={size.h} cursor={cursor} />}
              </svg>
            </div>

            <div className="flex h-7 items-center gap-4 border-t border-line bg-panel-2 px-3 text-[11.5px] text-muted">
              <span className="w-44 shrink-0 tabular-nums">{cursor ? `X ${M(cursor.x).toFixed(2)}  Y ${M(cursor.y).toFixed(2)} mm` : '—'}</span>
              <span className="w-24 shrink-0 tabular-nums">
                {L.zoom} {(view.s * mm(1)).toFixed(1)} px/mm
              </span>
              <span className="min-w-0 truncate">{hints[tool]}</span>
            </div>
          </div>

          <aside className="bb-scroll w-[330px] shrink-0 overflow-y-auto border-l border-line bg-panel">
            {tool === 'array' && arraySection}
            <Section title={L.footprint}>
              <Field label={L.id}>
                <TextInput id={idInput} value={def.id} onCommit={(id) => setMeta({ id: id.trim() })} mono />
              </Field>
              <Field label={L.name}>
                <TextInput value={def.name} onCommit={(name) => setMeta({ name })} />
              </Field>
              <Field label={L.description}>
                <TextArea value={def.description} rows={2} onCommit={(description) => setMeta({ description })} />
              </Field>
              <Field label={L.category}>
                <Select value={def.category} options={categoryOptions} onChange={(category) => setMeta({ category })} />
              </Field>
              <Field label={L.tags}>
                <TextInput value={(def.tags ?? []).join(', ')} placeholder={L.tagsHint} onCommit={(v) => setMeta({ tags: parseTags(v) })} />
              </Field>
            </Section>
            {(selPads.length > 0 || !selSilk.length) && padSection}
            {(selSilk.length > 0 || !selPads.length) && silkSection}
            <Section title={L.actions}>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  onClick={() =>
                    edit((d) => {
                      const courtyard = autoCourtyard(d);
                      return { ...d, courtyard, refPos: autoRefPos({ ...d, courtyard }) };
                    })
                  }
                >
                  {L.autoCourtyard}
                </Button>
                <Button
                  onClick={() => {
                    edit(clipSilk);
                    setSel(validSel.filter((k) => k[0] === 'p'));
                  }}
                >
                  {L.clipSilk}
                </Button>
                <Button onClick={() => edit((d) => normalizeOrigin(d, 'pad1'))}>{L.originPad1}</Button>
                <Button onClick={() => edit((d) => normalizeOrigin(d, 'center'))}>{L.originCenter}</Button>
              </div>
            </Section>
            <Section title={L.checks}>
              {!issues.length ? (
                <p className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
                  <CircleCheck size={14} /> {L.noIssues}
                </p>
              ) : (
                <ul className="grid gap-0.5">
                  {issues.map((is, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={cx('flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-hover', !is.pads?.length && !is.silk?.length && 'cursor-default')}
                        onClick={() => selectIssue(is)}
                      >
                        <TriangleAlert size={14} className={cx('mt-px shrink-0', is.severity === 'error' ? 'text-red-500' : 'text-amber-500')} />
                        <span>{issueText(is)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </aside>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-panel-2 px-4 py-3">
          {error && <span className="mr-auto text-[12px] text-red-600 dark:text-red-400">{error}</span>}
          <Button onClick={cancel}>{L.cancel}</Button>
          <Button variant="primary" onClick={save}>
            {L.save}
          </Button>
        </footer>
      </div>
    </div>
  );
}
