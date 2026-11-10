// KiCad netlist (S-expression format "E" as written by Eeschema 6-8) of a
// schematic: components with KiCad library footprints, lib parts and nets.
// KiCad's PCB editor reads it with File > Import > Netlist.

import type { Doc } from '../../model/types.ts';
import { extractPcbNetlist, type FootprintLookup, type FromSchematicWarning, type PcbComponent } from '../../pcb/fromSchematic.ts';
import { KICAD_ID_PREFIX, kicadName } from './footprint.ts';
import { q, writeSexpr, type SOut } from './sexpr.ts';

export const BLACKBOARD_LIB = 'BlackBoard';

/** built-in footprint id -> KiCad library footprint (same pad numbering) */
export const KICAD_FOOTPRINTS: Record<string, string> = {
  'R_Axial_P7.62mm': 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal',
  'R_Axial_P10.16mm': 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal',
  'R_Axial_P12.70mm': 'Resistor_THT:R_Axial_DIN0309_L9.0mm_D3.2mm_P12.70mm_Horizontal',
  'R_Axial_P15.24mm': 'Resistor_THT:R_Axial_DIN0414_L11.9mm_D4.5mm_P15.24mm_Horizontal',
  'R_Axial_Vertical_P2.54mm': 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P2.54mm_Vertical',
  R_0402: 'Resistor_SMD:R_0402_1005Metric',
  R_0603: 'Resistor_SMD:R_0603_1608Metric',
  R_0805: 'Resistor_SMD:R_0805_2012Metric',
  R_1206: 'Resistor_SMD:R_1206_3216Metric',
  R_2512: 'Resistor_SMD:R_2512_6332Metric',
  'C_Disc_P2.54mm': 'Capacitor_THT:C_Disc_D3.8mm_W2.6mm_P2.50mm',
  'C_Disc_P5.08mm': 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
  'C_Rect_P5.00mm': 'Capacitor_THT:C_Rect_L7.2mm_W2.5mm_P5.00mm_FKS2_FKP2_MKS2_MKP2',
  'C_Rect_P7.50mm': 'Capacitor_THT:C_Rect_L10.0mm_W2.5mm_P7.50mm_MKS4',
  C_0402: 'Capacitor_SMD:C_0402_1005Metric',
  C_0603: 'Capacitor_SMD:C_0603_1608Metric',
  C_0805: 'Capacitor_SMD:C_0805_2012Metric',
  C_1206: 'Capacitor_SMD:C_1206_3216Metric',
  'CP_Elec_6.3x5.4': 'Capacitor_SMD:CP_Elec_6.3x5.4',
  'L_Axial_P10.16mm': 'Inductor_THT:L_Axial_L6.6mm_D2.7mm_P10.16mm_Horizontal_Vishay_IM-2',
  L_1210: 'Inductor_SMD:L_1210_3225Metric',
  'D_DO-35_P7.62mm': 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
  'D_DO-35_P10.16mm': 'Diode_THT:D_DO-35_SOD27_P10.16mm_Horizontal',
  'D_DO-41_P10.16mm': 'Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal',
  'D_DO-201_P15.24mm': 'Diode_THT:D_DO-201_P15.24mm_Horizontal',
  'D_SOD-123': 'Diode_SMD:D_SOD-123',
  D_SMA: 'Diode_SMD:D_SMA',
  D_SMB: 'Diode_SMD:D_SMB',
  D_MiniMELF: 'Diode_SMD:D_MiniMELF',
  LED_3mm: 'LED_THT:LED_D3.0mm',
  LED_5mm: 'LED_THT:LED_D5.0mm',
  LED_0603: 'LED_SMD:LED_0603_1608Metric',
  LED_0805: 'LED_SMD:LED_0805_2012Metric',
  'TO-92': 'Package_TO_SOT_THT:TO-92_Inline',
  'TO-92_CBE': 'Package_TO_SOT_THT:TO-92_Inline',
  'TO-92_EBC': 'Package_TO_SOT_THT:TO-92_Inline',
  'TO-92_DGS': 'Package_TO_SOT_THT:TO-92_Inline',
  'TO-92_Wide': 'Package_TO_SOT_THT:TO-92_Inline_Wide',
  'TO-220': 'Package_TO_SOT_THT:TO-220-3_Vertical',
  'TO-220_GDS': 'Package_TO_SOT_THT:TO-220-3_Vertical',
  'TO-220_BCE': 'Package_TO_SOT_THT:TO-220-3_Vertical',
  'TO-220_Horizontal': 'Package_TO_SOT_THT:TO-220-3_Horizontal_TabDown',
  'SOT-23': 'Package_TO_SOT_SMD:SOT-23',
  'SOT-23-5': 'Package_TO_SOT_SMD:SOT-23-5',
  'SOT-23-6': 'Package_TO_SOT_SMD:SOT-23-6',
  'Crystal_HC49-U': 'Crystal:Crystal_HC49-U_Vertical',
  'Crystal_HC49-4H': 'Crystal:Crystal_HC49-4H_Vertical',
  'Potentiometer_Trimmer_P2.54mm': 'Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical',
  Potentiometer_RK09_Vertical: 'Potentiometer_THT:Potentiometer_Alps_RK09K_Single_Vertical',
  SW_PUSH_6mm: 'Button_Switch_THT:SW_PUSH_6mm',
  'MountingHole_2.2mm_M2': 'MountingHole:MountingHole_2.2mm_M2',
  'MountingHole_3.2mm_M3': 'MountingHole:MountingHole_3.2mm_M3',
  'MountingHole_3.2mm_M3_Pad': 'MountingHole:MountingHole_3.2mm_M3_Pad',
  'Buzzer_12x9.5RM7.6': 'Buzzer_Beeper:Buzzer_12x9.5RM7.6',
  'TestPoint_THT_D1.0mm': 'TestPoint:TestPoint_THTPad_D1.0mm_Drill0.5mm',
  'TestPoint_Pad_D1.0mm': 'TestPoint:TestPoint_Pad_D1.0mm',
};

