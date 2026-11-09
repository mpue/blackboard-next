// Fabrication outputs: Gerber, Excellon, assembly files, zip and etching SVG.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Doc, FootprintDef, FootprintItem, Item } from '../../model/types.ts';
import { createPcbDoc } from '../defaults.ts';
import { mm } from '../units.ts';
import { bomCsv, drillFiles, etchingSvg, fabricationZip, gerberFiles, pickAndPlaceCsv, strokeText, strokeTextWidth, type MultiPolygon } from './index.ts';

const tht: FootprintDef = {
  id: 'R_Axial_P7.62mm',
  name: 'Resistor axial',
  description: '',
  category: 'Resistors THT',
  pads: [
    { num: '1', x: 0, y: 0, shape: 'rect', w: mm(1.6), h: mm(1.6), drill: mm(0.8) },
    { num: '2', x: mm(7.62), y: 0, shape: 'circle', w: mm(1.6), h: mm(1.6), drill: mm(0.8) },
  ],
  silk: [
    { kind: 'rect', x: mm(1.5), y: mm(-1), w: mm(4.62), h: mm(2), width: mm(0.12) },
    { kind: 'arc', cx: mm(3.81), cy: 0, r: mm(0.5), start: 180, sweep: 180, width: mm(0.12) },
  ],
  courtyard: { x: mm(-1), y: mm(-1.25), w: mm(9.62), h: mm(2.5) },
  refPos: { x: mm(3.81), y: mm(-2) },
};

const smd: FootprintDef = {
  id: 'C_0805',
  name: 'C 0805',
  description: '',
  category: 'Chip SMD',
  pads: [
    { num: '1', x: mm(-0.95), y: 0, shape: 'roundrect', w: mm(1), h: mm(1.25), roundness: 0.25 },
    { num: '2', x: mm(0.95), y: 0, shape: 'rect', w: mm(1), h: mm(1.25) },
  ],
  silk: [{ kind: 'line', x1: mm(-0.3), y1: mm(-0.8), x2: mm(0.3), y2: mm(-0.8), width: mm(0.12) }],
  courtyard: { x: mm(-1.7), y: mm(-1), w: mm(3.4), h: mm(2) },
  refPos: { x: 0, y: mm(-1.6) },
};

const hole: FootprintDef = {
  id: 'MountingHole_3.2mm',
  name: 'Mounting hole',
  description: '',
  category: 'Mechanical',
  pads: [{ num: '', x: 0, y: 0, shape: 'circle', w: mm(3.2), h: mm(3.2), drill: mm(3.2), npth: true }],
  silk: [{ kind: 'circle', cx: 0, cy: 0, r: mm(2), width: mm(0.12) }],
  courtyard: { x: mm(-2.5), y: mm(-2.5), w: mm(5), h: mm(5) },
};

const place = (name: string, value: string, footprint: FootprintDef, x: number, y: number, rotation = 0, side: 'top' | 'bottom' = 'top'): FootprintItem => ({
  id: `fp-${name}`,
  kind: 'footprint',
  layer: side === 'top' ? 'L1' : 'L2',
  x,
  y,
  rotation,
  side,
  name,
  value,
  footprint,
  nets: {},
});

const zoneFill: MultiPolygon = [
  [
    [
      { x: mm(60), y: mm(50) },
      { x: mm(90), y: mm(50) },
      { x: mm(90), y: mm(75) },
      { x: mm(60), y: mm(75) },
    ],
    [
      { x: mm(70), y: mm(60) },
      { x: mm(80), y: mm(60) },
      { x: mm(80), y: mm(65) },
      { x: mm(70), y: mm(65) },
    ],
  ],
];

function board(): Doc {
  const doc = createPcbDoc();
  const items: Item[] = [
    place('R1', '10k', tht, mm(12.7), mm(25.4)),
    place('R10', '10k', tht, mm(12.7), mm(45.72), 90),
    place('R2', '10k', tht, mm(12.7), mm(35.56)),
    place('C1', '100n', smd, mm(50), mm(40), 90, 'bottom'),
    place('H1', 'MountingHole', hole, mm(5), mm(75)),
    { id: 't1', kind: 'track', layer: 'L1', x1: mm(12.7), y1: mm(25.4), x2: mm(30), y2: mm(25.4), width: mm(0.3) },
    { id: 'v1', kind: 'via', layer: 'L1', x: mm(30), y: mm(25.4), diameter: mm(0.8), drill: mm(0.4) },
    { id: 'z1', kind: 'zone', layer: 'L2', points: zoneFill[0][0], net: 'GND' },
    { id: 'x1', kind: 'text', layer: 'L0', x: mm(60), y: mm(10), text: 'Hello <b>PCB</b>', font: 'Arial', fontSize: mm(2), rotation: 0, textType: 'TEXT', color: '#fff' },
  ];
  doc.items = items;
  return doc;
}

