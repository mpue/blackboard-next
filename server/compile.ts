// The code editor's compiler: C/C++ to Intel HEX for the ATmega328P. It runs in
// a container of its own (compiler/); this passes the requests on for accounts
// whose plan includes it (plans.ts), counts them per day and keeps runaway
// scripts out (MAX_COMPILES per account in ten minutes). The web app signs in
// with its session; the desktop app has no server of its own and sends the
// account's key instead (Authorization: Bearer bbk_…), so its origins may call
// this route.

import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { isAdmin, type Auth } from './auth.ts';
import type { Config } from './config.ts';
import { compileAccess, type PlanStore } from './plans.ts';

const WINDOW_MS = 10 * 60_000;
/** the compiler takes 512 KB of source; JSON escaping adds a little */
const MAX_BODY = 1024 * 1024;
export const DESKTOP = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

interface Who {
  id: string;
  email: string;
  emailVerified: boolean | number;
  role?: string | null;
  banned?: boolean | number | null;
}

export function compileRoutes(config: Config, auth: Auth, db: DatabaseSync, plans: PlanStore) {
  const app = new Hono();
  /** account -> times of the compiles in the window */
  const hits = new Map<string, number[]>();
  app.use(
    '*',
    cors({
      origin: (o) => (DESKTOP.includes(o) ? o : null),
      allowMethods: ['POST'],
      allowHeaders: ['content-type', 'authorization'],
      exposeHeaders: ['x-compile-used', 'x-compile-limit'],
      maxAge: 86400,
    }),
  );

  /** the account of the request; 'key' for a key that is not (or no longer) valid */
  const who = async (req: Request): Promise<Who | 'key' | undefined> => {
    const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
    if (key) {
      const id = plans.userOfKey(key);
      const u = id ? (db.prepare('select id, email, emailVerified, role, banned from user where id = ?').get(id) as Who | undefined) : undefined;
      return u && !u.banned ? u : 'key';
    }
    return ((await auth.api.getSession({ headers: req.headers }))?.user as Who | undefined) ?? undefined;
  };

  app.post('/', bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: 'large' }, 413) }), async (c) => {
    const origin = c.req.header('origin');
    if (origin && origin !== config.origin && !DESKTOP.includes(origin)) return c.json({ error: 'origin' }, 403);
    const u = await who(c.req.raw);
    if (u === 'key') return c.json({ error: 'key' }, 401);
    if (!u) return c.json({ error: 'login' }, 401);
    const access = compileAccess(plans.planOf(u.id), isAdmin(config, u), plans.settings());
    if (!access.ok) return c.json({ error: access.reason }, 403);
    const used = plans.used(u.id);
    if (access.limit !== null && used >= access.limit) return c.json({ error: 'quota', used, limit: access.limit }, 429);

    const now = Date.now();
    const recent = (hits.get(u.id) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= config.maxCompiles) return c.json({ error: 'rate' }, 429);
    recent.push(now);
    hits.set(u.id, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);

    let r: Response;
    try {
      r = await fetch(`${config.compilerUrl}/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: await c.req.arrayBuffer(),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      return c.json({ error: 'no compiler' }, 503);
    }
    // a compile that ran counts, with or without errors in the code
    const count = r.status === 200 ? plans.use(u.id) : used;
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-compile-used': String(count) };
    if (access.limit !== null) headers['x-compile-limit'] = String(access.limit);
    return new Response(await r.arrayBuffer(), { status: r.status, headers });
  });
  return app;
}
