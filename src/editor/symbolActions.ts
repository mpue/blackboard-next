import { activeDoc, commit, select, selectedItems, setLibrary, toast, useStore } from '../store/store.ts';
import type { Item, Pin, SymbolDef, SymbolItem, SymbolShape } from '../model/types.ts';
import { RASTER } from '../model/types.ts';
import { uid } from '../model/id.ts';
import { rectOfPoints, shapeBounds, symbolToWorld, unionRect, type Rect } from '../geometry/geom.ts';
import { symbolItemFromDef } from '../io/legacy.ts';
import { saveUserSymbols } from '../platform/persist.ts';
import { t } from '../i18n/i18n.ts';
import type { Draft } from 'immer';

const norm = (d: number) => ((d % 360) + 360) % 360;

/** Converts placed symbols back into loose shapes (BreakSymbolCommand). */
export function shapesInWorld(s: SymbolItem): SymbolShape[] {
  const w = (x: number, y: number) => symbolToWorld(s, { x, y });
  return s.shapes.map((sh): SymbolShape => {
    switch (sh.kind) {
      case 'line': {
        const a = w(sh.x1, sh.y1);
        const b = w(sh.x2, sh.y2);
        return { ...sh, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }
      case 'box':
      case 'ellipse': {
        const r = rectOfPoints([w(sh.x, sh.y), w(sh.x + sh.w, sh.y + sh.h)]);
        if (sh.kind === 'box') return { ...sh, x: r.x, y: r.y, w: r.w, h: r.h };
        let start = sh.startAngle;
        if (s.mirrorV) start = -start - sh.arcAngle;
        if (s.mirrorH) start = 180 - start - sh.arcAngle;
        start = norm(start - s.rotation);
        return { ...sh, x: r.x, y: r.y, w: r.w, h: r.h, startAngle: start };
      }
      case 'text': {
        const p = w(sh.x, sh.y);
        const text = sh.textType === 'NAME' ? s.name : sh.textType === 'VALUE' ? s.value : sh.text;
        return { ...sh, x: p.x, y: p.y, rotation: norm(sh.rotation + s.rotation), text, textType: 'TEXT' };
      }
    }
  });
}

export function breakSymbols() {
  const ds = activeDoc();
  if (!ds) return;
  const symbols = selectedItems(ds).filter((i): i is SymbolItem => i.kind === 'symbol');
  if (!symbols.length) return;
  const created: Item[] = [];
  commit((d) => {
    for (const s of symbols) {
      const idx = d.items.findIndex((i) => i.id === s.id);
      const loose = shapesInWorld(s).map((sh) => ({ ...sh, id: uid(), layer: s.layer }) as Item);
      created.push(...loose);
      d.items.splice(idx, 1, ...(loose as Draft<Item>[]));
    }
  });
  select(created.map((i) => i.id));
}

export function createSymbolFromSelection(name: string, category: string, addToLibrary: boolean) {
  const ds = activeDoc();
  if (!ds) return;
  const items = selectedItems(ds).filter((i) => i.kind === 'line' || i.kind === 'box' || i.kind === 'ellipse' || i.kind === 'text');
  if (!items.length) {
    toast(t('symbol.needShapes'), 'error');
    return;
  }
  let bounds: Rect | undefined;
  for (const it of items) bounds = unionRect(bounds, shapeBounds(it as SymbolShape));
  const ox = Math.floor(bounds!.x / RASTER) * RASTER;
  const oy = Math.floor(bounds!.y / RASTER) * RASTER;
  const pins: Pin[] = [];
  const shapes: SymbolShape[] = items.map((it) => {
    const { id: _id, layer: _layer, ...g } = structuredClone(it);
    const sh = g as SymbolShape;
    if (sh.kind === 'line') {
      sh.x1 -= ox;
      sh.y1 -= oy;
      sh.x2 -= ox;
      sh.y2 -= oy;
      // dotted wire ends mark the connection points of the new symbol
      if (sh.startType === 'ROUND_DOT') {
        pins.push({ num: pins.length + 1, x: sh.x1, y: sh.y1, name: String(pins.length + 1), orientation: 'TOP_LEFT' });
        sh.startType = 'STRAIGHT';
      }
      if (sh.endType === 'ROUND_DOT') {
        pins.push({ num: pins.length + 1, x: sh.x2, y: sh.y2, name: String(pins.length + 1), orientation: 'TOP_LEFT' });
        sh.endType = 'STRAIGHT';
      }
    } else {
      sh.x -= ox;
      sh.y -= oy;
    }
    return sh;
  });
  const local = shapes.reduce<Rect | undefined>((r, s) => unionRect(r, shapeBounds(s)), undefined)!;
  const def: SymbolDef = {
    name,
    category: category || 'User',
    width: Math.ceil(local.x + local.w),
    height: Math.ceil(local.y + local.h),
    value: '',
    customModel: false,
    pins,
    shapes,
  };
  const layer = items[0].layer;
  const sym = symbolItemFromDef(def, ox, oy, layer, name);
  const ids = new Set(items.map((i) => i.id));
  commit((d) => {
    const first = d.items.findIndex((i) => ids.has(i.id));
    d.items = d.items.filter((i) => !ids.has(i.id));
    d.items.splice(Math.max(0, first), 0, sym as Draft<Item>);
  });
  select([sym.id]);
  if (addToLibrary) {
    const userSymbols = [...useStore.getState().library.userSymbols.filter((s) => s.name !== name), { ...def, category: 'User', filename: `user-${uid('s')}.xml` }];
    setLibrary({ userSymbols });
    void saveUserSymbols(userSymbols);
  }
  toast(t('symbol.created', { name }), 'success');
}
