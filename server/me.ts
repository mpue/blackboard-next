// The signed-in user's own access: what it allows, today's compiles, and the key
// with which the desktop app compiles for the account.

import { Hono } from 'hono';
import { isAdmin, type Auth } from './auth.ts';
import type { Config } from './config.ts';
import type { NewsletterStore } from './newsletter.ts';
import { compileAccess, type PlanStore } from './plans.ts';

type User = { id: string; name: string; email: string; emailVerified: boolean; role?: string | null };

export function meRoutes(config: Config, auth: Auth, plans: PlanStore, news: NewsletterStore) {
  const app = new Hono<{ Variables: { user: User } }>();

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && origin && origin !== config.origin) return c.json({ error: 'origin' }, 403);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    c.set('user', session.user as User);
    await next();
  });

  app.get('/', (c) => {
    const u = c.get('user');
    const p = plans.planOf(u.id);
    const admin = isAdmin(config, u);
    const access = compileAccess(p, admin, plans.settings());
    return c.json({
      id: u.id,
      name: u.name,
      email: u.email,
      admin,
      plan: p.plan,
      compile: access.ok ? { ok: true, limit: access.limit, used: plans.used(u.id) } : { ok: false, reason: access.reason, limit: null, used: 0 },
      key: plans.keyInfo(u.id) ?? null,
      newsletter: news.byEmail(u.email)?.status ?? null,
    });
  });

  // shown once; a new one replaces the old one
  app.post('/key', (c) => c.json({ key: plans.createKey(c.get('user').id) }));
  app.delete('/key', (c) => {
    plans.removeKey(c.get('user').id);
    return c.json({ ok: true });
  });

  return app;
}
