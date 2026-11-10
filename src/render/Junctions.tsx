// Junction dots of schematics: wherever three or more wire ends, wire
// interiors (T junctions) or pins meet, a dot marks the connection, so
// crossings without a dot are clearly not connected.

import { memo, useMemo } from 'react';
import type { Doc, LineItem } from '../model/types.ts';
import { distToSegment, itemPins, type Pt } from '../geometry/geom.ts';
import { partLookup } from '../model/ops.ts';

const TOL = 3;

export function junctionPoints(doc: Doc): { at: Pt; color: string; r: number }[] {
  const wires = doc.items.filter((i): i is LineItem => i.kind === 'line' && !(i.x1 === i.x2 && i.y1 === i.y2));
  const lookup = partLookup(doc);
  const pins = doc.items.flatMap((i) => (i.kind === 'symbol' ? itemPins(i, lookup) : []));
  const out: { at: Pt; color: string; r: number }[] = [];
  const seen: Pt[] = [];
  for (const w of wires) {
    for (const p of [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ]) {
      if (seen.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= TOL)) continue;
      seen.push(p);
      let n = 0;
      for (const o of wires) {
        const atEnd = Math.hypot(o.x1 - p.x, o.y1 - p.y) <= TOL || Math.hypot(o.x2 - p.x, o.y2 - p.y) <= TOL;
        if (atEnd) n++;
        // a wire passing through the point (T junction) counts twice: it continues on both sides
        else if (distToSegment(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= TOL) n += 2;
      }
      for (const pin of pins) if (Math.hypot(pin.x - p.x, pin.y - p.y) <= TOL) n++;
      if (n >= 3) out.push({ at: p, color: w.color, r: Math.max(3, w.thickness * 1.6 + 1) });
    }
  }
  return out;
}

export const Junctions = memo(function Junctions({ doc }: { doc: Doc }) {
  const dots = useMemo(() => junctionPoints(doc), [doc]);
  return (
    <g pointerEvents="none">
      {dots.map((d, i) => (
        <circle key={i} cx={d.at.x} cy={d.at.y} r={d.r} fill={d.color} />
      ))}
    </g>
  );
});