const fills = new Map([['z1', zoneFill]]);

function gerbers(doc = board()) {
  const files = gerberFiles(doc, { project: 'demo', zoneFills: fills });
  const get = (suffix: string) => files.find((f) => f.name === `demo-${suffix}`)!.content;
  return { files, get };
}

describe('gerber', () => {
  it('writes all layers with a valid header and footer', () => {
    const { files } = gerbers();
    expect(files.map((f) => f.name)).toEqual([
      'demo-F_Cu.gtl',
      'demo-B_Cu.gbl',
      'demo-F_Mask.gts',
      'demo-B_Mask.gbs',
      'demo-F_Silkscreen.gto',
      'demo-B_Silkscreen.gbo',
      'demo-Edge_Cuts.gm1',
    ]);
    for (const f of files) {
      expect(f.content).toContain('%FSLAX46Y46*%');
      expect(f.content).toContain('%MOMM*%');
      expect(f.content).toContain('%TF.GenerationSoftware,BlackBoard,Next,3.0*%');
      expect(f.content.trimEnd().endsWith('M02*')).toBe(true);
      const lines = f.content.trimEnd().split('\n');
      for (const l of lines) expect(l, `${f.name}: ${l}`).toMatch(/[*%]$/);
      // every selected aperture is defined
      const defined = new Set([...f.content.matchAll(/%ADD(\d+)/g)].map((m) => m[1]));
      for (const l of lines) {
        const m = /^D(\d+)\*$/.exec(l);
        if (m) expect(defined.has(m[1]), `${f.name}: D${m[1]}`).toBe(true);
      }
    }
  });

  it('declares the file functions', () => {
    const { get } = gerbers();
    expect(get('F_Cu.gtl')).toContain('%TF.FileFunction,Copper,L1,Top*%');
    expect(get('B_Cu.gbl')).toContain('%TF.FileFunction,Copper,L2,Bot*%');
    expect(get('F_Mask.gts')).toContain('%TF.FileFunction,Soldermask,Top*%');
    expect(get('F_Mask.gts')).toContain('%TF.FilePolarity,Negative*%');
    expect(get('B_Silkscreen.gbo')).toContain('%TF.FileFunction,Legend,Bot*%');
    expect(get('Edge_Cuts.gm1')).toContain('%TF.FileFunction,Profile,NP*%');
  });

  it('flashes THT pads on both copper layers at flipped coordinates', () => {
    const { get } = gerbers();
    for (const cu of [get('F_Cu.gtl'), get('B_Cu.gbl')]) {
      expect(cu).toMatch(/%ADD\d+R,1\.600000X1\.600000\*%/);
      expect(cu).toContain('X12700000Y54600000D03*');
      // R10 is turned by 90° clockwise: pad 2 lies below pad 1 on screen
      expect(cu).toContain('X12700000Y26660000D03*');
    }
  });

  it('puts bottom SMD pads only on the bottom layers', () => {
    const { get } = gerbers();
    const pad1 = 'X50000000Y39050000D03*';
    const pad2 = 'X50000000Y40950000D03*';
    for (const f of ['B_Cu.gbl', 'B_Mask.gbs']) {
      expect(get(f)).toContain(pad1);
      expect(get(f)).toContain(pad2);
    }
    for (const f of ['F_Cu.gtl', 'F_Mask.gts']) {
      expect(get(f)).not.toContain(pad1);
      expect(get(f)).not.toContain(pad2);
    }
    // rect turned by 90°: width and height swap; the roundrect needs the macro
    expect(get('B_Cu.gbl')).toMatch(/%ADD\d+R,1\.250000X1\.000000\*%/);
    expect(get('B_Cu.gbl')).toContain('%AMRoundRect*');
    expect(get('B_Cu.gbl')).toContain('%TA.AperFunction,SMDPad,CuDef*%');
  });

  it('draws tracks and vias, vias are tented', () => {
    const { get } = gerbers();
    const top = get('F_Cu.gtl');
    expect(top).toMatch(/%ADD\d+C,0\.300000\*%/);
    expect(top).toContain('X30000000Y54600000D01*');
    expect(top).toMatch(/%ADD\d+C,0\.800000\*%/);
    for (const f of ['F_Cu.gtl', 'B_Cu.gbl']) expect(get(f)).toContain('X30000000Y54600000D03*');
    for (const f of ['F_Mask.gts', 'B_Mask.gbs']) expect(get(f)).not.toContain('X30000000Y54600000D03*');
    // mask openings are expanded by 0.05 mm per side
    expect(get('F_Mask.gts')).toMatch(/%ADD\d+R,1\.700000X1\.700000\*%/);
    // the non plated hole opens the mask on both sides
    expect(get('F_Mask.gts')).toMatch(/%ADD\d+C,3\.300000\*%/);
    expect(get('B_Mask.gbs')).toMatch(/%ADD\d+C,3\.300000\*%/);
  });

  it('writes zone fills first as regions with clear holes', () => {
    const { get } = gerbers();
    const bot = get('B_Cu.gbl');
    expect(bot).toContain('G36*');
    expect(bot).toContain('G37*');
    expect(bot).toContain('%LPC*%');
    expect(bot.indexOf('G36*')).toBeLessThan(bot.indexOf('D03*'));
    expect(bot.indexOf('%LPC*%')).toBeLessThan(bot.lastIndexOf('%LPD*%'));
    expect(bot).toContain('X60000000Y30000000D02*');
    expect(get('F_Cu.gtl')).not.toContain('G36*');
  });

  it('rotated pads use outline macros', () => {
    const doc = board();
    const fp = doc.items.find((i): i is FootprintItem => i.kind === 'footprint' && i.name === 'C1')!;
    fp.rotation = 45;
    const { get } = gerbers(doc);
    expect(get('B_Cu.gbl')).toContain('%AMRotRect*');
    expect(get('B_Cu.gbl')).toMatch(/%ADD\d+RotRect,(-?\d+\.\d{6}X){7}-?\d+\.\d{6}\*%/);
  });

  it('writes silkscreen with designators, arcs and texts', () => {
    const { get } = gerbers();
    const top = get('F_Silkscreen.gto');
    expect(top).toContain('D01*');
    expect(top).toMatch(/G0[23]\*/);
    expect(top).toMatch(/%ADD\d+C,0\.150000\*%/);
    const bottom = get('B_Silkscreen.gbo');
    expect(bottom).toContain('D01*');
    expect(bottom).not.toEqual(top);
  });

  it('writes the board outline with rounded corners', () => {
    const doc = board();
    const plain = gerbers(doc).get('Edge_Cuts.gm1');
    expect(plain).toContain('X0Y80000000D02*');
    expect(plain).not.toContain('G02*');
    doc.pcb!.cornerRadius = mm(2);
    const round = gerbers(doc).get('Edge_Cuts.gm1');
    expect(round.match(/G02\*/g)).toHaveLength(4);
    expect(round).toContain('X98000000Y80000000D01*');
    expect(round).toMatch(/%ADD\d+C,0\.100000\*%/);
  });
});

