import { activeDoc, closeDoc, isDirty, markSaved, openDoc, toast, useStore, type DocState } from '../store/store.ts';
import { dataUrl, fetchBytes, readBoardArchive, writeBoardArchive } from '../io/bbfile.ts';
import { zoneFillsOf } from './zoneFills.ts';
import { zoneFillPath } from '../pcb/zones.ts';
import { BB_TYPE, exportFile, openFile, saveFile, type FileType } from '../platform/files.ts';
import { t } from '../i18n/i18n.ts';
import type { Doc, PartDef } from '../model/types.ts';
import { buildNetlist } from '../spice/netlist.ts';
import { formatOhm } from '../model/ops.ts';

const libraryPart = (file: string): PartDef | undefined => useStore.getState().library.parts.find((p) => p.file === file);

export function openBytes(name: string, data: Uint8Array, handle?: unknown) {
  try {
    const { doc, missingParts } = readBoardArchive(data, name, libraryPart);
    openDoc(doc, name, handle);
    toast(t('file.opened', { name }), 'success');
    if (missingParts.length) {
      toast(t('file.missingParts', { count: missingParts.length, list: [...new Set(missingParts)].slice(0, 5).join(', ') }), 'error');
    }
  } catch (e) {
    toast(t('file.openError', { msg: (e as Error).message }), 'error');
  }
}

export async function openFromDisk() {
  try {
    const f = await openFile(BB_TYPE);
    if (f) openBytes(f.name, f.data, f.handle);
  } catch (e) {
    toast(t('file.openError', { msg: (e as Error).message }), 'error');
  }
}

export async function openSample(group: string, file: string) {
  try {
    const res = await fetch(`samples/${group}/${encodeURIComponent(file)}`);
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) throw new Error(`${file}: ${res.status}`);
    // samples are opened as new, unsaved copies
    const { doc, missingParts } = readBoardArchive(new Uint8Array(await res.arrayBuffer()), file, libraryPart);
    openDoc(doc, file, undefined, true);
    if (missingParts.length) toast(t('file.missingParts', { count: missingParts.length, list: missingParts.slice(0, 5).join(', ') }), 'error');
  } catch (e) {
    toast(t('file.openError', { msg: (e as Error).message }), 'error');
  }
}

export async function saveActive(saveAs = false) {
  const ds = activeDoc();
  if (!ds) return;
  // a cloud document saves back to the cloud; "save as" writes a local file
  if (ds.cloud && !saveAs) {
    const { saveToCloud } = await import('../account/cloudActions.ts');
    return saveToCloud(ds);
  }
  try {
    const name = /\.bbs?$/i.test(ds.fileName) ? ds.fileName : `${ds.fileName}.bb`;
    const bytes = await writeBoardArchive(ds.doc, name, fetchBytes);
    const res = await saveFile(name, bytes, BB_TYPE, saveAs ? undefined : ds.handle);
    if (!res) return;
    markSaved(ds.id, res.name, res.handle);
    toast(t('file.saved', { name: res.name }), 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export function closeWithConfirm(ds: DocState) {
  if (isDirty(ds) && ds.doc.items.length && !confirm(t('file.unsaved', { name: ds.fileName }))) return;
  closeDoc(ds.id);
}

// ---- exports ------------------------------------------------------------------------------

const baseName = (ds: DocState) => ds.fileName.replace(/\.bbs?$/i, '');

/** Standalone SVG of the document (no overlays) with all images inlined. */
export async function documentSvg(ds: DocState): Promise<string> {
  const [{ renderToStaticMarkup }, { DocumentSvg }] = await Promise.all([import('react-dom/server'), import('../render/DocumentSvg.tsx')]);
  const settings = useStore.getState().settings;
  const images = new Map<string, string>();
  const inline = async (url: string) => {
    if (url.startsWith('data:') || images.has(url)) return;
    images.set(url, dataUrl(await fetchBytes(url), url));
  };
  await Promise.all(Object.values(ds.doc.parts).map((p) => inline(p.image)));
  const doc: Doc = {
    ...ds.doc,
    parts: Object.fromEntries(Object.entries(ds.doc.parts).map(([k, p]) => [k, { ...p, image: images.get(p.image) ?? p.image }])),
  };
  const fills = doc.type === 'PCB' ? zoneFillsOf(doc) : undefined;
  const zoneFills = fills ? new Map([...fills].map(([id, mp]) => [id, zoneFillPath(mp)])) : undefined;
  const svg = renderToStaticMarkup(DocumentSvg({ doc, settings, mirror: ds.mirror, zoneFills }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

const PNG: FileType = { description: 'PNG', extensions: ['.png'], mime: 'image/png' };
const SVG: FileType = { description: 'SVG', extensions: ['.svg'], mime: 'image/svg+xml' };
const CIR: FileType = { description: 'SPICE', extensions: ['.cir'], mime: 'text/plain' };
const CSV: FileType = { description: 'CSV', extensions: ['.csv'], mime: 'text/csv' };

export async function exportSvg() {
  const ds = activeDoc();
  if (!ds) return;
  await exportFile(`${baseName(ds)}.svg`, new Blob([await documentSvg(ds)], { type: 'image/svg+xml' }), SVG);
}

export async function renderPng(ds: DocState, scale = 2): Promise<Blob> {
  const svg = await documentSvg(ds);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(ds.doc.width * scale);
    canvas.height = Math.round(ds.doc.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng() {
  const ds = activeDoc();
  if (!ds) return;
  try {
    await exportFile(`${baseName(ds)}.png`, await renderPng(ds), PNG);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export async function exportNetlist() {
  const ds = activeDoc();
  if (!ds) return;
  const r = buildNetlist(ds.doc, ds.fileName, useStore.getState().library.models);
  await exportFile(`${baseName(ds)}.cir`, new Blob([r.netlist], { type: 'text/plain' }), CIR);
}

export async function exportBom() {
  const ds = activeDoc();
  if (!ds) return;
  if (ds.doc.type === 'PCB') {
    const { bomCsv } = await import('../pcb/fab/assembly.ts');
    await exportFile(`${baseName(ds)}_bom.csv`, new Blob(['\ufeff' + bomCsv(ds.doc)], { type: 'text/csv' }), CSV);
    return;
  }
  const rows: string[][] = [['Designator', 'Type', 'Value', 'Package / Symbol']];
  for (const it of ds.doc.items) {
    if (it.kind === 'part') rows.push([it.name, ds.doc.parts[it.ref]?.name ?? it.ref, it.value ?? '', ds.doc.parts[it.ref]?.packageType ?? '']);
    if (it.kind === 'resistor') rows.push([it.name, 'Resistor', formatOhm(it.value).replace('Ω', ' Ohm'), `${it.tolerance}%`]);
    if (it.kind === 'diode') rows.push([it.name, 'Diode', it.value, it.diodeType]);
    if (it.kind === 'symbol' && it.spiceType) rows.push([it.name, it.spiceType, it.value, it.symbolName]);
  }
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  await exportFile(`${baseName(ds)}_bom.csv`, new Blob(['﻿' + csv], { type: 'text/csv' }), CSV);
}

export async function printActive() {
  const ds = activeDoc();
  if (!ds) return;
  const svg = await documentSvg(ds);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow!;
  w.document.open();
  w.document.write(
    `<!doctype html><html><head><title>${ds.fileName}</title><style>@page{margin:12mm}html,body{margin:0}svg{width:100%;height:auto}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`,
  );
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 1000);
  }, 300);
}
