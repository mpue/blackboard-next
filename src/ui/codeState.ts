// The code editor beside the canvas: which chip's program is open, and what the
// last compile of each chip said. "Upload" compiles, puts the HEX onto the
// chip and turns the live simulation on, like uploading in the Arduino IDE.

import { create } from 'zustand';
import { zipSync, strToU8 } from 'fflate';
import { download, exportFile, openFiles, type FileType } from '../platform/files.ts';
import { setLiveMode, setLiveValues, useLive } from '../store/live.ts';
import { toast } from '../store/store.ts';
import { t } from '../i18n/i18n.ts';
import {
  CompileError,
  compileSketch,
  FILE_NAME,
  flashSketch,
  mainFile,
  MAX_FILES,
  SOURCE_EXTENSIONS,
  type CompileProblem,
  type CompileResult,
  type CompileUsage,
  type SourceFile,
} from '../mcu/sketch.ts';

export interface CompileRun {
  busy: boolean;
  result?: CompileResult;
  problem?: CompileProblem;
  /** today's compiles, after the last answer that had them */
  usage?: CompileUsage;
  /** the result went onto the chip */
  uploaded?: boolean;
}

interface CodeState {
  /** the chip whose program is open, and the tab it is in */
  open: { docId: string; chipId: string } | null;
  runs: Record<string, CompileRun>;
}

export const useCode = create<CodeState>()(() => ({ open: null, runs: {} }));

export const openCode = (docId: string, chipId: string) => useCode.setState({ open: { docId, chipId } });
export const closeCode = () => useCode.setState({ open: null });

const setRun = (chipId: string, run: CompileRun) => useCode.setState((s) => ({ runs: { ...s.runs, [chipId]: run } }));
/** forgets the last answer, e.g. after a new key, so the panel asks the account again */
export const clearRun = (chipId: string) =>
  useCode.setState((s) => {
    const { [chipId]: _, ...runs } = s.runs;
    return { runs };
  });

export const HEX_TYPE: FileType = { description: 'Intel HEX', extensions: ['.hex'], mime: 'text/plain' };
export const SOURCE_TYPE: FileType = { description: 'C/C++', extensions: SOURCE_EXTENSIONS, mime: 'text/plain' };
const ZIP_TYPE: FileType = { description: 'ZIP', extensions: ['.zip'], mime: 'application/zip' };

/** Asks for a place where the browser can; after a compile the click may be too long ago for that, then it downloads. */
async function saveAs(name: string, blob: Blob, type: FileType) {
  try {
    const saved = await exportFile(name, blob, type);
    if (saved) toast(t('code.saved', { name: saved.name }), 'success');
  } catch {
    download(name, blob);
  }
}

/**
 * Compiles the program of a chip; with `upload` the HEX and the source go onto
 * the chip and the simulation starts. Returns the result when it compiled.
 */
export async function compileChip(docId: string, chipId: string, files: SourceFile[], clock: number, upload: boolean): Promise<CompileResult | undefined> {
  if (useCode.getState().runs[chipId]?.busy) return;
  setRun(chipId, { ...useCode.getState().runs[chipId], busy: true });
  try {
    const result = await compileSketch(files, clock);
    if (result.ok && result.hex && upload) {
      flashSketch(docId, chipId, files, result.hex);
      if (useLive.getState().mode !== 'dc') setLiveMode('dc');
      setLiveValues(true);
    }
    setRun(chipId, { busy: false, result, usage: result.usage, uploaded: upload && result.ok });
    return result.ok ? result : undefined;
  } catch (e) {
    const problem = e instanceof CompileError ? e.problem : 'unavailable';
    setRun(chipId, { busy: false, problem, usage: e instanceof CompileError ? e.usage : undefined });
    return undefined;
  }
}

const baseName = (files: SourceFile[]) => mainFile(files).replace(/\.[^.]+$/, '');

/** Compiles and saves the HEX file, e.g. to put it onto a real Arduino. */
export async function saveHex(docId: string, chipId: string, files: SourceFile[], clock: number) {
  const r = await compileChip(docId, chipId, files, clock, false);
  if (r?.hex) await saveAs(`${baseName(files)}.hex`, new Blob([r.hex], { type: 'text/plain' }), HEX_TYPE);
}

/** The source: one file as it is, several in a ZIP (a sketch folder for the Arduino IDE). */
export async function saveSource(files: SourceFile[]) {
  if (files.length === 1) return saveAs(files[0].name, new Blob([files[0].content], { type: 'text/plain' }), SOURCE_TYPE);
  const base = baseName(files);
  const zip = zipSync(Object.fromEntries(files.map((f) => [`${base}/${f.name}`, strToU8(f.content)])), { level: 6 });
  await saveAs(`${base}.zip`, new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), ZIP_TYPE);
}

/** Source files from disk; names the compiler would refuse are made fit. */
export async function pickSource(): Promise<SourceFile[]> {
  const picked = await openFiles(SOURCE_TYPE);
  return picked.slice(0, MAX_FILES).map((f) => ({ name: fitName(f.name), content: new TextDecoder().decode(f.data) }));
}

/** "Mein Sketch (2).ino" -> "Mein_Sketch_2.ino" */
export function fitName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '.ino';
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[^A-Za-z0-9_]+/, '').replace(/_+$/, '').slice(0, 60) || 'sketch';
  const fixed = `${base}${SOURCE_EXTENSIONS.includes(ext) ? ext : ext.toLowerCase()}`;
  return FILE_NAME.test(fixed) ? fixed : `${base}.ino`;
}
