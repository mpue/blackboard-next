// KiCad interop: footprints (.kicad_mod) in and out of the user library and
// the netlist of a schematic for KiCad's PCB editor.

import { strFromU8, strToU8, zipSync } from 'fflate';
import type { FootprintDef } from '../model/types.ts';
import { activeDoc, setLibrary, toast, useStore } from '../store/store.ts';
import { t } from '../i18n/i18n.ts';
import { exportFile, openFiles, type FileType } from '../platform/files.ts';
import { saveUserFootprints, withUserFootprint } from '../platform/userFootprints.ts';
import { kicadFootprintFileName, kicadName, parseKicadFootprints, writeKicadFootprint } from '../io/kicad/footprint.ts';
import { BLACKBOARD_LIB, buildKicadNetlist } from '../io/kicad/netlist.ts';
import { findFootprint } from './footprintLookup.ts';
import { reportWarnings } from './pcbActions.ts';

const KICAD_MOD: FileType = { description: 'KiCad footprint', extensions: ['.kicad_mod'], mime: 'application/x-kicad-footprint' };
const NET: FileType = { description: 'KiCad netlist', extensions: ['.net'], mime: 'text/plain' };
const ZIP: FileType = { description: 'ZIP', extensions: ['.zip'], mime: 'application/zip' };

/** Adds footprints to the user library (same id: replaced) and stores it. */
export function addUserFootprints(defs: FootprintDef[]) {
  let next = useStore.getState().library.userFootprints;
  for (const d of defs) next = withUserFootprint(next, d);
  setLibrary({ userFootprints: next });
  void saveUserFootprints(next);
}

/** Library → "Import KiCad footprints…": one or more .kicad_mod files. */
export async function importKicadFootprints() {
  const files = await openFiles(KICAD_MOD);
  if (!files.length) return;
  const r = parseKicadFootprints(files.map((f) => ({ name: f.name, text: strFromU8(f.data) })));
  if (r.footprints.length) addUserFootprints(r.footprints);
  if (r.errors.length) {
    console.warn('KiCad import', r.errors);
    toast(t('kicad.importErrors', { n: r.footprints.length, failed: r.errors.length, file: r.errors[0].file, message: r.errors[0].message }), 'error');
  } else toast(t('kicad.imported', { n: r.footprints.length }));
}

/** User footprints as a KiCad library: a zip with one .pretty folder. */
export async function exportKicadFootprints() {
  const list = useStore.getState().library.userFootprints;
  if (!list.length) return toast(t('kicad.noUserFootprints'), 'error');
  const files: Record<string, Uint8Array> = {};
  for (const def of list) files[`BlackBoard.pretty/${kicadFootprintFileName(def)}`] = strToU8(writeKicadFootprint(def));
  await exportFile('BlackBoard.pretty.zip', new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), ZIP);
}

/**
 * Schematic → KiCad netlist (.net, for KiCad's File → Import → Netlist). When
 * parts use footprints KiCad does not have, a zip with the netlist and a
 * BlackBoard.pretty library of those footprints is exported instead.
 */
export async function exportKicadNetlist() {
  const ds = activeDoc();
  if (!ds) return;
  const base = ds.fileName.replace(/\.bbs?$/i, '');
  const r = buildKicadNetlist(ds.doc, base, findFootprint, { source: ds.fileName });
  reportWarnings(r.warnings);
  if (!r.customFootprints.length) {
    await exportFile(`${base}.net`, new Blob([r.netlist], { type: 'text/plain' }), NET);
    return;
  }
  const files: Record<string, Uint8Array> = { [`${base}.net`]: strToU8(r.netlist) };
  for (const id of r.customFootprints) {
    const def = findFootprint(id);
    if (def) files[`${BLACKBOARD_LIB}.pretty/${kicadName(id)}.kicad_mod`] = strToU8(writeKicadFootprint({ ...def, id, name: kicadName(id) }));
  }
  await exportFile(`${base}-kicad.zip`, new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), ZIP);
  toast(t('kicad.netlistWithLibrary', { n: r.customFootprints.length, lib: BLACKBOARD_LIB }));
}
