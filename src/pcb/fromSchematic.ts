// Schematic -> PCB netlist: decides which symbols become footprints, guesses a
// footprint per symbol, maps symbol pins to pads and names the nets KiCad style.

import type { Doc, FootprintDef, Pin, SymbolItem } from '../model/types.ts';
import { computeConnectivity, pinKey } from '../spice/connectivity.ts';
import { isGround } from '../spice/netlist.ts';
import { earthedPinIndex, instrumentOf } from '../spice/instruments.ts';

export interface PcbComponentPin {
  /** index into the symbol's pins */
  pinIndex: number;
  pinNum: number;
  pinName?: string;
  pad: string;
  net: string;
  /** symbol the pin belongs to; only set on components merged from several units */
  symbolId?: string;
}

export interface PcbComponent {
  /** designator (unique) */
  ref: string;
  value: string;
  symbolId: string;
  symbolName: string;
  footprintId: string;
  /** mapped pins only, see the unmappedPin warning */
  pins: PcbComponentPin[];
  /** all unit symbols (LM324.A, LM324.B …) when several share one designator */
  units?: string[];
}

export type FromSchematicWarning =
  | { key: 'noFootprint'; ref: string; footprintId: string }
  | { key: 'pinMismatch'; ref: string; footprintId: string; pins: number; pads: number }
  | { key: 'unmappedPin'; ref: string; pin: string }
  | { key: 'duplicateRef'; ref: string }
  | { key: 'multiUnit'; ref: string };

export interface PcbNetlist {
  components: PcbComponent[];
  nets: string[];
  warnings: FromSchematicWarning[];
}

export type FootprintLookup = (id: string) => FootprintDef | undefined;

// ---- classification ------------------------------------------------------------------

type Kind =
  | 'source' | 'regulator' | 'reference' | 'bjt' | 'fet' | 'thyristor' | 'ic' | 'crystal' | 'connector'
  | 'switch' | 'buzzer' | 'resistor' | 'capacitor' | 'inductor' | 'led' | 'diode' | 'other';

const POWER_RE = /^(?:[+-]?V(?:CC|DD|SS|EE|BAT|BATT|IN|PP|S|AA|REF)[A-Z0-9_]*|V[+-]|[+-]?\d+(?:[.,]\d+)?V|[+-]?\d+V\d+|[+-]U[BS]?|U[BS][+-])$/i;
const REGULATOR_RE = /(?:^|[^0-9A-Z])(?:LM|MC|UA|µA|KA|L)?7[89][LMS]?\d{2}[A-Z]{0,4}(?![0-9])|LM3(?:17|37|38|50)|LM1117|LM108[456]|LD1117|AMS1117|LM2940/i;
const REFERENCE_RE = /TLV?43[12]|LM38[15]|LM336|LM4040|REF\d|re?ferenz|reference|DS18B20|(?:^|[^0-9A-Z])LM3(?:5|35|34)[A-Z]{0,2}(?![0-9])/i;
const UNIT_SUFFIX_RE = /\.[A-H](?:[^A-Za-z0-9]|$)/;
const GATE_RE = /gate|gatter|flip-?flop|schmitt|inverter|(?:^|[^a-z])(?:N?AND|X?N?OR|NOT|UND|ODER|NICHT)(?:[^a-z]|$)/i;
const CONNECTOR_RE = /connector|stiftleiste|buchsenleiste|header|jumper|IDC|klemme|terminal|stecker|buchse|socket|plug|jack|klinke|cinch|USB|SUB-?D|XLR|scart|faston|lötstift/i;
const TERMINAL_RE = /klemme|terminal|schraub|screw|lüster/i;
const SWITCH_RE = /taster|schalter|switch|button|reed|tact|(?:^|[^a-z])SW\d*(?:[^a-z]|$)/i;
const CAP_NAME_RE = /kondensator|capacitor|^C\d*#?$|^C[-_ ]|elko|elco|tantal|keramik|ceramic|folie|film|styroflex|styreflex/i;
const RES_NAME_RE = /widerstand|resistor|^R\d*#?$|^R[-_ ]|LDR|NTC|PTC|VDR|thermist|potentiometer|^pot|poti(?![a-z])|trimmer|^P\d+$|shunt|PT100/i;
const IND_NAME_RE = /spule|induct|drossel|choke|coil|^L\d*$|ferrit/i;
const LED_RE = /(?:^|[^a-z])led/i;
const DIODE_NAME_RE = /diode|diac|gleichrichter|rectifier|zener|varicap|^D\d+$|^ZD/i;
const TRANSISTOR_RE = /transistor|transitor|mosfet|(?:^|[^a-z])j?fet(?:[^a-z]|$)|darlington|npn|pnp|^[TQ]\d+$/i;
const FET_NAME_RE = /mosfet|(?:^|[^a-z])j?fet(?:[^a-z]|$)/i;
const THYRISTOR_RE = /thyristor|triac|(?:^|[^A-Z])TIC\d|BT1\d\d|BT[AB]\d|^TH#|^TRI#|(?:^|[^A-Z])SCR|TYN\d|MCR\d/i;
const OPTO_RE = /opto|PC81\d|(?:^|[^0-9A-Z])4N[23]\d|MOC\d|CNY\d|TLP\d|6N13\d/i;
const IC_NAME_RE = /(?:^|[^a-z])(?:IC|OTA|OPV|MCU)(?:[^a-z]|$)|timer|op-?amp|operational|operationsverst|controller|atmega|attiny|(?:^|[^a-z])PIC\d|µC|eeprom|eprom|sram/i;

