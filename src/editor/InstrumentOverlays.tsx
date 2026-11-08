import { memo } from 'react';
import type { Doc, SymbolItem } from '../model/types.ts';
import { symbolTransform } from '../geometry/geom.ts';
import { dmmReading, fgenSettings, instrumentOf, scopeSettings, scopeView } from '../spice/instruments.ts';
import { useSim, type BenchResult } from '../store/sim.ts';
import { formatEng } from '../model/ops.ts';
import { dmmDisplay } from '../ui/instruments/Multimeter.tsx';
import { CH_COLORS } from '../ui/instruments/Oscilloscope.tsx';

const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Live readings drawn onto the instrument symbols of the schematic. */
export const InstrumentOverlays = memo(function InstrumentOverlays({ doc, docId }: { doc: Doc; docId: string }) {
  const result = useSim((s) => (s.docId === docId ? s.result : null));
  const instruments = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol' && !!instrumentOf(i));
  if (!instruments.length) return null;
  return (
    <g pointerEvents="none">
      {instruments.map((it) => (
        <g key={it.id} transform={symbolTransform(it)}>
          <Overlay item={it} result={result} />
        </g>
      ))}
    </g>
  );
});

function Overlay({ item, result }: { item: SymbolItem; result: BenchResult | null }) {
  switch (instrumentOf(item)) {
    case 'fgen': {
      const f = fgenSettings(item);
      return (
        <g>
          <rect x={8} y={8} width={60} height={28} fill="#0f172a" />
          <text x={64} y={20} textAnchor="end" fontSize={10} fontFamily={MONO} fill="#7dd3fc">
            {formatEng(f.frequency, 'Hz')}
          </text>
          <text x={64} y={32} textAnchor="end" fontSize={7.5} fontFamily={MONO} fill="#38bdf8">
            {f.shape} {formatEng(2 * f.amplitude, 'V')}pp
          </text>
        </g>
      );
    }
    case 'dmm': {
      if (!result) return null;
      const r = dmmReading(result.data, result.probes, item, result.analysis);
      const d = dmmDisplay(r.value, r.unit);
      return (
        <g>
          <rect x={9} y={9} width={46} height={20} fill="#c7d2b0" />
          <text x={53} y={23} textAnchor="end" fontSize={9.5} fontWeight={700} fontFamily={MONO} fill="#1a2412">
            {d.text.trim()}
            <tspan fontSize={6.5}>{d.unit}</tspan>
          </text>
        </g>
      );
    }
    case 'scope': {
      if (!result) return null;
      const st = scopeSettings(item);
      const view = scopeView(result.data, result.probes, item, result.analysis);
      const window = 10 * st.timeDiv;
      // the symbol's little screen: 64 x 48 at (24, 8), 10 x 8 divisions
      const sx = 64 / window;
      const div = 6;
      return (
        <g>
          <rect x={24} y={8} width={64} height={48} fill="#031a0c" />
          {view.channels.map((c, i) => {
            if (!c) return null;
            const step = Math.max(1, Math.floor(c.t.length / 128));
            const pts: string[] = [];
            for (let k = 0; k < c.t.length; k += step) {
              const x = 24 + Math.max(0, Math.min(64, c.t[k] * sx));
              const y = 32 - (c.v[k] / st.ch[i].voltsDiv + st.ch[i].pos) * div;
              pts.push(`${x.toFixed(1)},${Math.max(8, Math.min(56, y)).toFixed(1)}`);
            }
            return <polyline key={i} points={pts.join(' ')} fill="none" stroke={CH_COLORS[i]} strokeWidth={1.1} strokeLinejoin="round" />;
          })}
        </g>
      );
    }
    default:
      return null;
  }
}
