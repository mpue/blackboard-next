// Schematic -> PCB (create and forward annotate) and the PCB outputs.

import type { Draft } from 'immer';
import type { Doc, FootprintDef, FootprintItem, Item } from '../model/types.ts';
import { activeDoc, commit, openDoc, select, toast, useStore } from '../store/store.ts';
import { t } from '../i18n/i18n.ts';
import { annotate, extractPcbNetlist, type FromSchematicWarning, type PcbComponent } from '../pcb/fromSchematic.ts';
import { footprintById } from '../pcb/footprints/index.ts';
import { createPcbDoc } from '../pcb/defaults.ts';
import { makeFootprintItem } from '../pcb/place.ts';
import { isPowerNet } from '../pcb/geometry.ts';
import { mm, toMm } from '../pcb/units.ts';
import { fabricationZip } from '../pcb/fab/index.ts';
import { etchingSvg } from '../pcb/fab/etching.ts';
import { runDrc } from '../pcb/drc.ts';
import { computePcbConnectivity } from '../pcb/connectivity.ts';
import { snapTo } from '../geometry/geom.ts';
import { isSchematicDoc, RASTER } from '../model/types.ts';
import { exportFile } from '../platform/files.ts';
import { zoneFillsOf } from './zoneFills.ts';
import { openSample } from './fileActions.ts';
import { runAutorouter } from './autorouteAction.ts';

const ZIP = { description: 'ZIP', extensions: ['.zip'], mime: 'application/zip' };
const GAP = mm(2.54);
const MARGIN = mm(5);

function footprintFor(doc: Doc, c: PcbComponent, def: FootprintDef): FootprintItem {
  const fp = makeFootprintItem(doc, def, 0, 0, 'top', c.ref, c.value);
  for (const pin of c.pins) if (pin.pad) fp.nets[pin.pad] = pin.net;
  return fp;
}

/**
 * Order in which components are placed: a breadth first walk over shared
 * signal nets, so connected parts end up next to each other.
 */
function placementOrder(fps: FootprintItem[]): FootprintItem[] {
  const byNet = new Map<string, number[]>();
  fps.forEach((fp, i) => {
    for (const net of new Set(Object.values(fp.nets))) {
      if (isPowerNet(net) || net.startsWith('unconnected-')) continue;
      byNet.set(net, [...(byNet.get(net) ?? []), i]);
    }
  });
  const area = (fp: FootprintItem) => fp.footprint.courtyard.w * fp.footprint.courtyard.h;
  const seeds = fps.map((_, i) => i).sort((a, b) => area(fps[b]) - area(fps[a]));
  const seen = new Set<number>();
  const order: FootprintItem[] = [];
  for (const seed of seeds) {
    if (seen.has(seed)) continue;
    const queue = [seed];
    seen.add(seed);
    while (queue.length) {
      const i = queue.shift()!;
      order.push(fps[i]);
      for (const net of new Set(Object.values(fps[i].nets))) {
        for (const j of byNet.get(net) ?? []) {
          if (seen.has(j)) continue;
          seen.add(j);
          queue.push(j);
        }
      }
    }
  }
  return order;
}

/** Shelf packing of the courtyards starting at (x0, y0); returns the used extent. */
function shelfPack(fps: FootprintItem[], x0: number, y0: number, rowWidth: number): { w: number; h: number } {
  let x = x0;
  let y = y0;
  let rowH = 0;
  let maxX = x0;
  for (const fp of fps) {
    const c = fp.footprint.courtyard;
    if (x > x0 && x + c.w > x0 + rowWidth) {
      x = x0;
      y += rowH + GAP;
      rowH = 0;
    }
    fp.x = snapTo(x - c.x, RASTER / 2);
    fp.y = snapTo(y - c.y, RASTER / 2);
    x += c.w + GAP;
    rowH = Math.max(rowH, c.h);
    maxX = Math.max(maxX, x - GAP);
  }
  return { w: maxX - x0, h: y + rowH - y0 };
}

function reportWarnings(warnings: FromSchematicWarning[]) {
  for (const w of warnings.slice(0, 4)) {
    switch (w.key) {
      case 'noFootprint':
        toast(t('pcb.warnFootprint', { ref: w.ref, fp: w.footprintId }), 'error');
        break;
      case 'pinMismatch':
        toast(t('pcb.warnPins', { ref: w.ref, pins: w.pins, pads: w.pads, fp: w.footprintId }), 'error');
        break;
      case 'unmappedPin':
        toast(t('pcb.warnUnmapped', { ref: w.ref, pin: w.pin }), 'error');
        break;
      case 'duplicateRef':
        toast(t('pcb.warnDuplicate', { ref: w.ref }), 'error');
        break;
      case 'multiUnit':
        toast(t('pcb.warnMultiUnit', { ref: w.ref }), 'info');
        break;
    }
  }
}

