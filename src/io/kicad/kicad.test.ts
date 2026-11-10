// Tests for the KiCad interoperability: S-expression parser and writer, .kicad_mod
// import (KiCad 5 and 7/8 syntax) and export, and the KiCad netlist of a schematic.

import { describe, expect, it } from 'vitest';
import type { FootprintDef, FootprintGraphic, PadDef } from '../../model/types.ts';
import { CircuitBuilder } from '../../learn/build.ts';
import { librarySymbols } from '../../learn/testing.ts';
import { FOOTPRINTS, footprintById } from '../../pcb/footprints/index.ts';
import { padShapeLocal } from '../../pcb/geometry.ts';
import { mm, toMm } from '../../pcb/units.ts';
import { find, findAll, fmtNum, num, parseSexpr, q, SexprError, str, writeSexpr, type SExpr } from './sexpr.ts';
import { guessCategory, kicadFootprintFileName, parseKicadFootprint, parseKicadFootprints, writeKicadFootprint } from './footprint.ts';
import { buildKicadNetlist, kicadFootprintId, kicadNetlist, stableUuid } from './netlist.ts';

const close = (u: number, mmValue: number) => expect(toMm(u)).toBeCloseTo(mmValue, 5);
const padAt = (fp: FootprintDef, n: string) => {
  const p = fp.pads.find((x) => x.num === n);
  if (!p) throw new Error(`no pad ${n}`);
  return p;
};
const norm360 = (a: number) => ((a % 360) + 360) % 360;

// ---- realistic KiCad files -----------------------------------------------------------------

const R_AXIAL = `(footprint "R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal" (version 20221018) (generator pcbnew)
  (layer "F.Cu")
  (descr "Resistor, Axial_DIN0207 series, Axial, Horizontal, pin pitch=10.16mm, 0.25W = 1/4W, length*diameter=6.3*2.5mm^2")
  (tags "Resistor Axial_DIN0207 series Axial Horizontal pin pitch 10.16mm 0.25W = 1/4W length 6.3mm diameter 2.5mm")
  (attr through_hole)
  (fp_text reference "REF**" (at 5.08 -2.37) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15)))
    (tstamp 3d5b0f43-58f1-4a11-a4b6-0e3c3a0c8e01)
  )
  (fp_text value "R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal" (at 5.08 2.37) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15)))
    (tstamp 9a1f4c2e-7d3b-4e55-8c1a-2b6e0f9d4a10)
  )
  (fp_text user "\${REFERENCE}" (at 5.08 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15)))
    (tstamp 0c7e2d11-46aa-4f0b-b5f3-6e8d9a1c2b30)
  )
  (fp_line (start 1.04 0) (end 1.81 0) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000001))
  (fp_line (start 1.81 -1.37) (end 1.81 1.37) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000002))
  (fp_line (start 1.81 -1.37) (end 8.35 -1.37) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000003))
  (fp_line (start 1.81 1.37) (end 8.35 1.37) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000004))
  (fp_line (start 8.35 -1.37) (end 8.35 1.37) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000005))
  (fp_line (start 9.12 0) (end 8.35 0) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (tstamp 1b2c3d4e-0000-4000-8000-000000000006))
  (fp_line (start -1.05 -1.5) (end -1.05 1.5) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (tstamp 1b2c3d4e-0000-4000-8000-000000000007))
  (fp_line (start -1.05 1.5) (end 11.21 1.5) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (tstamp 1b2c3d4e-0000-4000-8000-000000000008))
  (fp_line (start 11.21 -1.5) (end -1.05 -1.5) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (tstamp 1b2c3d4e-0000-4000-8000-000000000009))
  (fp_line (start 11.21 1.5) (end 11.21 -1.5) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (tstamp 1b2c3d4e-0000-4000-8000-00000000000a))
  (fp_rect (start 1.93 -1.25) (end 8.23 1.25) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab") (tstamp 1b2c3d4e-0000-4000-8000-00000000000b))
  (fp_line (start 0 0) (end 1.93 0) (stroke (width 0.1) (type solid)) (layer "F.Fab") (tstamp 1b2c3d4e-0000-4000-8000-00000000000c))
  (fp_line (start 10.16 0) (end 8.23 0) (stroke (width 0.1) (type solid)) (layer "F.Fab") (tstamp 1b2c3d4e-0000-4000-8000-00000000000d))
  (pad "1" thru_hole rect (at 0 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask") (tstamp 1b2c3d4e-0000-4000-8000-00000000000e))
  (pad "2" thru_hole oval (at 10.16 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask") (tstamp 1b2c3d4e-0000-4000-8000-00000000000f))
  (model "\${KICAD7_3DMODEL_DIR}/Resistor_THT.3dshapes/R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal.wrl"
    (offset (xyz 0 0 0))
    (scale (xyz 1 1 1))
    (rotate (xyz 0 0 0))
  )
)
`;

const SOIC_PADS: [string, number, number][] = [
  ['1', -2.475, -1.905], ['2', -2.475, -0.635], ['3', -2.475, 0.635], ['4', -2.475, 1.905],
  ['5', 2.475, 1.905], ['6', 2.475, 0.635], ['7', 2.475, -0.635], ['8', 2.475, -1.905],
];

