// The BlackBoard server: accounts with their plans, cloud projects, the way to
// the compiler and to Claude, the newsletter and the admin page's API, under
// <PUBLIC_PATH>/api. The app itself stays static (nginx); this only answers
// /api, with its data in one SQLite file in DATA_DIR.

import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig, type Config } from './config.ts';
import { createMailer, type Mailer } from './mail.ts';
import { createAuth } from './auth.ts';
import { ProjectStore, projectRoutes } from './projects.ts';
import { compileRoutes } from './compile.ts';
import { PlanStore } from './plans.ts';
import { meRoutes } from './me.ts';
import { NewsletterSender, NewsletterStore, newsletterRoutes } from './newsletter.ts';
import { adminRoutes } from './admin.ts';
import { AssistantKeyStore, assistantRoutes, type ClaudeFactory } from './assistant.ts';

export async function createServer(config: Config, opts: { mailer?: Mailer; file?: string; claude?: ClaudeFactory } = {}) {
  const db = new DatabaseSync(opts.file ?? join(config.dataDir, 'blackboard.db'));
  db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000;');
  const mail = opts.mailer ?? createMailer(config);
  // a deleted account takes its projects, plan, compiles, keys and subscription along
  const deleteUser = (user: { id: string; email: string }) => {
    store.deleteUser(user.id);
    plans.deleteUser(user.id);
    keys.remove(user.id);
    news.deleteUser(user.id, user.email);
  };
  const auth = await createAuth(config, db, mail, deleteUser);
  const store = new ProjectStore(db);
  const plans = new PlanStore(db);
  const news = new NewsletterStore(db);
  const keys = new AssistantKeyStore(db, config.secret);
  const sender = new NewsletterSender(news, mail, config);
  // what was in line before a restart goes on
  sender.kick();
  const base = `${config.publicPath}/api`;
  // "/api/projects/" and "/api/projects" are the same
  const app = new Hono({ strict: false });
  app.get(`${base}/health`, (c) => c.json({ ok: true }));
  // what the sign-in dialog and the price list can offer
  app.get(`${base}/config`, (c) => c.json({ google: !!config.google, maxProjectBytes: config.maxProjectBytes, plans: plans.settings() }));
  app.on(['GET', 'POST'], `${base}/auth/*`, (c) => auth.handler(c.req.raw));
  app.route(`${base}/projects`, projectRoutes(config, auth, store, mail));
  app.route(`${base}/compile`, compileRoutes(config, auth, db, plans));
  app.route(`${base}/me`, meRoutes(config, auth, plans, news));
  app.route(`${base}/assistant`, assistantRoutes(config, auth, plans, keys, opts.claude));
  app.route(`${base}/newsletter`, newsletterRoutes(config, auth, news, mail));
  app.route(`${base}/admin`, adminRoutes(config, auth, db, plans, news, sender, mail, deleteUser));
  return { app, auth, db, store, plans, news, sender, keys };
}

if (import.meta.main) {
  const config = loadConfig();
  const { app } = await createServer(config);
  serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
    console.log(
      `BlackBoard server on :${port}, ${config.origin}${config.publicPath}/api (Google ${config.google ? 'on' : 'off'}, SMTP ${config.smtp ? 'on' : 'off: mails go to the log'}, admins ${config.adminEmails.join(', ') || 'none'})`,
    );
  });
}
