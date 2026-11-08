import { useId, useMemo, useRef } from 'react';
import type { SymbolItem } from '../../model/types.ts';
import { scopeSettings, scopeView, stats, nodeVoltage, type ScopeView } from '../../spice/instruments.ts';
import type { BenchResult } from '../../store/sim.ts';
import { formatEng } from '../../model/ops.ts';
import { setInstrumentProps } from '../../editor/instrumentActions.ts';
import { Knob, PanelButton, seq125, type EditPhase } from './controls.tsx';
import { useT } from '../../i18n/i18n.ts';

export const CH_COLORS = ['#facc15', '#22d3ee'];
const W = 500;
const H = 400;
const DIV = 50;
const TIME_STEPS = seq125(-7, 0);
const VOLT_STEPS = seq125(-3, 1);

const fmt = (v: number | undefined, unit: string) => (v === undefined || !Number.isFinite(v) ? '––' : formatEng(v, unit));
/** values below the solver noise relative to the signal swing are shown as 0 */
const fmtRel = (v: number, span: number, unit: string) => fmt(Math.abs(v) < Math.max(span, 1e-6) * 1e-4 ? 0 : v, unit);

/** keeps traces light: at most ~2 points per screen pixel */
function decimate(t: number[], v: number[], window: number): string {
  const step = Math.max(1, Math.floor(t.length / (W * 2)));
  const pts: string[] = [];
  for (let i = 0; i < t.length; i += step) pts.push(`${((t[i] / window) * W).toFixed(1)},${v[i].toFixed(1)}`);
  return pts.join(' ');
}

