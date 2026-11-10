// Footprints derived from the classic BlackBoard part library: the part
// images are drawn on the 0.1" raster with their pins on the holes, so every
// part with pins becomes a through-hole footprint (pad 1 square, origin on
// pad 1, outline of the part body on the silkscreen).

import type { FootprintDef, PartDef, PadDef } from '../model/types.ts';
import { mm } from './units.ts';

export const LEGACY_CATEGORY = 'Legacy';

const cache = new WeakMap<PartDef, FootprintDef>();

const PREFIX: [RegExp, string][] = [
  [/^(resistor|ntc|ldr)/i, 'R'],
  [/^(ccer|elcap|film|ctantal)/i, 'C'],
  [/^(do|rectifier|led|photodiode)/i, 'D'],
  [/^(inductor|toroid)/i, 'L'],
  [/^(to|t0-|multiwatt)/i, 'Q'],
  [/^(dil|dip|ic|sil|smd|oscdip)/i, 'U'],
  [/^(connector|boxheader|straightheader|jumper|bat)/i, 'J'],
  [/^(quartz|hc49|resonator)/i, 'Y'],
  [/^potentiometer/i, 'RV'],
  [/^switch/i, 'SW'],
  [/^relay/i, 'K'],
  [/^(fuse|polyswitch)/i, 'F'],
  [/^transformer/i, 'T'],
];

/** Designator prefix for footprints made from parts (tag "designator:R"). */
export function partDesignator(def: FootprintDef): string | undefined {
  return def.tags?.find((t) => t.startsWith('designator:'))?.slice(11);
}

export function footprintFromPart(part: PartDef): FootprintDef | undefined {
  if (!part.pins.length) return undefined;
  const hit = cache.get(part);
  if (hit) return hit;
  const p1 = part.pins.find((p) => p.num === 1) ?? part.pins[0];
  const pads: PadDef[] = part.pins.map((p) => ({
    num: String(p.num),
    x: p.x - p1.x,
    y: p.y - p1.y,
    shape: p === p1 ? 'rect' : 'circle',
    w: mm(1.7),
    h: mm(1.7),
    drill: mm(0.9),
  }));
  const body = { x: -p1.x, y: -p1.y, w: part.width, h: part.height };
  // a few parts have pins on (or beyond) the edge of their image: the courtyard covers the pads too
  const r = mm(0.85);
  const x1 = Math.min(body.x, ...pads.map((p) => p.x - r));
  const y1 = Math.min(body.y, ...pads.map((p) => p.y - r));
  const x2 = Math.max(body.x + body.w, ...pads.map((p) => p.x + r));
  const y2 = Math.max(body.y + body.h, ...pads.map((p) => p.y + r));
  const grow = mm(0.25);
  const def: FootprintDef = {
    id: `Part:${part.file}`,
    name: part.name,
    description: [part.description, part.packageType].filter(Boolean).join(' · ') || part.name,
    category: LEGACY_CATEGORY,
    pads,
    silk: [{ kind: 'rect', ...body, width: mm(0.15) }],
    courtyard: { x: x1 - grow, y: y1 - grow, w: x2 - x1 + 2 * grow, h: y2 - y1 + 2 * grow },
    refPos: { x: body.x + body.w / 2, y: body.y - mm(1) },
    tags: ['legacy', 'part', part.packageType.toLowerCase(), `designator:${PREFIX.find(([re]) => re.test(part.packageType.trim()))?.[1] ?? 'U'}`],
  };
  cache.set(part, def);
  return def;
}
