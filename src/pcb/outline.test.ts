import { describe, expect, it } from 'vitest';
import type { Doc, FootprintItem, ZoneItem } from '../model/types.ts';
import { createPcbDoc } from './defaults.ts';
import { footprintById } from './footprints/index.ts';
import { makeFootprintItem } from './place.ts';
import { mm } from './units.ts';
import { boardSdf, insidePolygon, outlinePath, outlinePolygon } from './outline.ts';
import { runDrc } from './drc.ts';
import { fillAllZones } from './zones.ts';
import { autoroute } from './autoroute.ts';
import { gerberFiles } from './fab/gerber.ts';

/** 60 × 40 mm board with the upper right quarter cut away (an L). */
function lBoard(): Doc {
  const doc = createPcbDoc(mm(60), mm(40));
  doc.pcb!.outline = [
    { x: 0, y: 0 },
    { x: mm(30), y: 0 },
    { x: mm(30), y: mm(20) },
    { x: mm(60), y: mm(20) },
    { x: mm(60), y: mm(40) },
    { x: 0, y: mm(40) },
  ];
  return doc;
}

const resistor = (doc: Doc, name: string, x: number, y: number, a: string, b: string): FootprintItem => {
  const fp = makeFootprintItem(doc, footprintById('R_Axial_P10.16mm')!, mm(x), mm(y), 'top', name);
  fp.nets = { '1': a, '2': b };
  doc.items.push(fp);
  return fp;
};

describe('free board outlines', () => {
  it('measures signed distances to an L shaped outline', () => {
    const doc = lBoard();
    const sdf = boardSdf(doc);
    expect(sdf(mm(10), mm(10))).toBeCloseTo(-mm(10), 6);
    // inside the cut away quarter
    expect(sdf(mm(45), mm(10))).toBeGreaterThan(0);
    expect(insidePolygon({ x: mm(45), y: mm(30) }, doc.pcb!.outline!)).toBe(true);
    expect(outlinePath(doc)).toMatch(/^M0 0L/);
    // the plain rectangle still works
    const rect = createPcbDoc(mm(20), mm(10));
    expect(boardSdf(rect)(mm(10), mm(5))).toBeCloseTo(-mm(5), 6);
    expect(outlinePolygon(rect)).toHaveLength(4);
  });

  it('reports copper in the cut out as outside the board', () => {
    const doc = lBoard();
    resistor(doc, 'R1', 5, 30, 'A', 'B');
    resistor(doc, 'R2', 40, 8, 'C', 'D');
    const v = runDrc(doc);
    const r2 = doc.items.find((i) => i.kind === 'footprint' && i.name === 'R2')!;
    expect(v.some((x) => x.kind === 'outsideBoard' && x.items.includes(r2.id))).toBe(true);
    const r1 = doc.items.find((i) => i.kind === 'footprint' && i.name === 'R1')!;
    expect(v.some((x) => (x.kind === 'outsideBoard' || x.kind === 'edgeClearance') && x.items.includes(r1.id))).toBe(false);
  });

  it('keeps copper pours inside the outline', () => {
    const doc = lBoard();
    resistor(doc, 'R1', 5, 30, 'GND', 'B');
    const zone: ZoneItem = { id: 'z', kind: 'zone', layer: 'L2', net: 'GND', points: [{ x: 0, y: 0 }, { x: doc.width, y: 0 }, { x: doc.width, y: doc.height }, { x: 0, y: doc.height }] };
    doc.items.push(zone);
    const fill = fillAllZones(doc).get('z')!;
    expect(fill.length).toBeGreaterThan(0);
    const sdf = boardSdf(doc);
    for (const poly of fill) for (const ring of poly) for (const p of ring) expect(sdf(p.x, p.y)).toBeLessThan(-doc.pcb!.rules.edgeClearance + mm(0.01));
    expect(runDrc(doc, { zoneFills: new Map([['z', fill]]) }).filter((x) => x.kind === 'edgeClearance')).toEqual([]);
  });

  it('routes around the cut out and writes the outline to Edge.Cuts', () => {
    const doc = lBoard();
    resistor(doc, 'R1', 3, 8, 'A', 'B');
    resistor(doc, 'R2', 45, 30, 'B', 'C');
    const r = autoroute(doc);
    expect(r.failed).toEqual([]);
    doc.items.push(...r.tracks, ...r.vias);
    const sdf = boardSdf(doc);
    for (const t of r.tracks) for (const p of [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }]) expect(sdf(p.x, p.y)).toBeLessThan(0);
    expect(runDrc(doc).filter((x) => x.severity === 'error')).toEqual([]);
    const edge = gerberFiles(doc, { project: 'l' }).find((f) => f.name.endsWith('Edge_Cuts.gm1'))!.content;
    // the inner corner of the L at 30/20 mm (Gerber y up: 40 - 20)
    expect(edge).toContain('X30000000Y20000000');
  });
});
