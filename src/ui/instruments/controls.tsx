import { useId, useRef, type ReactNode } from 'react';
import { cx } from '../primitives.tsx';

export type EditPhase = 'start' | 'move' | 'end' | 'step';

// ---- knob ---------------------------------------------------------------------------------------

type KnobScale =
  /** detented: one of the given values (e.g. a 1-2-5 sequence) */
  | { steps: number[] }
  /** continuous, optionally logarithmic */
  | { min: number; max: number; log?: boolean; fine?: number };

const SWEEP = 270;

function toPos(v: number, s: KnobScale): number {
  if ('steps' in s) {
    let best = 0;
    s.steps.forEach((x, i) => {
      if (Math.abs(Math.log(Math.abs(x) || 1e-30) - Math.log(Math.abs(v) || 1e-30)) < Math.abs(Math.log(Math.abs(s.steps[best]) || 1e-30) - Math.log(Math.abs(v) || 1e-30))) best = i;
    });
    return s.steps.length > 1 ? best / (s.steps.length - 1) : 0;
  }
  const p = s.log ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
  return Math.max(0, Math.min(1, p));
}

function fromPos(p: number, s: KnobScale): number {
  p = Math.max(0, Math.min(1, p));
  if ('steps' in s) return s.steps[Math.round(p * (s.steps.length - 1))];
  const v = s.log ? s.min * Math.pow(s.max / s.min, p) : s.min + p * (s.max - s.min);
  const fine = s.fine ?? 0;
  return fine ? Math.round(v / fine) * fine : v;
}

/**
 * Rotary knob: drag up/down, mouse wheel or arrow keys. Detented knobs move one
 * value per step, continuous knobs 1 % (0.1 % with Shift).
 */
export function Knob({
  label,
  value,
  scale,
  onChange,
  size = 56,
  color = '#e5e7eb',
  display,
}: {
  label: string;
  value: number;
  scale: KnobScale;
  onChange: (v: number, phase: EditPhase) => void;
  size?: number;
  /** colour of the cap ring (channel colour) */
  color?: string;
  display?: string;
}) {
  const drag = useRef<{ y: number; p: number; last: number } | null>(null);
  const gid = useId().replace(/:/g, '');
  const pos = toPos(value, scale);
  const angle = -SWEEP / 2 + pos * SWEEP;
  const steps = 'steps' in scale ? scale.steps.length : 0;
  const stepBy = (dir: number, fine: boolean) => {
    const next = steps ? fromPos((Math.round(pos * (steps - 1)) + dir) / (steps - 1), scale) : fromPos(pos + dir * (fine ? 0.001 : 0.01), scale);
    if (next !== value) onChange(next, 'step');
  };
  const r = size / 2;
  const ticks = steps && steps <= 24 ? steps : 11;
  return (
    <div className="flex select-none flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`${-r} ${-r} ${size} ${size}`}
        role="slider"
        aria-label={label}
        aria-valuetext={display}
        aria-valuenow={value}
        tabIndex={0}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, p: pos, last: value };
          onChange(value, 'start');
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const v = fromPos(d.p + (d.y - e.clientY) / (e.shiftKey ? 600 : 160), scale);
          if (v !== d.last) {
            d.last = v;
            onChange(v, 'move');
          }
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = null;
          onChange(value, 'end');
        }}
        onWheel={(e) => stepBy(e.deltaY < 0 ? 1 : -1, e.shiftKey)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') stepBy(1, e.shiftKey);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') stepBy(-1, e.shiftKey);
          else return;
          e.preventDefault();
        }}
      >
        <defs>
          <radialGradient id={`${gid}k`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#6b7280" />
            <stop offset="55%" stopColor="#27272a" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
        </defs>
        {Array.from({ length: ticks }, (_, i) => {
          const a = ((-SWEEP / 2 + (i / (ticks - 1)) * SWEEP - 90) * Math.PI) / 180;
          return <line key={i} x1={Math.cos(a) * (r - 1)} y1={Math.sin(a) * (r - 1)} x2={Math.cos(a) * (r - 5)} y2={Math.sin(a) * (r - 5)} stroke="#71717a" strokeWidth={1.2} />;
        })}
        <circle r={r - 7} fill={`url(#${gid}k)`} stroke={color} strokeOpacity={0.55} strokeWidth={2} />
        <circle r={r - 13} fill="none" stroke="#3f3f46" strokeWidth={1} />
        <g transform={`rotate(${angle})`}>
          <line x1={0} y1={-(r - 9)} x2={0} y2={-(r - 18)} stroke="#f4f4f5" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      </svg>
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
      {display && <span className="font-mono text-[10.5px] text-zinc-200">{display}</span>}
    </div>
  );
}