const pcbFileName = (schematic: string) => `${schematic.replace(/\.bbs?$/i, '')}-pcb.bb`;

export function createPcbFromSchematic() {
  const ds = activeDoc();
  if (!ds || !isSchematicDoc(ds.doc)) {
    toast(t('pcb.notSchematic'), 'error');
    return;
  }
  const netlist = extractPcbNetlist(ds.doc, footprintById);
  const doc = createPcbDoc();
  const fps = netlist.components.flatMap((c) => {
    const def = footprintById(c.footprintId);
    return def ? [footprintFor(doc, c, def)] : [];
  });
  if (!fps.length) {
    toast(t('pcb.empty'), 'error');
    return;
  }
  const area = fps.reduce((a, fp) => a + (fp.footprint.courtyard.w + GAP) * (fp.footprint.courtyard.h + GAP), 0);
  const ext = shelfPack(placementOrder(fps), MARGIN, MARGIN, Math.max(mm(40), Math.sqrt(area * 1.6)));
  // whole millimetres keep the board outline tidy
  doc.width = mm(Math.ceil(toMm(ext.w + 2 * MARGIN)));
  doc.height = mm(Math.ceil(toMm(ext.h + 2 * MARGIN)));
  doc.items = fps;
  doc.pcb!.schematic = ds.fileName;
  openDoc(doc, pcbFileName(ds.fileName), undefined, false);
  toast(t('pcb.created', { count: fps.length, nets: new Set(netlist.nets.filter((n) => !n.startsWith('unconnected-'))).size }), 'success');
  reportWarnings(netlist.warnings);
}

/** Forward annotation: footprints, values and nets follow the schematic. */
export function updatePcbFromSchematic() {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB') return;
  const name = ds.doc.pcb?.schematic ?? '';
  const schematics = useStore.getState().docs.filter((d) => isSchematicDoc(d.doc));
  const sch = schematics.find((d) => d.fileName === name) ?? (schematics.length === 1 ? schematics[0] : undefined);
  if (!sch) {
    toast(t('pcb.noSchematic', { name: name || '…' }), 'error');
    return;
  }
  const netlist = extractPcbNetlist(sch.doc, footprintById);
  const refs = new Set(netlist.components.map((c) => c.ref));
  let added = 0;
  let removed = 0;
  let changed = 0;
  const fresh: FootprintItem[] = [];
  commit((d) => {
    const byName = new Map(d.items.filter((i): i is Draft<FootprintItem> => i.kind === 'footprint').map((fp) => [fp.name, fp]));
    for (const c of netlist.components) {
      const def = footprintById(c.footprintId);
      if (!def) continue;
      const target = footprintFor(d as Doc, c, def);
      const fp = byName.get(c.ref);
      if (!fp) {
        fresh.push(target);
        continue;
      }
      let dirty = false;
      if (fp.footprint.id !== def.id) {
        fp.footprint = structuredClone(def);
        dirty = true;
      }
      if (fp.value !== c.value) {
        fp.value = c.value;
        dirty = true;
      }
      if (JSON.stringify(fp.nets) !== JSON.stringify(target.nets)) {
        fp.nets = target.nets;
        dirty = true;
      }
      if (dirty) changed++;
    }
    // footprints that came from the schematic (they carry nets) and are gone there
    const before = d.items.length;
    d.items = d.items.filter((i) => i.kind !== 'footprint' || refs.has(i.name) || !Object.keys(i.nets).length) as Draft<Item>[];
    removed = before - d.items.length;
    if (fresh.length) {
      shelfPack(fresh, d.width + MARGIN, 0, mm(30));
      d.items.push(...(fresh as Draft<Item>[]));
      added = fresh.length;
    }
    d.pcb!.schematic = sch.fileName;
  });
  toast(added || removed || changed ? t('pcb.updated', { added, removed, changed }) : t('pcb.upToDate'), 'success');
  reportWarnings(netlist.warnings);
}

