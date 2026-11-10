// .bb files are zip archives: <name>.bb.xml (BoardBean) plus the used parts
// (parts/<file>.xml, parts/images/<image>.png) so boards stay self contained.
// Data BlackBoard 1.x/2.x has no beans for (PCBs: footprints, tracks, vias,
// zones, layer roles, design rules) lives in bbnext/document.json, which the
// old versions ignore; they still open the drawings and texts of the board.

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { parseXml } from './xml.ts';
import { parseBoard, parsePartDef, serializeBoard, serializePartDef } from './legacy.ts';
import type { BoardType, Doc, Item, LayerRole, PartDef, PcbSettings } from '../model/types.ts';
import { isPcbItem } from '../model/types.ts';

const EXTENSION = 'bbnext/document.json';

interface DocExtension {
  format: 'blackboard-next';
  version: 1;
  /** board types the BoardBean enum does not know */
  type?: BoardType;
  pcb?: PcbSettings;
  /** by layer index */
  layerRoles?: (LayerRole | null)[];
  /** items without a BoardBean: position in the item list (z-order) and layer index */
  items?: { index: number; layer: number; item: Item }[];
}

/** Legacy BoardBean board types. */
const LEGACY_TYPES: BoardType[] = ['HOLES', 'STRIPES', 'BLANK', 'SCHEMATICS', 'CUSTOM'];

export function documentExtension(doc: Doc): DocExtension | undefined {
  const ext: DocExtension = { format: 'blackboard-next', version: 1 };
  if (!LEGACY_TYPES.includes(doc.type)) ext.type = doc.type;
  if (doc.pcb) ext.pcb = doc.pcb;
  if (doc.layers.some((l) => l.role)) ext.layerRoles = doc.layers.map((l) => l.role ?? null);
  const layerIndex = new Map(doc.layers.map((l, i) => [l.id, i]));
  const items = doc.items.flatMap((item, index) => (isPcbItem(item) ? [{ index, layer: layerIndex.get(item.layer) ?? 0, item }] : []));
  if (items.length) ext.items = items;
  return Object.keys(ext).length > 2 ? ext : undefined;
}

export function applyExtension(doc: Doc, ext: DocExtension): void {
  if (ext.format !== 'blackboard-next') return;
  if (ext.type) doc.type = ext.type;
  if (ext.pcb) doc.pcb = ext.pcb;
  ext.layerRoles?.forEach((role, i) => {
    if (role && doc.layers[i]) doc.layers[i].role = role;
  });
  if (!ext.items?.length) return;
  // legacy items keep their relative order and fill the gaps between the extension items
  const total = doc.items.length + ext.items.length;
  const slots: (Item | undefined)[] = new Array(total);
  const rest: Item[] = [];
  for (const e of ext.items) {
    const item = { ...e.item, layer: doc.layers[e.layer]?.id ?? doc.layers[0].id } as Item;
    if (e.index >= 0 && e.index < total && !slots[e.index]) slots[e.index] = item;
    else rest.push(item);
  }
  let k = 0;
  for (let i = 0; i < total && k < doc.items.length; i++) if (!slots[i]) slots[i] = doc.items[k++];
  doc.items = [...slots.filter((i): i is Item => !!i), ...doc.items.slice(k), ...rest];
}

export interface OpenResult {
  doc: Doc;
  missingParts: string[];
}

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function dataUrl(bytes: Uint8Array, name: string): string {
  return `data:${mimeOf(name)};base64,${bytesToBase64(bytes)}`;
}

export function readBoardArchive(
  data: Uint8Array,
  fileName: string,
  libraryPart: (file: string) => PartDef | undefined,
): OpenResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    // very old boards may be stored as plain XML
    return readBoardXml(strFromU8(data), libraryPart, {});
  }
  // archives written on Windows use backslashes as separators
  const files: Record<string, Uint8Array> = {};
  const lower: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    const n = name.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (n.endsWith('/')) continue;
    files[n] = bytes;
    lower[n.toLowerCase()] = n;
  }
  const roots = Object.keys(files).filter((n) => !n.includes('/') && n.toLowerCase().endsWith('.xml'));
  const preferred = roots.find((r) => r.toLowerCase() === `${fileName.toLowerCase()}.xml`) ?? roots[0];
  if (!preferred) throw new Error('Keine Board-Beschreibung im Archiv gefunden');

  const embedded: Record<string, PartDef> = {};
  for (const name of Object.keys(files)) {
    const m = /^parts\/([^/]+\.xml)$/i.exec(name);
    if (!m) continue;
    try {
      const def = parsePartDef(parseXml(strFromU8(files[name])), m[1], (img) => {
        const key = lower[`parts/images/${img}`.toLowerCase()];
        return key ? dataUrl(files[key], img) : '';
      });
      if (def.image) embedded[m[1]] = def;
    } catch {
      /* broken embedded part, fall back to the library */
    }
  }
  const result = readBoardXml(strFromU8(files[preferred]), libraryPart, embedded);
  const ext = files[EXTENSION];
  if (ext) {
    try {
      applyExtension(result.doc, JSON.parse(strFromU8(ext)) as DocExtension);
    } catch {
      /* a damaged extension leaves the legacy board */
    }
  }
  const bg = result.doc.backgroundImage;
  if (bg) {
    const key = lower[bg.toLowerCase()];
    if (key) result.doc.backgroundImage = dataUrl(files[key], bg);
    else delete result.doc.backgroundImage;
  }
  return result;
}

function readBoardXml(xml: string, libraryPart: (file: string) => PartDef | undefined, embedded: Record<string, PartDef>): OpenResult {
  // the library wins: its images are shared and cached, embedded parts are the fallback
  return parseBoard(parseXml(xml), (f) => libraryPart(f) ?? embedded[f]);
}

export async function writeBoardArchive(
  doc: Doc,
  fileName: string,
  loadBytes: (url: string) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const base = fileName.replace(/\.bbs?$/i, '');
  const files: Record<string, Uint8Array> = {};
  // the BoardBean only knows the legacy board types; PCBs open as blank boards in 1.x/2.x
  const exported: Doc = { ...doc, type: LEGACY_TYPES.includes(doc.type) ? doc.type : 'BLANK' };
  if (doc.backgroundImage) {
    const name = `${base}_background.${doc.backgroundImage.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
    files[name] = await loadBytes(doc.backgroundImage);
    exported.backgroundImage = name;
  }
  files[`${base}.bb.xml`] = strToU8(serializeBoard(exported));
  const ext = documentExtension(doc);
  if (ext) files[EXTENSION] = strToU8(JSON.stringify(ext));
  const used = new Set(doc.items.flatMap((i) => (i.kind === 'part' ? [i.ref] : [])));
  for (const ref of used) {
    const def = doc.parts[ref];
    if (!def) continue;
    files[`parts/${def.file}`] = strToU8(serializePartDef(def));
    if (def.image) files[`parts/images/${def.imageName}`] = await loadBytes(def.image);
  }
  return zipSync(files, { level: 6 });
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('data:')) return base64ToBytes(url.slice(url.indexOf(',') + 1));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
