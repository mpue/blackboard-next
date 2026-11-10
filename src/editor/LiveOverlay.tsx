// Live values drawn onto a schematic: wires coloured by their voltage (green =
// positive, red = negative, grey = 0 V), moving dots showing the current flow,
// voltage and current labels, glowing LEDs and draggable potentiometer wipers.

import { memo, useEffect, useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Doc, LineItem, SymbolItem } from '../model/types.ts';
import { computeConnectivity } from '../spice/connectivity.ts';
import { isPot, potPosition, switchClosed, switchOf, switchThrow } from '../spice/netlist.ts';
import { useLive, type LiveSeries } from '../store/live.ts';
import { liveValues, type LiveValues } from '../spice/live.ts';
import type { Connectivity } from '../spice/connectivity.ts';
import { beginGesture, endGesture, gestureUpdate } from '../store/store.ts';
import { itemBounds, symbolToWorld, type Pt } from '../geometry/geom.ts';
import { formatEng, partLookup } from '../model/ops.ts';

const FLOW_SPACING = 16;
const LABEL_FONT = '"Inter", Arial, sans-serif';

/** Falstad style voltage colours. */
export function voltageColor(v: number, maxAbs: number): string {
  const t = maxAbs > 0 ? Math.min(1, Math.abs(v) / maxAbs) : 0;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r, g, b] = v >= 0 ? [mix(128, 22), mix(128, 197), mix(128, 94)] : [mix(128, 239), mix(128, 68), mix(128, 68)];
  return `rgb(${r},${g},${b})`;
}

const LED_COLORS: [RegExp, string][] = [
  [/gr(ü|u)n|green/i, '#4ade80'],
  [/gelb|yellow/i, '#fde047'],
  [/blau|blue/i, '#60a5fa'],
  [/orange/i, '#fb923c'],
  [/wei(ß|ss)|white/i, '#f8fafc'],
  [/infrarot|ir\b/i, '#7f1d1d'],
];

function ledColor(s: SymbolItem): string {
  const txt = `${s.symbolName} ${s.value}`;
  return LED_COLORS.find(([re]) => re.test(txt))?.[1] ?? '#ef4444';
}

const isLed = (s: SymbolItem) => s.spiceType === 'DIODE' && /led/i.test(`${s.symbolName} ${s.filename ?? ''}`);

function setWiper(id: string, pos: number) {
  gestureUpdate((d) => {
    const it = d.items.find((i) => i.id === id);
    if (it?.kind === 'symbol') it.properties = { ...(it.properties ?? {}), wiper: pos.toFixed(3) };
  });
}

function PotSlider({ s, z }: { s: SymbolItem; z: number }) {
  const p1 = symbolToWorld(s, s.pins.find((p) => p.num === 1)!);
  const p3 = symbolToWorld(s, s.pins.find((p) => p.num === 3)!);
  const w = symbolToWorld(s, s.pins.find((p) => p.num === 2)!);
  // the track runs parallel to the resistor body, on the side away from the wiper
  const mid = { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };
  const len = Math.hypot(p3.x - p1.x, p3.y - p1.y) || 1;
  let nx = -(p3.y - p1.y) / len;
  let ny = (p3.x - p1.x) / len;
  if ((w.x - mid.x) * nx + (w.y - mid.y) * ny > 0) [nx, ny] = [-nx, -ny];
  const off = 16;
  const a = { x: p1.x + nx * off, y: p1.y + ny * off };
  const b = { x: p3.x + nx * off, y: p3.y + ny * off };
  const pos = potPosition(s);
  const knob = { x: a.x + (b.x - a.x) * pos, y: a.y + (b.y - a.y) * pos };
  const project = (e: RPointerEvent<SVGElement>) => {
    const g = (e.currentTarget as SVGElement).ownerSVGElement?.querySelector('.bb-live') as SVGGElement | null;
    const m = g?.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const t = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len);
    setWiper(s.id, Math.min(1, Math.max(0, t)));
  };
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--bb-accent)" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={knob.x} y2={knob.y} stroke="var(--bb-accent)" strokeWidth={4} strokeLinecap="round" />
      <circle
        cx={knob.x}
        cy={knob.y}
        r={Math.max(6, 7 / z)}
        fill="#fff"
        stroke="var(--bb-accent)"
        strokeWidth={2}
        style={{ cursor: 'grab' }}
        pointerEvents="all"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
          beginGesture();
        }}
        onPointerMove={(e) => {
          if ((e.currentTarget as SVGElement).hasPointerCapture(e.pointerId)) project(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          endGesture();
        }}
      />
      <text x={knob.x} y={knob.y + 18} fontSize={8} textAnchor="middle" fill="var(--bb-accent)" fontFamily={LABEL_FONT}>
        {Math.round(pos * 100)} %
      </text>
    </g>
  );
}

