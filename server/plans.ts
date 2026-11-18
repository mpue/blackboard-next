// What an account may do beyond the editor. Everything in BlackBoard is free
// and works without an account; the online compiler of the code editor and
// Claude as design assistant need one. Every account gets the standard access
// (a number of compiles per day, a setting of the admin page); admins can give
// an account unlimited access or block it from both.

import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type Plan = 'standard' | 'unlimited' | 'blocked';
export const PLANS: Plan[] = ['standard', 'unlimited', 'blocked'];

export interface PlanSettings {
  /** compiles per account and day with the standard access */
  dailyCompiles: number;
}

export const DEFAULT_SETTINGS: PlanSettings = { dailyCompiles: 60 };

export interface UserPlan {
  plan: Plan;
  /** the admin's note */
  note: string;
}

const DEFAULT_PLAN: UserPlan = { plan: 'standard', note: '' };

export type Access = { ok: true; limit: number | null } | { ok: false; reason: 'blocked' };

/** The day in Germany, YYYY-MM-DD: the daily limit starts at midnight there. */
export const today = (now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);

/** May this account compile, and how often today? */
export function compileAccess(p: UserPlan, admin: boolean, s: PlanSettings): Access {
  if (admin || p.plan === 'unlimited') return { ok: true, limit: null };
  if (p.plan === 'blocked') return { ok: false, reason: 'blocked' };
  return { ok: true, limit: s.dailyCompiles };
}

/** May this account use Claude with its own API key? Everyone not blocked (the account pays Anthropic itself). */
export function assistantAccess(p: UserPlan, admin: boolean): { ok: true } | { ok: false; reason: 'blocked' } {
  return admin || p.plan !== 'blocked' ? { ok: true } : { ok: false, reason: 'blocked' };
}

/** The settings from the admin page, checked; undefined when something does not fit. */
export function checkSettings(raw: unknown, base: PlanSettings): PlanSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<PlanSettings> & { proDailyCompiles?: unknown };
  // stored before everything was free: the daily compiles of the plan Professional
  const n = r.dailyCompiles ?? r.proDailyCompiles ?? base.dailyCompiles;
  if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 100_000) return undefined;
  return { dailyCompiles: n as number };
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
    // the plans from before everything was free: no compiler, Professional, Commercial
    db.exec(`update userPlan set plan = case plan when 'free' then 'blocked' when 'commercial' then 'unlimited' else 'standard' end
      where plan not in ('standard', 'unlimited', 'blocked')`);
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
    const r = this.db.prepare('select plan, note from userPlan where userId = ?').get(userId) as UserPlan | undefined;
    return r ? { plan: PLANS.includes(r.plan) ? r.plan : 'standard', note: r.note } : DEFAULT_PLAN;
  }

  setPlan(userId: string, p: UserPlan) {
    this.db
      .prepare(
        `insert into userPlan (userId, plan, paidUntil, note, updatedAt) values (?, ?, null, ?, ?)
         on conflict(userId) do update set plan = excluded.plan, paidUntil = null, note = excluded.note, updatedAt = excluded.updatedAt`,
      )
      .run(userId, p.plan, p.note, Date.now());
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