/** Gives duplicate and unnumbered designators ("R?", second "R1") the next free number. */
export function annotateSchematic() {
  const ds = activeDoc();
  if (!ds || !isSchematicDoc(ds.doc)) return;
  const renames = annotate(ds.doc);
  if (!renames.length) {
    toast(t('annotate.none'), 'success');
    return;
  }
  const byId = new Map(renames.map((r) => [r.id, r.name]));
  commit((d) => {
    for (const it of d.items) {
      const name = byId.get(it.id);
      if (name && it.kind === 'symbol') it.name = name;
    }
  });
  toast(t('annotate.done', { count: renames.length }), 'success');
}

const projectName = (fileName: string) => fileName.replace(/\.bbs?$/i, '').replace(/[^\w.-]+/g, '_') || 'board';

export async function exportFabrication() {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB') return;
  const zoneFills = zoneFillsOf(ds.doc);
  const errors = runDrc(ds.doc, { zoneFills }).filter((v) => v.severity === 'error').length;
  if (errors) toast(t('drc.summary', { errors, warnings: 0 }).replace(/ · .*$/, ''), 'error');
  const project = projectName(ds.fileName);
  const zip = fabricationZip(ds.doc, { project, zoneFills });
  await exportFile(`${project}-gerber.zip`, new Blob([zip as BlobPart], { type: 'application/zip' }), ZIP);
  toast(t('pcb.exported', { name: `${project}-gerber.zip` }), 'success');
}

/** Prints the copper artwork 1:1 for toner transfer / UV exposure. */
export async function exportEtching() {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB') return;
  const zoneFills = zoneFillsOf(ds.doc);
  const sides: ('top' | 'bottom')[] = ds.doc.pcb?.rules.copperLayers === 1 ? ['bottom'] : ['bottom', 'top'];
  const svgs = sides.map((side) => `<figure><figcaption>${t(side === 'top' ? 'pcb.etchTop' : 'pcb.etchBottom')}</figcaption>${etchingSvg(ds.doc, side, { zoneFills })}</figure>`);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow!;
  w.document.open();
  w.document.write(
    `<!doctype html><html><head><title>${ds.fileName}</title><style>@page{margin:10mm}html,body{margin:0;font:11px Arial,sans-serif}figure{margin:0 0 8mm;break-inside:avoid}figcaption{margin-bottom:2mm}</style></head><body>${svgs.join('')}</body></html>`,
  );
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 1000);
  }, 300);
}

/** Welcome screen demo: the 555 blinker sample becomes a PCB and is autorouted. */
export async function openPcbDemo() {
  await openSample('schematics', 'ne555_multivibrator.bb');
  const ds = activeDoc();
  if (!ds || !isSchematicDoc(ds.doc)) return;
  createPcbFromSchematic();
  if (activeDoc()?.doc.type === 'PCB') runAutorouter();
}

/** Removes tracks and vias: all of them, or only those of the selected items' nets. */
export function unroute(scope: 'all' | 'selection') {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB') return;
  let nets: Set<string> | undefined;
  if (scope === 'selection') {
    const conn = computePcbConnectivity(ds.doc);
    const sel = new Set(ds.selection);
    nets = new Set<string>();
    conn.objects.forEach((o) => {
      if (!sel.has(o.itemId)) return;
      const n = o.kind === 'pad' ? o.net : conn.netOfItem.get(o.itemId);
      if (n) nets!.add(n);
    });
    if (!nets.size) return;
    commit((d) => {
      d.items = d.items.filter((i) => (i.kind !== 'track' && i.kind !== 'via') || !nets!.has(conn.netOfItem.get(i.id) ?? i.net ?? '')) as Draft<Item>[];
    });
    return;
  }
  commit((d) => {
    d.items = d.items.filter((i) => i.kind !== 'track' && i.kind !== 'via') as Draft<Item>[];
  });
}

/** Selects all tracks and vias connected to the selected copper (KiCad "U"). */
export function selectConnectedCopper() {
  const ds = activeDoc();
  if (!ds || ds.doc.type !== 'PCB' || !ds.selection.length) return;
  const conn = computePcbConnectivity(ds.doc);
  const sel = new Set(ds.selection);
  const islands = new Set<number>();
  conn.objects.forEach((o, i) => {
    if (sel.has(o.itemId) && (o.kind === 'track' || o.kind === 'via')) islands.add(conn.island[i]);
  });
  const ids = new Set(ds.selection);
  conn.objects.forEach((o, i) => {
    if ((o.kind === 'track' || o.kind === 'via') && islands.has(conn.island[i])) ids.add(o.itemId);
  });
  select([...ids]);
}