/** parametric families: [pattern, KiCad id] */
const KICAD_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^CP_Radial_D[\d.]+mm_P[\d.]+mm$/, (m) => `Capacitor_THT:${m[0]}`],
  [/^DIP-\d+_W(?:7\.62|15\.24)mm$/, (m) => `Package_DIP:${m[0]}`],
  [/^(?:SOIC|TSSOP|MSOP)-\d+W?_[\dx.]+mm_P[\d.]+mm$/, (m) => `Package_SO:${m[0]}`],
  [/^TQFP-\d+_[\dx.]+mm_P[\d.]+mm$/, (m) => `Package_QFP:${m[0]}`],
  [/^PinHeader_[12]x\d\d_P2\.54mm$/, (m) => `Connector_PinHeader_2.54mm:${m[0]}_Vertical`],
  [/^TerminalBlock_1x(\d\d)_P5\.08mm$/, (m) => `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-${+m[1]}-5.08_1x${m[1]}_P5.08mm_Horizontal`],
  [/^TerminalBlock_1x(\d\d)_P3\.50mm$/, (m) => `TerminalBlock_Phoenix:TerminalBlock_Phoenix_PT-1,5-${+m[1]}-3.5-H_1x${m[1]}_P3.50mm_Horizontal`],
];

/** KiCad library footprint of a built-in one; undefined when there is no equivalent */
export function kicadLibraryFootprint(id: string): string | undefined {
  const fixed = KICAD_FOOTPRINTS[id];
  if (fixed) return fixed;
  for (const [re, f] of KICAD_PATTERNS) {
    const m = re.exec(id);
    if (m) return f(m);
  }
  return undefined;
}

/** footprints made from the classic part library (src/pcb/fromParts.ts) */
const PART_PREFIX = 'Part:';

/**
 * KiCad footprint id ("Lib:Name") for a footprint id of ours: KiCad library equivalents,
 * imported KiCad footprints by their name alone (KiCad then searches all its
 * libraries), unknown "Lib:Name" ids (set on a symbol by hand) as they are,
 * everything else in the "BlackBoard" library (export it with writeKicadFootprint).
 */
export function kicadFootprintId(id: string, lookup?: FootprintLookup): string {
  const lib = kicadLibraryFootprint(id);
  if (lib) return lib;
  if (id.startsWith(KICAD_ID_PREFIX)) return kicadName(lookup?.(id)?.name || id.slice(KICAD_ID_PREFIX.length));
  if (!id.startsWith(PART_PREFIX) && !lookup?.(id) && /^[^:\s]+:[^:\s]+$/.test(id)) return id;
  return `${BLACKBOARD_LIB}:${kicadName(id)}`;
}

