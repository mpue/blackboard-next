// Reading and writing the XML formats of BlackBoard 1.x/2.x (JAXB beans).
// Board files keep symbol shapes in absolute coordinates while pins are
// relative to the symbol origin; internally all symbol geometry is local.

import { child, childrenNamed, num, bool, text, rawText, XmlWriter, type XmlNode } from './xml.ts';
import { uid } from '../model/id.ts';
import type {
  BoardType,
  BoxGeom,
  DiodeType,
  Doc,
  EdgeType,
  EllipseGeom,
  Item,
  Layer,
  LineGeom,
  PartDef,
  Pin,
  PinOrientation,
  ShapeStyle,
  SpiceModel,
  SpiceType,
  SymbolDef,
  SymbolItem,
  SymbolShape,
  TextGeom,
  TextType,
} from '../model/types.ts';
import { isBoardLayer } from '../model/types.ts';

// ---- primitives ---------------------------------------------------------------

export function parseColor(node: XmlNode | undefined, fallback = '#000000'): string {
  const c = node && child(node, 'color');
  if (!c) return fallback;
  return rgbToHex(num(c, 'red'), num(c, 'green'), num(c, 'blue'));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function parseDash(node: XmlNode): number[] | undefined {
  const d = childrenNamed(node, 'dashArray').map((c) => parseFloat(c.text)).filter(Number.isFinite);
  return d.length ? d : undefined;
}

function pinsOf(node: XmlNode | undefined): Pin[] {
  return childrenNamed(child(node, 'connections'), 'pin').map((p) => {
    const pin: Pin = { num: num(p, 'num'), x: num(p, 'x'), y: num(p, 'y') };
    const name = text(p, 'name');
    if (name) pin.name = name;
    const o = text(p, 'orientation');
    if (o) pin.orientation = o as PinOrientation;
    return pin;
  });
}

function parseLineGeom(n: XmlNode, dx = 0, dy = 0): LineGeom {
  const s = child(n, 'start');
  const e = child(n, 'end');
  const g: LineGeom = {
    kind: 'line',
    x1: num(s, 'x') - dx,
    y1: num(s, 'y') - dy,
    x2: num(e, 'x') - dx,
    y2: num(e, 'y') - dy,
    color: parseColor(n),
    thickness: num(n, 'thickness', 2) || 2,
    startType: (text(n, 'startType') || 'STRAIGHT') as EdgeType,
    endType: (text(n, 'endType') || 'STRAIGHT') as EdgeType,
  };
  const dash = parseDash(n);
  if (dash) g.dash = dash;
  return g;
}

function parseBoxGeom(n: XmlNode, dx = 0, dy = 0): BoxGeom {
  const g: BoxGeom = {
    kind: 'box',
    x: num(n, 'xLoc') - dx,
    y: num(n, 'yLoc') - dy,
    w: num(n, 'width'),
    h: num(n, 'height'),
    color: parseColor(n),
    thickness: num(n, 'thickness', 1) || 1,
    style: (text(n, 'style') || 'FILLED') as ShapeStyle,
  };
  const dash = parseDash(n);
  if (dash) g.dash = dash;
  return g;
}

function parseEllipseGeom(n: XmlNode, dx = 0, dy = 0): EllipseGeom {
  const arc = num(n, 'rotation', 360);
  const g: EllipseGeom = {
    kind: 'ellipse',
    x: num(n, 'xLoc') - dx,
    y: num(n, 'yLoc') - dy,
    w: num(n, 'width'),
    h: num(n, 'height'),
    color: parseColor(n),
    thickness: num(n, 'thickness', 1) || 1,
    style: (text(n, 'style') || 'FILLED') as ShapeStyle,
    startAngle: num(n, 'startAngle'),
    arcAngle: arc === 0 ? 360 : arc,
  };
  const dash = parseDash(n);
  if (dash) g.dash = dash;
  return g;
}

function parseTextGeom(n: XmlNode, dx = 0, dy = 0): TextGeom {
  return {
    kind: 'text',
    x: num(n, 'xLoc') - dx,
    y: num(n, 'yLoc') - dy,
    text: rawText(n, 'text') ?? '',
    font: text(n, 'font') || 'Arial',
    fontSize: num(n, 'fontsize', 12) || 12,
    rotation: num(n, 'rotation'),
    textType: (text(n, 'type') || 'TEXT') as TextType,
    color: parseColor(n),
  };
}

function parseModel(n: XmlNode | undefined): SpiceModel | undefined {
  if (!n) return undefined;
  const m: SpiceModel = { name: text(n, 'name'), content: rawText(n, 'content') ?? '' };
  const t = text(n, 'type');
  if (t) m.type = t as SpiceType;
  const f = text(n, 'filename');
  if (f) m.filename = f;
  return m.name || m.content ? m : undefined;
}

function parseProperties(n: XmlNode | undefined): Record<string, string> | undefined {
  if (!n) return undefined;
  const props: Record<string, string> = {};
  for (const e of childrenNamed(n, 'entry')) props[text(e, 'key')] = text(e, 'value');
  return Object.keys(props).length ? props : undefined;
}

// ---- symbols & parts --------------------------------------------------------------

const CATEGORY_MAP: [RegExp, string][] = [
  [/^(passi|passiv)/i, 'Passive'],
  [/^(activ|aktiv|active|sctiv)/i, 'Active'],
  [/^(semi|diode)/i, 'Semiconductors'],
  [/^(stecker|steck|connector|klemmen)/i, 'Connectors'],
  [/^(opt)/i, 'Optoelectronics'],
  [/^(source)/i, 'Sources'],
  [/^(digital)/i, 'Digital'],
  [/^(schalter|relais)/i, 'Switches'],
  [/^(microcontroller)/i, 'Microcontrollers'],
  [/^(analog)/i, 'Active'],
  [/^(acoustic|piezo|signalgeber)/i, 'Acoustic'],
];

/** The shipped symbol library uses ~40 spellings for a dozen categories. */
export function normalizeCategory(raw: string): string {
  const c = raw.trim();
  if (!c) return 'Misc';
  for (const [re, name] of CATEGORY_MAP) if (re.test(c)) return name;
  return 'Misc';
}

export function parseSymbolBean(n: XmlNode): { def: SymbolDef; x: number; y: number; rotation: number; mirrorH: boolean; mirrorV: boolean } {
  const x = num(n, 'xLoc');
  const y = num(n, 'yLoc');
  const shapes: SymbolShape[] = [
    ...childrenNamed(n, 'lines').map((l) => parseLineGeom(l, x, y)),
    ...childrenNamed(n, 'boxes').map((b) => parseBoxGeom(b, x, y)),
    ...childrenNamed(n, 'ellipses').map((e) => parseEllipseGeom(e, x, y)),
    ...childrenNamed(n, 'textparts').map((t) => parseTextGeom(t, x, y)),
  ];
  const def: SymbolDef = {
    name: text(n, 'name'),
    category: text(n, 'category'),
    width: num(n, 'width'),
    height: num(n, 'height'),
    value: rawText(n, 'value')?.trim() ?? '',
    customModel: bool(n, 'customModel'),
    pins: pinsOf(n),
    shapes,
  };
  const filename = text(n, 'filename');
  if (filename) def.filename = filename;
  const type = text(n, 'type');
  if (type) def.spiceType = type as SpiceType;
  const model = parseModel(child(n, 'model'));
  if (model) def.model = model;
  const props = parseProperties(child(n, 'properties'));
  if (props) def.properties = props;
  return {
    def,
    x,
    y,
    rotation: num(n, 'rotation'),
    mirrorH: bool(n, 'mirrorHorizontal'),
    mirrorV: bool(n, 'mirrorVertical'),
  };
}

export function parsePartDef(n: XmlNode, file: string, imageUrl: (imageName: string) => string): PartDef {
  const imageName = text(n, 'imageName');
  const def: PartDef = {
    file,
    name: text(n, 'name') || file.replace(/\.xml$/i, ''),
    description: text(n, 'description'),
    packageType: text(n, 'packageType'),
    designator: text(n, 'designator') || 'U',
    width: num(n, 'width'),
    height: num(n, 'height'),
    imageName,
    image: imageUrl(imageName),
    pins: pinsOf(n),
  };
  const author = text(n, 'author');
  if (author) def.author = author;
  const license = text(n, 'license');
  if (license) def.license = license;
  return def;
}

export function parseModelFile(n: XmlNode, filename: string): SpiceModel {
  return parseModel(n) ?? { name: filename.replace(/\.xml$/i, ''), content: '', filename };
}

/** Places a library symbol definition as a board item. */
export function symbolItemFromDef(def: SymbolDef, x: number, y: number, layer: string, name: string): SymbolItem {
  const { name: symbolName, value, ...rest } = structuredClone(def);
  return {
    ...rest,
    id: uid(),
    kind: 'symbol',
    layer,
    x,
    y,
    rotation: 0,
    mirrorH: false,
    mirrorV: false,
    name,
    value,
    symbolName,
  };
}

// ---- boards ---------------------------------------------------------------------

export interface PartResolver {
  (filename: string): PartDef | undefined;
}

/**
 * Converts a legacy board XML into a document. Parts are looked up through
 * `resolvePart` (embedded parts of the .bb archive first, then the library).
 */
export function parseBoard(root: XmlNode, resolvePart: PartResolver): { doc: Doc; missingParts: string[] } {
  const layerNodes = childrenNamed(root, 'layers');
  const layers: Layer[] = layerNodes
    .map((l) => ({
      index: num(l, 'index'),
      layer: {
        id: `L${num(l, 'index')}`,
        name: text(l, 'name') || 'Layer',
        visible: bool(l, 'visible', true),
        locked: bool(l, 'locked'),
        opacity: num(l, 'opacity', 1),
        color: parseColor(l),
      } satisfies Layer,
    }))
    .sort((a, b) => a.index - b.index)
    .map((l) => l.layer);
  const type = (text(root, 'type') || 'BLANK') as BoardType;
  if (!layers.length) layers.push(...defaultLayers(type));
  const layerIds = new Set(layers.map((l) => l.id));
  const fallbackLayer = (layers.find((l) => !isBoardLayer(l)) ?? layers[0]).id;
  const layerOf = (n: XmlNode) => {
    const id = `L${num(n, 'layer')}`;
    return layerIds.has(id) ? id : fallbackLayer;
  };

  const ordered: { index: number; item: Item }[] = [];
  const push = (n: XmlNode, item: Item) => ordered.push({ index: num(n, 'index'), item });

  const parts: Record<string, PartDef> = {};
  const missingParts: string[] = [];

  for (const n of childrenNamed(root, 'textParts')) {
    push(n, { ...parseTextGeom(n), id: uid(), layer: layerOf(n) });
  }
  for (const n of childrenNamed(root, 'parts')) {
    const ref = text(n, 'filename');
    if (!parts[ref]) {
      const def = resolvePart(ref);
      if (def) parts[ref] = def;
      else missingParts.push(ref);
    }
    const value = rawText(n, 'value')?.trim();
    push(n, {
      id: uid(),
      kind: 'part',
      layer: layerOf(n),
      x: num(n, 'xLoc'),
      y: num(n, 'yLoc'),
      rotation: num(n, 'rotation'),
      name: text(n, 'name'),
      ...(value ? { value } : {}),
      ref,
    });
  }
  for (const n of childrenNamed(root, 'lines')) {
    push(n, { ...parseLineGeom(n), id: uid(), layer: layerOf(n) });
  }
  for (const n of childrenNamed(root, 'resistors')) {
    const g = parseLineGeom(n);
    push(n, {
      id: uid(),
      kind: 'resistor',
      layer: layerOf(n),
      x1: g.x1,
      y1: g.y1,
      x2: g.x2,
      y2: g.y2,
      name: text(n, 'name') || 'R',
      value: num(n, 'value', 1000),
      tolerance: num(n, 'tolerance', 5),
    });
  }
  for (const n of childrenNamed(root, 'diodes')) {
    const g = parseLineGeom(n);
    push(n, {
      id: uid(),
      kind: 'diode',
      layer: layerOf(n),
      x1: g.x1,
      y1: g.y1,
      x2: g.x2,
      y2: g.y2,
      name: text(n, 'name') || 'D',
      value: text(n, 'value') || '1N4148',
      diodeType: (text(n, 'type') || 'DO35') as DiodeType,
    });
  }
  for (const n of childrenNamed(root, 'boxes')) {
    push(n, { ...parseBoxGeom(n), id: uid(), layer: layerOf(n) });
  }
  for (const n of childrenNamed(root, 'ellipses')) {
    push(n, { ...parseEllipseGeom(n), id: uid(), layer: layerOf(n) });
  }
  for (const n of childrenNamed(root, 'symbols')) {
    const s = parseSymbolBean(n);
    const { name, value, ...def } = s.def;
    push(n, {
      ...def,
      id: uid(),
      kind: 'symbol',
      layer: layerOf(n),
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      mirrorH: s.mirrorH,
      mirrorV: s.mirrorV,
      name,
      value,
      symbolName: def.filename?.replace(/\.xml$/i, '') ?? name,
    });
  }

  ordered.sort((a, b) => a.index - b.index);
  const doc: Doc = {
    width: num(root, 'width', 640) || 640,
    height: num(root, 'height', 480) || 480,
    type,
    layers,
    items: ordered.map((o) => o.item),
    parts,
  };
  const bg = text(root, 'backgroundImage');
  if (bg) doc.backgroundImage = bg;
  return { doc, missingParts };
}

export function defaultLayers(type: BoardType): Layer[] {
  const mk = (id: string, name: string, color: string): Layer => ({ id, name, visible: true, locked: false, opacity: 1, color });
  if (type === 'SCHEMATICS') {
    return [mk('L0', 'Top', '#1e6fd9'), mk('L1', 'Bottom', '#0000ff'), mk('L2', 'Parts', '#000000'), mk('L3', 'Board', '#000000')];
  }
  return [mk('L0', 'Parts', '#000000'), mk('L1', 'Top', '#ff0000'), mk('L2', 'Bottom', '#0000ff'), mk('L3', 'Board', '#000000')];
}

// ---- writer -----------------------------------------------------------------------

function writeColor(w: XmlWriter, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  w.open('color').leaf('red', r).leaf('green', g).leaf('blue', b).close('color');
}

function writeStrokeTail(w: XmlWriter, thickness: number, dash: number[] | undefined) {
  w.float('thickness', thickness);
  for (const d of dash ?? []) w.float('dashArray', d);
  w.float('dashPhase', 0).leaf('endCap', 2).leaf('lineJoin', 0).float('miterLimit', 10);
}

function writeLine(w: XmlWriter, tag: string, g: LineGeom, index: number, layer: number, dx = 0, dy = 0) {
  w.open(tag).leaf('xLoc', 0).leaf('yLoc', 0).leaf('index', index);
  writeColor(w, g.color);
  w.leaf('layer', layer);
  w.open('start').leaf('x', Math.round(g.x1 + dx)).leaf('y', Math.round(g.y1 + dy)).close('start');
  w.open('end').leaf('x', Math.round(g.x2 + dx)).leaf('y', Math.round(g.y2 + dy)).close('end');
  w.leaf('startType', g.startType).leaf('endType', g.endType);
  writeStrokeTail(w, g.thickness, g.dash);
  w.close(tag);
}

function writeBox(w: XmlWriter, g: BoxGeom, index: number, layer: number, dx = 0, dy = 0) {
  w.open('boxes').leaf('xLoc', Math.round(g.x + dx)).leaf('yLoc', Math.round(g.y + dy)).leaf('index', index);
  writeColor(w, g.color);
  w.leaf('layer', layer).leaf('width', Math.round(g.w)).leaf('height', Math.round(g.h));
  writeStrokeTail(w, g.thickness, g.dash);
  w.leaf('style', g.style).close('boxes');
}

function writeEllipse(w: XmlWriter, g: EllipseGeom, index: number, layer: number, dx = 0, dy = 0) {
  w.open('ellipses').leaf('xLoc', Math.round(g.x + dx)).leaf('yLoc', Math.round(g.y + dy)).leaf('index', index);
  writeColor(w, g.color);
  w.leaf('layer', layer).leaf('width', Math.round(g.w)).leaf('height', Math.round(g.h));
  writeStrokeTail(w, g.thickness, g.dash);
  w.leaf('style', g.style).leaf('startAngle', Math.round(g.startAngle)).leaf('rotation', Math.round(g.arcAngle)).close('ellipses');
}

function writeText(w: XmlWriter, tag: string, g: TextGeom, index: number, layer: number, dx = 0, dy = 0) {
  w.open(tag).leaf('xLoc', Math.round(g.x + dx)).leaf('yLoc', Math.round(g.y + dy)).leaf('index', index);
  writeColor(w, g.color);
  w.leaf('layer', layer).leaf('width', 0).leaf('height', 0).leaf('rotation', Math.round(g.rotation));
  w.leaf('text', g.text).leaf('font', g.font).leaf('fontsize', Math.round(g.fontSize)).leaf('type', g.textType);
  w.close(tag);
}

function writePins(w: XmlWriter, pins: Pin[]) {
  w.open('connections');
  for (const p of pins) {
    w.open('pin').leaf('x', p.x).leaf('y', p.y).leaf('num', p.num).leaf('name', p.name).leaf('orientation', p.orientation).close('pin');
  }
  w.close('connections');
}

export interface SymbolPlacement {
  x: number;
  y: number;
  rotation: number;
  mirrorH: boolean;
  mirrorV: boolean;
  index: number;
  layer: number;
}

export function writeSymbol(w: XmlWriter, tag: string, def: SymbolDef, p: SymbolPlacement) {
  const { x, y } = p;
  w.open(tag).leaf('value', def.value).leaf('rotation', Math.round(p.rotation)).leaf('xLoc', Math.round(x)).leaf('yLoc', Math.round(y));
  w.leaf('index', p.index);
  writeColor(w, '#000000');
  w.leaf('layer', p.layer).leaf('name', def.name).leaf('category', def.category).leaf('width', Math.round(def.width)).leaf('height', Math.round(def.height));
  for (const s of def.shapes) if (s.kind === 'line') writeLine(w, 'lines', s, 0, p.layer, x, y);
  for (const s of def.shapes) if (s.kind === 'ellipse') writeEllipse(w, s, 0, p.layer, x, y);
  for (const s of def.shapes) if (s.kind === 'box') writeBox(w, s, 0, p.layer, x, y);
  for (const s of def.shapes) if (s.kind === 'text') writeText(w, 'textparts', s, 0, p.layer, x, y);
  w.leaf('mirrorVertical', p.mirrorV).leaf('mirrorHorizontal', p.mirrorH);
  writePins(w, def.pins);
  w.leaf('customModel', def.customModel);
  if (def.model) {
    w.open('model').leaf('filename', def.model.filename).leaf('name', def.model.name).leaf('content', def.model.content).leaf('type', def.model.type).close('model');
  }
  w.leaf('type', def.spiceType).leaf('filename', def.filename);
  if (def.properties) {
    w.open('properties', { 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance' });
    for (const [k, v] of Object.entries(def.properties)) {
      w.open('entry')
        .leaf('key', k, { 'xsi:type': 'xs:string', 'xmlns:xs': 'http://www.w3.org/2001/XMLSchema' })
        .leaf('value', v, { 'xsi:type': 'xs:string', 'xmlns:xs': 'http://www.w3.org/2001/XMLSchema' })
        .close('entry');
    }
    w.close('properties');
  }
  w.close(tag);
}

export function symbolDefOf(s: SymbolItem): SymbolDef {
  const def: SymbolDef = {
    name: s.name,
    category: s.category,
    width: s.width,
    height: s.height,
    value: s.value,
    customModel: s.customModel,
    pins: s.pins,
    shapes: s.shapes,
  };
  if (s.filename) def.filename = s.filename;
  if (s.spiceType) def.spiceType = s.spiceType;
  if (s.model) def.model = s.model;
  if (s.properties) def.properties = s.properties;
  return def;
}

/** Serialises a document as BoardBean XML (BlackBoard 1.x/2.x compatible). */
export function serializeBoard(doc: Doc): string {
  const layerIndex = new Map(doc.layers.map((l, i) => [l.id, i]));
  const li = (id: string) => layerIndex.get(id) ?? 0;
  const indexOf = new Map(doc.items.map((it, i) => [it.id, i + 1]));
  const ix = (id: string) => indexOf.get(id) ?? 0;
  const w = new XmlWriter();
  w.open('boardBean');
  for (const it of doc.items) if (it.kind === 'text') writeText(w, 'textParts', it, ix(it.id), li(it.layer));
  for (const it of doc.items) {
    if (it.kind !== 'part') continue;
    const def = doc.parts[it.ref];
    w.open('parts').leaf('xLoc', Math.round(it.x)).leaf('yLoc', Math.round(it.y)).leaf('index', ix(it.id));
    writeColor(w, '#000000');
    w.leaf('layer', li(it.layer)).leaf('name', it.name).leaf('width', def?.width ?? 0).leaf('height', def?.height ?? 0);
    w.leaf('filename', it.ref).leaf('rotation', Math.round(it.rotation)).leaf('value', it.value);
    w.close('parts');
  }
  for (const it of doc.items) if (it.kind === 'line') writeLine(w, 'lines', it, ix(it.id), li(it.layer));
  for (const it of doc.items) {
    if (it.kind !== 'resistor') continue;
    w.open('resistors').leaf('name', it.name).leaf('xLoc', 0).leaf('yLoc', 0).leaf('index', ix(it.id)).leaf('layer', li(it.layer));
    w.open('start').leaf('x', Math.round(it.x1)).leaf('y', Math.round(it.y1)).close('start');
    w.open('end').leaf('x', Math.round(it.x2)).leaf('y', Math.round(it.y2)).close('end');
    w.float('thickness', 0).float('dashPhase', 0).leaf('endCap', 0).leaf('lineJoin', 0).float('miterLimit', 0);
    w.leaf('value', Math.round(it.value)).float('tolerance', it.tolerance).close('resistors');
  }
  for (const it of doc.items) {
    if (it.kind !== 'diode') continue;
    w.open('diodes').leaf('name', it.name).leaf('xLoc', 0).leaf('yLoc', 0).leaf('index', ix(it.id)).leaf('layer', li(it.layer));
    w.open('start').leaf('x', Math.round(it.x1)).leaf('y', Math.round(it.y1)).close('start');
    w.open('end').leaf('x', Math.round(it.x2)).leaf('y', Math.round(it.y2)).close('end');
    w.float('thickness', 0).float('dashPhase', 0).leaf('endCap', 0).leaf('lineJoin', 0).float('miterLimit', 0);
    w.leaf('value', it.value).leaf('type', it.diodeType).close('diodes');
  }
  for (const it of doc.items) if (it.kind === 'box') writeBox(w, it, ix(it.id), li(it.layer));
  for (const it of doc.items) if (it.kind === 'ellipse') writeEllipse(w, it, ix(it.id), li(it.layer));
  for (const it of doc.items) {
    if (it.kind !== 'symbol') continue;
    writeSymbol(w, 'symbols', symbolDefOf(it), {
      x: it.x,
      y: it.y,
      rotation: it.rotation,
      mirrorH: it.mirrorH,
      mirrorV: it.mirrorV,
      index: ix(it.id),
      layer: li(it.layer),
    });
  }
  doc.layers.forEach((l, i) => {
    w.open('layers').leaf('index', i).leaf('name', l.name).leaf('visible', l.visible).leaf('locked', l.locked).float('opacity', l.opacity);
    writeColor(w, l.color);
    w.close('layers');
  });
  w.leaf('width', Math.round(doc.width)).leaf('height', Math.round(doc.height)).leaf('type', doc.type).leaf('backgroundImage', doc.backgroundImage);
  w.close('boardBean');
  return w.toString();
}

export function serializePartDef(def: PartDef): string {
  const w = new XmlWriter();
  w.open('part').leaf('author', def.author).leaf('license', def.license);
  w.leaf('width', def.width).leaf('height', def.height).leaf('xLoc', 0).leaf('yLoc', 0);
  w.leaf('name', def.name).leaf('imageName', def.imageName).leaf('description', def.description);
  w.leaf('packageType', def.packageType).leaf('rotation', 0).leaf('designator', def.designator);
  if (def.pins.length) {
    w.open('connections');
    for (const p of def.pins) w.open('pin').leaf('num', p.num).leaf('x', p.x).leaf('y', p.y).leaf('name', p.name).close('pin');
    w.close('connections');
  }
  w.close('part');
  return w.toString();
}

/** Symbol library file (root element <symbolBean>). */
export function serializeSymbolDef(def: SymbolDef): string {
  const w = new XmlWriter();
  writeSymbol(w, 'symbolBean', def, { x: 0, y: 0, rotation: 0, mirrorH: false, mirrorV: false, index: 0, layer: 0 });
  return w.toString();
}
