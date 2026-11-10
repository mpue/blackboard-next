import { memo } from 'react';
import type { Doc, SymbolItem } from '../model/types.ts';
import { symbolTransform } from '../geometry/geom.ts';
import { useLive } from '../store/live.ts';
import { useMcu, type ChipState } from '../mcu/controller.ts';
import { isMcu, mcuFirmware, mcuKind, mcuModel, type McuKind } from '../mcu/pinout.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';

const FONT = '"Inter", Arial, sans-serif';
const DOT: Record<string, string> = { running: '#22c55e', unpowered: '#f59e0b', noFirmware: '#f59e0b', error: '#ef4444', off: '#94a3b8' };
/** where the status badge sits inside each symbol */
const BADGE: Record<McuKind, [number, number]> = { atmega328p: [40, 300], esp32: [82, 362] };

/** Run state and pin levels drawn onto the microcontroller symbols. */
export const McuOverlay = memo(function McuOverlay({ doc }: { doc: Doc }) {
  const chips = doc.items.filter((i): i is SymbolItem => isMcu(i));
  if (!chips.length) return null;
  return (
    <g pointerEvents="none">
      {chips.map((s) => (
        <g key={s.id} transform={symbolTransform(s)}>
          <Chip s={s} />
        </g>
      ))}
    </g>
  );
});

function Chip({ s }: { s: SymbolItem }) {
  const t = useT();
  const live = useLive((x) => x.on && x.mode === 'dc');
  const state: ChipState | undefined = useMcu((x) => x.chips[s.id]);
  const status = !mcuFirmware(s) ? 'noFirmware' : live ? (state?.status ?? 'off') : 'off';
  const running = status === 'running';
  const byNum = new Map(s.pins.map((p) => [p.num, p]));
  return (
    <g>
      {/* status badge inside the package */}
      <g transform={`translate(${BADGE[mcuKind(s) ?? 'atmega328p'].join(' ')})`}>
        <rect width={92} height={16} rx={8} fill="#ffffff" fillOpacity={0.92} stroke={DOT[status]} strokeOpacity={0.6} />
        <circle cx={9} cy={8} r={3.5} fill={DOT[status]}>
          {running && <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />}
        </circle>
        <text x={17} y={11.2} fontSize={8.5} fontFamily={FONT} fill="#0f172a">
          {t(`mcu.badge.${status}` as I18nKey)}
          {running && state ? ` · ${Math.round(state.seconds)} s` : ''}
        </text>
      </g>
      {running &&
        state &&
        mcuModel(s).io.map((io) => {
          const p = byNum.get(io.num);
          const d = state.drives[io.num];
          if (!p || d === undefined) return null;
          // on the pin line, just outside the package; pins on the left edge point the other way
          const left = p.x === 0;
          const x = left ? p.x + 8 : p.x - 8;
          if (d === 'Z' || d === 'PU') return <circle key={io.num} cx={x} cy={p.y} r={2.6} fill="none" stroke="#64748b" strokeWidth={1.1} />;
          if (typeof d === 'number') {
            return (
              <g key={io.num}>
                <circle cx={x} cy={p.y} r={5} fill="#f59e0b" opacity={0.25 * d} />
                <circle cx={x} cy={p.y} r={3.2} fill="#f59e0b" fillOpacity={0.35 + 0.65 * d} stroke="#b45309" strokeWidth={0.6} />
                <text x={left ? p.x - 4 : p.x + 4} y={p.y - 3} fontSize={6.5} fontFamily={FONT} fill="#b45309" textAnchor={left ? 'end' : 'start'}>
                  {Math.round(d * 100)} %
                </text>
              </g>
            );
          }
          return d === 'H' ? (
            <g key={io.num}>
              <circle cx={x} cy={p.y} r={5.5} fill="#ef4444" opacity={0.3} />
              <circle cx={x} cy={p.y} r={3.2} fill="#ef4444" stroke="#991b1b" strokeWidth={0.6} />
            </g>
          ) : (
            <circle key={io.num} cx={x} cy={p.y} r={3.2} fill="#334155" stroke="#0f172a" strokeWidth={0.6} />
          );
        })}
    </g>
  );
}
