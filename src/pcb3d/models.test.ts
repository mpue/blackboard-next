// 3D model families, colours and board geometry (three.js core only, no WebGL).

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CopperSide, Doc, FootprintDef, FootprintItem } from '../model/types.ts';
import { FOOTPRINTS, footprintById } from '../pcb/footprints/index.ts';
import { mm } from '../pcb/units.ts';
import { boardHoles, buildBoard, faceGeometry, boardShape, viewPose } from './board.ts';
import { BOARD_THICKNESS, bandColors, bodyKind, componentBody, disposeModelCache, ledColor, type BodyKind } from './models.ts';
import { surfaceOf, textureSize } from './textures.ts';

const T = BOARD_THICKNESS;

function place(def: FootprintDef, o: { x?: number; y?: number; rotation?: number; side?: CopperSide; value?: string } = {}): FootprintItem {
  return { id: `fp-${def.id}`, kind: 'footprint', layer: 'top', x: mm(o.x ?? 20), y: mm(o.y ?? 20), rotation: o.rotation ?? 0, side: o.side ?? 'top', name: 'U1', value: o.value ?? '', footprint: def, nets: {} };
}

const lib = (id: string) => {
  const def = footprintById(id);
  if (!def) throw new Error(`no footprint ${id}`);
  return def;
};

const bounds = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('bodyKind', () => {
  const cases: [string, BodyKind][] = [
    ['R_Axial_P10.16mm', 'resistor'],
    ['R_Axial_Vertical_P2.54mm', 'resistor-vertical'],
    ['D_DO-35_P7.62mm', 'diode'],
    ['D_DO-41_P10.16mm', 'diode'],
    ['C_Disc_P5.08mm', 'disc-cap'],
    ['C_Rect_P5.00mm', 'film-cap'],
    ['CP_Radial_D6.3mm_P2.50mm', 'elco'],
    ['CP_Elec_6.3x5.4', 'elco-smd'],
    ['L_Axial_P10.16mm', 'inductor-axial'],
    ['L_Radial_D8.0mm_P5.00mm', 'inductor-radial'],
    ['LED_5mm', 'led'],
    ['LED_3mm', 'led'],
    ['LED_0805', 'chip-led'],
    ['TO-92_CBE', 'to92'],
    ['TO-220', 'to220'],
    ['TO-220_Horizontal', 'to220-horizontal'],
    ['DIP-8_W7.62mm', 'dip'],
    ['DIP-40_W15.24mm', 'dip'],
    ['SOIC-8_3.9x4.9mm_P1.27mm', 'soic'],
    ['TSSOP-20_4.4x6.5mm_P0.65mm', 'soic'],
    ['TQFP-44_10x10mm_P0.8mm', 'qfp'],
    ['SOT-23', 'sot'],
    ['SOT-23-5', 'sot'],
    ['SOT-223', 'sot223'],
    ['TO-252', 'dpak'],
    ['R_0805', 'chip-r'],
    ['C_0603', 'chip-c'],
    ['L_1210', 'chip-l'],
    ['D_SOD-123', 'smd-diode'],
    ['D_MiniMELF', 'melf'],
    ['Crystal_HC49-4H', 'crystal'],
    ['PinHeader_1x04_P2.54mm', 'header'],
    ['PinHeader_2x05_P2.54mm', 'header'],
    ['TerminalBlock_1x02_P5.08mm', 'terminal'],
    ['SW_PUSH_6mm', 'switch'],
    ['Potentiometer_Trimmer_P2.54mm', 'trimmer'],
    ['Potentiometer_RK09_Vertical', 'pot'],
    ['Buzzer_12x9.5RM7.6', 'buzzer'],
    ['TestPoint_THT_D1.0mm', 'testpoint'],
    ['MountingHole_3.2mm_M3', 'hole'],
    ['MountingHole_3.2mm_M3_Pad', 'hole'],
  ];
  it.each(cases)('%s -> %s', (id, kind) => {
    expect(bodyKind(lib(id))).toBe(kind);
    expect(bodyKind(place(lib(id)))).toBe(kind);
  });

  it('gives every library footprint a specific model', () => {
    expect(FOOTPRINTS.filter((f) => bodyKind(f) === 'generic').map((f) => f.id)).toEqual([]);
  });

  it('falls back on the category, then to a generic box', () => {
    const base = lib('R_Axial_P10.16mm');
    expect(bodyKind({ ...base, id: 'MyResistor' })).toBe('resistor');
    expect(bodyKind({ ...lib('R_0805'), id: 'Foo_0805x' })).toBe('chip-r');
    expect(bodyKind({ ...base, id: 'Weird', category: 'Misc' })).toBe('generic');
  });
});