describe('drill', () => {
  it('writes plated and non plated holes', () => {
    const [pth, npth] = drillFiles(board(), 'demo');
    expect(pth.name).toBe('demo-PTH.drl');
    expect(npth.name).toBe('demo-NPTH.drl');
    expect(pth.content.startsWith('M48\n')).toBe(true);
    expect(pth.content).toContain('METRIC,TZ');
    expect(pth.content).toContain('T1C0.400\nT2C0.800\n');
    expect(pth.content.match(/^X/gm)).toHaveLength(7);
    expect(pth.content).toContain('X12.700Y54.600');
    expect(pth.content).toContain('X30.000Y54.600');
    expect(pth.content.trimEnd().endsWith('M30')).toBe(true);
    expect(npth.content).toContain('T1C3.200');
    expect(npth.content.match(/^X/gm)).toHaveLength(1);
    expect(npth.content).toContain('X5.000Y5.000');
  });
});

describe('assembly', () => {
  it('writes pick and place rows', () => {
    const lines = pickAndPlaceCsv(board()).trim().split('\n');
    expect(lines[0]).toBe('Designator,Value,Package,PosX,PosY,Rotation,Side');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['"C1"', '"H1"', '"R1"', '"R2"', '"R10"']);
    expect(lines).toContain('"C1","100n","C_0805",50.0000,40.0000,270,bottom');
    expect(lines).toContain('"R1","10k","R_Axial_P7.62mm",12.7000,54.6000,0,top');
    expect(lines.find((l) => l.startsWith('"R10"'))).toContain(',270,top');
  });

  it('groups the BOM by value and footprint', () => {
    const lines = bomCsv(board()).trim().split('\n');
    expect(lines[0]).toBe('"Designators","Quantity","Value","Footprint"');
    expect(lines).toContain('"R1, R2, R10",3,"10k","R_Axial_P7.62mm"');
    expect(lines).toContain('"C1",1,"100n","C_0805"');
    expect(lines).toHaveLength(4);
  });
});

