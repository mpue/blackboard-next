// File access that works everywhere: Tauri (native dialogs), Chromium based
// browsers (File System Access API, real "save" to the same file) and every
// other browser (file input + download).

export interface PickedFile {
  name: string;
  data: Uint8Array;
  handle?: unknown;
}

export interface FileType {
  description: string;
  extensions: string[];
  mime: string;
}

export const BB_TYPE: FileType = { description: 'BlackBoard', extensions: ['.bb', '.bbs'], mime: 'application/x-blackboard' };

type FsHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
};
type FsWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
};

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const fsWindow = () => window as FsWindow;

const pickerTypes = (t: FileType) => [{ description: t.description, accept: { [t.mime]: t.extensions } }];

function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError';
}

export async function openFile(type: FileType = BB_TYPE): Promise<PickedFile | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: type.description, extensions: type.extensions.map((e) => e.slice(1)) }] });
    if (!path || Array.isArray(path)) return null;
    return { name: path.split(/[\\/]/).pop() ?? path, data: await readFile(path), handle: path };
  }
  const w = fsWindow();
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: pickerTypes(type), multiple: false });
      const f = await h.getFile();
      return { name: f.name, data: new Uint8Array(await f.arrayBuffer()), handle: h };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  return openViaInput(type.extensions.join(','));
}

export function openViaInput(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Saves to `handle` when given (silent save), otherwise asks for a location. */
export async function saveFile(name: string, data: Uint8Array, type: FileType, handle?: unknown): Promise<{ name: string; handle?: unknown } | null> {
  if (isTauri()) {
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    let path = typeof handle === 'string' ? handle : null;
    if (!path) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      path = await save({ defaultPath: name, filters: [{ name: type.description, extensions: type.extensions.map((e) => e.slice(1)) }] });
    }
    if (!path) return null;
    await writeFile(path, data);
    return { name: path.split(/[\\/]/).pop() ?? path, handle: path };
  }
  const w = fsWindow();
  if (w.showSaveFilePicker) {
    try {
      const h = (handle as FsHandle | undefined)?.createWritable ? (handle as FsHandle) : await w.showSaveFilePicker({ suggestedName: name, types: pickerTypes(type) });
      const out = await h.createWritable();
      await out.write(data as Uint8Array<ArrayBuffer>);
      await out.close();
      return { name: h.name, handle: h };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(name, new Blob([data as Uint8Array<ArrayBuffer>], { type: type.mime }));
  return { name };
}

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Exports (PNG, SVG, CSV, netlists) always ask for a location where possible. */
export async function exportFile(name: string, blob: Blob, type: FileType) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isTauri() || fsWindow().showSaveFilePicker) return saveFile(name, bytes, type);
  download(name, blob);
  return { name };
}
