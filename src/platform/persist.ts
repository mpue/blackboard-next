// Session persistence in IndexedDB: open documents survive reloads and
// crashes, the user symbol library lives here as well.

import type { Doc, SymbolDef } from '../model/types.ts';

const DB = 'blackboard';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

async function put(key: string, value: unknown) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export interface SessionDoc {
  fileName: string;
  doc: Doc;
  dirty: boolean;
}

export interface Session {
  docs: SessionDoc[];
  active: number;
}

export async function saveSession(s: Session) {
  try {
    await put('session', s);
  } catch {
    /* quota or private mode: persistence is best effort */
  }
}

export async function loadSession(): Promise<Session | undefined> {
  try {
    return await get<Session>('session');
  } catch {
    return undefined;
  }
}

export async function saveUserSymbols(symbols: SymbolDef[]) {
  try {
    await put('userSymbols', symbols);
  } catch {
    /* best effort */
  }
}

export async function loadUserSymbols(): Promise<SymbolDef[]> {
  try {
    return (await get<SymbolDef[]>('userSymbols')) ?? [];
  } catch {
    return [];
  }
}
