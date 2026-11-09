import type { FootprintDef, FootprintGraphic, PadDef } from '../model/types.ts';
import { copperShapeBounds, padShapeLocal } from '../pcb/geometry.ts';
import { unionRect, type Rect } from '../geometry/geom.ts';

const boxCache = new WeakMap<FootprintDef, Rect>();

/** Courtyard and pads in footprint coordinates. */
export function footprintBoundsLocal(def: FootprintDef): Rect {
  let r = boxCache.get(def);
  if (!r) {
    r = def.courtyard;
    for (const p of def.pads) r = unionRect(r, copperShapeBounds(padShapeLocal(p)));
    boxCache.set(def, r);
  }
  return r;
}

function Pad({ p }: { p: PadDef }) {
  const fill = p.npth ? 'none' : p.drill ? '#c9a94a' : '#d6453d';
  const rot = p.rotation ? `rotate(${p.rotation} ${p.x} ${p.y})` : undefined;
  if (p.shape === 'circle') return <circle cx={p.x} cy={p.y} r={Math.min(p.w, p.h) / 2} fill={fill} transform={rot} />;
  const rx = p.shape === 'oval' ? Math.min(p.w, p.h) / 2 : p.shape === 'roundrect' ? (p.roundness ?? 0.25) * Math.min(p.w, p.h) : 0;
  return <rect x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx={rx} fill={fill} transform={rot} />;
}

function Silk({ g }: { g: FootprintGraphic }) {
  const c = '#f2f2f2';
  switch (g.kind) {
    case 'line':
      return <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={c} strokeWidth={g.width} strokeLinecap="round" />;
    case 'rect':
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none" stroke={c} strokeWidth={g.width} />;
    case 'circle':
      return <circle cx={g.cx} cy={g.cy} r={g.r} fill={g.fill ? c : 'none'} stroke={c} strokeWidth={g.width} />;
    case 'poly':
      return <polygon points={g.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={g.fill ? c : 'none'} stroke={c} strokeWidth={g.width} />;
    case 'arc': {
      const a0 = (g.start * Math.PI) / 180;
      const a1 = ((g.start + g.sweep) * Math.PI) / 180;
      if (Math.abs(g.sweep) >= 360) return <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={c} strokeWidth={g.width} />;
      return (
        <path
          d={`M${g.cx + g.r * Math.cos(a0)} ${g.cy + g.r * Math.sin(a0)}A${g.r} ${g.r} 0 ${Math.abs(g.sweep) > 180 ? 1 : 0} ${g.sweep > 0 ? 1 : 0} ${g.cx + g.r * Math.cos(a1)} ${g.cy + g.r * Math.sin(a1)}`}
          fill="none"
          stroke={c}
          strokeWidth={g.width}
        />
      );
    }
  }
}

export function FootprintThumb({ def, box }: { def: FootprintDef; box: Rect }) {
  const pad = Math.max(box.w, box.h) * 0.06;
  return (
    <svg viewBox={`${box.x - pad} ${box.y - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`} className="h-full w-full" aria-hidden="true">
      {def.silk.map((g, i) => (
        <Silk key={i} g={g} />
      ))}
      {def.pads.map((p, i) => (
        <Pad key={i} p={p} />
      ))}
      {def.pads.map((p, i) => (p.drill ? <circle key={`h${i}`} cx={p.x} cy={p.y} r={p.drill / 2} fill="#05080a" /> : null))}
    </svg>
  );
}
