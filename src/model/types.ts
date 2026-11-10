// Document model of BlackBoard. Coordinates are in board units: one unit is one
// pixel of the original application, the raster is 16 units = 0.1" = 2.54 mm.

export const RASTER = 16;
export const MM_PER_UNIT = 2.54 / RASTER;

export type BoardType = 'HOLES' | 'STRIPES' | 'BLANK' | 'SCHEMATICS' | 'CUSTOM' | 'PCB';
export type EdgeType = 'STRAIGHT' | 'ROUND_DOT' | 'SIMPLE_ARROW';
export type ShapeStyle = 'OUTLINED' | 'FILLED' | 'OUTLINED_FILLED';
export type TextType = 'TEXT' | 'NAME' | 'VALUE' | 'SPICE_DIRECTIVE' | 'CONTROL';
export type PinOrientation = 'TOP_LEFT' | 'BOTTOM_LEFT' | 'TOP_RIGHT' | 'BOTTOM_RIGHT';
export type DiodeType = 'DO35' | 'DO41' | 'DO7' | 'SOD57';
export type SpiceType =
  | 'DIODE'
  | 'NPN'
  | 'PNP'
  | 'MOSFET'
  | 'RESISTOR'
  | 'CAPACITOR'
  | 'INDUCTOR'
  | 'VOLTAGE_CONTROLLED_SWITCH'
  | 'CURRENT_CONTROLLED_SWITCH'
  | 'VOLTAGE_SOURCE'
  | 'SUBCIRCUIT';

export interface Pin {
  num: number;
  x: number;
  y: number;
  name?: string;
  orientation?: PinOrientation;
}

export interface SpiceModel {
  name: string;
  content: string;
  type?: SpiceType;
  filename?: string;
}

// ---- geometry shared by board items and symbol shapes ------------------------

export interface LineGeom {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness: number;
  startType: EdgeType;
  endType: EdgeType;
  dash?: number[];
}

export interface BoxGeom {
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  thickness: number;
  style: ShapeStyle;
  dash?: number[];
}

export interface EllipseGeom {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  thickness: number;
  style: ShapeStyle;
  /** degrees, counter clockwise from 3 o'clock (java.awt.Graphics#drawArc) */
  startAngle: number;
  /** arc extent in degrees, 360 = full ellipse */
  arcAngle: number;
  dash?: number[];
}

export interface TextGeom {
  kind: 'text';
  /** baseline origin */
  x: number;
  y: number;
  text: string;
  font: string;
  fontSize: number;
  rotation: number;
  textType: TextType;
  color: string;
}

export type SymbolShape = LineGeom | BoxGeom | EllipseGeom | TextGeom;

export interface SymbolDef {
  name: string;
  filename?: string;
  category: string;
  width: number;
  height: number;
  value: string;
  spiceType?: SpiceType;
  model?: SpiceModel;
  customModel: boolean;
  properties?: Record<string, string>;
  pins: Pin[];
  /** shapes in symbol local coordinates (origin = top left of the symbol) */
  shapes: SymbolShape[];
}

export interface PartDef {
  file: string;
  name: string;
  description: string;
  packageType: string;
  designator: string;
  author?: string;
  license?: string;
  width: number;
  height: number;
  imageName: string;
  /** URL (library) or data URL (embedded in a .bb file) */
  image: string;
  pins: Pin[];
}

// ---- board items ---------------------------------------------------------------

interface ItemBase {
  id: string;
  layer: string;
}

export type LineItem = ItemBase & LineGeom;
export type BoxItem = ItemBase & BoxGeom;
export type EllipseItem = ItemBase & EllipseGeom;
export type TextItem = ItemBase & TextGeom;

export interface ResistorItem extends ItemBase {
  kind: 'resistor';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  name: string;
  /** ohms */
  value: number;
  /** percent */
  tolerance: number;
}

export interface DiodeItem extends ItemBase {
  kind: 'diode';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  name: string;
  value: string;
  diodeType: DiodeType;
}

export interface PartItem extends ItemBase {
  kind: 'part';
  x: number;
  y: number;
  rotation: number;
  name: string;
  value?: string;
  /** key into Doc.parts */
  ref: string;
}

export interface SymbolItem extends ItemBase, Omit<SymbolDef, 'name' | 'value'> {
  kind: 'symbol';
  x: number;
  y: number;
  rotation: number;
  mirrorH: boolean;
  mirrorV: boolean;
  /** designator, e.g. R1 */
  name: string;
  value: string;
  /** library name of the symbol, e.g. "Capacitor" */
  symbolName: string;
}

// ---- printed circuit boards ------------------------------------------------------
//
// PCB geometry uses board units as well (floats; see src/pcb/units.ts for mm and
// mil conversions). Footprints are embedded into the document like symbols, so a
// board stays self contained. Angles are degrees, clockwise (y points down).

export type CopperSide = 'top' | 'bottom';
export type PadShape = 'circle' | 'rect' | 'oval' | 'roundrect';

