// The BlackBoard server: accounts, cloud projects and the way to the compiler
// for the web app, under <PUBLIC_PATH>/api. The app itself stays static
// (nginx); this only answers /api, with its data in one SQLite file in DATA_DIR.

import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig, type Config } from './config.ts';
import { createMailer, type Mailer } from './mail.ts';
import { createAuth } from './auth.ts';
import { ProjectStore, projectRoutes } from './projects.ts';
import { compileRoutes } from './compile.ts';

export async function createServer(config: Config, opts: { mailer?: Mailer; file?: string } = {}) {
  const db = new DatabaseSync(opts.file ?? join(config.dataDir, 'blackboard.db'));
  db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000;');
  const mail = opts.mailer ?? createMailer(config);
  const auth = await createAuth(config, db, mail, (userId) => store.deleteUser(userId));
  const store = new ProjectStore(db);
  const base = `${config.publicPath}/api`;
  // "/api/projects/" and "/api/projects" are the same
  const app = new Hono({ strict: false });
  app.get(`${base}/health`, (c) => c.json({ ok: true }));
  // what the sign-in dialog can offer
  app.get(`${base}/config`, (c) => c.json({ google: !!config.google, maxProjectBytes: config.maxProjectBytes }));
  app.on(['GET', 'POST'], `${base}/auth/*`, (c) => auth.handler(c.req.raw));
  app.route(`${base}/projects`, projectRoutes(config, auth, store, mail));
  app.route(`${base}/compile`, compileRoutes(config));
  return { app, auth, db, store };
}

if (import.meta.main) {
  const config = loadConfig();
  const { app } = await createServer(config);
  serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
    console.log(`BlackBoard server on :${port}, ${config.origin}${config.publicPath}/api (Google ${config.google ? 'on' : 'off'}, SMTP ${config.smtp ? 'on' : 'off: mails go to the log'})`);
  });
}
