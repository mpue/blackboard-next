// The plans as the server knows them (server/plans.ts): Free for everyone,
// Professional and Commercial with the online compiler. Also the signed-in
// user's own plan, the desktop app's compile key and the newsletter.

import { apiUrl } from './api.ts';

export type Plan = 'free' | 'pro' | 'commercial';

export interface PlanSettings {
  /** first day (YYYY-MM-DD) on which Professional costs money */
  proFreeUntil: string;
  proPrice: number;
  proDailyCompiles: number;
  commercialPrice: number;
  /** Stripe payment links; '' = none yet */
  proCheckoutUrl: string;
  commercialCheckoutUrl: string;
}

/** what the price list shows when there is no server (static hosting) */
export const DEFAULT_PLANS: PlanSettings = {
  proFreeUntil: '2027-02-01',
  proPrice: 6,
  proDailyCompiles: 60,
  commercialPrice: 29,
  proCheckoutUrl: '',
  commercialCheckoutUrl: 'https://buy.stripe.com/4gM4gzdxz6ac9ht0Sfdby01',
};

export type NewsletterStatus = 'pending' | 'active' | null;

export interface Me {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  plan: Plan;
  paidUntil: number | null;
  compile: { ok: true; limit: number | null; used: number } | { ok: false; reason: 'plan' | 'payment'; limit: null; used: number };
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

/** Is Professional still free of charge (German date)? */
export const proFree = (s: PlanSettings, now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now) < s.proFreeUntil;

/** "1. Februar 2027" / "February 1, 2027" */
export const longDate = (iso: string | number, lang: string) =>
  new Date(typeof iso === 'string' ? `${iso}T12:00:00` : iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });

/** the day before `proFreeUntil`: the last free one */
export const lastFreeDay = (s: PlanSettings) => new Date(new Date(`${s.proFreeUntil}T12:00:00`).getTime() - 86_400_000).getTime();

export const euro = (n: number, lang: string) => `${n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 })} €`;

/** a Stripe payment link with the account, so the payment belongs to it */
export function checkoutUrl(base: string, user?: { id: string; email: string }) {
  if (!base || !user) return base;
  const u = new URL(base);
  u.searchParams.set('client_reference_id', user.id);
  u.searchParams.set('prefilled_email', user.email);
  return u.href;
}