describe('colours', () => {
  it('codes 4k7 as yellow violet red gold', () => {
    expect(bandColors('4k7')).toEqual(['#facc15', '#7c3aed', '#e02424', '#c9a227']);
    expect(bandColors('4.7k')).toEqual(bandColors('4k7'));
  });

  it('uses five bands for precision values and handles odd input', () => {
    expect(bandColors('10k 1%')).toHaveLength(5);
    expect(bandColors('100R')).toEqual(['#8b4513', '#000000', '#8b4513', '#c9a227']);
    expect(bandColors('0R')).toEqual(['#000000']);
    expect(bandColors('')).toEqual([]);
    expect(bandColors('abc')).toEqual([]);
  });

  it('codes inductors in µH', () => {
    // 100 µH: brown black brown, silver
    expect(bandColors('100u', 'inductor')).toEqual(['#8b4513', '#000000', '#8b4513', '#c0c0c0']);
  });

  it('picks LED colours from the value', () => {
    expect(ledColor('')).toBe(ledColor('red'));
    expect(ledColor('LED grün')).not.toBe(ledColor('red'));
    expect(ledColor('blue 5mm')).toBe(ledColor('blau'));
    expect(ledColor('infrared')).not.toBe(ledColor('red'));
  });
});

describe('componentBody', () => {
  // one representative footprint per family
  const byKind = new Map<BodyKind, FootprintDef>();
  for (const f of FOOTPRINTS) if (!byKind.has(bodyKind(f))) byKind.set(bodyKind(f), f);
  byKind.set('generic', { ...lib('DIP-8_W7.62mm'), id: 'Unknown', category: 'Misc' });

  it.each([...byKind].filter(([k]) => k !== 'hole'))('%s has a body above the board', (_kind, def) => {
    const o = componentBody(place(def, { value: '4k7' }));
    const b = bounds(o);
    expect(b.isEmpty()).toBe(false);
    expect(b.max.z).toBeGreaterThan(T / 2 + 0.1);
    let meshes = 0;
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) {
        meshes++;
        const pos = x.geometry.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      }
    });
    expect(meshes).toBeGreaterThan(0);
  });

  it('mounting holes have no body', () => {
    const o = componentBody(place(lib('MountingHole_3.2mm_M3')));
    expect(bounds(o).isEmpty()).toBe(true);
  });

  it('places the body at the footprint position', () => {
    const def = lib('SOIC-8_3.9x4.9mm_P1.27mm');
    const b = bounds(componentBody(place(def, { x: 30, y: 12 })));
    const c = b.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(30, 0);
    expect(c.y).toBeCloseTo(-12, 0);
  });

  it('turns with the rotation (clockwise, y down)', () => {
    const def = lib('R_Axial_P10.16mm');
    const flat = bounds(componentBody(place(def, { x: 20, y: 20 })));
    expect(flat.max.x - flat.min.x).toBeGreaterThan(9);
    expect(flat.max.y - flat.min.y).toBeLessThan(4);
    const turned = bounds(componentBody(place(def, { x: 20, y: 20, rotation: 90 })));
    expect(turned.max.y - turned.min.y).toBeGreaterThan(9);
    // pad 2 lies below pad 1 on the board (larger y): lower in 3D
    expect(turned.min.y).toBeLessThan(-25);
    expect(turned.max.y).toBeGreaterThan(-21);
  });

  it('hangs bottom side parts below the board, mirrored', () => {
    const def = lib('CP_Radial_D6.3mm_P2.50mm');
    const top = bounds(componentBody(place(def, { x: 20, y: 20 })));
    const bot = bounds(componentBody(place(def, { x: 20, y: 20, side: 'bottom' })));
    expect(top.max.z).toBeGreaterThan(10);
    expect(bot.min.z).toBeLessThan(-10);
    expect(bot.max.z).toBeLessThan(T / 2 + 1);
    // pad 2 is right of pad 1 on top, left of it on the bottom side
    expect(top.getCenter(new THREE.Vector3()).x).toBeGreaterThan(20);
    expect(bot.getCenter(new THREE.Vector3()).x).toBeLessThan(20);
  });

  it('merges a body into one mesh per material', () => {
    const o = componentBody(place(lib('PinHeader_1x10_P2.54mm')));
    let meshes = 0;
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) meshes++;
    });
    // plastic, gold pins, solder
    expect(meshes).toBe(3);
    disposeModelCache();
  });
});

