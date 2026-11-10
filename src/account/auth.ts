// Accounts and the cloud of the web version: the BlackBoard server answers
// under api/ next to the page (server/). Without it (desktop app, offline,
// static hosting) the app works as before and shows no cloud functions.

import { createAuthClient } from 'better-auth/react';

export const apiUrl = (path: string) => new URL(`api/${path}`, document.baseURI).href;

export const authClient = createAuthClient({ baseURL: apiUrl('auth') });

export const useSession = authClient.useSession;

export interface ServerConfig {
  google: boolean;
  maxProjectBytes: number;
}

let config: Promise<ServerConfig | null> | undefined;

/** What the server offers, null when there is none. */
export function serverConfig(): Promise<ServerConfig | null> {
  config ??= fetch(apiUrl('config'))
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<ServerConfig>) : null))
    .catch(() => null);
  return config;
}

/** Address of the landing page (sign in, account), and of the editor. */
export const landingUrl = (params = '') => new URL(`./${params}`, document.baseURI).href;
export const editorUrl = (params = '') => new URL(`./?app${params ? `&${params}` : ''}`, document.baseURI).href;
