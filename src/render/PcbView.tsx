// Rendering of printed circuit boards. Unlike the other board types, the
// geometry of one item is spread over several physical layers (a footprint has
// pads on copper and drawings on silkscreen), so the board is drawn layer by
// layer in physical stacking order instead of item by item.

import { memo } from 'react';
import type { CopperSide, Doc, FootprintGraphic, FootprintItem, Item, Layer, LayerRole, PadDef, TrackItem, ViaItem, ZoneItem } from '../model/types.ts';
import { footprintToWorld, footprintTransform } from '../pcb/geometry.ts';
import { mm } from '../pcb/units.ts';
import { outlinePath } from '../pcb/outline.ts';
import { ItemView, type RenderFlags } from './ItemView.tsx';
import { rectOfPoints, textWorldCorners } from '../geometry/geom.ts';
import type { TextItem } from '../model/types.ts';

function textCentreX(t: TextItem): number {
  const r = rectOfPoints(textWorldCorners(t));
  return r.x + r.w / 2;
}

export interface PcbRenderOptions extends RenderFlags {
  realistic: boolean;
  /** layer the user is editing: its copper is drawn on top, the other side dimmed */
  activeLayer?: string;
  /** zone id -> SVG path of the filled copper (fill-rule evenodd) */
  zoneFills?: Map<string, string>;
  /** item keys (item id, or `${id}:${padIndex}` for pads) of the highlighted net */
  highlight?: Set<string>;
  /** zoom factor, used to show pad numbers once they are large enough */
  zoom: number;
  grid?: number;
}

// ---- palettes ------------------------------------------------------------------------------

interface Palette {
  substrate: string;
  edge: string;
  copper: Record<CopperSide, string>;
  zoneOpacity: number;
  pad: Record<CopperSide, string>;
  thtPad: string;
  hole: string;
  silk: Record<CopperSide, string>;
  padText: string;
}

function palette(layers: Layer[], realistic: boolean): Palette {
  const color = (role: LayerRole, fallback: string) => layers.find((l) => l.role === role)?.color ?? fallback;
  if (realistic) {
    return {
      substrate: '#145c34',
      edge: '#0c3d22',
      copper: { top: '#2b8a4f', bottom: '#2b8a4f' },
      zoneOpacity: 1,
      pad: { top: '#d7d9db', bottom: '#d7d9db' },
      thtPad: '#d7d9db',
      hole: '#0b0f0c',
      silk: { top: '#f4f4f0', bottom: '#f4f4f0' },
      padText: '#00000000',
    };
  }
  return {
    substrate: '#0f1913',
    edge: '#e8d44d',
    copper: { top: color('top-copper', '#d6453d'), bottom: color('bottom-copper', '#3d7fd6') },
    zoneOpacity: 0.55,
    pad: { top: color('top-copper', '#d6453d'), bottom: color('bottom-copper', '#3d7fd6') },
    thtPad: '#c9a94a',
    hole: '#05080a',
    silk: { top: color('top-silk', '#f2f2f2'), bottom: color('bottom-silk', '#e3c76b') },
    padText: '#ffffff',
  };
}

// ---- primitives ----------------------------------------------------------------------------

function PadShape({ pad, fill, grow = 0, stroke, strokeWidth }: { pad: PadDef; fill: string; grow?: number; stroke?: string; strokeWidth?: number }) {
  const w = pad.w + 2 * grow;
  const h = pad.h + 2 * grow;
  const rot = pad.rotation ? `rotate(${pad.rotation} ${pad.x} ${pad.y})` : undefined;
  const common = { fill, stroke, strokeWidth, transform: rot };
  if (pad.shape === 'circle') return <circle cx={pad.x} cy={pad.y} r={Math.min(w, h) / 2} {...common} />;
  const rx = pad.shape === 'oval' ? Math.min(w, h) / 2 : pad.shape === 'roundrect' ? Math.min(0.5, pad.roundness ?? 0.25) * Math.min(pad.w, pad.h) + grow : 0;
  return <rect x={pad.x - w / 2} y={pad.y - h / 2} width={w} height={h} rx={rx} {...common} />;
}

