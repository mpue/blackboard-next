import { memo } from 'react';
import type { DiodeItem, Item, PartDef, PartItem, ResistorItem, SymbolItem, TextGeom } from '../model/types.ts';
import { BoxShape, EllipseShape, LineShape, ShapeView, TextShape } from './shapes.tsx';
import { resistorBands } from './resistorColors.ts';
import { partToWorld, rotatePt, symbolTransform, symbolToWorld, textLocalRect } from '../geometry/geom.ts';
import { formatOhm } from '../model/ops.ts';

export interface RenderFlags {
  showNames: boolean;
  showValues: boolean;
  showPins: boolean;
  /** solder side view: parts become ghosts, pins get solder joints */
  mirror: boolean;
}

const LABEL_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

function SolderJoint({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5.5} fill="#9ca3af" />
      <circle cx={x - 1.2} cy={y - 1.2} r={2.4} fill="#e5e7eb" />
    </g>
  );
}

function Joints({ it }: { it: ResistorItem | DiodeItem }) {
  return (
    <>
      <SolderJoint x={it.x1} y={it.y1} />
      <SolderJoint x={it.x2} y={it.y2} />
    </>
  );
}

function leadGeometry(it: ResistorItem | DiodeItem) {
  const dx = it.x2 - it.x1;
  const dy = it.y2 - it.y1;
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { len, angle, mx: (it.x1 + it.x2) / 2, my: (it.y1 + it.y2) / 2 };
}

function Lead({ it }: { it: ResistorItem | DiodeItem }) {
  return (
    <>
      <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke="#6b7280" strokeWidth={2.6} strokeLinecap="round" />
      <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke="#d1d5db" strokeWidth={1.2} strokeLinecap="round" />
    </>
  );
}

const Resistor = memo(function Resistor({ it, flags }: { it: ResistorItem; flags: RenderFlags }) {
  const { len, angle, mx, my } = leadGeometry(it);
  const bodyLen = Math.max(8, Math.min(30, len - 6));
  const h = 10;
  const bands = resistorBands(it.value, it.tolerance);
  const step = (bodyLen * 0.62) / Math.max(1, bands.length - 1);
  return (
    <g>
      <g opacity={flags.mirror ? 0.25 : 1}>
      <Lead it={it} />
      <g transform={`translate(${mx} ${my}) rotate(${angle})`}>
        <rect x={-bodyLen / 2} y={-h / 2} width={bodyLen} height={h} rx={4} fill={it.tolerance <= 1 ? '#7fb3e0' : '#dcc392'} stroke="#00000033" strokeWidth={0.6} />
        {bands.map((c, i) => (
          <rect key={i} x={-bodyLen * 0.36 + i * step + (i === bands.length - 1 ? step * 0.25 : 0)} y={-h / 2 + 0.6} width={2.4} height={h - 1.2} fill={c} />
        ))}
        <rect x={-bodyLen / 2 + 2} y={-h / 2 + 1.5} width={bodyLen - 4} height={2} rx={1} fill="#ffffff55" />
      </g>
      </g>
      {flags.showNames && (
        <text x={mx + 10} y={my - 9} fontSize={10} fontFamily={LABEL_FONT} fill="#111">
          {it.name}
        </text>
      )}
      {flags.showValues && (
        <text x={mx + 10} y={my + 17} fontSize={9} fontFamily={LABEL_FONT} fill="#333">
          {formatOhm(it.value)}
        </text>
      )}
      {flags.mirror && <Joints it={it} />}
    </g>
  );
});

const DIODE_STYLE: Record<DiodeItem['diodeType'], { len: number; h: number; body: string; band: string; glass: boolean }> = {
  DO35: { len: 18, h: 7, body: '#e8913a', band: '#111827', glass: true },
  DO41: { len: 22, h: 9, body: '#1f2937', band: '#d1d5db', glass: false },
  DO7: { len: 24, h: 9, body: '#d97706', band: '#111827', glass: true },
  SOD57: { len: 20, h: 9, body: '#6b7280', band: '#e5e7eb', glass: false },
};

const Diode = memo(function Diode({ it, flags }: { it: DiodeItem; flags: RenderFlags }) {
  const { len, angle, mx, my } = leadGeometry(it);
  const st = DIODE_STYLE[it.diodeType] ?? DIODE_STYLE.DO35;
  const bodyLen = Math.max(8, Math.min(st.len, len - 6));
  return (
    <g>
      <g opacity={flags.mirror ? 0.25 : 1}>
      <Lead it={it} />
      <g transform={`translate(${mx} ${my}) rotate(${angle})`}>
        <rect x={-bodyLen / 2} y={-st.h / 2} width={bodyLen} height={st.h} rx={st.h / 2.5} fill={st.body} fillOpacity={st.glass ? 0.85 : 1} stroke="#00000044" strokeWidth={0.6} />
        <rect x={bodyLen / 2 - bodyLen * 0.28} y={-st.h / 2} width={bodyLen * 0.14} height={st.h} fill={st.band} />
        <rect x={-bodyLen / 2 + 2} y={-st.h / 2 + 1.3} width={bodyLen - 4} height={1.6} rx={0.8} fill="#ffffff66" />
      </g>
      </g>
      {flags.showNames && (
        <text x={mx + 10} y={my - 8} fontSize={10} fontFamily={LABEL_FONT} fill="#111">
          {it.name}
        </text>
      )}
      {flags.showValues && (
        <text x={mx + 10} y={my + 16} fontSize={9} fontFamily={LABEL_FONT} fill="#333">
          {it.value}
        </text>
      )}
      {flags.mirror && <Joints it={it} />}
    </g>
  );
});