const has = (re: RegExp, ...texts: (string | undefined)[]) => texts.some((t) => !!t && re.test(t));
const pinNames = (s: SymbolItem) => new Set(s.pins.map((p) => (p.name ?? '').trim().toUpperCase()));
const distinctPins = (s: SymbolItem) => new Set(s.pins.map((p) => p.num)).size;
/** pads needed when the pin numbers are used as pad numbers */
const padSpan = (s: SymbolItem) => Math.max(1, distinctPins(s), ...s.pins.map((p) => p.num));

// IC packages of parts that are often drawn with fewer pins than the package has
const ANALOG_PACKAGES: { re: RegExp; pins: number; multi: boolean }[] = [
  { re: /556(?![0-9])/, pins: 14, multi: true },
  { re: /555(?![0-9])/, pins: 8, multi: false },
  { re: /LM13[67]00/i, pins: 16, multi: true },
  { re: /TL0[678]4|LF444|LF347|LM324|LM339|LM348|LM290[12]|MC3403|LM3900|LM837|TLC274|OPA4\d{3}/i, pins: 14, multi: true },
  { re: /TL0[678]2|LF353|LF412|NE5532|LM358|LM393|LM290[34]|[MR]C1458|RC4558|LM4558|LM833|TLC272|CA3240|OPA2\d{3}/i, pins: 8, multi: true },
  { re: /741(?![0-9])|TL0[678]1|LF3(?:5[1356]|11)|LF411|NE5534|OP07|CA3[01]40|LM3(?:01|07|10|11|86)|LM567|NE567|ICL7660/i, pins: 8, multi: false },
  { re: /LM391[456]|ULN280[34]|TDA7000/i, pins: 18, multi: false },
  { re: /ULN200[34]|MAX232|L293/i, pins: 16, multi: false },
];
const L74_RE = /(?:^|[^0-9A-Z])(?:SN|MC|DM|HD|M)?74[A-Z]{0,4}(\d{2,4})(?![0-9])/i;
const L40_RE = /(?:^|[^0-9A-Z])(?:CD|HEF|MC1|TC)?(4[05]\d{2,3})[A-Z]{0,3}(?![0-9])/i;
const L74_20 = new Set([240, 241, 244, 245, 273, 373, 374, 540, 541, 573, 574, 688]);
const L74_24 = new Set([150, 154]);
const L74_16 = new Set([
  42, 47, 48, 85, 109, 112, 123, 138, 139, 147, 148, 151, 153, 155, 156, 157, 158, 160, 161, 162, 163, 165, 166, 173, 174, 175,
  190, 191, 192, 193, 194, 195, 221, 251, 253, 257, 258, 259, 283, 365, 366, 367, 368, 390, 595, 4017, 4040, 4046, 4051, 4052,
  4053, 4060, 4094, 4511, 4520,
]);
const L40_14 = new Set([4001, 4002, 4007, 4011, 4012, 4013, 4016, 4023, 4024, 4025, 4030, 4047, 4066, 4068, 4069, 4070, 4071, 4072, 4073, 4075, 4077, 4078, 4081, 4082, 4093, 4584, 40106]);
const L40_24 = new Set([4067, 4097, 4514, 4515]);

function icPackage(s: SymbolItem): { pins: number; multi: boolean } | undefined {
  const texts = [s.symbolName, s.value, s.model?.name];
  for (const p of ANALOG_PACKAGES) if (has(p.re, ...texts)) return p;
  for (const t of texts) {
    const m74 = t ? L74_RE.exec(t) : null;
    if (m74) {
      const n = parseInt(m74[1], 10);
      return { pins: L74_20.has(n) ? 20 : L74_24.has(n) ? 24 : L74_16.has(n) ? 16 : 14, multi: true };
    }
    const m40 = t ? L40_RE.exec(t) : null;
    if (m40) {
      const n = parseInt(m40[1], 10);
      return { pins: L40_14.has(n) ? 14 : L40_24.has(n) ? 24 : 16, multi: true };
    }
  }
  if (GATE_RE.test(s.symbolName)) return { pins: 14, multi: true };
  return undefined;
}

