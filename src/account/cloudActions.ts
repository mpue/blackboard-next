// Opening documents from the cloud and saving them there. A document keeps
// the version it is based on; saving on top of a newer version (someone it is
// shared with saved in between) asks before overwriting.

import { activeDoc, markCloudSaved, openDoc, toast, useStore, type DocState } from '../store/store.ts';
import { fetchBytes, readBoardArchive, writeBoardArchive } from '../io/bbfile.ts';
import { t } from '../i18n/i18n.ts';
import type { PartDef } from '../model/types.ts';
import { CloudError, createProject, listProjects, loadProject, saveProject } from './cloud.ts';

const libraryPart = (file: string): PartDef | undefined => useStore.getState().library.parts.find((p) => p.file === file);
const baseName = (fileName: string) => fileName.replace(/\.bbs?$/i, '') || 'Unbenannt';

function cloudError(e: unknown): string {
  if (e instanceof CloudError) {
    if (e.status === 401) return t('cloud.err.signedOut');
    if (e.code === 'large') return t('cloud.err.large');
    if (e.code === 'quota') return t('cloud.err.quota');
    if (e.status === 404) return t('cloud.err.notFound');
    return t('cloud.err.generic', { msg: e.code });
  }
  return t('cloud.err.offline');
}

export async function openCloudProject(id: string) {
  try {
    const p = await loadProject(id);
    const { doc, missingParts } = readBoardArchive(p.data, `${p.name}.bb`, libraryPart);
    openDoc(doc, p.name, undefined, true, { id, version: p.version, role: p.role });
    toast(p.role === 'view' ? t('cloud.openedReadOnly', { name: p.name }) : t('cloud.opened', { name: p.name }), 'success');
    if (missingParts.length) toast(t('file.missingParts', { count: missingParts.length, list: [...new Set(missingParts)].slice(0, 5).join(', ') }), 'error');
  } catch (e) {
    toast(cloudError(e), 'error');
  }
}

/**
 * Saves a document to the cloud: back into its project when it has one and
 * may be edited, else as a new project of the user (`copy` forces that).
 */
export async function saveToCloud(ds: DocState | undefined = activeDoc(), copy = false) {
  if (!ds) return;
  const name = baseName(ds.fileName);
  const doc = ds.doc;
  try {
    const data = await writeBoardArchive(doc, `${name}.bb`, fetchBytes);
    const link = ds.cloud;
    if (link && !copy && link.role !== 'view') {
      try {
        const meta = await saveProject(link.id, link.version, data);
        markCloudSaved(ds.id, ds.fileName, { ...link, version: meta.version }, doc);
        toast(t('cloud.saved', { name }), 'success');
        return;
      } catch (e) {
        if (!(e instanceof CloudError) || e.code !== 'conflict') throw e;
        // someone saved in between: overwrite, or keep both
        if (confirm(t('cloud.conflict', { name }))) {
          const meta = await saveProject(link.id, e.version ?? link.version, data);
          markCloudSaved(ds.id, ds.fileName, { ...link, version: meta.version }, doc);
          toast(t('cloud.saved', { name }), 'success');
          return;
        }
        copy = true;
      }
    }
    const own = await listProjects();
    const taken = new Set(own.own.map((p) => p.name));
    let fresh = copy && link ? t('cloud.copyName', { name }) : name;
    for (let i = 2; taken.has(fresh); i++) fresh = `${copy && link ? t('cloud.copyName', { name }) : name} (${i})`;
    const meta = await createProject(fresh, data);
    markCloudSaved(ds.id, meta.name, { id: meta.id, version: meta.version, role: 'owner' }, doc);
    toast(link?.role === 'view' && !copy ? t('cloud.savedCopy', { name: meta.name }) : t('cloud.saved', { name: meta.name }), 'success');
  } catch (e) {
    toast(cloudError(e), 'error');
  }
}
