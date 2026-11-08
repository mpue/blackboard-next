import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Doc, Item, LineItem, PartDef } from './types.ts';
import { applyAttachments, collectAttachments } from './magnet.ts';
import { rotateItem, translateItem } from './ops.ts';

const chip: PartDef = {
  file: 'chip.xml',
  name: 'Chip',
  description: '',
  packageType: 'DIL',
  designator: 'U',
  width: 32,
  height: 32,
  imageName: 'chip.png',
  image: '',
  pins: [
    { num: 1, x: 8, y: 8 },
    { num: 2, x: 24, y: 8 },
  ],
};

const wire = (id: string, x1: number, y1: number, x2: number, y2: number, layer = 'top'): LineItem => ({
  id,
  kind: 'line',
  layer,
  x1,
  y1,
  x2,
  y2,
  color: '#00f',
  thickness: 2,
  startType: 'STRAIGHT',
  endType: 'STRAIGHT',
});

function doc(items: Item[]): Doc {
  return {
    width: 640,
    height: 480,
    type: 'HOLES',
    layers: [
      { id: 'top', name: 'Top', visible: true, locked: false, opacity: 1, color: '#f00' },
      { id: 'locked', name: 'Locked', visible: true, locked: true, opacity: 1, color: '#000' },
    ],
    items,
    parts: { 'chip.xml': chip },
  };
}

/** runs an edit of `ids` the way the editor does: record, edit, re-apply */
function edit(d: Doc, ids: string[], fn: (it: Item, d: Doc) => void): Doc {
  const set = new Set(ids);
  const attached = collectAttachments(d, set);
  return produce(d, (draft) => {
    for (const it of draft.items) if (set.has(it.id)) fn(it as Item, draft as Doc);
    applyAttachments(draft as Doc, attached);
  });
}

const line = (d: Doc, id: string) => d.items.find((i) => i.id === id) as LineItem;

describe('magnetic mode', () => {
  it('drags wire ends that sit on the pins of a moved part', () => {
    // chip at (32,32): pins at (40,40) and (56,40)
    const d = doc([{ id: 'u1', kind: 'part', layer: 'top', x: 32, y: 32, rotation: 0, name: 'U1', ref: 'chip.xml' }, wire('w1', 40, 40, 40, 120), wire('w2', 200, 200, 56, 40)]);
    const moved = edit(d, ['u1'], (it) => translateItem(it, 16, 32));
    expect(line(moved, 'w1')).toMatchObject({ x1: 56, y1: 72, x2: 40, y2: 120 });
    expect(line(moved, 'w2')).toMatchObject({ x1: 200, y1: 200, x2: 72, y2: 72 });
  });

  it('keeps wire junctions together when a wire is moved', () => {
    const d = doc([wire('a', 0, 0, 64, 0), wire('b', 64, 0, 64, 64), wire('c', 128, 128, 0, 0)]);
    const moved = edit(d, ['a'], (it) => translateItem(it, 0, 16));
    expect(line(moved, 'b')).toMatchObject({ x1: 64, y1: 16, x2: 64, y2: 64 });
    expect(line(moved, 'c')).toMatchObject({ x1: 128, y1: 128, x2: 0, y2: 16 });
  });

  it('keeps T junctions on the moved wire', () => {
    const d = doc([wire('main', 0, 32, 128, 32), wire('branch', 48, 32, 48, 96)]);
    const moved = edit(d, ['main'], (it) => translateItem(it, 0, -16));
    expect(line(moved, 'branch')).toMatchObject({ x1: 48, y1: 16, x2: 48, y2: 96 });
  });

  it('follows the pins when a resistor is rotated', () => {
    const d = doc([
      { id: 'r1', kind: 'resistor', layer: 'top', x1: 32, y1: 64, x2: 96, y2: 64, name: 'R1', value: 1000, tolerance: 5 },
      wire('w', 96, 64, 160, 64),
    ]);
    const rotated = edit(d, ['r1'], (it, dd) => rotateItem(dd, it, 90, { x: 64, y: 64 }, false));
    expect(line(rotated, 'w')).toMatchObject({ x1: 64, y1: 96, x2: 160, y2: 64 });
  });

  it('leaves wires on locked layers alone', () => {
    const d = doc([{ id: 'u1', kind: 'part', layer: 'top', x: 32, y: 32, rotation: 0, name: 'U1', ref: 'chip.xml' }, wire('w', 40, 40, 40, 120, 'locked')]);
    const moved = edit(d, ['u1'], (it) => translateItem(it, 16, 0));
    expect(line(moved, 'w')).toMatchObject({ x1: 40, y1: 40 });
  });

  it('moves only the wires at the dragged end of a wire', () => {
    const d = doc([wire('a', 0, 0, 64, 0), wire('atEnd', 64, 0, 64, 64), wire('atStart', 0, 0, 0, 64)]);
    const attached = collectAttachments(d, new Set(['a']), [{ itemId: 'a', kind: 'end', end: 2 }]);
    const moved = produce(d, (draft) => {
      const a = draft.items[0] as LineItem;
      a.x2 = 80;
      a.y2 = 16;
      applyAttachments(draft as Doc, attached);
    });
    expect(line(moved, 'atEnd')).toMatchObject({ x1: 80, y1: 16 });
    expect(line(moved, 'atStart')).toMatchObject({ x1: 0, y1: 0 });
  });
});
