// Small construction kit for the start documents of lessons: places library
// symbols by one of their pins on the raster and draws wires between pins.

import type { Doc, Item, LineItem, SymbolDef, SymbolItem, TextItem } from '../model/types.ts';
import { RASTER } from '../model/types.ts';
import { defaultLayers, symbolItemFromDef } from '../io/legacy.ts';
import { itemBounds, itemPins, unionRect, type Pt, type Rect } from '../geometry/geom.ts';
import { uid } from '../model/id.ts';

export interface PlaceOptions {
  /** pin number that lands on `at` (default: the first pin) */
  pin?: number;
  /** degrees, multiples of 90 */
  rotation?: number;
  value?: string;
  props?: Record<string, string>;
}

export class CircuitBuilder {
  readonly layers = defaultLayers('SCHEMATICS');
  readonly layer = this.layers[0].id;
  readonly items: Item[] = [];
  private readonly library: SymbolDef[];

  constructor(library: SymbolDef[]) {
    this.library = library;
  }

  /** Library symbol by its name (as listed in the symbols tab) or file name. */
  def(name: string): SymbolDef {
    const d = this.library.find((s) => s.name === name) ?? this.library.find((s) => s.filename === name || s.filename === `${name}.xml`);
    if (!d) throw new Error(`symbol "${name}" is not in the library`);
    return d;
  }

  /** Places a symbol so that one of its pins sits exactly on `at` (snapped to the raster). */
  add(name: string, ref: string, at: Pt, opts: PlaceOptions = {}): SymbolItem {
    const s = symbolItemFromDef(this.def(name), 0, 0, this.layer, ref);
    s.rotation = opts.rotation ?? 0;
    if (opts.value !== undefined) s.value = opts.value;
    if (opts.props) s.properties = { ...(s.properties ?? {}), ...opts.props };
    const pins = itemPins(s, () => undefined);
    const p = (opts.pin !== undefined ? pins.find((x) => x.pin.num === opts.pin) : pins[0]) ?? { x: 0, y: 0 };
    const snap = (v: number) => Math.round(v / RASTER) * RASTER;
    s.x = Math.round(snap(at.x) - p.x);
    s.y = Math.round(snap(at.y) - p.y);
    this.items.push(s);
    return s;
  }

  /** World position of a pin, by number or name. */
  pin(s: SymbolItem, pin: number | string): Pt {
    const p = itemPins(s, () => undefined).find((x) => (typeof pin === 'number' ? x.pin.num === pin : (x.pin.name ?? '').toLowerCase() === pin.toLowerCase()));
    if (!p) throw new Error(`${s.name} has no pin ${pin}`);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** Polyline of wires through the given points. */
  wire(...pts: Pt[]): void {
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].x === pts[i + 1].x && pts[i].y === pts[i + 1].y) continue;
      const w: LineItem = {
        id: uid(),
        kind: 'line',
        layer: this.layer,
        x1: pts[i].x,
        y1: pts[i].y,
        x2: pts[i + 1].x,
        y2: pts[i + 1].y,
        color: '#1e6fd9',
        thickness: 2,
        startType: 'STRAIGHT',
        endType: 'STRAIGHT',
      };
      this.items.push(w);
    }
  }

  /** Wire between two pins with one bend: horizontal first ('hv') or vertical first ('vh'). */
  connect(a: SymbolItem, pa: number | string, b: SymbolItem, pb: number | string, mode: 'hv' | 'vh' = 'hv'): void {
    const p = this.pin(a, pa);
    const q = this.pin(b, pb);
    this.wire(p, mode === 'hv' ? { x: q.x, y: p.y } : { x: p.x, y: q.y }, q);
  }

  /** Ground symbol whose pin sits on `at`. */
  ground(at: Pt): SymbolItem {
    return this.add('GND', 'GND', at);
  }

  text(x: number, y: number, text: string, fontSize = 14, bold = false): TextItem {
    const t: TextItem = {
      id: uid(),
      kind: 'text',
      layer: this.layer,
      x,
      y,
      text: bold ? `<b>${text}</b>` : text,
      font: 'Arial',
      fontSize,
      rotation: 0,
      textType: 'TEXT',
      color: '#111827',
    };
    this.items.push(t);
    return t;
  }

  /** The finished schematic, sized to its content plus a margin. */
  doc(margin = 96): Doc {
    let r: Rect | undefined;
    for (const it of this.items) r = unionRect(r, itemBounds(it, () => undefined));
    // tight around the circuit, so "fit" shows it large
    const w = Math.max(320, Math.ceil(((r ? r.x + r.w : 0) + margin) / RASTER) * RASTER);
    const h = Math.max(240, Math.ceil(((r ? r.y + r.h : 0) + margin) / RASTER) * RASTER);
    return { width: w, height: h, type: 'SCHEMATICS', layers: this.layers, items: this.items, parts: {} };
  }
}
