import { useId, useMemo } from 'react';
import type { SymbolItem } from '../../model/types.ts';
import { dmmMode, dmmReading, type DmmMode } from '../../spice/instruments.ts';
import type { BenchResult } from '../../store/sim.ts';
import { setInstrumentProps } from '../../editor/instrumentActions.ts';
import { SevenSegment } from './controls.tsx';
import { useT } from '../../i18n/i18n.ts';

const MODES: { mode: DmmMode; label: string; angle: number }[] = [
  { mode: 'VDC', label: 'V⎓', angle: -60 },
  { mode: 'VAC', label: 'V~', angle: -20 },
  { mode: 'ADC', label: 'A⎓', angle: 20 },
  { mode: 'AAC', label: 'A~', angle: 60 },
];

/** 4½ digit auto ranging: value, prefix, overload */
export function dmmDisplay(value: number | undefined, unit: 'V' | 'A'): { text: string; unit: string } {
  if (value === undefined || !Number.isFinite(value)) return { text: ' ----', unit };
  const a = Math.abs(value);
  const ranges: [number, string][] = unit === 'V' ? [[1, 'm'], [1000, '']] : [[1e-3, 'µ'], [1, 'm'], [10, '']];
  const scale: Record<string, number> = { µ: 1e6, m: 1e3, '': 1 };
  const max = unit === 'V' ? 1000 : 10;
  if (a >= max) return { text: '  OL', unit };
  const [, prefix] = ranges.find(([lim]) => a < lim) ?? ranges[ranges.length - 1];
  const scaled = value * scale[prefix];
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled) || 1)) + 1);
  const decimals = Math.max(0, 4 - intDigits);
  const s = Math.abs(scaled).toFixed(decimals);
  return { text: `${value < 0 ? '-' : ' '}${s}`, unit: `${prefix}${unit}` };
}

export function Multimeter({ item, result }: { item: SymbolItem; result: BenchResult | null }) {
  const t = useT();
  const gid = useId().replace(/:/g, '');
  const mode = dmmMode(item);
  const reading = useMemo(() => (result ? dmmReading(result.data, result.probes, item, result.analysis) : undefined), [result, item]);
  const disp = dmmDisplay(reading?.value, mode.startsWith('A') ? 'A' : 'V');
  const knobAngle = MODES.find((m) => m.mode === mode)!.angle;
  const ac = mode.endsWith('AC');
  const amps = mode.startsWith('A');
  return (
    <section
      className="w-[400px] shrink-0 rounded-[26px] border-4 border-amber-500 bg-gradient-to-b from-amber-400 to-amber-600 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      aria-label={`${t('inst.dmm')} ${item.name}`}
    >
      <div className="flex gap-3 rounded-[18px] bg-zinc-800 p-3 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
        <div className="flex flex-1 flex-col gap-2.5">
          <header className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            <span>
              {item.name} · {t('inst.dmm')}
            </span>
            <span className="text-amber-400">True RMS</span>
          </header>
          {/* LCD */}
          <div className="rounded-lg bg-gradient-to-b from-[#c9d3b4] to-[#aebb96] px-3 pb-1.5 pt-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]">
            <div className="flex h-4 items-center gap-2 font-mono text-[10px] font-bold text-[#1f2a17]">
              <span className={ac ? '' : 'opacity-15'}>AC</span>
              <span className={!ac ? '' : 'opacity-15'}>DC</span>
              <span className="ml-auto">AUTO</span>
            </div>
            <div className="flex items-end justify-between">
              <SevenSegment text={disp.text} height={48} on="#1a2412" off="#1a241214" />
              <span className="mb-1 font-mono text-[17px] font-bold text-[#1a2412]">{disp.unit}</span>
            </div>
          </div>
          {/* jacks: the schematic symbol has one input pin that is used for V and A */}
          <div className="flex justify-around pt-0.5">
            {(
              [
                ['A', '#dc2626', amps],
                ['COM', '#18181b', true],
                ['V', '#dc2626', !amps],
              ] as const
            ).map(([l, c, used]) => (
              <div key={l} className="flex flex-col items-center gap-1">
                <span className="h-6 w-6 rounded-full border-4 bg-zinc-950" style={{ borderColor: c, boxShadow: used ? `0 0 0 2px ${c === '#18181b' ? '#71717a' : '#fca5a5'}` : undefined }} />
                <span className="text-[9px] font-bold text-zinc-400">{l}</span>
              </div>
            ))}
          </div>
        </div>
        {/* rotary switch */}
        <svg width={132} height={150} viewBox="-66 -72 132 150" role="radiogroup" aria-label={t('inst.mode')} className="shrink-0">
          <defs>
            <radialGradient id={`${gid}d`} cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#52525b" />
              <stop offset="100%" stopColor="#18181b" />
            </radialGradient>
          </defs>
          {MODES.map((m) => {
            const a = ((m.angle - 90) * Math.PI) / 180;
            const active = m.mode === mode;
            return (
              <g key={m.mode} role="radio" aria-checked={active} aria-label={m.label} className="cursor-pointer" onClick={() => setInstrumentProps(item.id, { dmmMode: m.mode })}>
                <line x1={Math.cos(a) * 36} y1={Math.sin(a) * 36} x2={Math.cos(a) * 42} y2={Math.sin(a) * 42} stroke={active ? '#fbbf24' : '#71717a'} strokeWidth={2} />
                <text x={Math.cos(a) * 54} y={Math.sin(a) * 54 + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={active ? '#fbbf24' : '#d4d4d8'}>
                  {m.label}
                </text>
              </g>
            );
          })}
          <g
            className="cursor-pointer"
            onClick={() => {
              const i = MODES.findIndex((m) => m.mode === mode);
              setInstrumentProps(item.id, { dmmMode: MODES[(i + 1) % MODES.length].mode });
            }}
          >
            <circle r={32} fill={`url(#${gid}d)`} stroke="#09090b" strokeWidth={2} />
            <g transform={`rotate(${knobAngle})`} style={{ transition: 'transform 0.25s cubic-bezier(.3,1.6,.6,1)' }}>
              <rect x={-6} y={-32} width={12} height={64} rx={5} fill="#3f3f46" stroke="#18181b" />
              <path d="M0 -29 L-4 -21 L4 -21 Z" fill="#fbbf24" />
            </g>
          </g>
          <text y={70} textAnchor="middle" fontSize={9} fontWeight={700} fill="#a1a1aa" letterSpacing={1.5}>
            {t('inst.mode').toUpperCase()}
          </text>
        </svg>
      </div>
    </section>
  );
}
