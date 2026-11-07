// Document model of BlackBoard. Coordinates are in board units: one unit is one
// pixel of the original application, the raster is 16 units = 0.1" = 2.54 mm.

export const RASTER = 16;
export const MM_PER_UNIT = 2.54 / RASTER;

export type BoardType = 'HOLES' | 'STRIPES' | 'BLANK' | 'SCHEMATICS' | 'CUSTOM';
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

export type Item = LineItem | BoxItem | EllipseItem | TextItem | ResistorItem | DiodeItem | PartItem | SymbolItem;
export type ItemKind = Item['kind'];
export type TwoPointItem = LineItem | ResistorItem | DiodeItem;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  color: string;
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
}

export function isBoardLayer(l: Layer): boolean {
  return l.name.toLowerCase() === 'board';
}

export function isTwoPoint(i: Item): i is TwoPointItem {
  return i.kind === 'line' || i.kind === 'resistor' || i.kind === 'diode';
}