describe('fabrication zip', () => {
  it('bundles every file', () => {
    const zip = unzipSync(fabricationZip(board(), { project: 'My Board', zoneFills: fills }));
    const names = Object.keys(zip).sort();
    expect(names).toEqual(
      [
        'My_Board-F_Cu.gtl',
        'My_Board-B_Cu.gbl',
        'My_Board-F_Mask.gts',
        'My_Board-B_Mask.gbs',
        'My_Board-F_Silkscreen.gto',
        'My_Board-B_Silkscreen.gbo',
        'My_Board-Edge_Cuts.gm1',
        'My_Board-PTH.drl',
        'My_Board-NPTH.drl',
        'My_Board-pos.csv',
        'My_Board-bom.csv',
        'README.txt',
      ].sort(),
    );
    const readme = strFromU8(zip['README.txt']);
    expect(readme).toContain('My_Board-F_Cu.gtl');
    expect(readme).toContain('Top copper');
    expect(strFromU8(zip['My_Board-F_Cu.gtl'])).toContain('X12700000Y54600000D03*');
  });
});

describe('stroke font', () => {
  it('draws designators', () => {
    const h = mm(1);
    const segs = strokeText('R1', 0, 0, h);
    expect(segs.length).toBeGreaterThan(4);
    const w = strokeTextWidth('R1', h);
    expect(w).toBeGreaterThan(h);
    for (const s of segs) {
      for (const [x, y] of [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(-1e-9);
        expect(x).toBeLessThanOrEqual(w + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-h - 1e-9);
        expect(y).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('covers printable ASCII', () => {
    for (let c = 33; c <= 126; c++) expect(strokeText(String.fromCharCode(c), 0, 0, 10).length, String.fromCharCode(c)).toBeGreaterThan(0);
  });

  it('anchors, mirrors and rotates', () => {
    const h = 6;
    const mid = strokeText('AB', 0, 0, h, { anchor: 'middle', valign: 'middle' });
    const xs = mid.flatMap((s) => [s.x1, s.x2]);
    const ys = mid.flatMap((s) => [s.y1, s.y2]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0);
    const mirrored = strokeText('L', 0, 0, h, { mirror: true });
    expect(Math.max(...mirrored.flatMap((s) => [s.x1, s.x2]))).toBeCloseTo(0);
    const turned = strokeText('I', 0, 0, h, { rotation: 90 });
    // clockwise: the glyph now extends to the right of the baseline point
    expect(Math.max(...turned.flatMap((s) => [s.x1, s.x2]))).toBeCloseTo(h);
  });
});

describe('etching', () => {
  it('writes a 1:1 SVG', () => {
    const doc = board();
    const top = etchingSvg(doc, 'top', { zoneFills: fills });
    expect(top).toContain('width="100mm"');
    expect(top).toContain('height="80mm"');
    expect(top).toContain('viewBox="0 0 100 80"');
    expect(top).toContain('scale(-1 1)');
    const bottom = etchingSvg(doc, 'bottom', { zoneFills: fills });
    expect(bottom).not.toContain('scale(-1 1)');
    expect(bottom).toContain('fill-rule="evenodd"');
    expect(bottom).toContain('<circle cx="30" cy="25.4" r="0.2"/>');
    expect(etchingSvg(doc, 'bottom', { mirror: true })).toContain('scale(-1 1)');
  });
});
