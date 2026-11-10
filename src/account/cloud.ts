// The cloud projects of the signed-in user, over the BlackBoard server
// (server/projects.ts): list, load, save with version check, share.

import { apiUrl } from './auth.ts';

export type Role = 'owner' | 'edit' | 'view';

export interface ProjectMeta {
  id: string;
  name: string;
  size: number;
  version: number;
  updatedAt: number;
  owner: { id: string; name: string; email: string };
  role: Role;
  shares: number;
}

export interface Share {
  user: { id: string; name: string; email: string };
  role: Role;
}

/** an answer of the server that was not ok; `code` as the server says it ('conflict', 'no user', 'quota' …) */
export class CloudError extends Error {
  readonly status: number;
  readonly code: string;
  readonly version?: number;

  constructor(status: number, code: string, version?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.version = version;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(apiUrl(`projects${path === '/' ? '' : path}`), { credentials: 'same-origin', ...init });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; version?: number };
    throw new CloudError(r.status, body.error ?? String(r.status), body.version);
  }
  return r.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const binary = (method: string, data: Uint8Array, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'content-type': 'application/octet-stream', ...headers },
  body: data as Uint8Array<ArrayBuffer>,
});

export const listProjects = () => call<{ own: ProjectMeta[]; shared: ProjectMeta[] }>('/');

export const createProject = (name: string, data: Uint8Array) => call<ProjectMeta>(`?name=${encodeURIComponent(name)}`, binary('POST', data));

/** Saves on top of `version`; a CloudError 'conflict' (409) carries the version someone else saved. */
export const saveProject = (id: string, version: number, data: Uint8Array, name?: string) =>
  call<ProjectMeta>(`/${id}${name ? `?name=${encodeURIComponent(name)}` : ''}`, binary('PUT', data, { 'if-match': String(version) }));

export async function loadProject(id: string): Promise<{ data: Uint8Array; name: string; version: number; role: Role }> {
  const r = await fetch(apiUrl(`projects/${id}`), { credentials: 'same-origin' });
  if (!r.ok) throw new CloudError(r.status, r.status === 404 ? 'not found' : String(r.status));
  return {
    data: new Uint8Array(await r.arrayBuffer()),
    name: decodeURIComponent(r.headers.get('x-project-name') ?? 'Projekt'),
    version: Number(r.headers.get('x-project-version')),
    role: (r.headers.get('x-project-role') ?? 'view') as Role,
  };
}

export const renameProject = (id: string, name: string) => call<ProjectMeta>(`/${id}`, json('PATCH', { name }));
/** the owner deletes the project; anyone else only takes it off their list */
export const removeProject = (id: string) => call<{ ok: boolean }>(`/${id}`, { method: 'DELETE' });
export const listShares = (id: string) => call<Share[]>(`/${id}/shares`);
export const shareProject = (id: string, email: string, role: 'view' | 'edit') => call<Share[]>(`/${id}/shares`, json('POST', { email, role }));
export const unshareProject = (id: string, userId: string) => call<Share[]>(`/${id}/shares/${userId}`, { method: 'DELETE' });