export function Oscilloscope({ item, result }: { item: SymbolItem; result: BenchResult | null }) {
  const t = useT();
  const st = scopeSettings(item);
  const gid = useId().replace(/:/g, '');
  const frozen = useRef<ScopeView | null>(null);
  const window = st.timeDiv * 10;

  const live = useMemo(() => (result ? scopeView(result.data, result.probes, item, result.analysis) : null), [result, item]);
  // RUN/STOP freezes the screen on the last acquisition
  if (st.run && live) frozen.current = live;
  const view = st.run ? live : frozen.current;
  const set = (patch: Record<string, string>, phase: EditPhase = 'step') => setInstrumentProps(item.id, patch, phase);
  const connected = (n: number) => result?.probes.nodes[item.id]?.[n] !== undefined;

  const yOf = (v: number, ch: number) => H / 2 - (v / st.ch[ch].voltsDiv + st.ch[ch].pos) * DIV;
  const trigCh = st.trigSource - 1;

  const autoset = () => {
    if (!result) return;
    const { data, analysis, probes } = result;
    const nodes = probes.nodes[item.id] ?? {};
    const ref = nodeVoltage(data, nodes[3] ?? '0');
    const time = data.time;
    let i0 = 0;
    while (i0 < time.length - 1 && time[i0] < analysis.tstop - analysis.window) i0++;
    const patch: Record<string, string> = {};
    let freq: number | undefined;
    [1, 2].forEach((n, i) => {
      const v = nodeVoltage(data, nodes[n]);
      if (!v) return;
      const sig = ref ? v.map((x, k) => x - ref[k]) : v;
      const s = stats(time, sig, i0, time.length - 1);
      const span = Math.max(s.max - s.min, 1e-3);
      const vdiv = VOLT_STEPS.find((x) => x * 3 >= span) ?? VOLT_STEPS[VOLT_STEPS.length - 1];
      patch[`ch${n}Div`] = String(vdiv);
      patch[`ch${n}Pos`] = String(Math.max(-4, Math.min(4, (i === 0 ? 1.5 : -1.5) - (s.max + s.min) / 2 / vdiv)).toFixed(2));
      patch[`ch${n}On`] = 'true';
      if (n === st.trigSource || freq === undefined) {
        freq = s.freq ?? freq;
        if (n === st.trigSource) patch.trigLevel = String(parseFloat(((s.max + s.min) / 2).toPrecision(3)));
      }
    });
    if (freq) patch.timeDiv = String(TIME_STEPS.find((x) => x * 10 >= 2.5 / freq!) ?? TIME_STEPS[TIME_STEPS.length - 1]);
    set(patch);
  };

  return (
    <section className="flex shrink-0 gap-3 rounded-2xl border border-zinc-700 bg-gradient-to-b from-zinc-800 to-zinc-900 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]" aria-label={`${t('inst.scope')} ${item.name}`}>
      <div className="flex flex-col gap-2">
        <header className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          <span>
            {item.name} · {t('inst.scope')}
          </span>
          <span className="text-zinc-500">
            2 CH · <span className="normal-case">{fmt(window, 's')}</span>
          </span>
        </header>
        <div className="rounded-xl bg-black p-2 shadow-[inset_0_0_0_2px_#27272a,inset_0_4px_18px_rgba(0,0,0,0.9)]">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block rounded-md" role="img" aria-label="Screen">
            <defs>
              <radialGradient id={`${gid}bg`} cx="50%" cy="45%" r="75%">
                <stop offset="0%" stopColor="#0c1f16" />
                <stop offset="100%" stopColor="#020705" />
              </radialGradient>
              <filter id={`${gid}glow`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width={W} height={H} fill={`url(#${gid}bg)`} />
            {/* graticule */}
            <g stroke="#7dffb0" strokeOpacity={0.14} strokeWidth={1}>
              {Array.from({ length: 11 }, (_, i) => (
                <line key={'v' + i} x1={i * DIV + 0.5} y1={0} x2={i * DIV + 0.5} y2={H} />
              ))}
              {Array.from({ length: 9 }, (_, i) => (
                <line key={'h' + i} x1={0} y1={i * DIV + 0.5} x2={W} y2={i * DIV + 0.5} />
              ))}
            </g>
            <g stroke="#7dffb0" strokeOpacity={0.3} strokeWidth={1}>
              {Array.from({ length: 51 }, (_, i) => (
                <line key={'tx' + i} x1={i * 10 + 0.5} y1={H / 2 - 3} x2={i * 10 + 0.5} y2={H / 2 + 3} />
              ))}
              {Array.from({ length: 41 }, (_, i) => (
                <line key={'ty' + i} x1={W / 2 - 3} y1={i * 10 + 0.5} x2={W / 2 + 3} y2={i * 10 + 0.5} />
              ))}
            </g>
            {/* traces: dim persistence plus a bright, sweeping beam */}
            <g filter={`url(#${gid}glow)`} fill="none" strokeLinejoin="round" strokeLinecap="round">
              {view?.channels.map((c, i) => {
                if (!c) return null;
                const pts = decimate(c.t, c.v.map((v) => yOf(v, i)), window);
                return (
                  <g key={`${i}-${result?.seq}`}>
                    <polyline points={pts} stroke={CH_COLORS[i]} strokeOpacity={0.35} strokeWidth={1.6} />
                    <polyline points={pts} stroke={CH_COLORS[i]} strokeWidth={1.8} pathLength={1} className={st.run ? 'bb-sweep' : undefined} strokeDasharray={st.run ? '1 1' : undefined} />
                  </g>
                );
              })}
            </g>
            {/* channel ground markers and trigger level */}
            {[0, 1].map((i) =>
              st.ch[i].on ? (
                <g key={i} transform={`translate(0 ${Math.max(6, Math.min(H - 6, yOf(0, i)))})`}>
                  <path d="M0 -6 L9 0 L0 6 Z" fill={CH_COLORS[i]} />
                  <text x={1.5} y={3} fontSize={8} fontWeight={700} fill="#000">
                    {i + 1}
                  </text>
                </g>
              ) : null,
            )}
            <path d={`M${W} ${Math.max(6, Math.min(H - 6, yOf(st.trigLevel, trigCh))) - 6} l-9 6 l9 6 Z`} fill="#fb923c" />
            <path d={`M${DIV - 6} 0 l6 8 l6 -8 Z`} fill="#fb923c" />
            {/* status lines */}
            <g fontFamily="'JetBrains Mono', ui-monospace, monospace" fontSize={11}>
              {[0, 1].map((i) =>
                st.ch[i].on ? (
                  <text key={i} x={8 + i * 150} y={16} fill={CH_COLORS[i]}>
                    CH{i + 1} {formatEng(st.ch[i].voltsDiv, 'V')} {st.ch[i].coupling}
                    {!connected(i + 1) ? ' –' : ''}
                  </text>
                ) : null,
              )}
              <text x={W - 8} y={16} fill="#d4d4d8" textAnchor="end">
                M {formatEng(st.timeDiv, 's')}
              </text>
              <text x={W - 8} y={32} fill={view?.triggered ? '#4ade80' : '#fbbf24'} textAnchor="end">
                {!st.run ? 'STOP' : view?.triggered ? "Trig'd" : 'Auto'} {st.trigEdge === 'rise' ? '↗' : '↘'} CH{st.trigSource} {formatEng(st.trigLevel, 'V')}
              </text>
              {view?.channels.map((c, i) =>
                c ? (
                  <text key={'m' + i} x={8} y={H - 26 + i * 16} fill={CH_COLORS[i]}>
                    {`CH${i + 1}  Vpp ${fmt(c.stats.max - c.stats.min, 'V').padEnd(8)} Veff ${fmt(c.stats.acRms, 'V').padEnd(8)} Ø ${fmtRel(c.stats.mean, c.stats.max - c.stats.min, 'V').padEnd(8)} f ${fmt(c.stats.freq, 'Hz')}`}
                  </text>
                ) : null,
              )}
            </g>
            {!result && (
              <text x={W / 2} y={H / 2 - 12} fill="#4ade80" fillOpacity={0.7} fontSize={13} textAnchor="middle" fontFamily="ui-monospace, monospace">
                {t('inst.noSignal')}
              </text>
            )}
          </svg>
        </div>
      </div>

      <div className="grid w-[230px] grid-cols-2 content-start gap-x-2 gap-y-3 rounded-xl bg-zinc-900/60 p-2.5">
        <div className="col-span-2 flex items-end justify-between">
          <Knob label="Time/Div" value={st.timeDiv} scale={{ steps: TIME_STEPS }} display={`${formatEng(st.timeDiv, 's')}`} onChange={(v, p) => set({ timeDiv: String(v) }, p)} size={64} />
          <div className="flex flex-col gap-1.5">
            <PanelButton led="#22c55e" active={st.run} onClick={() => set({ run: String(!st.run) })}>
              {st.run ? 'Run' : 'Stop'}
            </PanelButton>
            <PanelButton onClick={autoset} title={t('inst.autoset')}>
              Auto
            </PanelButton>
          </div>
        </div>
        {[1, 2].map((n) => {
          const c = st.ch[n - 1];
          return (
            <div key={n} className="flex flex-col items-center gap-2 rounded-lg border border-zinc-800 p-1.5" style={{ boxShadow: `inset 0 2px 0 ${CH_COLORS[n - 1]}55` }}>
              <Knob label={`CH${n} V/Div`} value={c.voltsDiv} scale={{ steps: VOLT_STEPS }} display={formatEng(c.voltsDiv, 'V')} color={CH_COLORS[n - 1]} onChange={(v, p) => set({ [`ch${n}Div`]: String(v) }, p)} size={50} />
              <Knob label="Pos" value={c.pos} scale={{ min: -4, max: 4, fine: 0.05 }} display={`${c.pos.toFixed(2)} div`} color={CH_COLORS[n - 1]} onChange={(v, p) => set({ [`ch${n}Pos`]: v.toFixed(2) }, p)} size={38} />
              <div className="flex gap-1">
                <PanelButton led={CH_COLORS[n - 1]} active={c.on} onClick={() => set({ [`ch${n}On`]: String(!c.on) })} className="min-w-0 px-1.5">
                  {n}
                </PanelButton>
                <PanelButton onClick={() => set({ [`ch${n}Coupling`]: c.coupling === 'DC' ? 'AC' : 'DC' })} className="min-w-0 px-1.5">
                  {c.coupling}
                </PanelButton>
              </div>
            </div>
          );
        })}
        <div className="col-span-2 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 p-1.5">
          <Knob
            label="Trig Level"
            value={st.trigLevel}
            scale={{ min: -4 * st.ch[trigCh].voltsDiv, max: 4 * st.ch[trigCh].voltsDiv, fine: st.ch[trigCh].voltsDiv / 50 }}
            display={formatEng(st.trigLevel, 'V')}
            color="#fb923c"
            onChange={(v, p) => set({ trigLevel: String(parseFloat(v.toPrecision(4))) }, p)}
            size={46}
          />
          <div className="flex flex-col gap-1.5">
            <PanelButton onClick={() => set({ trigSource: st.trigSource === 1 ? '2' : '1' })}>
              <span style={{ color: CH_COLORS[st.trigSource - 1] }}>Src CH{st.trigSource}</span>
            </PanelButton>
            <PanelButton onClick={() => set({ trigEdge: st.trigEdge === 'rise' ? 'fall' : 'rise' })}>{st.trigEdge === 'rise' ? '↗ Rise' : '↘ Fall'}</PanelButton>
          </div>
        </div>
      </div>
    </section>
  );
}