// ---- seven segment display ------------------------------------------------------------------

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
  O: 'abcdef',
  L: 'def',
  E: 'adefg',
  r: 'eg',
  H: 'bcefg',
  P: 'abefg',
};

// segment polygons in a 12 x 22 cell, slanted like a real LCD/LED
const POLY: Record<string, string> = {
  a: '2,1 10,1 8.5,2.8 3.5,2.8',
  b: '10.4,1.6 10.4,10.4 8.8,9.4 8.8,3.2',
  c: '10.4,11.6 10.4,20.4 8.8,18.8 8.8,12.6',
  d: '2,21 10,21 8.5,19.2 3.5,19.2',
  e: '1.6,11.6 1.6,20.4 3.2,18.8 3.2,12.6',
  f: '1.6,1.6 1.6,10.4 3.2,9.4 3.2,3.2',
  g: '2.2,11 3.6,10 8.4,10 9.8,11 8.4,12 3.6,12',
};

/** Seven segment digits; '.' attaches a decimal point to the previous digit. */
export function SevenSegment({ text, height = 40, on, off, slant = 8 }: { text: string; height?: number; on: string; off: string; slant?: number }) {
  const cells: { ch: string; dot: boolean }[] = [];
  for (const ch of text) {
    if (ch === '.' && cells.length) cells[cells.length - 1].dot = true;
    else cells.push({ ch, dot: false });
  }
  const w = 14;
  return (
    <svg height={height} viewBox={`0 0 ${cells.length * w + 6} 22`} aria-label={text} role="img">
      <g transform={`translate(${Math.tan((slant * Math.PI) / 180) * 22} 0) skewX(${-slant})`}>
        {cells.map((c, i) => {
          const lit = SEGMENTS[c.ch] ?? '';
          return (
            <g key={i} transform={`translate(${i * w + 2} 0)`}>
              {Object.entries(POLY).map(([seg, pts]) => (
                <polygon key={seg} points={pts} fill={lit.includes(seg) ? on : off} />
              ))}
              <circle cx={12} cy={20.5} r={1.1} fill={c.dot ? on : off} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ---- buttons ----------------------------------------------------------------------------------

export function PanelButton({
  children,
  active,
  led,
  onClick,
  title,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  /** LED colour when active */
  led?: string;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'relative flex h-8 min-w-10 items-center justify-center gap-1.5 rounded-md border px-2 text-[10.5px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_3px_rgba(0,0,0,0.45)] transition active:translate-y-px',
        active ? 'border-zinc-500 bg-zinc-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
        className,
      )}
    >
      {led !== undefined && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? led : '#3f3f46', boxShadow: active ? `0 0 6px ${led}` : undefined }} />
      )}
      {children}
    </button>
  );
}

/** 1-2-5 sequence between two decades */
export function seq125(fromExp: number, toExp: number): number[] {
  const out: number[] = [];
  for (let e = fromExp; e <= toExp; e++) for (const m of [1, 2, 5]) out.push(parseFloat((m * 10 ** e).toPrecision(3)));
  return out;
}