const Part = memo(function Part({ it, def, flags, bottomLayer }: { it: PartItem; def?: PartDef; flags: RenderFlags; bottomLayer: boolean }) {
  const rot = it.rotation ? `rotate(${it.rotation} ${it.x} ${it.y})` : undefined;
  if (!def) {
    return (
      <g transform={rot}>
        <rect x={it.x} y={it.y} width={32} height={32} fill="#fee2e2" stroke="#dc2626" strokeDasharray="3 2" />
        <text x={it.x + 16} y={it.y + 21} textAnchor="middle" fontSize={14} fill="#dc2626">
          ?
        </text>
      </g>
    );
  }
  const ghost = flags.mirror && !bottomLayer;
  return (
    <g>
      <g transform={rot} opacity={ghost ? 0.2 : 1}>
        <image href={def.image} x={it.x} y={it.y} width={def.width} height={def.height} preserveAspectRatio="none" />
      </g>
      {flags.mirror && def.pins.map((p) => <SolderJoint key={p.num + ':' + p.x + ':' + p.y} {...partToWorld(it, p)} />)}
      {flags.showPins &&
        def.pins.map((p) => {
          const w = partToWorld(it, p);
          return <circle key={`pin${p.num}:${p.x}:${p.y}`} cx={w.x} cy={w.y} r={2.2} fill="#ef4444" />;
        })}
      {(flags.showNames || flags.showValues) && !flags.mirror && (
        <text x={it.x} y={it.y - 3} fontSize={10} fontFamily={LABEL_FONT} fill="#111" paintOrder="stroke" stroke="#ffffffcc" strokeWidth={2.5}>
          {[flags.showNames ? it.name : '', flags.showValues ? it.value : ''].filter(Boolean).join(' ')}
        </text>
      )}
    </g>
  );
});

/**
 * Designators and values stay readable whatever the symbol's rotation and
 * mirroring: they are drawn centred on their original place, horizontally or
 * reading from bottom to top.
 */
function SymbolLabel({ it, s, display }: { it: SymbolItem; s: TextGeom; display: string }) {
  const r = textLocalRect(s, display);
  const o = { x: s.x, y: s.y };
  const c = symbolToWorld(it, rotatePt({ x: s.x + r.x + r.w / 2, y: s.y + r.y + r.h / 2 }, o, s.rotation));
  const a = symbolToWorld(it, o);
  const b = symbolToWorld(it, rotatePt({ x: s.x + 10, y: s.y }, o, s.rotation));
  const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  return <TextShape g={{ ...s, x: c.x, y: c.y, rotation: vertical ? -90 : 0 }} display={display} centered />;
}

const isLabel = (s: SymbolItem['shapes'][number]): s is TextGeom => s.kind === 'text' && (s.textType === 'NAME' || s.textType === 'VALUE');

const Symbol = memo(function Symbol({ it, flags }: { it: SymbolItem; flags: RenderFlags }) {
  return (
    <g>
      <g transform={symbolTransform(it)}>
        {it.shapes.map((s, i) => (isLabel(s) ? null : <ShapeView key={i} s={s} name={it.name} value={it.value} />))}
      </g>
      {it.shapes.map((s, i) => {
        if (!isLabel(s) || (s.textType === 'NAME' && !flags.showNames) || (s.textType === 'VALUE' && !flags.showValues)) return null;
        return <SymbolLabel key={`l${i}`} it={it} s={s} display={s.textType === 'NAME' ? it.name : it.value} />;
      })}
      {flags.showPins &&
        it.pins.map((p, i) => {
          const w = symbolToWorld(it, p);
          return <circle key={i} cx={w.x} cy={w.y} r={2.2} fill="#ef4444" />;
        })}
    </g>
  );
});

export interface ItemViewProps {
  item: Item;
  part?: PartDef;
  flags: RenderFlags;
  layerColor?: string;
  bottomLayer: boolean;
}

export const ItemView = memo(function ItemView({ item, part, flags, layerColor, bottomLayer }: ItemViewProps) {
  switch (item.kind) {
    case 'line':
      return <LineShape g={item} color={layerColor} />;
    case 'box':
      return <BoxShape g={layerColor ? { ...item, color: layerColor } : item} />;
    case 'ellipse':
      return <EllipseShape g={layerColor ? { ...item, color: layerColor } : item} />;
    case 'text':
      return <TextShape g={item} color={layerColor} />;
    case 'resistor':
      return <Resistor it={item} flags={flags} />;
    case 'diode':
      return <Diode it={item} flags={flags} />;
    case 'part':
      return <Part it={item} def={part} flags={flags} bottomLayer={bottomLayer} />;
    case 'symbol':
      return <Symbol it={item} flags={flags} />;
  }
});
