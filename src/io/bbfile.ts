// .bb files are zip archives: <name>.bb.xml (BoardBean) plus the used parts
// (parts/<file>.xml, parts/images/<image>.png) so boards stay self contained.

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { parseXml } from './xml.ts';
import { parseBoard, parsePartDef, serializeBoard, serializePartDef } from './legacy.ts';
import type { Doc, PartDef } from '../model/types.ts';

export interface OpenResult {
  doc: Doc;
  missingParts: string[];
}

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
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
  const exported: Doc = { ...doc };
  if (doc.backgroundImage) {
    const name = `${base}_background.${doc.backgroundImage.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
    files[name] = await loadBytes(doc.backgroundImage);
    exported.backgroundImage = name;
  }
  files[`${base}.bb.xml`] = strToU8(serializeBoard(exported));
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
