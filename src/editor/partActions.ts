// The user part library: parts drawn on an image with the part editor
// (CreatePartCommand / EditPartDialog of the classic BlackBoard) or made from a
// selection (ConvertToPartCommand). Images are kept as data URLs, so the parts
// work offline and travel inside .bb files like every embedded part.

import type { Doc, Item, PartDef, Pin } from '../model/types.ts';
import { isBoardLayer, RASTER } from '../model/types.ts';
import { activeDoc, commit, openDialog, selectedItems, setLibrary, toast, useStore } from '../store/store.ts';
import { saveUserParts } from '../platform/persist.ts';
import { selectionBounds, translateItem } from '../model/ops.ts';
import { uid } from '../model/id.ts';
import { t } from '../i18n/i18n.ts';

/** user parts have their own file names, so they never shadow a library part */
export const isUserPart = (def: PartDef) => def.file.startsWith('user-');

export function emptyPart(): PartDef {
  return { file: '', name: '', description: '', packageType: '', designator: 'U', width: 64, height: 64, imageName: '', image: '', pins: [] };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function asDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  return blobToDataUrl(await (await fetch(url)).blob());
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

const MAX_IMAGE = 1600;

/** An image file as data URL; large photos are scaled down so documents stay small. */
export async function readImageFile(file: File): Promise<{ url: string; width: number; height: number }> {
  const url = await blobToDataUrl(file);
  const img = await loadImage(url);
  const w = img.naturalWidth || 64;
  const h = img.naturalHeight || 64;
  const k = MAX_IMAGE / Math.max(w, h);
  if (file.type === 'image/svg+xml' || k >= 1) return { url, width: w, height: h };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
  return { url: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), width: w, height: h };
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Saves the part from the editor into the user library. Library parts are
 * saved as a copy of their own. Copies placed in the active document follow
 * the new definition; `itemId` is the placed part the editor was opened for.
 */
export async function saveUserPart(draft: PartDef, itemId?: string): Promise<PartDef> {
  const file = isUserPart(draft) ? draft.file : `user-${uid('p')}.xml`;
  const image = await asDataUrl(draft.image);
  const mime = /^data:([^;,]+)/.exec(image)?.[1] ?? 'image/png';
  const def: PartDef = { ...draft, file, image, imageName: `${file.replace(/\.xml$/, '')}.${EXT[mime] ?? 'png'}` };
  if (!def.author) delete def.author;
  if (!def.license) delete def.license;
  const lib = useStore.getState().library.userParts;
  const next = lib.some((p) => p.file === file) ? lib.map((p) => (p.file === file ? def : p)) : [...lib, def];
  setLibrary({ userParts: next });
  void saveUserParts(next);
  const ds = activeDoc();
  if (ds && (ds.doc.parts[file] || itemId)) {
    commit((d) => {
      d.parts[file] = def;
      for (const it of d.items) if (it.id === itemId && it.kind === 'part') it.ref = file;
    });
  }
  return def;
}

export function removeUserPart(file: string) {
  const next = useStore.getState().library.userParts.filter((p) => p.file !== file);
  setLibrary({ userParts: next });
  void saveUserParts(next);
}

/** Opens the part editor for the selected placed part. */
export function editSelectedPart() {
  const ds = activeDoc();
  const it = ds?.doc.items.find((i) => i.kind === 'part' && ds.selection.includes(i.id));
  if (!ds || it?.kind !== 'part') return;
  const def = ds.doc.parts[it.ref] ?? useStore.getState().library.parts.find((p) => p.file === it.ref);
  if (def) openDialog({ kind: 'partEditor', def, itemId: it.id });
}

const SCALE = 4;

/**
 * Renders the selection into an image and opens the part editor with it.
 * Wire ends with a dot (●) become the pins, as with symbols.
 */
export async function partFromSelection() {
  const ds = activeDoc();
  if (!ds) return;
  const items = selectedItems(ds);
  const r = selectionBounds(ds.doc, items);
  if (!items.length || !r) {
    toast(t('part.needSelection'), 'error');
    return;
  }
  // a margin of half a raster keeps pins at the edge inside the image
  const pad = RASTER / 2;
  const ox = Math.floor(r.x - pad);
  const oy = Math.floor(r.y - pad);
  const width = Math.ceil(r.x + r.w + pad) - ox;
  const height = Math.ceil(r.y + r.h + pad) - oy;
  const pins: Pin[] = [];
  const pin = (x: number, y: number) => pins.push({ num: pins.length + 1, x: Math.round(x - ox), y: Math.round(y - oy), name: String(pins.length + 1) });
  const moved = items.map((it) => {
    const c = structuredClone(it) as Item;
    if (c.kind === 'line') {
      if (c.startType === 'ROUND_DOT') {
        pin(c.x1, c.y1);
        c.startType = 'STRAIGHT';
      }
      if (c.endType === 'ROUND_DOT') {
        pin(c.x2, c.y2);
        c.endType = 'STRAIGHT';
      }
    }
    translateItem(c, -ox, -oy);
    return c;
  });
  const doc: Doc = {
    ...ds.doc,
    type: 'BLANK',
    width,
    height,
    // only the drawing: no board, no holes
    layers: ds.doc.layers.map((l) => (isBoardLayer(l) ? { ...l, visible: false } : l)),
    items: moved,
    pcb: undefined,
  };
  try {
    const { svgOfDoc } = await import('./fileActions.ts');
    const settings = { ...useStore.getState().settings, showNames: false, showValues: false };
    const url = URL.createObjectURL(new Blob([await svgOfDoc(doc, false, settings)], { type: 'image/svg+xml' }));
    let png: string;
    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = width * SCALE;
      canvas.height = height * SCALE;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      png = canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
    openDialog({ kind: 'partEditor', def: { ...emptyPart(), name: t('part.newName'), width, height, image: png, pins } });
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