function classify(s: SymbolItem): Kind {
  const sn = s.symbolName ?? '';
  const v = s.value ?? '';
  const st = s.spiceType;
  const cat = s.category ?? '';
  const n = s.pins.length;
  const names = pinNames(s);
  if (n === 2 && (st === 'VOLTAGE_SOURCE' || /batter|akku|accu|mignon|solar|stromquelle|current.?source/i.test(sn))) return 'source';
  if (n > 3 && /regler|regel|regulator|L200/i.test(sn)) return 'other';
  if (n >= 2 && n <= 3 && has(REGULATOR_RE, sn, v, s.model?.name)) return 'regulator';
  if (n === 3 && has(REFERENCE_RE, sn, v)) return 'reference';
  if (n === 3 && ['C', 'B', 'E'].every((x) => names.has(x))) return 'bjt';
  if (n >= 3 && n <= 4 && ['D', 'G', 'S'].every((x) => names.has(x))) return 'fet';
  const passive = st === 'RESISTOR' || st === 'CAPACITOR' || st === 'INDUCTOR' || st === 'DIODE';
  if (!passive && !/connector/i.test(cat) && icPackage(s)) return 'ic';
  if (/röhre|tube|valve|relais|relay|mikrofon|microphone/i.test(sn)) return 'other';
  if (/crystal|quarz|quartz|xtal|resonator/i.test(sn) || (n === 2 && !st && /\d\s*[kM]Hz/.test(v))) return 'crystal';
  if (/connector/i.test(cat) || CONNECTOR_RE.test(sn)) return 'connector';
  if (/switch/i.test(cat) || SWITCH_RE.test(sn)) return 'switch';
  if (/buzzer|summer|piezo|beeper/i.test(sn)) return 'buzzer';
  if (n === 2 && /\d\s*[mµuμn]?H$/.test(v.trim())) return 'inductor';
  if (st === 'RESISTOR') return 'resistor';
  if (st === 'CAPACITOR') return 'capacitor';
  if (st === 'INDUCTOR') return 'inductor';
  if (st === 'DIODE') return LED_RE.test(sn) || /(?:^|[^a-z])LED(?:[^a-z]|$)/i.test(v) ? 'led' : 'diode';
  const semi = st === 'NPN' || st === 'PNP' || st === 'MOSFET';
  if (!semi) {
    if (CAP_NAME_RE.test(sn)) return 'capacitor';
    if (RES_NAME_RE.test(sn)) return 'resistor';
    if (IND_NAME_RE.test(sn)) return 'inductor';
    if (LED_RE.test(sn)) return 'led';
    if (DIODE_NAME_RE.test(sn)) return 'diode';
  }
  if (n === 3 && has(THYRISTOR_RE, sn, v)) return 'thyristor';
  if (n >= 2 && n <= 4 && (semi || TRANSISTOR_RE.test(sn))) {
    return st === 'MOSFET' || FET_NAME_RE.test(sn) ? 'fet' : 'bjt';
  }
  if (has(OPTO_RE, sn, v)) return 'ic';
  if (semi || TRANSISTOR_RE.test(sn)) return 'other';
  const icLike =
    st === 'SUBCIRCUIT' ||
    st === 'VOLTAGE_CONTROLLED_SWITCH' ||
    /micro|digital|analog\s*ic|integrated/i.test(cat) ||
    IC_NAME_RE.test(sn) ||
    (n >= 4 && /active|semiconductor|optoelectronic/i.test(cat));
  return icLike ? 'ic' : 'other';
}

function isMultiUnit(s: SymbolItem): boolean {
  if (classify(s) !== 'ic') return false;
  if (UNIT_SUFFIX_RE.test(s.symbolName)) return true;
  const pkg = icPackage(s);
  return !!pkg && pkg.multi && distinctPins(s) <= pkg.pins / 2;
}

/** "IC1A" / "U3.B" -> "IC1" / "U3" (units of one package share the designator) */
const unitBase = (ref: string) => /^(.*\d)[.:_-]?[A-Ha-h]$/.exec(ref)?.[1] ?? ref;

/** units merge into one package only when they are the same part on the same footprint */
const unitKey = (s: SymbolItem) =>
  `${guessFootprint(s)}|${((s.value ?? '').trim() || s.symbolName.replace(/\.[A-H](?=[^A-Za-z0-9]|$)/, '')).toUpperCase()}`;

// ---- footprint guesses ----------------------------------------------------------------

