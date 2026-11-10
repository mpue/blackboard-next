// The admin page's API (only for admins, see isAdmin): the accounts with their
// plan, blocking and deleting them, the plan settings (prices, the end of the
// free start, Stripe links) and the newsletter (subscribers, issues, sending).

import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { isAdmin, type Auth } from './auth.ts';
import type { Config } from './config.ts';
import type { Mailer } from './mail.ts';
import { issueMail, linksFor, renderBody, type Issue, type NewsletterSender, type NewsletterStore } from './newsletter.ts';
import { checkSettings, PLANS, today, type Plan, type PlanStore } from './plans.ts';

type User = { id: string; name: string; email: string; emailVerified: boolean; role?: string | null };

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
  paidUntil: number | null;
  note: string;
  projects: number;
  compilesToday: number;
  compilesTotal: number;
  lastSeen: string | null;
  providers: string[];
  newsletter: string | null;
}

interface Row extends Omit<AdminUser, 'emailVerified' | 'banned' | 'providers' | 'admin' | 'plan' | 'note'> {
  emailVerified: number;
  banned: number | null;
  providers: string | null;
  plan: string | null;
  note: string | null;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 100_000;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function adminRoutes(
  config: Config,
  auth: Auth,
  db: DatabaseSync,
  plans: PlanStore,
  news: NewsletterStore,
  sender: NewsletterSender,
  mail: Mailer,
  deleteUser: (user: { id: string; email: string }) => void,
) {
  const app = new Hono<{ Variables: { user: User } }>();
  const site = `${config.origin}${config.publicPath}`;

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && origin && origin !== config.origin) return c.json({ error: 'origin' }, 403);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    if (!isAdmin(config, session.user as User)) return c.json({ error: 'forbidden' }, 403);
    c.set('user', session.user as User);
    await next();
  });

  // ---- overview ----

  app.get('/stats', (c) => {
    const n = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;
    const week = Date.now() - 7 * 24 * 3600_000;
    const created = db.prepare('select createdAt from user').all() as unknown as { createdAt: string }[];
    const plan = (p: Plan) => n(`select count(*) as n from user u left join userPlan p on p.userId = u.id where coalesce(p.plan, 'pro') = ?`, p);
    return c.json({
      users: created.length,
      newUsers: created.filter((u) => new Date(u.createdAt).getTime() >= week).length,
      verified: n('select count(*) as n from user where emailVerified = 1'),
      banned: n('select count(*) as n from user where banned = 1'),
      plans: { free: plan('free'), pro: plan('pro'), commercial: plan('commercial') },
      projects: n('select count(*) as n from project'),
      compilesToday: n('select coalesce(sum(count), 0) as n from compileUsage where day = ?', today()),
      compilesByDay: plans.usageByDay(14),
      subscribers: news.counts(),
    });
  });

  // ---- accounts ----

  const userRow = (id: string) => db.prepare('select id, name, email, emailVerified, role from user where id = ?').get(id) as unknown as User | undefined;

  app.get('/users', (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const plan = PLANS.includes(c.req.query('plan') as Plan) ? c.req.query('plan')! : '';
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const where = `where (u.name like ? escape '\\' or u.email like ? escape '\\') and (? = '' or coalesce(p.plan, 'pro') = ?)`;
    const total = (db.prepare(`select count(*) as n from user u left join userPlan p on p.userId = u.id ${where}`).get(like, like, plan, plan) as { n: number }).n;
    const rows = db
      .prepare(
        `select u.id, u.name, u.email, u.emailVerified, u.image, u.createdAt, u.role, u.banned, u.banReason,
          p.plan, p.paidUntil, p.note,
          (select count(*) from project where ownerId = u.id) as projects,
          (select coalesce(sum(count), 0) from compileUsage where userId = u.id and day = ?) as compilesToday,
          (select coalesce(sum(count), 0) from compileUsage where userId = u.id) as compilesTotal,
          (select max(updatedAt) from session where userId = u.id) as lastSeen,
          (select group_concat(providerId) from account where userId = u.id) as providers,
          (select status from newsletterSubscriber where email = u.email) as newsletter
        from user u left join userPlan p on p.userId = u.id ${where}
        order by u.createdAt desc limit ? offset ?`,
      )
      .all(today(), like, like, plan, plan, limit, offset) as unknown as Row[];
    const users: AdminUser[] = rows.map((r) => ({
      ...r,
      emailVerified: !!r.emailVerified,
      banned: !!r.banned,
      admin: isAdmin(config, { email: r.email, emailVerified: r.emailVerified, role: r.role }),
      plan: (PLANS.includes(r.plan as Plan) ? r.plan : r.plan === null ? 'pro' : 'free') as Plan,
      note: r.note ?? '',
      providers: r.providers ? r.providers.split(',') : [],
    }));
    return c.json({ total, users });
  });

  app.patch('/users/:id', async (c) => {
    const me = c.get('user');
    const u = userRow(c.req.param('id'));
    if (!u) return c.json({ error: 'not found' }, 404);
    const b = (await c.req.json().catch(() => ({}))) as { plan?: unknown; paidUntil?: unknown; note?: unknown; role?: unknown; banned?: unknown; banReason?: unknown };
    if (b.plan !== undefined || b.paidUntil !== undefined || b.note !== undefined) {
      const p = plans.planOf(u.id);
      if (b.plan !== undefined && !PLANS.includes(b.plan as Plan)) return c.json({ error: 'plan' }, 400);
      if (b.paidUntil !== undefined && b.paidUntil !== null && !(typeof b.paidUntil === 'number' && Number.isFinite(b.paidUntil))) return c.json({ error: 'paidUntil' }, 400);
      plans.setPlan(u.id, {
        plan: (b.plan as Plan) ?? p.plan,
        paidUntil: b.paidUntil === undefined ? p.paidUntil : (b.paidUntil as number | null),
        note: b.note === undefined ? p.note : String(b.note).slice(0, 500),
      });
    }
    if (b.role !== undefined) {
      if (b.role !== 'admin' && b.role !== 'user') return c.json({ error: 'role' }, 400);
      if (u.id === me.id && b.role !== 'admin') return c.json({ error: 'self' }, 400);
      db.prepare('update user set role = ? where id = ?').run(b.role, u.id);
    }
    if (b.banned !== undefined) {
      if (u.id === me.id) return c.json({ error: 'self' }, 400);
      db.prepare('update user set banned = ?, banReason = ? where id = ?').run(b.banned ? 1 : 0, b.banned ? String(b.banReason ?? '').slice(0, 300) || null : null, u.id);
      // blocked: signed out everywhere, the desktop key stops too (compile.ts)
      if (b.banned) db.prepare('delete from session where userId = ?').run(u.id);
    }
    return c.json({ ok: true });
  });

  app.post('/users/:id/sign-out', (c) => {
    db.prepare('delete from session where userId = ?').run(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/users/:id/reset-password', async (c) => {
    const u = userRow(c.req.param('id'));
    if (!u) return c.json({ error: 'not found' }, 404);
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: `${site}/?reset=1` } });
    return c.json({ ok: true });
  });

  app.post('/users/:id/verify', async (c) => {
    const u = userRow(c.req.param('id'));
    if (!u) return c.json({ error: 'not found' }, 404);
    if (u.emailVerified) return c.json({ error: 'verified' }, 400);
    await auth.api.sendVerificationEmail({ body: { email: u.email, callbackURL: `${site}/?verified=1` } });
    return c.json({ ok: true });
  });

  app.delete('/users/:id', (c) => {
    const u = userRow(c.req.param('id'));
    if (!u) return c.json({ error: 'not found' }, 404);
    if (u.id === c.get('user').id) return c.json({ error: 'self' }, 400);
    deleteUser(u);
    for (const t of ['session', 'account']) db.prepare(`delete from ${t} where userId = ?`).run(u.id);
    db.prepare('delete from user where id = ?').run(u.id);
    return c.json({ ok: true });
  });

  // ---- plans ----

  app.get('/settings', (c) => c.json(plans.settings()));
  app.put('/settings', async (c) => {
    const s = checkSettings(await c.req.json().catch(() => null), plans.settings());
    if (!s) return c.json({ error: 'settings' }, 400);
    plans.saveSettings(s);
    return c.json(s);
  });

  // ---- newsletter ----

  app.get('/newsletter/subscribers', (c) =>
    c.json(news.list(c.req.query('q') ?? '', c.req.query('status') ?? '', Math.max(Number(c.req.query('offset')) || 0, 0), Math.min(Number(c.req.query('limit')) || 50, 500))),
  );
  app.get('/newsletter/subscribers.csv', (c) => {
    const { subscribers } = news.list('', 'active', 0, 1_000_000);
    const lines = [['email', 'lang', 'source', 'createdAt', 'confirmedAt'], ...subscribers.map((s) => [s.email, s.lang, s.source, new Date(s.createdAt).toISOString(), s.confirmedAt ? new Date(s.confirmedAt).toISOString() : ''])];
    return c.body(`${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="newsletter-${today()}.csv"`,
      'cache-control': 'no-store',
    });
  });
  app.delete('/newsletter/subscribers/:id', (c) => {
    news.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  const fields = async (req: Request) => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const str = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, max) : '');
    return { subject: str('subject', MAX_SUBJECT).trim(), body: str('body', MAX_BODY), subjectEn: str('subjectEn', MAX_SUBJECT).trim(), bodyEn: str('bodyEn', MAX_BODY) };
  };

  app.get('/newsletter/issues', (c) => c.json(news.issues()));
  app.get('/newsletter/issues/:id', (c) => {
    const i = news.issue(c.req.param('id'));
    return i ? c.json({ ...i, failures: news.failures(i.id) }) : c.json({ error: 'not found' }, 404);
  });
  app.post('/newsletter/issues', async (c) => c.json(news.saveIssue(undefined, await fields(c.req.raw)), 201));
  app.put('/newsletter/issues/:id', async (c) => {
    const i = news.issue(c.req.param('id'));
    if (!i) return c.json({ error: 'not found' }, 404);
    if (i.status !== 'draft') return c.json({ error: 'sent' }, 409);
    return c.json(news.saveIssue(i.id, await fields(c.req.raw)));
  });
  app.delete('/newsletter/issues/:id', (c) => {
    const i = news.issue(c.req.param('id'));
    if (!i) return c.json({ error: 'not found' }, 404);
    if (i.status === 'sending') return c.json({ error: 'sending' }, 409);
    news.deleteIssue(i.id);
    return c.json({ ok: true });
  });

  // the mail exactly as subscribers get it
  app.post('/newsletter/preview', async (c) => {
    const f = await fields(c.req.raw);
    const en = c.req.query('lang') === 'en';
    const m = issueMail('preview@example.org', en ? 'en' : 'de', en ? f.subjectEn : f.subject, en ? f.bodyEn : f.body, linksFor(config, 'preview'));
    return c.json({ html: m.html, text: renderBody(en ? f.bodyEn : f.body).text });
  });

  const ready = (i: Issue) => i.subject && i.body.trim();
  app.post('/newsletter/issues/:id/test', async (c) => {
    const i = news.issue(c.req.param('id'));
    if (!i) return c.json({ error: 'not found' }, 404);
    if (!ready(i)) return c.json({ error: 'empty' }, 400);
    const to = c.get('user').email;
    await mail(issueMail(to, 'de', `[Test] ${i.subject}`, i.body, linksFor(config, 'test')));
    if (i.subjectEn && i.bodyEn.trim()) await mail(issueMail(to, 'en', `[Test] ${i.subjectEn}`, i.bodyEn, linksFor(config, 'test')));
    return c.json({ ok: true, to });
  });
  app.post('/newsletter/issues/:id/send', (c) => {
    const i = news.issue(c.req.param('id'));
    if (!i) return c.json({ error: 'not found' }, 404);
    if (i.status !== 'draft') return c.json({ error: 'sent' }, 409);
    if (!ready(i)) return c.json({ error: 'empty' }, 400);
    news.queue(i.id);
    sender.kick();
    return c.json(news.issue(i.id));
  });
  app.post('/newsletter/issues/:id/cancel', (c) => {
    news.cancel(c.req.param('id'));
    return c.json(news.issue(c.req.param('id')) ?? { error: 'not found' });
  });

  return app;
}