function Label({ at, text, color }: { at: Pt; text: string; color: string }) {
  const w = text.length * 5.2 + 8;
  return (
    <g>
      <rect x={at.x - w / 2} y={at.y - 7} width={w} height={13} rx={6.5} fill="#0f172a" fillOpacity={0.82} />
      <text x={at.x} y={at.y + 3} fontSize={9} textAnchor="middle" fill={color} fontFamily={LABEL_FONT} fontWeight={600}>
        {text}
      </text>
    </g>
  );
}

/** Seconds the simulated time window takes to play back. */
const PLAYBACK_SECONDS = 6;
const PLAYBACK_STEPS = 360;

/** Slow motion: the transient result played back in a loop. */
function usePlayback(series: LiveSeries | null, conn: Connectivity): { values: LiveValues | null; t: number; phase: number; maxAbs: number; maxI: number } {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!series) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setStep(Math.floor((((now - start) / 1000) % PLAYBACK_SECONDS) / PLAYBACK_SECONDS * PLAYBACK_STEPS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [series]);
  // scales over the whole run, so colours and speeds do not jump between frames
  const scale = useMemo(() => {
    if (!series) return { maxAbs: 0, maxI: 0 };
    let maxAbs = 0;
    for (const [name, v] of series.vectors) if (name.startsWith('v(')) for (const x of v) maxAbs = Math.max(maxAbs, Math.abs(x));
    let maxI = 0;
    for (const [name, v] of series.vectors) if (name.startsWith('i(')) for (const x of v) maxI = Math.max(maxI, Math.abs(x));
    return { maxAbs, maxI };
  }, [series]);
  const phase = step / PLAYBACK_STEPS;
  const t = series ? series.time[0] + phase * (series.time[series.time.length - 1] - series.time[0]) : 0;
  const values = useMemo(() => {
    if (!series) return null;
    let i = 0;
    while (i < series.time.length - 1 && series.time[i + 1] <= t) i++;
    const vectors = new Map([...series.vectors].map(([k, v]) => [k, v[i]]));
    return liveValues(series.doc, series.nl, vectors, conn);
  }, [series, t, conn]);
  return { values, t, phase, ...scale };
}

