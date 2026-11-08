import type { SymbolItem } from '../../model/types.ts';
import { fgenSettings, type Waveform } from '../../spice/instruments.ts';
import { formatEng } from '../../model/ops.ts';
import { setInstrumentProps } from '../../editor/instrumentActions.ts';
import { Knob, PanelButton, SevenSegment, type EditPhase } from './controls.tsx';
import { useT } from '../../i18n/i18n.ts';

const WAVES: { shape: Waveform; path: string }[] = [
  { shape: 'SIN', path: 'M1 8 C4 -2 7 -2 10 8 S16 18 19 8' },
  { shape: 'SQUARE', path: 'M1 13 H5 V3 H10 V13 H15 V3 H19' },
  { shape: 'TRI', path: 'M1 13 L5.5 3 L10 13 L14.5 3 L19 13' },
  { shape: 'SAW', path: 'M1 13 L9 3 V13 L17 3 V13' },
];

/** frequency for the display: value plus unit, e.g. "1.000" "kHz" */
function freqDisplay(f: number): { text: string; unit: string } {
  const [scale, unit] = f >= 1e6 ? [1e6, 'MHz'] : f >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz'];
  const v = f / scale;
  const intDigits = Math.max(1, Math.floor(Math.log10(v)) + 1);
  return { text: v.toFixed(Math.max(0, 4 - intDigits)).padStart(5, ' '), unit };
}

export function FunctionGenerator({ item }: { item: SymbolItem }) {
  const t = useT();
  const fg = fgenSettings(item);
  const set = (patch: Record<string, string>, phase: EditPhase = 'step') => {
    const next = { ...fg, ...patch };
    // the value shown on the schematic follows the frequency
    const f = patch.frequency !== undefined ? parseFloat(patch.frequency) : fg.frequency;
    setInstrumentProps(item.id, { mode: 'AC', frequencyUnit: 'HZ', ...patch }, phase, `${formatEng(f, 'Hz')}`);
    return next;
  };
  const fd = freqDisplay(fg.frequency);
  const wave = WAVES.find((w) => w.shape === fg.shape)!;
  return (
    <section
      className="flex shrink-0 flex-col gap-3 rounded-2xl border border-zinc-300 bg-gradient-to-b from-zinc-100 to-zinc-300 p-3 text-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_1px_0_white]"
      aria-label={`${t('inst.fgen')} ${item.name}`}
    >
      <header className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <span>
          {item.name} · {t('inst.fgen')}
        </span>
        <span>DDS 1 MHz</span>
      </header>
      <div className="flex gap-3">
        {/* display */}
        <div className="flex w-[250px] flex-col justify-between rounded-lg bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-2 text-sky-300">
            <svg width={34} height={20} viewBox="0 -2 20 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 3px #38bdf8)' }}>
              <path d={wave.path} />
            </svg>
            <span className="font-mono text-[11px] uppercase tracking-wider text-sky-400/80">{t(`inst.wave.${fg.shape}`)}</span>
          </div>
          <div className="flex items-end justify-end gap-2" style={{ filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.55))' }}>
            <SevenSegment text={fd.text} height={44} on="#7dd3fc" off="#7dd3fc12" />
            <span className="mb-1 w-9 font-mono text-[14px] font-bold text-sky-300">{fd.unit}</span>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-sky-300/90">
            <span>Vpp {formatEng(2 * fg.amplitude, 'V')}</span>
            <span>Off {formatEng(fg.offset, 'V')}</span>
            {fg.shape === 'SQUARE' && <span>Duty {Math.round(fg.duty)}%</span>}
          </div>
        </div>
        {/* waveform keys */}
        <div className="grid grid-cols-2 content-center gap-1.5">
          {WAVES.map((w) => (
            <PanelButton key={w.shape} led="#38bdf8" active={fg.shape === w.shape} onClick={() => set({ shape: w.shape })} title={t(`inst.wave.${w.shape}`)}>
              <svg width={22} height={14} viewBox="0 -2 20 18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
                <path d={w.path} />
              </svg>
            </PanelButton>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 rounded-xl bg-zinc-800 px-3 py-2.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]">
        <Knob label={t('inst.frequency')} value={fg.frequency} scale={{ min: 1, max: 1e6, log: true }} display={formatEng(fg.frequency, 'Hz')} color="#38bdf8" onChange={(v, p) => set({ frequency: String(parseFloat(v.toPrecision(3))) }, p)} size={62} />
        <Knob label={t('inst.amplitude')} value={fg.amplitude} scale={{ min: 0, max: 10, fine: 0.01 }} display={`${formatEng(2 * fg.amplitude, 'V')}pp`} onChange={(v, p) => set({ acAmplitude: String(v) }, p)} size={52} />
        <Knob label="Offset" value={fg.offset} scale={{ min: -10, max: 10, fine: 0.05 }} display={formatEng(fg.offset, 'V')} onChange={(v, p) => set({ dcOffset: String(v) }, p)} size={52} />
        <Knob label="Duty" value={fg.duty} scale={{ min: 5, max: 95, fine: 1 }} display={`${Math.round(fg.duty)} %`} onChange={(v, p) => set({ duty: String(v) }, p)} size={44} />
        {/* output BNC */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <svg width={40} height={40} viewBox="-20 -20 40 40" aria-hidden="true">
            <circle r={17} fill="#a1a1aa" stroke="#52525b" strokeWidth={2} />
            <circle r={11} fill="#d4d4d8" stroke="#71717a" />
            <circle r={4} fill="#facc15" stroke="#a16207" />
            <rect x={-19} y={-3} width={5} height={6} rx={1} fill="#71717a" />
            <rect x={14} y={-3} width={5} height={6} rx={1} fill="#71717a" />
          </svg>
          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">Output</span>
        </div>
      </div>
    </section>
  );
}
