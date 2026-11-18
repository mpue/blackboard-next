// The admin page's calls to the server (server/admin.ts).

import { apiUrl } from '../account/api.ts';
import type { Plan, PlanSettings } from '../account/plans.ts';

export interface Stats {
  users: number;
  newUsers: number;
  verified: number;
  banned: number;
  plans: Record<Plan, number>;
  projects: number;
  compilesToday: number;
  compilesByDay: { day: string; count: number }[];
  subscribers: { active: number; pending: number };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  role: string | null;
  admin: boolean;
  banned: boolean;
  banReason: string | null;
  plan: Plan;
  note: string;
  projects: number;
  compilesToday: number;
  compilesTotal: number;
  lastSeen: string | null;
  providers: string[];
  newsletter: 'pending' | 'active' | null;
}

export interface Subscriber {
  id: string;
  email: string;
  lang: 'de' | 'en';
  status: 'pending' | 'active';
  userId: string | null;
  source: string;
  createdAt: number;
  confirmedAt: number | null;
}

export interface Issue {
  id: string;
  subject: string;
  body: string;
  subjectEn: string;
  bodyEn: string;
  status: 'draft' | 'sending' | 'sent';
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
  total: number;
  sent: number;
  failed: number;
  failures?: { email: string; error: string }[];
}

export type IssueFields = Pick<Issue, 'subject' | 'body' | 'subjectEn' | 'bodyEn'>;

/** an answer that was not ok; `code` as the server says it */
export class AdminError extends Error {
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(apiUrl(`admin/${path}`), { credentials: 'same-origin', ...init });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new AdminError(r.status, body.error ?? String(r.status));
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const q = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const api = {
  stats: () => call<Stats>('stats'),
  users: (p: { q: string; plan: string; offset: number }) => call<{ total: number; users: AdminUser[] }>(`users?${q({ ...p, limit: 50 })}`),
  updateUser: (id: string, patch: Partial<{ plan: Plan; note: string; role: 'admin' | 'user'; banned: boolean; banReason: string }>) =>
    call<{ ok: boolean }>(`users/${id}`, json('PATCH', patch)),
  signOutUser: (id: string) => call<{ ok: boolean }>(`users/${id}/sign-out`, { method: 'POST' }),
  resetPassword: (id: string) => call<{ ok: boolean }>(`users/${id}/reset-password`, { method: 'POST' }),
  resendVerification: (id: string) => call<{ ok: boolean }>(`users/${id}/verify`, { method: 'POST' }),
  deleteUser: (id: string) => call<{ ok: boolean }>(`users/${id}`, { method: 'DELETE' }),
  settings: () => call<PlanSettings>('settings'),
  saveSettings: (s: PlanSettings) => call<PlanSettings>('settings', json('PUT', s)),
  subscribers: (p: { q: string; status: string; offset: number }) => call<{ total: number; subscribers: Subscriber[] }>(`newsletter/subscribers?${q({ ...p, limit: 50 })}`),
  subscribersCsv: () => apiUrl('admin/newsletter/subscribers.csv'),
  removeSubscriber: (id: string) => call<{ ok: boolean }>(`newsletter/subscribers/${id}`, { method: 'DELETE' }),
  issues: () => call<Issue[]>('newsletter/issues'),
  issue: (id: string) => call<Issue>(`newsletter/issues/${id}`),
  createIssue: (f: IssueFields) => call<Issue>('newsletter/issues', json('POST', f)),
  saveIssue: (id: string, f: IssueFields) => call<Issue>(`newsletter/issues/${id}`, json('PUT', f)),
  deleteIssue: (id: string) => call<{ ok: boolean }>(`newsletter/issues/${id}`, { method: 'DELETE' }),
  preview: (f: IssueFields, lang: 'de' | 'en') => call<{ html: string; text: string }>(`newsletter/preview?lang=${lang}`, json('POST', f)),
  testIssue: (id: string) => call<{ ok: boolean; to: string }>(`newsletter/issues/${id}/test`, { method: 'POST' }),
  sendIssue: (id: string) => call<Issue>(`newsletter/issues/${id}/send`, { method: 'POST' }),
  cancelIssue: (id: string) => call<Issue>(`newsletter/issues/${id}/cancel`, { method: 'POST' }),
};

/** dates of the server: ISO text or milliseconds */
export const when = (v: string | number | null | undefined, time = false) => {
  if (v === null || v === undefined || v === '') return '–';
  const d = new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? '–' : time ? d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('de-DE', { dateStyle: 'medium' });
};

/** the access to online compiler and Claude */
export const PLAN_NAMES: Record<Plan, string> = { standard: 'Standard', unlimited: 'Unbegrenzt', blocked: 'Gesperrt' };
