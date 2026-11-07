import { memo, type ReactNode } from 'react';
import type { BoxGeom, EdgeType, EllipseGeom, LineGeom, SymbolShape, TextGeom } from '../model/types.ts';

// ---- lines ------------------------------------------------------------------------------

function edge(type: EdgeType, x: number, y: number, fromX: number, fromY: number, w: number, color: string): ReactNode {
  if (type === 'ROUND_DOT') return <circle cx={x} cy={y} r={(w * 3) / 2} fill={color} />;
  if (type === 'SIMPLE_ARROW') {
    const a = Math.atan2(y - fromY, x - fromX);
    const len = 6 + w * 2;
    const p = (da: number) => `${x - len * Math.cos(a + da)},${y - len * Math.sin(a + da)}`;
    return <polyline points={`${p(0.45)} ${x},${y} ${p(-0.45)}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return null;
}

export function LineShape({ g, color, extraWidth = 0 }: { g: LineGeom; color?: string; extraWidth?: number }) {
  const c = color ?? g.color;
  const w = g.thickness + extraWidth;
  return (
    <>
      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={c} strokeWidth={w} strokeLinecap="round" strokeDasharray={g.dash?.join(' ')} />
      {edge(g.startType, g.x1, g.y1, g.x2, g.y2, w, c)}
      {edge(g.endType, g.x2, g.y2, g.x1, g.y1, w, c)}
    </>
  );
}

// ---- boxes / ellipses ---------------------------------------------------------------------

function fillProps(style: BoxGeom['style'], color: string, thickness: number, dash?: number[]) {
  switch (style) {
    case 'FILLED':
      return { fill: color, stroke: 'none' };
    case 'OUTLINED_FILLED':
      return { fill: color, fillOpacity: 0.35, stroke: color, strokeWidth: thickness, strokeDasharray: dash?.join(' ') };
    default:
      return { fill: 'none', stroke: color, strokeWidth: thickness, strokeDasharray: dash?.join(' ') };
  }
}

export function BoxShape({ g }: { g: BoxGeom }) {
  const x = Math.min(g.x, g.x + g.w);
  const y = Math.min(g.y, g.y + g.h);
  return <rect x={x} y={y} width={Math.abs(g.w)} height={Math.abs(g.h)} {...fillProps(g.style, g.color, g.thickness, g.dash)} />;
}

/** java.awt arcs: degrees counter clockwise from 3 o'clock; filled arcs are pie slices. */
export function arcPath(g: EllipseGeom): string | null {
  const rx = Math.abs(g.w) / 2;
  const ry = Math.abs(g.h) / 2;
  const cx = Math.min(g.x, g.x + g.w) + rx;
  const cy = Math.min(g.y, g.y + g.h) + ry;
  if (Math.abs(g.arcAngle) >= 360) return null;
  const pt = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return `${cx + rx * Math.cos(r)},${cy - ry * Math.sin(r)}`;
  };
  const large = Math.abs(g.arcAngle) > 180 ? 1 : 0;
  const sweep = g.arcAngle > 0 ? 0 : 1;
  const arc = `M${pt(g.startAngle)} A${rx},${ry} 0 ${large} ${sweep} ${pt(g.startAngle + g.arcAngle)}`;
  return g.style === 'OUTLINED' ? arc : `M${cx},${cy} L${pt(g.startAngle)} A${rx},${ry} 0 ${large} ${sweep} ${pt(g.startAngle + g.arcAngle)} Z`;
}

export function EllipseShape({ g }: { g: EllipseGeom }) {
  const props = fillProps(g.style, g.color, g.thickness, g.dash);
  const d = arcPath(g);
  if (d) return <path d={d} {...props} />;
  const rx = Math.abs(g.w) / 2;
  const ry = Math.abs(g.h) / 2;
  return <ellipse cx={Math.min(g.x, g.x + g.w) + rx} cy={Math.min(g.y, g.y + g.h) + ry} rx={rx} ry={ry} {...props} />;
}

// ---- text -----------------------------------------------------------------------------------

const FONT_FALLBACK = ', "Inter", "Helvetica Neue", Arial, sans-serif';

/** Legacy texts may contain simple Swing HTML (<b>, <i>, <u>, <br>). */
function parseMarkup(src: string) {
  const bold = /<b>/i.test(src);
  const italic = /<i>/i.test(src);
  const underline = /<u>/i.test(src);
  const lines = src
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n');
  return { bold, italic, underline, lines };
}

export const TextShape = memo(function TextShape({ g, display, color }: { g: TextGeom; display?: string; color?: string }) {
  const m = parseMarkup(display ?? g.text);
  const mono = g.textType === 'SPICE_DIRECTIVE' || g.textType === 'CONTROL';
  return (
    <text
      x={g.x}
      y={g.y}
      fill={color ?? g.color}
      fontSize={g.fontSize}
      fontFamily={mono ? '"JetBrains Mono", "Cascadia Code", Consolas, monospace' : `"${g.font}"${FONT_FALLBACK}`}
      fontWeight={m.bold ? 700 : 400}
      fontStyle={m.italic ? 'italic' : undefined}
      textDecoration={m.underline ? 'underline' : undefined}
      transform={g.rotation ? `rotate(${g.rotation} ${g.x} ${g.y})` : undefined}
      style={{ whiteSpace: 'pre' }}
    >
      {m.lines.length === 1
        ? m.lines[0]
        : m.lines.map((l, i) => (
            <tspan key={i} x={g.x} dy={i === 0 ? 0 : g.fontSize * 1.2}>
              {l}
            </tspan>
          ))}
    </text>
  );
});

// ---- symbol shapes ---------------------------------------------------------------------------

export function ShapeView({ s, name, value }: { s: SymbolShape; name?: string; value?: string }) {
  switch (s.kind) {
    case 'line':
      return <LineShape g={s} />;
    case 'box':
      return <BoxShape g={s} />;
    case 'ellipse':
      return <EllipseShape g={s} />;
    case 'text': {
      const display = s.textType === 'NAME' && name !== undefined ? name : s.textType === 'VALUE' && value !== undefined ? value : s.text;
      return <TextShape g={s} display={display} />;
    }
  }
}