function Graphic({ g, color }: { g: FootprintGraphic; color: string }) {
  switch (g.kind) {
    case 'line':
      return <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={color} strokeWidth={g.width} strokeLinecap="round" />;
    case 'rect':
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none" stroke={color} strokeWidth={g.width} />;
    case 'circle':
      return <circle cx={g.cx} cy={g.cy} r={g.r} fill={g.fill ? color : 'none'} stroke={color} strokeWidth={g.width} />;
    case 'poly':
      return <polygon points={g.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={g.fill ? color : 'none'} stroke={color} strokeWidth={g.width} strokeLinejoin="round" />;
    case 'arc': {
      if (Math.abs(g.sweep) >= 360) return <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={color} strokeWidth={g.width} />;
      const a0 = (g.start * Math.PI) / 180;
      const a1 = ((g.start + g.sweep) * Math.PI) / 180;
      const x0 = g.cx + g.r * Math.cos(a0);
      const y0 = g.cy + g.r * Math.sin(a0);
      const x1 = g.cx + g.r * Math.cos(a1);
      const y1 = g.cy + g.r * Math.sin(a1);
      const large = Math.abs(g.sweep) > 180 ? 1 : 0;
      const sweep = g.sweep > 0 ? 1 : 0;
      return <path d={`M${x0} ${y0}A${g.r} ${g.r} 0 ${large} ${sweep} ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={g.width} strokeLinecap="round" />;
    }
  }
}

const isTht = (pad: PadDef) => !!pad.drill && !pad.npth;

/** Readable text: rotations between 90° and 270° are turned by 180°. */
function uprightAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 90 && a <= 270 ? a - 180 : a;
}

export const DESIGNATOR_SIZE = mm(1.1);

function Designator({ fp, color }: { fp: FootprintItem; color: string }) {
  const off = fp.refOffset ?? fp.footprint.refPos ?? { x: 0, y: fp.footprint.courtyard.y - mm(0.8) };
  const at = footprintToWorld(fp, off);
  const rot = uprightAngle(fp.rotation);
  const t = `rotate(${rot} ${at.x} ${at.y})${fp.side === 'bottom' ? ` translate(${2 * at.x} 0) scale(-1 1)` : ''}`;
  return (
    <text x={at.x} y={at.y} transform={t} fontSize={DESIGNATOR_SIZE} fontFamily='"Inter", Arial, sans-serif' fontWeight={600} fill={color} textAnchor="middle" dominantBaseline="central">
      {fp.name}
    </text>
  );
}

// ---- per item, per layer --------------------------------------------------------------------

const FootprintCopper = memo(function FootprintCopper({ fp, side, color, thtColor, highlight }: { fp: FootprintItem; side: CopperSide; color: string; thtColor: string; highlight?: Set<string> }) {
  const pads = fp.footprint.pads.map((pad, i) => ({ pad, i })).filter(({ pad }) => !pad.npth && (pad.drill ? true : fp.side === side));
  if (!pads.length) return null;
  return (
    <g transform={footprintTransform(fp)}>
      {pads.map(({ pad, i }) => (
        <g key={i}>
          <PadShape pad={pad} fill={isTht(pad) ? thtColor : color} />
          {highlight?.has(`${fp.id}:${i}`) && <PadShape pad={pad} fill="#ffffff" grow={0} />}
        </g>
      ))}
    </g>
  );
});

const FootprintSilk = memo(function FootprintSilk({ fp, color, showNames }: { fp: FootprintItem; color: string; showNames: boolean }) {
  return (
    <g>
      <g transform={footprintTransform(fp)}>
        {fp.footprint.silk.map((g, i) => (
          <Graphic key={i} g={g} color={color} />
        ))}
      </g>
      {showNames && <Designator fp={fp} color={color} />}
    </g>
  );
});

function PadNumbers({ fp, color }: { fp: FootprintItem; color: string }) {
  return (
    <g pointerEvents="none">
      {fp.footprint.pads.map((pad, i) => {
        if (pad.npth) return null;
        const at = footprintToWorld(fp, pad);
        const size = Math.min(pad.w, pad.h) * 0.55;
        return (
          <text key={i} x={at.x} y={at.y} fontSize={size} fill={color} textAnchor="middle" dominantBaseline="central" fontFamily="Inter, Arial, sans-serif" fontWeight={700}>
            {pad.num}
          </text>
        );
      })}
    </g>
  );
}

const Track = memo(function Track({ t, color, hl }: { t: TrackItem; color: string; hl: boolean }) {
  return (
    <>
      <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={color} strokeWidth={t.width} strokeLinecap="round" />
      {hl && <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={t.width} strokeLinecap="round" />}
    </>
  );
});

function Zone({ z, color, fill, opacity, hl }: { z: ZoneItem; color: string; fill?: string; opacity: number; hl: boolean }) {
  const pts = z.points.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <g>
      {fill ? (
        <path d={fill} fill={color} fillOpacity={hl ? Math.min(1, opacity + 0.25) : opacity} fillRule="evenodd" />
      ) : (
        <polygon points={pts} fill={color} fillOpacity={0.12} />
      )}
      <polygon points={pts} fill="none" stroke={color} strokeWidth={mm(0.1)} strokeDasharray={`${mm(0.6)} ${mm(0.4)}`} strokeOpacity={0.9} />
    </g>
  );
}

// ---- board -------------------------------------------------------------------------------------


export const PcbView = memo(function PcbView({ doc, idPrefix, opts, mirror }: { doc: Doc; idPrefix: string; opts: PcbRenderOptions; mirror: boolean }) {
  const pal = palette(doc.layers, opts.realistic);
  const byRole = (role: LayerRole) => doc.layers.find((l) => l.role === role);
  const visible = (role: LayerRole) => byRole(role)?.visible ?? true;
  const opacityOf = (role: LayerRole) => byRole(role)?.opacity ?? 1;
  const idsOfRole = (role: LayerRole) => new Set(doc.layers.filter((l) => l.role === role).map((l) => l.id));
  const topCu = idsOfRole('top-copper');
  const botCu = idsOfRole('bottom-copper');
  const layerSide = (id: string): CopperSide | undefined => (topCu.has(id) ? 'top' : botCu.has(id) ? 'bottom' : undefined);

  const footprints = doc.items.filter((i): i is FootprintItem => i.kind === 'footprint');
  const tracks = doc.items.filter((i): i is TrackItem => i.kind === 'track');
  const vias = doc.items.filter((i): i is ViaItem => i.kind === 'via');
  const zones = doc.items.filter((i): i is ZoneItem => i.kind === 'zone');
  const others = doc.items.filter((i) => i.kind !== 'footprint' && i.kind !== 'track' && i.kind !== 'via' && i.kind !== 'zone');
  const hl = opts.highlight;
  const edge = outlinePath(doc);
  const activeSide = opts.activeLayer ? layerSide(opts.activeLayer) : undefined;
  // seen from below the bottom side is in front
  const front: CopperSide = mirror ? 'bottom' : activeSide ?? 'top';
  const back: CopperSide = front === 'top' ? 'bottom' : 'top';
  const role = (side: CopperSide, kind: 'copper' | 'silk'): LayerRole => `${side}-${kind}` as LayerRole;
  const flags = { ...opts, mirror: false };

  const otherItemsOn = (role_: LayerRole) => {
    const ids = idsOfRole(role_);
    return others.filter((i) => ids.has(i.layer));
  };
  // texts on the bottom side are mirrored, as seen through the board from the top
  const legacy = (items: Item[], layerRole: LayerRole) =>
    items.map((it) =>
      it.kind === 'text' && layerRole.startsWith('bottom') ? (
        // mirrored around its own centre, so it stays where it is picked
        <g key={it.id} transform={`translate(${2 * textCentreX(it)} 0) scale(-1 1)`}>
          <ItemView item={it} flags={flags} bottomLayer />
        </g>
      ) : (
        <ItemView key={it.id} item={it} flags={flags} bottomLayer={layerRole.startsWith('bottom')} />
      ),
    );

  const copperLayer = (side: CopperSide, dim: boolean) => {
    const lr = role(side, 'copper');
    if (!visible(lr)) return null;
    // in the realistic view the far side is hidden by the opaque board
    if (opts.realistic && side !== front) return null;
    const ids = side === 'top' ? topCu : botCu;
    const color = pal.copper[side];
    return (
      <g key={lr} opacity={(dim ? 0.45 : 1) * opacityOf(lr)}>
        {zones
          .filter((z) => ids.has(z.layer))
          .map((z) => (
            <Zone key={z.id} z={z} color={color} fill={opts.zoneFills?.get(z.id)} opacity={pal.zoneOpacity} hl={!!hl?.has(z.id)} />
          ))}
        {tracks
          .filter((t) => ids.has(t.layer))
          .map((t) => (
            <Track key={t.id} t={t} color={color} hl={!!hl?.has(t.id)} />
          ))}
        {footprints.map((fp) => (
          <FootprintCopper key={fp.id} fp={fp} side={side} color={pal.pad[side]} thtColor={pal.thtPad} highlight={hl} />
        ))}
        {legacy(otherItemsOn(lr), lr)}
      </g>
    );
  };

  const silkLayer = (side: CopperSide, dim: boolean) => {
    const lr = role(side, 'silk');
    if (!visible(lr)) return null;
    if (opts.realistic && side !== front) return null;
    return (
      <g key={lr} opacity={(dim ? 0.35 : 1) * opacityOf(lr)}>
        {footprints
          .filter((fp) => fp.side === side)
          .map((fp) => (
            <FootprintSilk key={fp.id} fp={fp} color={pal.silk[side]} showNames={opts.showNames} />
          ))}
        {legacy(otherItemsOn(lr), lr)}
      </g>
    );
  };

  const showPadNumbers = !opts.realistic && opts.zoom > 3;
  const outline = byRole('outline');

  return (
    <g>
      <defs>
        {opts.grid && (
          <pattern id={`${idPrefix}-pcbgrid`} width={opts.grid} height={opts.grid} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={Math.max(0.35, opts.grid / 40)} fill="#ffffff" fillOpacity={0.22} />
          </pattern>
        )}
        <clipPath id={`${idPrefix}-pcbclip`}>
          <path d={edge} />
        </clipPath>
      </defs>
      {/* substrate */}
      <path d={edge} fill={pal.substrate} />
      {opts.realistic && <path d={edge} fill="none" stroke="#c8b27a" strokeWidth={mm(0.15)} />}
      {opts.grid && !opts.realistic && <path d={edge} fill={`url(#${idPrefix}-pcbgrid)`} />}

      <g clipPath={opts.realistic ? `url(#${idPrefix}-pcbclip)` : undefined}>
        {silkLayer(back, true)}
        {copperLayer(back, true)}
        {copperLayer(front, false)}
        {/* vias go through both copper layers */}
        {(visible('top-copper') || visible('bottom-copper')) && (
          <g>
            {vias.map((v) => (
              <g key={v.id}>
                <circle cx={v.x} cy={v.y} r={v.diameter / 2} fill={opts.realistic ? pal.copper[front] : '#b8b8b8'} />
                {hl?.has(v.id) && <circle cx={v.x} cy={v.y} r={v.diameter / 2} fill="#ffffff" fillOpacity={0.55} />}
              </g>
            ))}
          </g>
        )}
        {/* drill holes */}
        <g>
          {vias.map((v) => (
            <circle key={v.id} cx={v.x} cy={v.y} r={v.drill / 2} fill={pal.hole} />
          ))}
          {footprints.map((fp) =>
            fp.footprint.pads.some((p) => p.drill) ? (
              <g key={fp.id} transform={footprintTransform(fp)}>
                {fp.footprint.pads.map((p, i) => (p.drill ? <circle key={i} cx={p.x} cy={p.y} r={p.drill / 2} fill={pal.hole} /> : null))}
              </g>
            ) : null,
          )}
        </g>
        {silkLayer(front, false)}
        {showPadNumbers && footprints.map((fp) => <PadNumbers key={fp.id} fp={fp} color={pal.padText} />)}
      </g>

      {/* board edge and drawings on the outline layer */}
      {(outline?.visible ?? true) && (
        <g opacity={outline?.opacity ?? 1}>
          {!opts.realistic && <path d={edge} fill="none" stroke={pal.edge} strokeWidth={mm(0.15)} />}
          {legacy(otherItemsOn('outline'), 'outline')}
        </g>
      )}
      {/* user layers without a physical role */}
      {legacy(
        others.filter((i) => !doc.layers.find((l) => l.id === i.layer)?.role),
        'top-silk',
      )}
    </g>
  );
});
