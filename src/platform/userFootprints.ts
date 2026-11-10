// User footprint library in IndexedDB: same database and store as persist.ts
// (keep name and version in sync), key "userFootprints". Best effort: without
// IndexedDB the library is simply empty.

import type { FootprintDef } from '../model/types.ts';

const DB = 'blackboard';
const VERSION = 1;
const STORE = 'kv';
const KEY = 'userFootprints';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  }));
}

const isFootprint = (v: unknown): v is FootprintDef =>
  !!v && typeof v === 'object' && typeof (v as FootprintDef).id === 'string' && Array.isArray((v as FootprintDef).pads) && Array.isArray((v as FootprintDef).silk);

export async function loadUserFootprints(): Promise<FootprintDef[]> {
  try {
    const d = await db();
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return Array.isArray(value) ? value.filter(isFootprint) : [];
  } catch {
    return [];
  }
}

export async function saveUserFootprints(list: FootprintDef[]): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(list, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* quota or private mode: persistence is best effort */
  }
}

/** list with def added, or replacing the footprint of the same id */
export function withUserFootprint(list: FootprintDef[], def: FootprintDef): FootprintDef[] {
  const i = list.findIndex((f) => f.id === def.id);
  return i < 0 ? [...list, def] : list.map((f, k) => (k === i ? def : f));
}

export function withoutUserFootprint(list: FootprintDef[], id: string): FootprintDef[] {
  return list.filter((f) => f.id !== id);
}