describe('board', () => {
  const doc = (items: FootprintItem[] = [], cornerRadius = 0): Doc => ({
    width: mm(50),
    height: mm(30),
    type: 'PCB',
    layers: [],
    items,
    parts: {},
    pcb: {
      rules: { clearance: 1, trackWidth: 1, powerTrackWidth: 1, viaDiameter: 1, viaDrill: 1, minTrackWidth: 1, minDrill: 1, minAnnularRing: 1, edgeClearance: 1, copperLayers: 2 },
      cornerRadius: mm(cornerRadius),
    },
  });

  it('builds a slab with textured faces', () => {
    const b = buildBoard(doc([], 3));
    expect(b.width).toBeCloseTo(50);
    expect(b.height).toBeCloseTo(30);
    const box = bounds(b.group);
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(50);
    expect(box.min.y).toBeCloseTo(-30);
    expect(box.max.y).toBeCloseTo(0);
    expect(box.max.z - box.min.z).toBeCloseTo(T);
  });

  it('maps the face UVs onto the board rectangle, the bottom face looking down', () => {
    const shape = boardShape(doc([], 2));
    for (const bottom of [false, true]) {
      const g = faceGeometry(shape, 50, 30, bottom);
      const uv = g.getAttribute('uv');
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / 50);
        expect(uv.getY(i)).toBeCloseTo(1 + pos.getY(i) / 30);
      }
      g.computeVertexNormals();
      expect(Math.sign(g.getAttribute('normal').getZ(0))).toBe(bottom ? -1 : 1);
    }
  });

  it('cuts mounting holes inside the outline only', () => {
    const hole = lib('MountingHole_3.2mm_M3');
    const inside = place(hole, { x: 5, y: 5 });
    const outside = { ...place(hole, { x: 0.5, y: 5 }), id: 'h2' };
    const holes = boardHoles(doc([inside, outside]));
    expect(holes).toHaveLength(1);
    expect(holes[0].x).toBeCloseTo(5);
    expect(holes[0].y).toBeCloseTo(-5);
    expect(holes[0].r).toBeCloseTo(1.6);
    expect(boardShape(doc([inside])).holes).toHaveLength(1);
  });

  it('fits camera poses', () => {
    const box = new THREE.Box3(new THREE.Vector3(0, -30, -1), new THREE.Vector3(50, 0, 12));
    const size = { width: 50, height: 30 };
    const top = viewPose('top', box, size, 35, 1.5);
    expect(top.target.x).toBeCloseTo(25);
    expect(top.target.y).toBeCloseTo(-15);
    expect(top.position.z).toBeGreaterThan(40);
    expect(top.position.x).toBeCloseTo(25);
    // seen from below with +y up on screen the camera sits a hair towards +y
    const bottom = viewPose('bottom', box, size, 35, 1.5);
    expect(bottom.position.z).toBeLessThan(-40);
    expect(bottom.position.y).toBeGreaterThan(bottom.target.y);
    const iso = viewPose('iso', box, size, 35, 1.5);
    expect(iso.position.z).toBeGreaterThan(0);
    expect(iso.position.y).toBeLessThan(iso.target.y);
  });
});

describe('textures', () => {
  it('sizes the canvas at 12 px/mm, capped at 4096 px', () => {
    expect(textureSize(100, 80)).toEqual({ width: 1200, height: 960 });
    const big = textureSize(500, 250);
    expect(big.width).toBe(4096);
    expect(big.height).toBe(2048);
  });

  it('classifies the realistic palette', () => {
    const metal = (v: number) => v >> 8;
    expect(metal(surfaceOf(0xd7, 0xd9, 0xdb))).toBe(255); // tinned pad
    expect(metal(surfaceOf(0x14, 0x5c, 0x34))).toBe(0); // solder mask
    expect(metal(surfaceOf(0xf4, 0xf4, 0xf0))).toBe(0); // silkscreen
    expect(surfaceOf(0xf4, 0xf4, 0xf0) & 255).toBeGreaterThan(surfaceOf(0x14, 0x5c, 0x34) & 255);
  });
});
