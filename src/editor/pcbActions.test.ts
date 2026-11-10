import { describe, expect, it } from 'vitest';
import type { Doc, FootprintItem, SymbolItem } from '../model/types.ts';
import { activeDoc, openDoc, setActive, useStore } from '../store/store.ts';
import { CircuitBuilder } from '../learn/build.ts';
import { librarySymbols } from '../learn/testing.ts';
import { addMountingHoles, createPcbFromSchematic, fitBoardToParts, updatePcbFromSchematic } from './pcbActions.ts';
import { footprintBounds } from '../geometry/geom.ts';
import { mm } from '../pcb/units.ts';

const lib = librarySymbols();

function divider(): Doc {
  const b = new CircuitBuilder(lib);
  const bat = b.add('Battery', 'V1', { x: 96, y: 160 }, { props: { mode: 'DC', dcVoltage: '9' } });
  const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: '1k' });
  const r2 = b.add('R#', 'R2', { x: 352, y: 96 }, { value: '2k' });
  b.wire(b.pin(bat, '+'), { x: b.pin(bat, '+').x, y: 96 }, b.pin(r1, 1));
  b.connect(r1, 2, r2, 1);
  const minus = b.pin(bat, '-');
  b.wire(b.pin(r2, 2), { x: b.pin(r2, 2).x, y: minus.y + 32 }, { x: minus.x, y: minus.y + 32 }, minus);
  b.ground({ x: minus.x, y: minus.y + 32 });
  return b.doc();
}

const footprints = (doc: Doc) => doc.items.filter((i): i is FootprintItem => i.kind === 'footprint');

describe('schematic -> PCB actions', () => {
  it('creates a PCB and carries later schematic changes over', () => {
    useStore.setState({ docs: [], active: null });
    const schId = openDoc(divider(), 'divider.bb');
    createPcbFromSchematic();
    const pcb = activeDoc()!;
    expect(pcb.doc.type).toBe('PCB');
    expect(pcb.doc.pcb?.schematic).toBe('divider.bb');
    expect(footprints(pcb.doc).map((f) => f.name).sort()).toEqual(['R1', 'R2', 'V1']);
    const r1 = footprints(pcb.doc).find((f) => f.name === 'R1')!;
    expect(r1.footprint.id).toBe('R_Axial_P10.16mm');
    expect(Object.values(r1.nets)).toHaveLength(2);
    // all parts on the board
    for (const f of footprints(pcb.doc)) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.y).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(pcb.doc.width);
      expect(f.y).toBeLessThan(pcb.doc.height);
    }
    const r1Pos = { x: r1.x, y: r1.y };

    // edit the schematic: new value for R1, R2 removed, a capacitor with a footprint of its own
    setActive(schId);
    const sch = activeDoc()!;
    const b = new CircuitBuilder(lib);
    const c1 = b.add('Capacitor', 'C1', { x: 512, y: 96 }, { value: '100n', props: { footprint: 'C_0805' } });
    useStore.setState((s) => ({
      docs: s.docs.map((d) =>
        d.id !== sch.id
          ? d
          : {
              ...d,
              doc: {
                ...d.doc,
                items: [
                  ...d.doc.items.filter((i) => !(i.kind === 'symbol' && i.name === 'R2')).map((i) => (i.kind === 'symbol' && i.name === 'R1' ? ({ ...i, value: '4k7' } as SymbolItem) : i)),
                  c1,
                ],
              },
            },
      ),
    }));

    setActive(pcb.id);
    updatePcbFromSchematic();
    const after = activeDoc()!.doc;
    const names = footprints(after).map((f) => f.name).sort();
    expect(names).toEqual(['C1', 'R1', 'V1']);
    const r1After = footprints(after).find((f) => f.name === 'R1')!;
    expect(r1After.value).toBe('4k7');
    // existing parts keep their place, new ones are put next to the board
    expect({ x: r1After.x, y: r1After.y }).toEqual(r1Pos);
    const c1After = footprints(after).find((f) => f.name === 'C1')!;
    expect(c1After.footprint.id).toBe('C_0805');
    expect(c1After.x).toBeGreaterThan(after.width);
    // one undo step brings the old state back
    expect(activeDoc()!.past.length).toBeGreaterThan(0);
  });

  it('fits the board to its parts and adds corner mounting holes', () => {
    useStore.setState({ docs: [], active: null });
    openDoc(divider(), 'divider.bb');
    createPcbFromSchematic();
    const before = activeDoc()!.doc;
    fitBoardToParts(mm(2));
    const doc = activeDoc()!.doc;
    expect(doc.width).toBeLessThanOrEqual(before.width + mm(1));
    for (const f of footprints(doc)) {
      const b = footprintBounds(f);
      expect(b.x).toBeGreaterThanOrEqual(mm(2) - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(mm(2) - 1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(doc.width);
      expect(b.y + b.h).toBeLessThanOrEqual(doc.height);
    }
    addMountingHoles();
    const holes = footprints(activeDoc()!.doc).filter((f) => f.footprint.id === 'MountingHole_3.2mm_M3');
    expect(holes.map((h) => h.name)).toEqual(['H1', 'H2', 'H3', 'H4']);
  });
});
