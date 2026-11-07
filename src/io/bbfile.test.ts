import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readBoardArchive, writeBoardArchive } from './bbfile.ts';
import { parseXml } from './xml.ts';
import { parseBoard, serializeBoard } from './legacy.ts';

const samples = join(import.meta.dirname, '..', '..', '..', 'samples');
// phasenschieber.bbs ships as a damaged archive (bad local header offsets)
const all = ['boards', 'schematics'].flatMap((g) => readdirSync(join(samples, g)).filter((f) => f.endsWith('.bb')).map((f) => join(samples, g, f)));
const noLibrary = () => undefined;

describe('legacy .bb archives', () => {
  it.each(all)('reads %s', (file) => {
    const { doc } = readBoardArchive(new Uint8Array(readFileSync(file)), file.split('/').pop()!, noLibrary);
    expect(doc.layers.length).toBeGreaterThan(0);
    expect(doc.items.length).toBeGreaterThan(0);
    expect(doc.width).toBeGreaterThan(0);
  });

  it('rejects the damaged sample with an error instead of crashing', () => {
    const file = join(samples, 'schematics', 'phasenschieber.bbs');
    expect(() => readBoardArchive(new Uint8Array(readFileSync(file)), 'phasenschieber.bbs', noLibrary)).toThrow();
  });

  it('keeps parts, wires and resistors of the tutorial board', () => {
    const { doc, missingParts } = readBoardArchive(new Uint8Array(readFileSync(join(samples, 'boards', 'tutorial.bb'))), 'tutorial.bb', noLibrary);
    expect(missingParts).toEqual([]);
    expect(doc.type).toBe('HOLES');
    expect(doc.items.filter((i) => i.kind === 'part')).toHaveLength(6);
    expect(doc.items.filter((i) => i.kind === 'resistor')).toHaveLength(4);
    expect(doc.items.filter((i) => i.kind === 'line')).toHaveLength(24);
    expect(Object.values(doc.parts).every((p) => p.image.startsWith('data:image/png;base64,'))).toBe(true);
  });

  it('stores symbol shapes relative to the symbol origin', () => {
    const { doc } = readBoardArchive(new Uint8Array(readFileSync(join(samples, 'schematics', 'ne555_multivibrator.bb'))), 'ne555_multivibrator.bb', noLibrary);
    const r1 = doc.items.find((i) => i.kind === 'symbol' && i.name === 'R1');
    expect(r1?.kind).toBe('symbol');
    if (r1?.kind !== 'symbol') return;
    expect(r1.x).toBe(120);
    expect(r1.rotation).toBe(90);
    const line = r1.shapes.find((s) => s.kind === 'line');
    expect(line && line.kind === 'line' && line.x1).toBe(0);
    const x1 = doc.items.find((i) => i.kind === 'symbol' && i.name === 'X1');
    expect(x1?.kind === 'symbol' && x1.model?.name).toBe('NE555');
  });

  it('round trips through the XML writer', () => {
    for (const file of all) {
      const { doc } = readBoardArchive(new Uint8Array(readFileSync(file)), file.split('/').pop()!, noLibrary);
      const again = parseBoard(parseXml(serializeBoard(doc)), (f) => doc.parts[f]).doc;
      const strip = (d: typeof doc) => d.items.map(({ id: _id, layer: _layer, ...rest }) => rest);
      expect(strip(again)).toEqual(strip(doc));
      expect(again.layers.map((l) => l.name)).toEqual(doc.layers.map((l) => l.name));
    }
  });

  it('writes archives that can be read again', async () => {
    const file = join(samples, 'boards', 'power.bb');
    const { doc } = readBoardArchive(new Uint8Array(readFileSync(file)), 'power.bb', noLibrary);
    const { fetchBytes } = await import('./bbfile.ts');
    const zipped = await writeBoardArchive(doc, 'power.bb', fetchBytes);
    const again = readBoardArchive(zipped, 'power.bb', noLibrary);
    expect(again.missingParts).toEqual([]);
    expect(again.doc.items.length).toBe(doc.items.length);
  });
});