export const LiveOverlay = memo(function LiveOverlay({ doc, docId, z, showLabels }: { doc: Doc; docId: string; z: number; showLabels: boolean }) {
  const dc = useLive((s) => (s.on && s.docId === docId ? s.values : null));
  const series = useLive((s) => (s.on && s.docId === docId ? s.series : null));
  const conn = useMemo(() => computeConnectivity(doc), [doc]);
  const seriesConn = useMemo(() => (series ? computeConnectivity(series.doc) : conn), [series, conn]);
  const lookup = useMemo(() => partLookup(doc), [doc]);
  const play = usePlayback(series, seriesConn);
  const values = series ? play.values : dc;
  if (!values) return null;
  const maxAbs = series ? play.maxAbs : Math.max(Math.abs(values.minV), Math.abs(values.maxV));
  if (series) values.maxI = Math.max(values.maxI, play.maxI);
  const wires = doc.items.filter((i): i is LineItem => i.kind === 'line');
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');

  // one voltage label per net: on the middle of its longest wire
  const netLabel = new Map<number, LineItem>();
  for (const w of wires) {
    const n = conn.netOfWire.get(w.id);
    if (n === undefined) continue;
    const cur = netLabel.get(n);
    if (!cur || Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1)) netLabel.set(n, w);
  }

  return (
    <g className="bb-live">
      <g pointerEvents="none">
        {wires.map((w) => {
          const n = conn.netOfWire.get(w.id);
          const v = n === undefined ? undefined : values.netVoltage.get(n);
          if (v === undefined) return null;
          return <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={voltageColor(v, maxAbs)} strokeWidth={w.thickness + 1.5} strokeLinecap="round" />;
        })}
        {values.segments.map((s, i) => {
          // leakage through open switches (1 GΩ) and nanoamps are no visible current
          if (values.maxI <= 0 || s.i < values.maxI * 1e-3 || s.i < 1e-7) return null;
          const speed = 25 + 160 * Math.sqrt(s.i / values.maxI);
          return (
            <line
              key={i}
              x1={s.a.x}
              y1={s.a.y}
              x2={s.b.x}
              y2={s.b.y}
              stroke="#facc15"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray={`0 ${FLOW_SPACING}`}
              className="bb-flow"
              style={{ animationDuration: `${FLOW_SPACING / speed}s` }}
            />
          );
        })}
        {symbols.filter(isLed).map((s) => {
          const i = values.deviceCurrent.get(s.id) ?? 0;
          if (i < 2e-4) return null;
          const b = Math.min(1, i / 0.015);
          const r = itemBounds(s, lookup);
          const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
          const color = ledColor(s);
          return (
            <g key={s.id}>
              <defs>
                <radialGradient id={`glow-${s.id}`}>
                  <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </radialGradient>
              </defs>
              <circle cx={c.x} cy={c.y} r={16 + 22 * b} fill={`url(#glow-${s.id})`} opacity={0.35 + 0.65 * b} />
            </g>
          );
        })}
        {showLabels &&
          [...netLabel].map(([n, w]) => {
            const v = values.netVoltage.get(n);
            if (v === undefined || Math.abs(v) < 1e-9) return null;
            return <Label key={`n${n}`} at={{ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }} text={formatEng(v, 'V')} color={voltageColor(v, maxAbs) === 'rgb(128,128,128)' ? '#e5e7eb' : '#86efac'} />;
          })}
        {showLabels &&
          symbols.map((s) => {
            const i = values.deviceCurrent.get(s.id);
            if (i === undefined || Math.abs(i) < 1e-12) return null;
            const r = itemBounds(s, lookup);
            return <Label key={`i${s.id}`} at={{ x: r.x + r.w / 2, y: r.y + r.h + 9 }} text={formatEng(Math.abs(i), 'A')} color="#fde047" />;
          })}
        {symbols.map((s) => {
          const kind = switchOf(s);
          if (!kind) return null;
          const r = itemBounds(s, lookup);
          const on = kind === 'toggle' ? switchClosed(s) : true;
          const text = kind === 'toggle' ? (on ? 'ON' : 'OFF') : `1–${switchThrow(s)}`;
          return <Label key={`s${s.id}`} at={{ x: r.x + r.w / 2, y: r.y - 8 }} text={text} color={on ? '#86efac' : '#fca5a5'} />;
        })}
      </g>
      {symbols.filter(isPot).map((s) => (
        <PotSlider key={s.id} s={s} z={z} />
      ))}
      {series && (
        <g pointerEvents="none" transform={`translate(16 ${-10 - 18 / z}) scale(${1 / Math.max(z, 0.25)})`}>
          <rect x={0} y={0} width={150} height={18} rx={9} fill="#0f172a" fillOpacity={0.85} />
          <rect x={58} y={7} width={84} height={4} rx={2} fill="#ffffff" fillOpacity={0.2} />
          <rect x={58} y={7} width={84 * play.phase} height={4} rx={2} fill="#facc15" />
          <text x={8} y={13} fontSize={10} fill="#fde047" fontFamily={LABEL_FONT} fontWeight={600}>
            t = {formatEng(play.t, 's')}
          </text>
        </g>
      )}
    </g>
  );
});