export interface PadDef {
  /** pad number as in the datasheet: "1", "2", "A1" */
  num: string;
  /** optional function, e.g. "B"/"C"/"E": symbol pins are then mapped by name */
  name?: string;
  /** centre in footprint coordinates */
  x: number;
  y: number;
  shape: PadShape;
  /** copper size */
  w: number;
  h: number;
  rotation?: number;
  /** corner radius as a fraction of the smaller side (roundrect), 0..0.5 */
  roundness?: number;
  /** plated through hole diameter; without a drill the pad is SMD on the footprint side */
  drill?: number;
  /** non plated hole without copper (mounting holes) */
  npth?: boolean;
}

export type FootprintGraphic =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; width: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; width: number; fill?: boolean }
  /** start and sweep in degrees, clockwise from +x */
  | { kind: 'arc'; cx: number; cy: number; r: number; start: number; sweep: number; width: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; width: number; fill?: boolean };

export interface FootprintDef {
  /** library id, e.g. "DIP-8_W7.62mm" */
  id: string;
  name: string;
  description: string;
  /** library group, e.g. "DIP", "Resistors THT", "Chip SMD" */
  category: string;
  /** THT footprints have their origin on pad 1, SMD footprints in the body centre */
  pads: PadDef[];
  /** silkscreen in footprint coordinates */
  silk: FootprintGraphic[];
  /** body outline incl. clearance, used for placement and overlap checks */
  courtyard: { x: number; y: number; w: number; h: number };
  /** reference designator text position */
  refPos?: { x: number; y: number };
  /** search keywords */
  tags?: string[];
}

export interface FootprintItem extends ItemBase {
  kind: 'footprint';
  /** origin in world coordinates */
  x: number;
  y: number;
  rotation: number;
  /** bottom side footprints are mirrored (seen through the board from the top) */
  side: CopperSide;
  /** designator, links the footprint to the schematic symbol */
  name: string;
  value: string;
  footprint: FootprintDef;
  /** pad number -> net name */
  nets: Record<string, string>;
  /** designator position relative to the origin (unrotated); default footprint.refPos */
  refOffset?: { x: number; y: number };
}

export interface TrackItem extends ItemBase {
  kind: 'track';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  /** the copper layer is the item layer (role top-copper / bottom-copper) */
  net?: string;
}

export interface ViaItem extends ItemBase {
  kind: 'via';
  x: number;
  y: number;
  diameter: number;
  drill: number;
  net?: string;
}

export interface ZoneItem extends ItemBase {
  kind: 'zone';
  /** outline, closed implicitly */
  points: { x: number; y: number }[];
  net: string;
  /** copper clearance to other nets; default: design rules */
  clearance?: number;
  /** pads of the zone net: thermal relief spokes or solid connection */
  connect?: 'thermal' | 'solid';
  priority?: number;
}

export type PcbItem = FootprintItem | TrackItem | ViaItem | ZoneItem;

export type Item = LineItem | BoxItem | EllipseItem | TextItem | ResistorItem | DiodeItem | PartItem | SymbolItem | PcbItem;
export type ItemKind = Item['kind'];
export type TwoPointItem = LineItem | ResistorItem | DiodeItem | TrackItem;

export type LayerRole = 'top-copper' | 'bottom-copper' | 'top-silk' | 'bottom-silk' | 'outline';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  color: string;
  /** physical meaning on PCBs */
  role?: LayerRole;
}

export interface DesignRules {
  /** copper to copper of different nets */
  clearance: number;
  trackWidth: number;
  /** tracks of supply nets (GND, VCC, +5V …) */
  powerTrackWidth: number;
  viaDiameter: number;
  viaDrill: number;
  minTrackWidth: number;
  minDrill: number;
  minAnnularRing: number;
  /** copper to board edge */
  edgeClearance: number;
  /** single sided boards (home etching) only use the bottom copper */
  copperLayers: 1 | 2;
}

export interface PcbSettings {
  rules: DesignRules;
  /** file name of the schematic the board was created from */
  schematic?: string;
  /** rounded board corners */
  cornerRadius?: number;
  /** free board outline (closed polygon); the rectangle when absent */
  outline?: { x: number; y: number }[];
}

export interface Doc {
  width: number;
  height: number;
  type: BoardType;
  /** top most layer first */
  layers: Layer[];
  /** per layer the array order is the z-order (later = on top) */
  items: Item[];
  parts: Record<string, PartDef>;
  backgroundImage?: string;
  /** only on PCB documents */
  pcb?: PcbSettings;
}

export function isBoardLayer(l: Layer): boolean {
  return l.role === 'outline' || l.name.toLowerCase() === 'board';
}

export function isTwoPoint(i: Item): i is TwoPointItem {
  return i.kind === 'line' || i.kind === 'resistor' || i.kind === 'diode' || i.kind === 'track';
}

/** Circuit diagrams: schematics, and older boards drawn with symbols (often typed BLANK). */
export function isSchematicDoc(doc: Doc): boolean {
  return doc.type === 'SCHEMATICS' || (doc.type !== 'PCB' && doc.items.some((i) => i.kind === 'symbol'));
}

export function isPcbItem(i: Item): i is PcbItem {
  return i.kind === 'footprint' || i.kind === 'track' || i.kind === 'via' || i.kind === 'zone';
}