const DIP_SIZES = [4, 6, 8, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const pad2 = (n: number) => String(n).padStart(2, '0');

function dip(pins: number): string | undefined {
  const size = DIP_SIZES.find((s) => s >= pins);
  return size ? `DIP-${size}_W${size >= 32 ? '15.24' : '7.62'}mm` : undefined;
}

function header(pins: number, rows: 1 | 2 = 1): string {
  const n = Math.max(1, pins);
  if ((rows === 2 && n >= 3) || n > 20) return `PinHeader_2x${pad2(Math.min(20, Math.ceil(n / 2)))}_P2.54mm`;
  return `PinHeader_1x${pad2(n)}_P2.54mm`;
}

/** capacitance in µF, undefined for ranges ("1..470u") and values without unit */
function microfarad(value: string): number | undefined {
  if (value.includes('..')) return undefined;
  const m = /(\d+(?:[.,]\d+)?)\s*([pnuµμmPNU])(\d*)/.exec(value);
  if (!m) return undefined;
  const digits = m[1].replace(',', '.') + (m[3] && !/[.,]/.test(m[1]) ? `.${m[3]}` : '');
  const scale: Record<string, number> = { p: 1e-6, n: 1e-3, u: 1, µ: 1, μ: 1, m: 1e3 };
  return parseFloat(digits) * (scale[m[2].toLowerCase()] ?? 1);
}

function capacitorFootprint(s: SymbolItem): string {
  const sn = s.symbolName;
  const uf = microfarad(s.value);
  const film = has(/folie|film|MK[STP]|styro|styre|polyester|polyprop|wima/i, sn, s.value);
  const tantal = has(/tantal/i, sn, s.value);
  const elko = tantal || has(/elko|elco|electrolyt|elektrolyt|polari[sz]ed|gepolt|hochvolt|^CP(?![a-z])/i, sn, s.value) || (!film && uf !== undefined && uf >= 1);
  if (tantal) return 'CP_Radial_D5.0mm_P2.00mm';
  if (elko) {
    if ((uf ?? 0) >= 2200) return 'CP_Radial_D12.5mm_P5.00mm';
    if ((uf ?? 0) >= 470 || /hochvolt|high.?volt/i.test(sn)) return 'CP_Radial_D10.0mm_P5.00mm';
    if ((uf ?? 0) >= 220) return 'CP_Radial_D8.0mm_P3.50mm';
    return 'CP_Radial_D6.3mm_P2.50mm';
  }
  if (film) return (uf ?? 0) >= 1 ? 'C_Rect_P7.50mm' : 'C_Rect_P5.00mm';
  return 'C_Disc_P5.08mm';
}

function resistorFootprint(s: SymbolItem): string {
  const n = s.pins.length;
  const text = `${s.value} ${s.symbolName}`;
  if (n === 3) return 'Potentiometer_Trimmer_P2.54mm';
  if (n !== 2) return (/array|netzwerk|network/i.test(s.symbolName) && dip(padSpan(s))) || header(padSpan(s));
  const watt = /(?:^|[^\d/.,])(\d+(?:[.,]\d+)?)\s*W(?:att)?(?![a-z])/i.exec(text);
  if ((watt && parseFloat(watt[1].replace(',', '.')) >= 1) || /shunt|last|leistung|power/i.test(s.symbolName)) return 'R_Axial_P15.24mm';
  if (/LDR|NTC|PTC|VDR|thermist|PT1000?|feldplatte|MDR|stehend|vertikal|vertical|standing/i.test(text)) return 'R_Axial_Vertical_P2.54mm';
  return 'R_Axial_P10.16mm';
}

function diodeFootprint(s: SymbolItem): string {
  const big = /1N54\d\d|1N53\d\d|1N58[2-4]\d|BY2\d\d|P600|6A\d{2}|SB5\d0|MR75\d/i;
  const medium = /1N400\d|1N47\d\d|1N49\d\d|1N581[789]|BZ[XV]85|UF400\d|FR10\d|SB1\d0|BYV?\d{2,3}/i;
  const small = /1N4148|1N4448|1N914|1N34|1N60|1N37\d\d|BAT\d|BZX55|BZX79|BZY|AA\d{3}|BB\d|DB3/i;
  const byPart = (t: string | undefined) =>
    !t ? undefined : big.test(t) ? 'D_DO-201_P15.24mm' : medium.test(t) ? 'D_DO-41_P10.16mm' : small.test(t) ? 'D_DO-35_P7.62mm' : undefined;
  const sn = s.symbolName;
  return (
    byPart(s.value) ??
    byPart(sn) ??
    (/leistung|leis\.|leidio|gleichrichter|rectifier|power/i.test(sn) ? 'D_DO-41_P10.16mm' : undefined) ??
    (/schottky|zener|z-diode|kapazit|varicap|germanium|ge-diode|diac|tunnel|signal/i.test(sn) ? 'D_DO-35_P7.62mm' : undefined) ??
    byPart(s.model?.name) ??
    'D_DO-35_P7.62mm'
  );
}

function bjtFootprint(s: SymbolItem): string {
  const texts = [s.value, s.model?.name, s.symbolName];
  if (s.pins.length === 2) return 'LED_5mm';
  if (has(/TIP\d|BD\d{3}|BD[WX]\d|BU\d{3}|2N3055|2N3773|MJE?\d{3,5}|2SC5200|2SA1943|TO-?220|leistung/i, ...texts)) return 'TO-220_BCE';
  if (has(/2N(?:2222|3904|3906|440[13]|555[01]|540[01]|508[89]|412[46])|PN2222|PN2907|MPSA\d\d/i, ...texts)) return 'TO-92_EBC';
  const names = pinNames(s);
  const labelled = s.pins.some((p) => p.name && !/^\d+$/.test(p.name.trim()));
  if (labelled && !['C', 'B', 'E'].every((x) => names.has(x))) return 'TO-92';
  return 'TO-92_CBE';
}

function fetFootprint(s: SymbolItem): string {
  const small = /BS1\d\d|BS250|2N700[02]|VN10|VN2222|BF24[4-6]|BF256|J1[01]\d|J3\d\d|2N38\d\d|2N54\d\d|2N4416|2SK\d|MPF10\d|JFET|^FET|-FET/i;
  return has(small, s.value, s.model?.name, s.symbolName) ? 'TO-92_DGS' : 'TO-220_GDS';
}

function connectorFootprint(s: SymbolItem): string {
  const span = padSpan(s);
  const text = `${s.symbolName} ${s.value}`;
  if (TERMINAL_RE.test(text)) {
    if (/3[.,]5\s*mm/.test(text) && span >= 2 && span <= 4) return `TerminalBlock_1x${pad2(span)}_P3.50mm`;
    if (span >= 2 && span <= 6) return `TerminalBlock_1x${pad2(span)}_P5.08mm`;
    return header(span);
  }
  const grid = /(\d+)\s*[x×]\s*(\d+)/i.exec(text);
  if (grid) {
    const [rows, cols] = [parseInt(grid[1], 10), parseInt(grid[2], 10)].sort((a, b) => a - b);
    if (rows === 2) return header(Math.max(span, 2 * cols), 2);
    if (rows === 1) return header(Math.max(span, cols));
  }
  const pol = /(\d+)[\s.-]*pol/i.exec(text);
  if (pol) {
    const count = Math.max(span, parseInt(pol[1], 10));
    return header(count, /IDC|wanne|box/i.test(text) && count >= 4 ? 2 : 1);
  }
  return header(span);
}

/** Footprint id for a schematic symbol: the `footprint` property, otherwise a guess. */
export function guessFootprint(sym: SymbolItem): string {
  const explicit = sym.properties?.footprint?.trim();
  if (explicit) return explicit;
  const n = sym.pins.length;
  const span = padSpan(sym);
  const text = `${sym.symbolName} ${sym.value}`;
  switch (classify(sym)) {
    case 'source':
      return 'TerminalBlock_1x02_P5.08mm';
    case 'regulator':
    case 'thyristor':
      return 'TO-220';
    case 'reference':
      return 'TO-92';
    case 'bjt':
      return bjtFootprint(sym);
    case 'fet':
      return fetFootprint(sym);
    case 'crystal':
      return n <= 2 ? 'Crystal_HC49-4H' : header(span);
    case 'connector':
      return connectorFootprint(sym);
    case 'switch':
      if (/DIP|DIL|mäuseklavier|codier/i.test(sym.symbolName)) return dip(span) ?? header(span);
      return n === 2 ? 'SW_PUSH_6mm' : header(span);
    case 'buzzer':
      return n === 2 ? 'Buzzer_12x9.5RM7.6' : header(span);
    case 'resistor':
      return resistorFootprint(sym);
    case 'capacitor':
      return n === 2 ? capacitorFootprint(sym) : header(span);
    case 'inductor':
      if (n !== 2) return header(span);
      return /radial|stehend|vertikal|vertical|ringkern|toroid/i.test(text) ? 'L_Radial_D8.0mm_P5.00mm' : 'L_Axial_P10.16mm';
    case 'led':
      if (n === 2) return /3\s*mm/i.test(text) ? 'LED_3mm' : 'LED_5mm';
      return (/bargraph|balken|segm|anzeige|display/i.test(sym.symbolName) && dip(span)) || header(span);
    case 'diode':
      if (n === 2) return diodeFootprint(sym);
      if (n === 3 && /BAV99|BAV70|BAW56|BAT54|BAS\d/i.test(text)) return 'SOT-23';
      return header(span);
    case 'ic': {
      const pkg = icPackage(sym);
      return ((span >= 4 || pkg) && dip(Math.max(pkg?.pins ?? 0, span))) || header(span);
    }
    default:
      return header(span);
  }
}

// ---- pin mapping ----------------------------------------------------------------------

/** pads that can carry a symbol pin (no mounting holes / mounting pads) */
const electricalPads = (fp: FootprintDef) => fp.pads.filter((p) => p.num !== '' && !p.npth && !/^MP$/i.test(p.num));

/** + and - pin of a two pin source (same rule as the SPICE netlist) */
function sourcePins(s: SymbolItem): { plus: number; minus: number } {
  const nm = (p: Pin) => (p.name ?? '').trim();
  const plus = s.pins.findIndex((p) => nm(p) === '+' || (nm(p) !== '-' && p.num === 1));
  const minus = s.pins.findIndex((p, i) => i !== plus && (nm(p) === '-' || (nm(p) !== '+' && p.num === 2)));
  return plus < 0 || minus < 0 ? { plus: 0, minus: 1 } : { plus, minus };
}

/**
 * Symbol pin -> pad number. Pins are mapped by name when every pad is named and the
 * symbol pin names cover them (TO-92_CBE: C/B/E), otherwise by number. Two pin
 * sources always put + on pad 1.
 */
export function mapPins(sym: SymbolItem, fp: FootprintDef): { padOfPin: (string | undefined)[]; unmapped: number[] } {
  const pads = electricalPads(fp);
  const nums = new Set(pads.map((p) => p.num));
  const upper = (t: string | undefined) => (t ?? '').trim().toUpperCase();
  const names = new Set(sym.pins.map((p) => upper(p.name)));
  let padOfPin: (string | undefined)[];
  if (pads.length && pads.every((p) => upper(p.name) && names.has(upper(p.name)))) {
    const byName = new Map<string, string>();
    for (const p of pads) if (!byName.has(upper(p.name))) byName.set(upper(p.name), p.num);
    padOfPin = sym.pins.map((p) => byName.get(upper(p.name)));
  } else if (classify(sym) === 'source' && nums.has('1') && nums.has('2')) {
    const { plus, minus } = sourcePins(sym);
    padOfPin = sym.pins.map((_, i) => (i === plus ? '1' : i === minus ? '2' : undefined));
  } else {
    padOfPin = sym.pins.map((p) => (nums.has(String(p.num)) ? String(p.num) : undefined));
  }
  const unmapped = padOfPin.flatMap((pad, i) => (pad === undefined ? [i] : []));
  return { padOfPin, unmapped };
}

/** stand-in footprint with one pad per pin number (no lookup / unknown footprint) */
function numberedFootprint(s: SymbolItem): FootprintDef {
  const pads = [...new Set(s.pins.map((p) => p.num))].map((num) => ({ num: String(num), x: 0, y: 0, shape: 'circle' as const, w: 0, h: 0 }));
  return { id: '', name: '', description: '', category: '', pads, silk: [], courtyard: { x: 0, y: 0, w: 0, h: 0 } };
}

const pinLabel = (p: Pin) => {
  const name = (p.name ?? '').trim();
  return name && name !== String(p.num) ? `${p.num} (${name})` : String(p.num);
};

// ---- roles, ground and supply symbols ---------------------------------------------------

const normPower = (t: string) => {
  const u = t.replace(/\s+/g, '').replace(',', '.').toUpperCase();
  return /^\d/.test(u) ? `+${u}` : u;
};

/** net name of a one pin supply symbol (VCC, +5V, 3V3 …) */
function powerName(s: SymbolItem): string | undefined {
  if (s.pins.length !== 1) return undefined;
  // net labels name their net
  if (s.properties?.netlabel === 'true' && s.name.trim()) return s.name.trim();
  for (const t of [s.name, s.value, s.symbolName]) {
    const c = (t ?? '').replace(/\s+/g, '');
    if (POWER_RE.test(c)) return normPower(c);
  }
  return undefined;
}

const isGroundSymbol = (s: SymbolItem) =>
  isGround(s) || (s.pins.length === 1 && (/^(?:masse|ground|earth|erde)/i.test(s.symbolName) || /^(?:gnd|masse|ground|0v?)$/i.test((s.value ?? '').trim())));

const groundName = (s: SymbolItem) => (/^(?:[ADPCS]GND|GND[ADPCS]|GND_\w+)$/i.test(s.name.trim()) ? s.name.trim().toUpperCase() : 'GND');

function roleOf(s: SymbolItem): 'component' | 'ground' | 'power' | 'skip' {
  if (!s.pins.length || instrumentOf(s)) return 'skip';
  if (isGroundSymbol(s)) return 'ground';
  if (powerName(s)) return 'power';
  return 'component';
}

const KIND_PREFIX: Record<Kind, string> = {
  source: 'V', regulator: 'U', reference: 'U', bjt: 'Q', fet: 'Q', thyristor: 'Q', ic: 'U', crystal: 'Y', connector: 'J',
  switch: 'SW', buzzer: 'BZ', resistor: 'R', capacitor: 'C', inductor: 'L', led: 'D', diode: 'D', other: 'U',
};

function prefixOf(s: SymbolItem): string {
  const sn = s.symbolName;
  if (/trafo|transformer|übertrager/i.test(sn)) return 'T';
  if (/lautsprecher|speaker|kopfhörer|headphone/i.test(sn)) return 'LS';
  if (/relais|relay/i.test(sn)) return 'K';
  if (/sicherung|fuse/i.test(sn)) return 'F';
  if (/motor/i.test(sn)) return 'M';
  return KIND_PREFIX[classify(s)];
}

// ---- netlist ---------------------------------------------------------------------------

const collator = new Intl.Collator('en', { numeric: true });
const IC_FOOTPRINT_RE = /^(?:DIP|SOIC|SOP|SO-|SSOP|TSSOP|MSOP|QFN|QFP|TQFP|LQFP|PLCC)/i;

interface Analysis extends PcbNetlist {
  names: Map<number, string>;
}

function analyse(doc: Doc, lookup?: FootprintLookup): Analysis {
  const conn = computeConnectivity(doc);
  const symbols = doc.items.filter((i): i is SymbolItem => i.kind === 'symbol');
  const warnings: FromSchematicWarning[] = [];
  const netOf = (s: SymbolItem, i: number) => conn.netOfPin.get(pinKey(s.id, i));

  // ground > supply symbols > sources named like a rail ("VCC" battery)
  const marks = [new Map<number, string[]>(), new Map<number, string[]>(), new Map<number, string[]>()];
  const mark = (level: number, net: number | undefined, name: string) => {
    if (net === undefined) return;
    marks[level].set(net, [...(marks[level].get(net) ?? []), name]);
  };
  for (const s of symbols) {
    const earthed = earthedPinIndex(s);
    if (earthed !== undefined) mark(0, netOf(s, earthed), 'GND');
    const role = roleOf(s);
    if (role === 'ground') s.pins.forEach((_, i) => mark(0, netOf(s, i), groundName(s)));
    else if (role === 'power') mark(1, netOf(s, 0), powerName(s)!);
    else if (role === 'component' && classify(s) === 'source' && POWER_RE.test(s.name.replace(/\s+/g, ''))) {
      mark(2, netOf(s, sourcePins(s).plus), normPower(s.name));
    }
  }
  const fixed = new Map<number, string>();
  for (const level of marks) {
    for (const [net, list] of level) if (!fixed.has(net)) fixed.set(net, [...list].sort(collator.compare)[0]);
  }

  interface Entry { comp: PcbComponent; unit?: string; fp?: FootprintDef; pinNums: Set<number> }
  const entries: Entry[] = [];
  const byRef = new Map<string, Entry>();
  const raw: { entry: Entry; pin: PcbComponentPin; net: number | undefined }[] = [];
  for (const s of symbols) {
    if (roleOf(s) !== 'component') continue;
    const footprintId = guessFootprint(s);
    const unit = isMultiUnit(s) ? unitKey(s) : undefined;
    const name = s.name.trim() || `${prefixOf(s)}?`;
    let ref = unit ? unitBase(name) : name;
    const fp = lookup?.(footprintId);
    const prev = byRef.get(ref.toUpperCase());
    let entry: Entry;
    if (prev && unit && prev.unit === unit) {
      entry = prev;
      entry.comp.units = [...(entry.comp.units ?? [entry.comp.symbolId]), s.id];
    } else {
      if (prev) {
        warnings.push({ key: 'duplicateRef', ref });
        let k = 2;
        while (byRef.has(`${ref}_${k}`.toUpperCase())) k++;
        ref = `${ref}_${k}`;
      }
      entry = { comp: { ref, value: s.value ?? '', symbolId: s.id, symbolName: s.symbolName, footprintId, pins: [] }, unit, fp, pinNums: new Set() };
      byRef.set(ref.toUpperCase(), entry);
      entries.push(entry);
      if (lookup && !fp) warnings.push({ key: 'noFootprint', ref, footprintId });
      if (unit) warnings.push({ key: 'multiUnit', ref });
    }
    const { padOfPin, unmapped } = mapPins(s, fp ?? numberedFootprint(s));
    if (fp) for (const i of unmapped) warnings.push({ key: 'unmappedPin', ref: entry.comp.ref, pin: pinLabel(s.pins[i]) });
    s.pins.forEach((p, i) => {
      entry.pinNums.add(p.num);
      const pad = padOfPin[i];
      if (pad === undefined) return;
      const pin: PcbComponentPin = { pinIndex: i, pinNum: p.num, pad, net: '', symbolId: s.id };
      if (p.name?.trim()) pin.pinName = p.name.trim();
      entry.comp.pins.push(pin);
      raw.push({ entry, pin, net: netOf(s, i) });
    });
  }

  for (const { comp, unit, fp, pinNums } of entries) {
    if (!comp.units) for (const p of comp.pins) delete p.symbolId;
    if (!fp) continue;
    const pads = new Set(electricalPads(fp).map((p) => p.num)).size;
    const pins = pinNums.size;
    if (pins > pads || (pads > pins && !unit && !IC_FOOTPRINT_RE.test(fp.id))) {
      warnings.push({ key: 'pinMismatch', ref: comp.ref, footprintId: comp.footprintId, pins, pads });
    }
  }

  // automatic names: alphabetically first designator and its lowest pad on the net
  const best = new Map<number, { ref: string; pad: string }>();
  for (const r of raw) {
    if (r.net === undefined) continue;
    const b = best.get(r.net);
    const ref = r.entry.comp.ref;
    const c = b ? collator.compare(ref, b.ref) || collator.compare(r.pin.pad, b.pad) : -1;
    if (c < 0) best.set(r.net, { ref, pad: r.pin.pad });
  }
  const names = new Map<number, string>();
  const owner = new Map<string, string>();
  const claim = (name: string, key: string) => {
    let n = name;
    for (let k = 2; owner.has(n) && owner.get(n) !== key; k++) n = `${name}_${k}`;
    owner.set(n, key);
    return n;
  };
  for (const [net, name] of fixed) names.set(net, claim(name, `fixed:${name}`));
  const auto = [...best].filter(([net]) => !fixed.has(net)).sort(([, a], [, b]) => collator.compare(a.ref, b.ref) || collator.compare(a.pad, b.pad));
  for (const [net, { ref, pad }] of auto) {
    const n = conn.nets[net];
    const single = n.wires.length === 0 && n.pins.length === 1;
    names.set(net, single ? claim(`unconnected-(${ref}-Pad${pad})`, `u:${ref}:${pad}`) : claim(`Net-(${ref}-Pad${pad})`, `n:${net}`));
  }
  for (const r of raw) {
    r.pin.net = (r.net !== undefined ? names.get(r.net) : undefined) ?? claim(`unconnected-(${r.entry.comp.ref}-Pad${r.pin.pad})`, `u:${r.entry.comp.ref}:${r.pin.pad}`);
  }

  const used = new Set(raw.map((r) => r.pin.net));
  const fixedNames = new Set(fixed.values());
  const group = (n: string) => (fixedNames.has(n) ? 0 : n.startsWith('unconnected-') ? 2 : 1);
  const nets = [...used].sort((a, b) => group(a) - group(b) || collator.compare(a, b));
  return { components: entries.map((e) => e.comp), nets, warnings, names };
}

/**
 * Names of the schematic nets (connectivity net index -> name): ground and supply
 * symbols name their nets, the rest get KiCad style names. Without a lookup the pin
 * numbers stand in for pad numbers.
 */
export function netNames(doc: Doc, lookup?: FootprintLookup): Map<number, string> {
  return analyse(doc, lookup).names;
}

/** Components with footprints and pad nets for building a PCB from a schematic. */
export function extractPcbNetlist(schematic: Doc, lookup: FootprintLookup): PcbNetlist {
  const { components, nets, warnings } = analyse(schematic, lookup);
  return { components, nets, warnings };
}

// ---- annotation -------------------------------------------------------------------------

const DESIGNATOR_RE = /^([A-Za-z]+)(\d+)$/;

/** Proposed designators for unnumbered ("R?", "Capacitor") and duplicate components. */
export function annotate(doc: Doc): { id: string; name: string }[] {
  const max = new Map<string, number>();
  for (const it of doc.items) {
    if (!('name' in it) || typeof it.name !== 'string') continue;
    const m = DESIGNATOR_RE.exec(unitBase(it.name.trim()));
    if (m) max.set(m[1].toUpperCase(), Math.max(max.get(m[1].toUpperCase()) ?? 0, parseInt(m[2], 10)));
  }
  const next = (prefix: string) => {
    const n = (max.get(prefix.toUpperCase()) ?? 0) + 1;
    max.set(prefix.toUpperCase(), n);
    return `${prefix}${n}`;
  };
  // designator -> unit key of its first symbol ('' for single unit parts)
  const seen = new Map<string, string>();
  const out: { id: string; name: string }[] = [];
  for (const it of doc.items) {
    if (it.kind !== 'symbol' || roleOf(it) !== 'component') continue;
    const raw = it.name.trim();
    const unit = isMultiUnit(it) ? unitKey(it) : '';
    const m = DESIGNATOR_RE.exec(unit ? unitBase(raw) : raw);
    if (m) {
      const key = m[0].toUpperCase();
      const prev = seen.get(key);
      if (prev === undefined) seen.set(key, unit);
      else if (!unit || prev !== unit) out.push({ id: it.id, name: next(m[1]) });
      continue;
    }
    const short = raw.replace(/[?*#!_.\s-]+$/, '');
    const prefix = /^[A-Za-z]{1,3}$/.test(short) && !POWER_RE.test(short) ? short.toUpperCase() : prefixOf(it);
    out.push({ id: it.id, name: next(prefix) });
  }
  return out;
}
