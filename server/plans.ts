// The plans and what they allow. Everything in BlackBoard works without an
// account (Free); the online compiler of the code editor and Claude as design
// assistant need an account with Professional (free of charge until
// `proFreeUntil`, then paid, a number of compiles per day) or Commercial (no
// daily limit). Admins set the plan of an
// account by hand; the prices, the date and the Stripe payment links are
// settings of the admin page.

import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type Plan = 'free' | 'pro' | 'commercial';
export const PLANS: Plan[] = ['free', 'pro', 'commercial'];

export interface PlanSettings {
  /** first day (YYYY-MM-DD, German time) on which Professional costs money */
  proFreeUntil: string;
  /** € per month */
  proPrice: number;
  proDailyCompiles: number;
  commercialPrice: number;
  /** Stripe payment links; '' = none yet */
  proCheckoutUrl: string;
  commercialCheckoutUrl: string;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  proFreeUntil: '2027-02-01',
  proPrice: 6,
  proDailyCompiles: 60,
  commercialPrice: 29,
  proCheckoutUrl: '',
  commercialCheckoutUrl: 'https://buy.stripe.com/4gM4gzdxz6ac9ht0Sfdby01',
};

export interface UserPlan {
  plan: Plan;
  /** paid until then (ms); Professional after the free start needs it */
  paidUntil: number | null;
  /** the admin's note, e.g. the Stripe customer */
  note: string;
}

/** New accounts get Professional. */
const DEFAULT_PLAN: UserPlan = { plan: 'pro', paidUntil: null, note: '' };

export type Access = { ok: true; limit: number | null } | { ok: false; reason: 'plan' | 'payment' };

/** The day in Germany, YYYY-MM-DD: the daily limit starts at midnight there. */
export const today = (now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);

/** May this account compile, and how often today? */
export function compileAccess(p: UserPlan, admin: boolean, s: PlanSettings, now = Date.now()): Access {
  if (admin || p.plan === 'commercial') return { ok: true, limit: null };
  if (p.plan === 'free') return { ok: false, reason: 'plan' };
  if (today(now) < s.proFreeUntil || (p.paidUntil ?? 0) > now) return { ok: true, limit: s.proDailyCompiles };
  return { ok: false, reason: 'payment' };
}

/** May this account use Claude with its own API key? The plans of the compiler, without a daily limit (the account pays Anthropic itself). */
export function assistantAccess(p: UserPlan, admin: boolean, s: PlanSettings, now = Date.now()): { ok: true } | { ok: false; reason: 'plan' | 'payment' } {
  const a = compileAccess(p, admin, s, now);
  return a.ok ? { ok: true } : a;
}

const URL_OK =(u: unknown) => typeof u === 'string' && (u === '' || (/^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500));

/** The settings from the admin page, checked; undefined when something does not fit. */
export function checkSettings(raw: unknown, base: PlanSettings): PlanSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = { ...base, ...(raw as Partial<PlanSettings>) };
  const money = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10_000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.proFreeUntil) || Number.isNaN(Date.parse(s.proFreeUntil))) return undefined;
  if (!money(s.proPrice) || !money(s.commercialPrice)) return undefined;
  if (!Number.isInteger(s.proDailyCompiles) || s.proDailyCompiles < 0 || s.proDailyCompiles > 100_000) return undefined;
  if (!URL_OK(s.proCheckoutUrl) || !URL_OK(s.commercialCheckoutUrl)) return undefined;
  const { proFreeUntil, proPrice, proDailyCompiles, commercialPrice, proCheckoutUrl, commercialCheckoutUrl } = s;
  return { proFreeUntil, proPrice, proDailyCompiles, commercialPrice, proCheckoutUrl, commercialCheckoutUrl };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class PlanStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      create table if not exists setting (key text primary key, value text not null);
      create table if not exists userPlan (
        userId text primary key, plan text not null, paidUntil integer, note text not null default '', updatedAt integer not null);
      create table if not exists compileUsage (
        userId text not null, day text not null, count integer not null, primary key (userId, day));
      create table if not exists compileKey (
        userId text primary key, hash text not null unique, createdAt integer not null, lastUsedAt integer);`);
  }

  settings(): PlanSettings {
    const row = this.db.prepare(`select value from setting where key = 'plans'`).get() as { value: string } | undefined;
    if (!row) return DEFAULT_SETTINGS;
    return checkSettings(JSON.parse(row.value), DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS;
  }

  saveSettings(s: PlanSettings) {
    this.db.prepare(`insert into setting (key, value) values ('plans', ?) on conflict(key) do update set value = excluded.value`).run(JSON.stringify(s));
  }

  planOf(userId: string): UserPlan {
    const r = this.db.prepare('select plan, paidUntil, note from userPlan where userId = ?').get(userId) as UserPlan | undefined;
    return r ? { plan: PLANS.includes(r.plan) ? r.plan : 'free', paidUntil: r.paidUntil ?? null, note: r.note } : DEFAULT_PLAN;
  }

  setPlan(userId: string, p: UserPlan) {
    this.db
      .prepare(
        `insert into userPlan (userId, plan, paidUntil, note, updatedAt) values (?, ?, ?, ?, ?)
         on conflict(userId) do update set plan = excluded.plan, paidUntil = excluded.paidUntil, note = excluded.note, updatedAt = excluded.updatedAt`,
      )
      .run(userId, p.plan, p.paidUntil, p.note, Date.now());
  }

  used(userId: string, day = today()): number {
    return (this.db.prepare('select count from compileUsage where userId = ? and day = ?').get(userId, day) as { count: number } | undefined)?.count ?? 0;
  }

  /** counts one compile; returns the count of the day */
  use(userId: string, day = today()): number {
    this.db.prepare('insert into compileUsage (userId, day, count) values (?, ?, 1) on conflict(userId, day) do update set count = count + 1').run(userId, day);
    return this.used(userId, day);
  }

  /** compiles of all accounts per day, newest first */
  usageByDay(days: number): { day: string; count: number }[] {
    return this.db.prepare('select day, sum(count) as count from compileUsage group by day order by day desc limit ?').all(days) as unknown as { day: string; count: number }[];
  }

  /** A new key for the desktop app (shown once); an older one stops working. */
  createKey(userId: string): string {
    const key = `bbk_${randomBytes(24).toString('base64url')}`;
    this.db
      .prepare('insert into compileKey (userId, hash, createdAt) values (?, ?, ?) on conflict(userId) do update set hash = excluded.hash, createdAt = excluded.createdAt, lastUsedAt = null')
      .run(userId, sha256(key), Date.now());
    return key;
  }

  keyInfo(userId: string): { createdAt: number; lastUsedAt: number | null } | undefined {
    return this.db.prepare('select createdAt, lastUsedAt from compileKey where userId = ?').get(userId) as { createdAt: number; lastUsedAt: number | null } | undefined;
  }

  removeKey(userId: string) {
    this.db.prepare('delete from compileKey where userId = ?').run(userId);
  }

  /** the account a key belongs to */
  userOfKey(key: string): string | undefined {
    if (!/^bbk_[\w-]{20,64}$/.test(key)) return undefined;
    const r = this.db.prepare('select userId from compileKey where hash = ?').get(sha256(key)) as { userId: string } | undefined;
    if (r) this.db.prepare('update compileKey set lastUsedAt = ? where userId = ?').run(Date.now(), r.userId);
    return r?.userId;
  }

  deleteUser(userId: string) {
    for (const t of ['userPlan', 'compileUsage', 'compileKey']) this.db.prepare(`delete from ${t} where userId = ?`).run(userId);
  }
}
