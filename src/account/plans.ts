// What an account may do beyond the editor, as the server knows it
// (server/plans.ts): every account compiles online and uses Claude, a number
// of compiles per day; admins can lift the limit or block an account. Also the
// signed-in user's own access, the desktop app's compile key and the newsletter.

import { apiUrl } from './api.ts';

export type Plan = 'standard' | 'unlimited' | 'blocked';

export interface PlanSettings {
  /** compiles per account and day with the standard access */
  dailyCompiles: number;
}

/** what the landing page shows when there is no server (static hosting) */
export const DEFAULT_DAILY_COMPILES = 60;

export type NewsletterStatus = 'pending' | 'active' | null;

export interface Me {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  plan: Plan;
  compile: { ok: true; limit: number | null; used: number } | { ok: false; reason: 'blocked'; limit: null; used: number };
  key: { createdAt: number; lastUsedAt: number | null } | null;
  newsletter: NewsletterStatus;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(apiUrl(path), { credentials: 'same-origin', ...init });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? String(r.status));
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** the signed-in user's plan; null without a session */
export const fetchMe = () => call<Me>('me').catch(() => null);
export const createCompileKey = () => call<{ key: string }>('me/key', { method: 'POST' }).then((r) => r.key);
export const removeCompileKey = () => call<{ ok: boolean }>('me/key', { method: 'DELETE' });

export const subscribeNewsletter = (email: string, lang: string) => call<{ ok: boolean }>('newsletter', json('POST', { email, lang }));
export const confirmNewsletter = (token: string) => call<{ ok: boolean }>('newsletter/confirm', json('POST', { token }));
export const unsubscribeNewsletter = (token: string) => call<{ ok: boolean }>('newsletter/unsubscribe', json('POST', { token }));
export const setOwnNewsletter = (subscribed: boolean, lang: string) => call<{ status: NewsletterStatus }>('newsletter/me', json('PUT', { subscribed, lang }));