/** stable RFC 4122 style id from a key (cyrb128), so re-exports keep KiCad's symbol links */
export function stableUuid(key: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const collator = new Intl.Collator('en', { numeric: true });

export interface KicadNetlistOptions {
  /** design date; default now (ISO 8601) */
  date?: string;
  /** schematic file name in the design header; default the title */
  source?: string;
}

export interface KicadNetlistResult {
  netlist: string;
  warnings: FromSchematicWarning[];
  /** footprint ids written as "BlackBoard:<id>": export them into a BlackBoard.pretty library for KiCad */
  customFootprints: string[];
}

const prefixOf = (ref: string) => /^[A-Za-z#]+/.exec(ref)?.[0] ?? 'U';

function libparts(components: PcbComponent[]): SOut[] {
  const parts = new Map<string, { ref: string; pins: Map<string, string | undefined> }>();
  for (const c of components) {
    const p = parts.get(c.symbolName) ?? { ref: c.ref, pins: new Map<string, string | undefined>() };
    for (const pin of c.pins) if (!p.pins.has(pin.pad)) p.pins.set(pin.pad, pin.pinName);
    parts.set(c.symbolName, p);
  }
  return [...parts].sort(([a], [b]) => collator.compare(a, b)).map(([part, { ref, pins }]) => [
    'libpart',
    ['lib', q(BLACKBOARD_LIB)],
    ['part', q(part)],
    ['description', q('')],
    ['docs', q('~')],
    ['fields', ['field', ['name', q('Reference')], q(prefixOf(ref))], ['field', ['name', q('Value')], q(part)]],
    ['pins', ...[...pins].sort(([a], [b]) => collator.compare(a, b)).map(([num, name]): SOut => ['pin', ['num', q(num)], ['name', q(name ?? '~')], ['type', q('passive')]])],
  ]);
}

/** Netlist plus the extraction warnings and the footprints KiCad has to get from a "BlackBoard" library. */
export function buildKicadNetlist(schematic: Doc, title: string, lookup: FootprintLookup, opts: KicadNetlistOptions = {}): KicadNetlistResult {
  const { components, nets, warnings } = extractPcbNetlist(schematic, lookup);
  const comps = [...components].sort((a, b) => collator.compare(a.ref, b.ref));
  const source = opts.source ?? title;
  const custom = new Set<string>();

  const compList: SOut[] = comps.map((c) => {
    const fp = kicadFootprintId(c.footprintId, lookup);
    if (fp.startsWith(`${BLACKBOARD_LIB}:`)) custom.add(c.footprintId);
    const stamps = c.units ? c.units.map((_, k) => stableUuid(`${c.ref}/${k}`)) : [stableUuid(c.ref)];
    return [
      'comp',
      ['ref', q(c.ref)],
      ['value', q(c.value.trim() || c.symbolName)],
      ['footprint', q(fp)],
      ['libsource', ['lib', q(BLACKBOARD_LIB)], ['part', q(c.symbolName)], ['description', q('')]],
      ['property', ['name', q('BlackBoard footprint')], ['value', q(c.footprintId)]],
      ['sheetpath', ['names', q('/')], ['tstamps', q('/')]],
      ['tstamps', ...stamps.map(q)],
    ];
  });

  // net -> (ref, pad) nodes; a pad shared by several symbol pins is listed once
  const nodes = new Map<string, Map<string, { ref: string; pad: string; fn?: string }>>(nets.map((n) => [n, new Map()]));
  for (const c of comps) {
    for (const p of c.pins) {
      const list = nodes.get(p.net);
      const key = `${c.ref}\u0000${p.pad}`;
      if (!list || list.has(key)) continue;
      list.set(key, { ref: c.ref, pad: p.pad, fn: p.pinName && p.pinName !== p.pad ? p.pinName : undefined });
    }
  }
  const netList: SOut[] = nets.map((name, i) => [
    'net',
    ['code', q(String(i + 1))],
    ['name', q(name)],
    ...[...(nodes.get(name)?.values() ?? [])]
      .sort((a, b) => collator.compare(a.ref, b.ref) || collator.compare(a.pad, b.pad))
      .map((n): SOut => ['node', ['ref', q(n.ref)], ['pin', q(n.pad)], ...(n.fn ? [['pinfunction', q(n.fn)]] : []), ['pintype', q('passive')]]),
  ]);

  const doc: SOut = [
    'export',
    ['version', q('E')],
    [
      'design',
      ['source', q(source)],
      ['date', q(opts.date ?? new Date().toISOString())],
      ['tool', q('BlackBoard Next')],
      ['sheet', ['number', q('1')], ['name', q('/')], ['tstamps', q('/')], ['title_block', ['title', q(title)], ['company', q('')], ['rev', q('')], ['date', q('')], ['source', q(source)]]],
    ],
    ['components', ...compList],
    ['libparts', ...libparts(comps)],
    ['libraries', ['library', ['logical', q(BLACKBOARD_LIB)], ['uri', q('')]]],
    ['nets', ...netList],
  ];
  return { netlist: writeSexpr(doc) + '\n', warnings, customFootprints: [...custom].sort(collator.compare) };
}

/** KiCad netlist (.net) of a schematic for KiCad's PCB editor (File > Import > Netlist). */
export function kicadNetlist(schematic: Doc, title: string, lookup: FootprintLookup, opts: KicadNetlistOptions = {}): string {
  return buildKicadNetlist(schematic, title, lookup, opts).netlist;
}