/** KiCad 8 syntax: designator as a property, uuids, filled pin 1 marker */
const SOIC8 = `(footprint "SOIC-8_3.9x4.9mm_P1.27mm"
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (layer "F.Cu")
  (descr "SOIC, 8 Pin (JEDEC MS-012AA), generated with kicad-footprint-generator ipc_gullwing_generator.py")
  (tags "SOIC SO")
  (property "Reference" "REF**"
    (at 0 -3.4 0)
    (layer "F.SilkS")
    (uuid "a5a4b2a4-2bfc-4a0f-9b25-7f5c8f8c5c11")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (property "Value" "SOIC-8_3.9x4.9mm_P1.27mm"
    (at 0 3.4 0)
    (layer "F.Fab")
    (uuid "b1c2d3e4-0000-4000-8000-000000000001")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (property "Footprint" "" (at 0 0 0) (unlocked yes) (layer "F.Fab") (hide yes)
    (uuid "b1c2d3e4-0000-4000-8000-000000000002")
    (effects (font (size 1.27 1.27)))
  )
  (attr smd)
  (fp_line (start 0 -2.56) (end -1.95 -2.56) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "c0000000-0000-4000-8000-000000000001"))
  (fp_line (start 0 -2.56) (end 1.95 -2.56) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "c0000000-0000-4000-8000-000000000002"))
  (fp_line (start 0 2.56) (end -1.95 2.56) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "c0000000-0000-4000-8000-000000000003"))
  (fp_line (start 0 2.56) (end 1.95 2.56) (stroke (width 0.12) (type solid)) (layer "F.SilkS") (uuid "c0000000-0000-4000-8000-000000000004"))
  (fp_poly
    (pts (xy -2.7 -2.47) (xy -2.94 -2.8) (xy -2.46 -2.8) (xy -2.7 -2.47))
    (stroke (width 0.12) (type solid))
    (fill solid)
    (layer "F.SilkS")
    (uuid "c0000000-0000-4000-8000-000000000005")
  )
  (fp_line (start -3.7 -2.7) (end -3.7 2.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "c0000000-0000-4000-8000-000000000006"))
  (fp_line (start -3.7 2.7) (end 3.7 2.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "c0000000-0000-4000-8000-000000000007"))
  (fp_line (start 3.7 -2.7) (end -3.7 -2.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "c0000000-0000-4000-8000-000000000008"))
  (fp_line (start 3.7 2.7) (end 3.7 -2.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd") (uuid "c0000000-0000-4000-8000-000000000009"))
  (fp_poly
    (pts (xy -0.975 -2.45) (xy 1.95 -2.45) (xy 1.95 2.45) (xy -1.95 2.45) (xy -1.95 -1.475))
    (stroke (width 0.1) (type solid))
    (fill none)
    (layer "F.Fab")
    (uuid "c0000000-0000-4000-8000-00000000000a")
  )
  (fp_text user "\${REFERENCE}" (at 0 0 0) (layer "F.Fab") (uuid "c0000000-0000-4000-8000-00000000000b")
    (effects (font (size 0.98 0.98) (thickness 0.15)))
  )
${SOIC_PADS.map(([n, x, y]) => `  (pad "${n}" smd roundrect (at ${x} ${y}) (size 1.95 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (uuid "d0000000-0000-4000-8000-00000000000${n}"))`).join('\n')}
  (model "\${KICAD8_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.wrl"
    (offset (xyz 0 0 0))
    (scale (xyz 1 1 1))
    (rotate (xyz 0 0 0))
  )
)
`;

const MOUNTING_HOLE = `(footprint "MountingHole_3.2mm_M3" (version 20221018) (generator pcbnew)
  (layer "F.Cu")
  (descr "Mounting Hole 3.2mm, no annular, M3")
  (tags "mounting hole 3.2mm no annular m3")
  (attr exclude_from_pos_files exclude_from_bom)
  (fp_text reference "REF**" (at 0 -4.2) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text value "MountingHole_3.2mm_M3" (at 0 4.2) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text user "\${REFERENCE}" (at 0.3 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_circle (center 0 0) (end 3.2 0) (stroke (width 0.15) (type solid)) (fill none) (layer "Cmts.User"))
  (fp_circle (center 0 0) (end 3.45 0) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))
  (pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "F&B.Cu" "*.Mask"))
)
`;

/** rotated pads, three point arcs, a slot, custom / trapezoid / paste-only pads, bottom silk */
const MIXED = `(footprint "Test_Mixed" (version 20221018) (generator pcbnew)
  (layer "F.Cu")
  (attr smd)
  (fp_text reference "REF**" (at 0 -4) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_arc (start -1 0) (mid 1 -2) (end 3 0) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
  (fp_arc (start -1 0) (mid 1 2) (end 3 0) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
  (fp_circle (center 0 0) (end 0.5 0) (stroke (width 0.12) (type solid)) (fill solid) (layer "F.SilkS"))
  (fp_line (start -5 5) (end 5 5) (stroke (width 0.12) (type solid)) (layer "B.SilkS"))
  (fp_rect (start -4 -3) (end 4 3) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))
  (pad "1" smd rect (at 0 -2 90) (size 2 1) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd oval (at 2 0 30) (size 2 1) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "3" thru_hole oval (at -2 0) (size 1.8 3) (drill oval 1 2.2) (layers "*.Cu" "*.Mask"))
  (pad "4" smd custom (at 0 2) (size 1 1) (layers "F.Cu" "F.Paste" "F.Mask")
    (options (clearance outline) (anchor circle))
    (primitives
      (gr_poly (pts (xy -1 -0.5) (xy 1 -0.5) (xy 1 0.5) (xy -1 0.5)) (width 0) (fill yes))
    )
  )
  (pad "" smd roundrect (at 3 3) (size 0.5 0.5) (layers "F.Paste") (roundrect_rratio 0.25))
  (pad "5" smd trapezoid (at -3 3) (size 1 0.8) (rect_delta 0 0.2) (layers "F.Cu" "F.Mask"))
)
`;

/** KiCad 5 legacy syntax: (module …), unquoted atoms, (width …), centre/start/angle arcs */
const LED_KICAD5 = `(module LED_D5.0mm (layer F.Cu) (tedit 5995936A)
  (descr "LED, diameter 5.0mm, 2 pins")
  (tags "LED diameter 5.0mm 2 pins")
  (fp_text reference REF** (at 1.27 -3.96) (layer F.SilkS)
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text value LED_D5.0mm (at 1.27 3.96) (layer F.Fab)
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text user %R (at 1.25 0) (layer F.Fab)
    (effects (font (size 0.8 0.8) (thickness 0.2)))
  )
  (fp_arc (start 1.27 0) (end -1.23 -1.469694) (angle 299.1) (layer F.Fab) (width 0.1))
  (fp_arc (start 1.27 0) (end -1.29 -1.54483) (angle 148.9) (layer F.SilkS) (width 0.12))
  (fp_arc (start 1.27 0) (end -1.29 1.54483) (angle -148.9) (layer F.SilkS) (width 0.12))
  (fp_circle (center 1.27 0) (end 3.77 0) (layer F.Fab) (width 0.1))
  (fp_line (start -1.29 -1.545) (end -1.29 1.545) (layer F.SilkS) (width 0.12))
  (fp_line (start -1.95 -3.25) (end -1.95 3.25) (layer F.CrtYd) (width 0.05))
  (fp_line (start -1.95 3.25) (end 4.5 3.25) (layer F.CrtYd) (width 0.05))
  (fp_line (start 4.5 3.25) (end 4.5 -3.25) (layer F.CrtYd) (width 0.05))
  (fp_line (start 4.5 -3.25) (end -1.95 -3.25) (layer F.CrtYd) (width 0.05))
  (fp_poly (pts (xy 0 -3) (xy 0.5 -3.5) (xy -0.5 -3.5)) (layer F.SilkS) (width 0.1))
  (pad 1 thru_hole rect (at 0 0) (size 1.8 1.8) (drill 0.9) (layers *.Cu *.Mask))
  (pad 2 thru_hole circle (at 2.54 0) (size 1.8 1.8) (drill 0.9) (layers *.Cu *.Mask))
  (model \${KISYS3DMOD}/LED_THT.3dshapes/LED_D5.0mm.wrl
    (at (xyz 0 0 0))
    (scale (xyz 1 1 1))
    (rotate (xyz 0 0 0))
  )
)
`;

/** point on an arc graphic at a fraction of its sweep, in mm */
function arcPoint(g: FootprintGraphic, t: number) {
  if (g.kind !== 'arc') throw new Error('arc expected');
  const a = ((g.start + g.sweep * t) * Math.PI) / 180;
  return { x: toMm(g.cx + g.r * Math.cos(a)), y: toMm(g.cy + g.r * Math.sin(a)) };
}

// ---- S-expressions ----------------------------------------------------------------------------

describe('sexpr', () => {
  it('parses nested lists, symbols, numbers and quoted strings with escapes', () => {
    const [e] = parseSexpr('\ufeff(a b 1.5 -2 "x \\"y\\" \\\\ z\\n" (c (d)) "" "(not a list)")');
    expect(e).toEqual(['a', 'b', '1.5', '-2', 'x "y" \\ z\n', ['c', ['d']], '', '(not a list)']);
    const list = e as SExpr[];
    expect(num(list, 2)).toBe(1.5);
    expect(num(list, 3)).toBe(-2);
    expect(num(list, 1)).toBeUndefined();
    expect(str(list, 1)).toBe('b');
    expect(find(list, 'c')).toEqual(['c', ['d']]);
    expect(findAll(parseSexpr('(r (x 1) (y 2) (x 3))')[0] as SExpr[], 'x')).toEqual([['x', '1'], ['x', '3']]);
    // hex / octal escapes, unknown escapes stay literal (unescaped Windows paths)
    expect(parseSexpr('"\\x41\\101 C:\\Users"')).toEqual(['AA C:\\Users']);
    expect(parseSexpr('  ')).toEqual([]);
  });

  it('reports unbalanced input with its position', () => {
    expect(() => parseSexpr('(a\n  (b c)')).toThrow(SexprError);
    expect(() => parseSexpr('(a\n  (b c)')).toThrow(/missing "\)" \(line 1, column 1\)/);
    expect(() => parseSexpr('(a))')).toThrow(/unexpected "\)" \(line 1, column 4\)/);
    expect(() => parseSexpr('(a "open)')).toThrow(/unterminated string/);
  });

  it('writes quoted strings, numbers without exponents and parses its own output back', () => {
    expect(fmtNum(1.5)).toBe('1.5');
    expect(fmtNum(-0.0000001)).toBe('0');
    expect(fmtNum(1e-6)).toBe('0.000001');
    expect(fmtNum(10)).toBe('10');
    expect(fmtNum(2.54 / 3)).toBe('0.846667');
    const tricky = 'say "hi" \\ \n tab\t (paren)';
    const text = writeSexpr(['root', ['name', q(tricky)], ['v', 0.1 + 0.2], ['sym', 'F.Cu'], ...Array.from({ length: 20 }, (_, i) => ['item', i])]);
    expect(text.split('\n').length).toBeGreaterThan(1);
    const [back] = parseSexpr(text) as SExpr[][];
    expect(str(find(back, 'name'), 1)).toBe(tricky);
    expect(str(find(back, 'v'), 1)).toBe('0.3');
    expect(findAll(back, 'item')).toHaveLength(20);
  });
});

// ---- footprint import ---------------------------------------------------------------------------

describe('parseKicadFootprint', () => {
  it('reads a KiCad 7 axial resistor', () => {
    const fp = parseKicadFootprint(R_AXIAL, 'R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal.kicad_mod');
    expect(fp.id).toBe('KiCad:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal');
    expect(fp.name).toBe('R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal');
    expect(fp.description).toMatch(/^Resistor, Axial_DIN0207 series/);
    expect(fp.category).toBe('Resistors');
    expect(fp.tags).toEqual(expect.arrayContaining(['Resistor', 'Axial_DIN0207', 'kicad', 'tht']));
    expect(fp.pads).toHaveLength(2);
    const [p1, p2] = [padAt(fp, '1'), padAt(fp, '2')];
    expect([p1.shape, p2.shape]).toEqual(['rect', 'oval']);
    close(p1.x, 0);
    close(p2.x, 10.16);
    close(p2.y, 0);
    close(p1.w, 1.6);
    close(p1.drill!, 0.8);
    expect(p1.rotation).toBeUndefined();
    // silk only: six lines; Fab and courtyard drawings are not silkscreen
    expect(fp.silk).toHaveLength(6);
    expect(fp.silk.every((g) => g.kind === 'line')).toBe(true);
    close(fp.silk[0].width, 0.12);
    close(fp.courtyard.x, -1.05);
    close(fp.courtyard.y, -1.5);
    close(fp.courtyard.w, 12.26);
    close(fp.courtyard.h, 3);
    close(fp.refPos!.x, 5.08);
    close(fp.refPos!.y, -2.37);
  });

  it('reads a KiCad 8 SOIC-8 with roundrect pads like the built-in one', () => {
    const fp = parseKicadFootprint(SOIC8);
    expect(fp.id).toBe('KiCad:SOIC-8_3.9x4.9mm_P1.27mm');
    expect(fp.category).toBe('ICs SMD');
    expect(fp.tags).toEqual(expect.arrayContaining(['SOIC', 'SO', 'smd']));
    expect(fp.pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    for (const [n, x, y] of SOIC_PADS) {
      const p = padAt(fp, n);
      close(p.x, x);
      close(p.y, y);
      expect(p.shape).toBe('roundrect');
      expect(p.roundness).toBe(0.25);
      expect(p.drill).toBeUndefined();
    }
    // same land pattern as our library footprint
    const builtIn = footprintById('SOIC-8_3.9x4.9mm_P1.27mm')!;
    for (const p of builtIn.pads) {
      const k = padAt(fp, p.num);
      expect(k.x).toBeCloseTo(p.x, 4);
      expect(k.y).toBeCloseTo(p.y, 4);
      expect(k.w).toBeCloseTo(p.w, 4);
      expect(k.h).toBeCloseTo(p.h, 4);
    }
    expect(fp.silk).toHaveLength(5);
    const marker = fp.silk.find((g) => g.kind === 'poly');
    expect(marker?.kind === 'poly' && marker.fill).toBe(true);
    close(fp.courtyard.x, -3.7);
    close(fp.courtyard.w, 7.4);
    close(fp.courtyard.y, -2.7);
    close(fp.courtyard.h, 5.4);
    // designator from (property "Reference" … (at …))
    close(fp.refPos!.x, 0);
    close(fp.refPos!.y, -3.4);
  });

  it('reads a mounting hole as a non plated hole without number', () => {
    const fp = parseKicadFootprint(MOUNTING_HOLE);
    expect(fp.category).toBe('Mechanical');
    expect(fp.pads).toHaveLength(1);
    const h = fp.pads[0];
    expect(h).toMatchObject({ num: '', shape: 'circle', npth: true });
    close(h.drill!, 3.2);
    close(h.w, 3.2);
    // Cmts.User is no silkscreen, the courtyard comes from the circle
    expect(fp.silk).toEqual([]);
    close(fp.courtyard.x, -3.45);
    close(fp.courtyard.w, 6.9);
  });

  it('converts pad angles, three point arcs, slots and special pad shapes', () => {
    const fp = parseKicadFootprint(MIXED);
    expect(fp.category).toBe('User');
    // the paste-only aperture has no copper
    expect(fp.pads.map((p) => p.num)).toEqual(['1', '2', '3', '4', '5']);
    // KiCad turns counter clockwise (on screen), our rotation is clockwise
    expect(padAt(fp, '1').rotation).toBe(270);
    const p2 = padAt(fp, '2');
    expect(p2.rotation).toBe(330);
    const ends = padShapeLocal(p2).pts.map((p) => ({ x: toMm(p.x), y: toMm(p.y) }));
    const right = ends.reduce((a, b) => (b.x > a.x ? b : a));
    // the right end of the oval is lifted (screen y up), as in KiCad
    expect(right.x).toBeCloseTo(2 + 0.5 * Math.cos(Math.PI / 6), 5);
    expect(right.y).toBeCloseTo(-0.5 * Math.sin(Math.PI / 6), 5);
    // oval drill: round drill of the smaller dimension, pad size kept, tagged as slot
    const slot = padAt(fp, '3');
    close(slot.drill!, 1);
    close(slot.w, 1.8);
    close(slot.h, 3);
    expect(fp.tags).toContain('slot');
    expect(fp.tags).toContain('tht');
    expect(padAt(fp, '4')).toMatchObject({ shape: 'circle' });
    close(padAt(fp, '4').w, 1);
    expect(padAt(fp, '5').shape).toBe('rect');
    close(padAt(fp, '5').h, 0.8);

    // B.SilkS of a top footprint is ignored
    expect(fp.silk.map((g) => g.kind)).toEqual(['arc', 'arc', 'circle']);
    const [over, under, dot] = fp.silk;
    for (const a of [over, under]) {
      if (a.kind !== 'arc') throw new Error('arc expected');
      close(a.cx, 1);
      close(a.cy, 0);
      close(a.r, 2);
      expect(a.sweep).toBeCloseTo(180, 6);
    }
    // left over the top to the right, and below
    expect(arcPoint(over, 0.5).y).toBeCloseTo(-2, 5);
    expect(arcPoint(under, 0.5).y).toBeCloseTo(2, 5);
    expect(over.kind === 'arc' && norm360(over.start)).toBeCloseTo(180, 6);
    expect(dot.kind === 'circle' && dot.fill).toBe(true);
    close(fp.courtyard.x, -4);
    close(fp.courtyard.w, 8);
    close(fp.courtyard.h, 6);
    close(fp.refPos!.y, -4);
  });

  it('reads a KiCad 5 module with (width …) and centre / angle arcs', () => {
    const fp = parseKicadFootprint(LED_KICAD5, 'LED_D5.0mm.kicad_mod');
    expect(fp.id).toBe('KiCad:LED_D5.0mm');
    expect(fp.category).toBe('LEDs');
    expect(fp.pads.map((p) => [p.num, p.shape])).toEqual([['1', 'rect'], ['2', 'circle']]);
    close(padAt(fp, '2').x, 2.54);
    close(padAt(fp, '2').drill!, 0.9);
    expect(fp.silk.map((g) => g.kind)).toEqual(['arc', 'arc', 'line', 'poly']);
    const [top, bottom, flat, mark] = fp.silk;
    for (const a of [top, bottom]) {
      if (a.kind !== 'arc') throw new Error('arc expected');
      close(a.cx, 1.27);
      close(a.cy, 0);
      close(a.r, Math.hypot(2.56, 1.54483));
      expect(a.sweep).toBeCloseTo(148.9, 6);
      close(a.width, 0.12);
    }
    // positive KiCad 5 angles turn clockwise on screen: the first arc runs over the top
    const t0 = arcPoint(top, 0);
    expect(t0.x).toBeCloseTo(-1.29, 4);
    expect(t0.y).toBeCloseTo(-1.54483, 4);
    expect(arcPoint(top, 0.5).y).toBeLessThan(-2);
    expect(arcPoint(bottom, 0.5).y).toBeGreaterThan(2);
    // both arcs end on the right
    expect(arcPoint(top, 1).y).toBeCloseTo(0, 2);
    expect(arcPoint(bottom, 0).y).toBeCloseTo(0, 2);
    close(flat.width, 0.12);
    // KiCad 5 polygons are filled
    expect(mark.kind === 'poly' && mark.fill).toBe(true);
    close(fp.courtyard.x, -1.95);
    close(fp.courtyard.w, 6.45);
    close(fp.courtyard.h, 6.5);
    close(fp.refPos!.x, 1.27);
    close(fp.refPos!.y, -3.96);
  });

  it('mirrors footprints drawn for the bottom back to the top view', () => {
    const text = `(footprint "Bottom_Test" (version 20221018) (generator pcbnew) (layer "B.Cu")
      (fp_text reference "REF**" (at 0 3) (layer "B.SilkS") (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
      (fp_line (start 0 1) (end 2 1) (stroke (width 0.12) (type solid)) (layer "B.SilkS"))
      (fp_line (start 0 5) (end 2 5) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
      (pad "1" smd rect (at 1 2 30) (size 1 0.5) (layers "B.Cu" "B.Paste" "B.Mask")))`;
    const fp = parseKicadFootprint(text);
    expect(fp.silk).toHaveLength(1);
    const l = fp.silk[0];
    expect(l.kind === 'line' && toMm(l.y1)).toBeCloseTo(-1, 6);
    const p = fp.pads[0];
    close(p.y, -2);
    expect(p.rotation).toBe(30);
    close(fp.refPos!.y, -3);
  });

  it('falls back to the file name, an automatic courtyard and designator', () => {
    const fp = parseKicadFootprint('(footprint "" (layer "F.Cu") (pad "1" smd rect (at 0 0) (size 1 2) (layers "F.Cu")))', 'My Part.kicad_mod');
    expect(fp.name).toBe('My Part');
    expect(fp.id).toBe('KiCad:My_Part');
    expect(fp.courtyard.w).toBeGreaterThan(mm(1));
    expect(fp.refPos!.y).toBeLessThan(fp.courtyard.y);
    expect(fp.tags).toContain('smd');
  });

  it('collects several files and reports the broken ones', () => {
    const r = parseKicadFootprints([
      { name: 'R.kicad_mod', text: R_AXIAL },
      { name: 'broken.kicad_mod', text: '(footprint "X" (pad "1" smd rect' },
      { name: 'board.kicad_pcb', text: '(kicad_pcb (version 20221018))' },
      { name: 'LED.kicad_mod', text: LED_KICAD5 },
    ]);
    expect(r.footprints.map((f) => f.name)).toEqual(['R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal', 'LED_D5.0mm']);
    expect(r.errors.map((e) => e.file)).toEqual(['broken.kicad_mod', 'board.kicad_pcb']);
    expect(r.errors[0].message).toMatch(/missing/);
    expect(r.errors[1].message).toMatch(/not a KiCad footprint/);
  });

  it('guesses library categories from names and tags', () => {
    expect(guessCategory('CP_Radial_D6.3mm_P2.50mm')).toBe('Capacitors');
    expect(guessCategory('DIP-8_W7.62mm')).toBe('ICs DIP');
    expect(guessCategory('TO-92_Inline')).toBe('Transistors');
    expect(guessCategory('PinHeader_1x02_P2.54mm_Vertical')).toBe('Connectors');
    expect(guessCategory('Crystal_HC49-U_Vertical')).toBe('Crystals');
    expect(guessCategory('Potentiometer_Bourns_3296W_Vertical')).toBe('Potentiometers');
    expect(guessCategory('SW_PUSH_6mm')).toBe('Switches');
    expect(guessCategory('D_DO-35_SOD27_P7.62mm_Horizontal')).toBe('Diodes');
    expect(guessCategory('Foo', 'zener diode')).toBe('Diodes');
    expect(guessCategory('Foo')).toBe('User');
  });
});

// ---- footprint export ----------------------------------------------------------------------------

function samePads(a: PadDef[], b: PadDef[]) {
  expect(b.map((p) => p.num)).toEqual(a.map((p) => p.num));
  a.forEach((p, i) => {
    const k = b[i];
    expect(k.shape).toBe(p.shape);
    expect(k.name).toBe(p.name);
    expect(!!k.npth).toBe(!!p.npth);
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(k[key]).toBeCloseTo(p[key], 4);
    expect(k.drill ?? 0).toBeCloseTo(p.drill ?? 0, 4);
    expect(norm360(k.rotation ?? 0)).toBeCloseTo(norm360(p.rotation ?? 0), 4);
    if (p.shape === 'roundrect') expect(k.roundness).toBeCloseTo(p.roundness ?? 0.25, 6);
  });
}

/** arcs with a positive sweep and the start in [0, 360) */
function normGraphic(g: FootprintGraphic): FootprintGraphic {
  if (g.kind !== 'arc') return g;
  if (Math.abs(g.sweep) >= 360) return { kind: 'circle', cx: g.cx, cy: g.cy, r: g.r, width: g.width };
  const start = g.sweep < 0 ? g.start + g.sweep : g.start;
  return { ...g, start: norm360(start), sweep: Math.abs(g.sweep) };
}

function sameSilk(a: FootprintGraphic[], b: FootprintGraphic[]) {
  expect(b.map((g) => normGraphic(g).kind)).toEqual(a.map((g) => normGraphic(g).kind));
  a.forEach((g0, i) => {
    const g = normGraphic(g0);
    const k = normGraphic(b[i]) as Record<string, unknown>;
    for (const [key, v] of Object.entries(g)) {
      if (typeof v === 'number') expect(k[key] as number).toBeCloseTo(v, 3);
      else if (key === 'pts') (v as { x: number; y: number }[]).forEach((p, j) => expect((k.pts as typeof p[])[j].x).toBeCloseTo(p.x, 4));
      else expect(k[key]).toEqual(v);
    }
  });
}

describe('writeKicadFootprint', () => {
  const ids = ['SOIC-8_3.9x4.9mm_P1.27mm', 'TO-220_Horizontal', 'TO-92_CBE', 'LED_5mm', 'LED_3mm', 'Crystal_HC49-4H', 'MountingHole_3.2mm_M3', 'Potentiometer_RK09_Vertical', 'TQFP-32_7x7mm_P0.8mm', 'CP_Elec_6.3x5.4'];

  it.each(ids)('round trips %s', (id) => {
    const def = footprintById(id)!;
    const text = writeKicadFootprint(def);
    expect(text.startsWith(`(footprint "${id}"`)).toBe(true);
    expect(text).toContain('(version 20221018)');
    const back = parseKicadFootprint(text, kicadFootprintFileName(def));
    expect(back.name).toBe(id);
    samePads(def.pads, back.pads);
    sameSilk(def.silk, back.silk);
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(back.courtyard[key]).toBeCloseTo(def.courtyard[key], 4);
    expect(back.refPos!.x).toBeCloseTo(def.refPos!.x, 4);
    expect(back.refPos!.y).toBeCloseTo(def.refPos!.y, 4);
  });

  it('keeps rotated pads, filled graphics, rectangles and the user footprint name', () => {
    const def: FootprintDef = {
      id: 'My_Footprint',
      name: 'My footprint',
      description: '',
      category: 'User',
      pads: [
        { num: '1', x: 0, y: 0, shape: 'roundrect', w: mm(2), h: mm(1), rotation: 30, roundness: 0.4 },
        { num: 'A2', x: mm(3), y: mm(-1), shape: 'oval', w: mm(1.2), h: mm(2.4), drill: mm(0.7), rotation: 90 },
        { num: '', x: mm(-3), y: 0, shape: 'circle', w: mm(2), h: mm(2), drill: mm(2), npth: true },
      ],
      silk: [
        { kind: 'rect', x: mm(-4), y: mm(-2), w: mm(8), h: mm(4), width: mm(0.15) },
        { kind: 'circle', cx: mm(1), cy: mm(1), r: mm(0.3), width: 0, fill: true },
        { kind: 'poly', pts: [{ x: 0, y: mm(-3) }, { x: mm(1), y: mm(-3) }, { x: mm(0.5), y: mm(-2.5) }], width: mm(0.1), fill: true },
        { kind: 'arc', cx: 0, cy: 0, r: mm(3), start: -30, sweep: -120, width: mm(0.15) },
      ],
      courtyard: { x: mm(-4.5), y: mm(-3.5), w: mm(9), h: mm(7) },
      tags: ['tht', 'test'],
    };
    const text = writeKicadFootprint(def);
    expect(text).toContain('(descr "My footprint")');
    expect(text).toContain('(at 0 0 330)');
    expect(text).toContain('(pad "" np_thru_hole circle');
    expect(kicadFootprintFileName(def)).toBe('My_Footprint.kicad_mod');
    const back = parseKicadFootprint(text);
    expect(back.name).toBe('My_Footprint');
    samePads(def.pads, back.pads);
    sameSilk(def.silk, back.silk);
    expect(back.tags).toEqual(expect.arrayContaining(['tht', 'test']));
  });

  it('exports imported KiCad footprints under their KiCad name', () => {
    const fp = parseKicadFootprint(R_AXIAL);
    const text = writeKicadFootprint(fp);
    expect(text.startsWith('(footprint "R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal"')).toBe(true);
    expect(kicadFootprintFileName(fp)).toBe('R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal.kicad_mod');
    samePads(fp.pads, parseKicadFootprint(text).pads);
  });

  it('writes every library footprint so that it parses back with the same pads', () => {
    for (const def of FOOTPRINTS) {
      const back = parseKicadFootprint(writeKicadFootprint(def));
      expect(back.pads.length, def.id).toBe(def.pads.length);
      expect(back.silk.length, def.id).toBe(def.silk.length);
    }
  });
});

// ---- netlist ----------------------------------------------------------------------------------------

/** 9 V battery, resistor and LED to ground, plus an inductor without KiCad equivalent */
function ledCircuit() {
  const b = new CircuitBuilder(librarySymbols());
  const bat = b.add('Battery', 'V1', { x: 96, y: 160 }, { pin: 1, value: '9V' });
  const r1 = b.add('R#', 'R1', { x: 192, y: 96 }, { value: '4k7 "1%" \\ x' });
  const led = b.add('Led rot', 'D1', { x: 352, y: 96 });
  b.wire(b.pin(bat, '+'), { x: b.pin(bat, '+').x, y: 96 }, b.pin(r1, 1));
  b.wire(b.pin(r1, 2), b.pin(led, 'A'));
  const k = b.pin(led, 'K');
  const minus = b.pin(bat, '-');
  b.wire(k, { x: k.x + 32, y: k.y }, { x: k.x + 32, y: minus.y + 32 }, { x: minus.x, y: minus.y + 32 }, minus);
  b.ground({ x: minus.x, y: minus.y + 32 });
  const r2 = b.add('R#', 'R2', { x: 192, y: 320 }, { value: '1k', props: { footprint: 'Package_DIP:DIP-8_W7.62mm' } });
  const r3 = b.add('R#', 'R3', { x: 192, y: 416 }, { value: '2k', props: { footprint: 'L_Radial_D8.0mm_P5.00mm' } });
  b.wire(b.pin(r2, 2), { x: b.pin(r2, 2).x + 16, y: b.pin(r2, 2).y }, { x: b.pin(r2, 2).x + 16, y: b.pin(r3, 2).y }, b.pin(r3, 2));
  return b.doc();
}

const nodesOf = (net: SExpr[]) => findAll(net, 'node').map((n) => [str(find(n, 'ref'), 1), str(find(n, 'pin'), 1)]);

describe('kicadNetlist', () => {
  const opts = { date: '2026-11-10T00:00:00Z', source: 'led.bb' };

  it('writes components, footprints and nets KiCad can import', () => {
    const r = buildKicadNetlist(ledCircuit(), 'LED "demo"', footprintById, opts);
    const text = r.netlist;
    // balanced: the whole file is one expression
    const top = parseSexpr(text);
    expect(top).toHaveLength(1);
    const root = top[0] as SExpr[];
    expect(root[0]).toBe('export');
    expect(str(find(root, 'version'), 1)).toBe('E');
    const design = find(root, 'design');
    expect(str(find(design, 'tool'), 1)).toBe('BlackBoard Next');
    expect(str(find(design, 'date'), 1)).toBe(opts.date);
    expect(str(find(design, 'source'), 1)).toBe('led.bb');
    expect(str(find(find(find(design, 'sheet'), 'title_block'), 'title'), 1)).toBe('LED "demo"');

    const comps = findAll(find(root, 'components'), 'comp');
    const byRef = new Map(comps.map((c) => [str(find(c, 'ref'), 1), c]));
    expect([...byRef.keys()]).toEqual(['D1', 'R1', 'R2', 'R3', 'V1']);
    const fpOf = (ref: string) => str(find(byRef.get(ref), 'footprint'), 1);
    expect(fpOf('R1')).toBe('Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal');
    expect(fpOf('D1')).toBe('LED_THT:LED_D5.0mm');
    expect(fpOf('V1')).toBe('TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal');
    // a KiCad id set on the symbol passes through, footprints without equivalent go to the BlackBoard library
    expect(fpOf('R2')).toBe('Package_DIP:DIP-8_W7.62mm');
    expect(fpOf('R3')).toBe('BlackBoard:L_Radial_D8.0mm_P5.00mm');
    expect(r.customFootprints).toEqual(['L_Radial_D8.0mm_P5.00mm']);
    // escaped value survives
    expect(str(find(byRef.get('R1'), 'value'), 1)).toBe('4k7 "1%" \\ x');
    expect(str(find(find(byRef.get('R1'), 'libsource'), 'part'), 1)).toBe('R#');
    const stamp = str(find(byRef.get('R1'), 'tstamps'), 1)!;
    expect(stamp).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(str(find(find(byRef.get('R1'), 'sheetpath'), 'tstamps'), 1)).toBe('/');

    const nets = findAll(find(root, 'nets'), 'net');
    expect(nets.map((n) => str(find(n, 'code'), 1))).toEqual(nets.map((_, i) => String(i + 1)));
    const byName = new Map(nets.map((n) => [str(find(n, 'name'), 1), n]));
    // the LED cathode is pad 1 (KiCad LED_D5.0mm), the battery minus pad 2
    expect(nodesOf(byName.get('GND')!)).toEqual([['D1', '1'], ['V1', '2']]);
    expect(nodesOf(byName.get('Net-(D1-Pad2)')!)).toEqual([['D1', '2'], ['R1', '2']]);
    expect(nodesOf(byName.get('Net-(R1-Pad1)')!)).toEqual([['R1', '1'], ['V1', '1']]);
    expect(nodesOf(byName.get('Net-(R2-Pad2)')!)).toEqual([['R2', '2'], ['R3', '2']]);
    expect(str(find(findAll(byName.get('GND'), 'node')[0], 'pinfunction'), 1)).toBe('K');
    for (const n of nets) expect(findAll(n, 'node').length).toBeGreaterThan(0);
    // every pin of every component is on exactly one net
    const all = nets.flatMap(nodesOf).map(([ref, pin]) => `${ref}.${pin}`);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(10);

    const parts = findAll(find(root, 'libparts'), 'libpart').map((p) => str(find(p, 'part'), 1));
    expect(parts).toEqual(['Battery', 'Led rot', 'R#']);
  });

  it('is deterministic for a fixed date', () => {
    expect(kicadNetlist(ledCircuit(), 'x', footprintById, opts)).toBe(kicadNetlist(ledCircuit(), 'x', footprintById, opts));
    expect(stableUuid('R1')).toBe(stableUuid('R1'));
    expect(stableUuid('R1')).not.toBe(stableUuid('R2'));
  });

  it('maps library footprints to KiCad library names', () => {
    expect(kicadFootprintId('R_Axial_P10.16mm')).toBe('Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal');
    expect(kicadFootprintId('DIP-8_W7.62mm')).toBe('Package_DIP:DIP-8_W7.62mm');
    expect(kicadFootprintId('DIP-40_W15.24mm')).toBe('Package_DIP:DIP-40_W15.24mm');
    expect(kicadFootprintId('TO-92_CBE')).toBe('Package_TO_SOT_THT:TO-92_Inline');
    expect(kicadFootprintId('CP_Radial_D6.3mm_P2.50mm')).toBe('Capacitor_THT:CP_Radial_D6.3mm_P2.50mm');
    expect(kicadFootprintId('C_Disc_P5.08mm')).toBe('Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm');
    expect(kicadFootprintId('LED_5mm')).toBe('LED_THT:LED_D5.0mm');
    expect(kicadFootprintId('PinHeader_1x02_P2.54mm')).toBe('Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical');
    expect(kicadFootprintId('PinHeader_2x20_P2.54mm')).toBe('Connector_PinHeader_2.54mm:PinHeader_2x20_P2.54mm_Vertical');
    expect(kicadFootprintId('TerminalBlock_1x02_P5.08mm')).toBe('TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal');
    expect(kicadFootprintId('TerminalBlock_1x03_P3.50mm')).toBe('TerminalBlock_Phoenix:TerminalBlock_Phoenix_PT-1,5-3-3.5-H_1x03_P3.50mm_Horizontal');
    expect(kicadFootprintId('R_0805')).toBe('Resistor_SMD:R_0805_2012Metric');
    expect(kicadFootprintId('SOIC-8_3.9x4.9mm_P1.27mm')).toBe('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
    expect(kicadFootprintId('SOIC-16W_7.5x10.3mm_P1.27mm')).toBe('Package_SO:SOIC-16W_7.5x10.3mm_P1.27mm');
    expect(kicadFootprintId('TQFP-44_10x10mm_P0.8mm')).toBe('Package_QFP:TQFP-44_10x10mm_P0.8mm');
    expect(kicadFootprintId('SOT-223')).toBe('BlackBoard:SOT-223');
    expect(kicadFootprintId('My part/v2')).toBe('BlackBoard:My_part_v2');
    // ours despite the colon: classic part footprints and user footprints the lookup knows
    expect(kicadFootprintId('Part:7805.xml')).toBe('BlackBoard:Part_7805.xml');
    const mine = { ...footprintById('R_0805')!, id: 'Mine:R' };
    expect(kicadFootprintId('Mine:R', (id) => (id === mine.id ? mine : undefined))).toBe('BlackBoard:Mine_R');
    expect(kicadFootprintId('Mine:R')).toBe('Mine:R');
    // imported KiCad footprints by name: KiCad searches its libraries
    const imported = parseKicadFootprint(R_AXIAL);
    expect(kicadFootprintId(imported.id, (id) => (id === imported.id ? imported : undefined))).toBe('R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal');
    // every built-in footprint gets a well-formed "Lib:Name"
    for (const f of FOOTPRINTS) expect(kicadFootprintId(f.id), f.id).toMatch(/^[A-Za-z0-9_.-]+:[^\s:"]+$/);
  });
});
