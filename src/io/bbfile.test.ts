import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readBoardArchive, writeBoardArchive } from './bbfile.ts';
import { parseXml } from './xml.ts';
import { parseBoard, serializeBoard } from './legacy.ts';

const samples = join(import.meta.dirname, '..', '..', 'library', 'samples');
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

  it('carries parts of the user library inside the archive', async () => {
    const { createDoc } = await import('../store/store.ts');
    const { fetchBytes } = await import('./bbfile.ts');
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"/>').toString('base64')}`;
    const part = {
      file: 'user-p1.xml',
      name: 'Relais',
      description: 'Mein Relais',
      packageType: 'DIL',
      designator: 'K',
      author: 'Ich',
      width: 32,
      height: 16,
      imageName: 'user-p1.svg',
      image: svg,
      pins: [
        { num: 1, x: 8, y: 8, name: 'A' },
        { num: 2, x: 24, y: 8, name: 'B' },
      ],
    };
    const doc = createDoc('HOLES', 320, 160);
    doc.parts[part.file] = part;
    doc.items.push({ id: 'p', kind: 'part', layer: doc.layers[0].id, x: 16, y: 16, rotation: 0, name: 'K1', ref: part.file });
    const again = readBoardArchive(await writeBoardArchive(doc, 'relais.bb', fetchBytes), 'relais.bb', noLibrary);
    expect(again.missingParts).toEqual([]);
    expect(again.doc.parts[part.file]).toEqual(part);
  });

  it('keeps PCB data in an extension that legacy readers ignore', async () => {
    const { createPcbDoc } = await import('../pcb/defaults.ts');
    const { fetchBytes } = await import('./bbfile.ts');
    const { unzipSync, strFromU8 } = await import('fflate');
    const doc = createPcbDoc(400, 300);
    const fp = {
      id: 'fp1',
      kind: 'footprint' as const,
      layer: 'L1',
      x: 32,
      y: 48,
      rotation: 90,
      side: 'top' as const,
      name: 'R1',
      value: '1k',
      nets: { '1': 'GND', '2': 'N1' },
      footprint: {
        id: 'TEST',
        name: 'TEST',
        description: '',
        category: 'Resistors',
        pads: [
          { num: '1', x: 0, y: 0, shape: 'rect' as const, w: 10, h: 10, drill: 5 },
          { num: '2', x: 64, y: 0, shape: 'circle' as const, w: 10, h: 10, drill: 5 },
        ],
        silk: [],
        courtyard: { x: -8, y: -8, w: 80, h: 16 },
      },
    };
    doc.items.push(
      { id: 't0', kind: 'text', layer: 'L0', x: 10, y: 10, text: 'Hello', font: 'Arial', fontSize: 12, rotation: 0, textType: 'TEXT', color: '#ffffff' },
      fp,
      { id: 'tr', kind: 'track', layer: 'L2', x1: 32, y1: 48, x2: 100, y2: 48, width: 2, net: 'GND' },
      { id: 'l0', kind: 'line', layer: 'L4', x1: 0, y1: 0, x2: 20, y2: 0, color: '#000000', thickness: 1, startType: 'STRAIGHT', endType: 'STRAIGHT' },
      { id: 'v1', kind: 'via', layer: 'L1', x: 100, y: 48, diameter: 5, drill: 2.5, net: 'GND' },
      { id: 'z1', kind: 'zone', layer: 'L2', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }], net: 'GND' },
    );
    const zipped = await writeBoardArchive(doc, 'board.bb', fetchBytes);
    const entries = unzipSync(zipped);
    // the BoardBean stays a legacy board
    expect(strFromU8(entries['board.bb.xml'])).toContain('<type>BLANK</type>');
    const again = readBoardArchive(zipped, 'board.bb', noLibrary).doc;
    expect(again.type).toBe('PCB');
    expect(again.pcb).toEqual(doc.pcb);
    expect(again.layers.map((l) => l.role)).toEqual(doc.layers.map((l) => l.role));
    expect(again.items.map((i) => i.kind)).toEqual(['text', 'footprint', 'track', 'line', 'via', 'zone']);
    const fp2 = again.items[1];
    expect(fp2.kind === 'footprint' && fp2.nets).toEqual({ '1': 'GND', '2': 'N1' });
    expect(again.items[2].layer).toBe(again.layers[2].id);
    // without the extension (BlackBoard 1.x/2.x view) only the legacy items remain
    delete entries['bbnext/document.json'];
    const { zipSync } = await import('fflate');
    const legacy = readBoardArchive(zipSync(entries), 'board.bb', noLibrary).doc;
    expect(legacy.type).toBe('BLANK');
    expect(legacy.items.map((i) => i.kind)).toEqual(['text', 'line']);
  });
});
