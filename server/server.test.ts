// node --test: the whole account and project flow against the real server,
// with the mails captured instead of sent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadConfig } from './config.ts';
import { createServer } from './main.ts';
import type { Mail } from './mail.ts';

const ORIGIN = 'http://localhost:5173';
const P = '/blackboard';

async function setup(env: Record<string, string> = {}) {
  const config = loadConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'bb-')), ORIGIN, PUBLIC_PATH: P, MAX_PROJECT_MB: '1', ...env });
  const mails: Mail[] = [];
  const server = await createServer(config, { file: ':memory:', mailer: async (m) => void mails.push(m) });
  const { app } = server;
  const call = async (path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.has('origin')) headers.set('origin', ORIGIN);
    if (init.cookie) headers.set('cookie', init.cookie);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    return app.fetch(new Request(path.startsWith('http') ? path : `${ORIGIN}${path}`, { ...init, headers, body, redirect: 'manual' }));
  };
  const cookieOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');
  const linkIn = (m: Mail) => /https?:\/\/\S+/.exec(m.text)![0];

  /** signs a new user up, confirms the address from the mail and returns the session cookie */
  const user = async (name: string, email: string, password = 'geheim-123') => {
    const r = await call(`${P}/api/auth/sign-up/email`, { method: 'POST', json: { name, email, password, callbackURL: `${P}/?verified=1` } });
    assert.equal(r.status, 200, await r.clone().text());
    const mail = mails.findLast((m) => m.to === email)!;
    assert.match(mail.subject, /bestätigen/);
    const v = await call(linkIn(mail));
    assert.equal(v.status, 302);
    assert.match(v.headers.get('location')!, /verified=1/);
    return cookieOf(v);
  };
  return { call, cookieOf, user, mails, linkIn, server };
}

test('sign up needs the confirmed address, then the session works', async () => {
  const { call, user } = await setup();
  const signUp = await call(`${P}/api/auth/sign-up/email`, { method: 'POST', json: { name: 'Eve', email: 'eve@example.com', password: 'geheim-123' } });
  assert.equal(signUp.status, 200);
  const early = await call(`${P}/api/auth/sign-in/email`, { method: 'POST', json: { email: 'eve@example.com', password: 'geheim-123' } });
  assert.equal(early.status, 403);
  const cookie = await user('Ada', 'ada@example.com');
  const s = await call(`${P}/api/auth/get-session`, { cookie });
  assert.equal(((await s.json()) as { user: { email: string } }).user.email, 'ada@example.com');
  const cfg = (await (await call(`${P}/api/config`)).json()) as { google: boolean };
  assert.equal(cfg.google, false);
});

test('projects: save, share to view and edit, versions guard concurrent saves, revoke', async () => {
  const { call, user, mails } = await setup();
  const ada = await user('Ada', 'ada@example.com');
  const bob = await user('Bob', 'bob@example.com');
  assert.equal((await call(`${P}/api/projects`)).status, 401);

  const created = await call(`${P}/api/projects?name=${encodeURIComponent('Blinker 555')}`, { method: 'POST', cookie: ada, body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(created.status, 201);
  const meta = (await created.json()) as { id: string; version: number; name: string };
  assert.equal(meta.name, 'Blinker 555');

  // not shared yet: Bob does not even see it
  assert.equal((await call(`${P}/api/projects/${meta.id}`, { cookie: bob })).status, 404);
  assert.equal((await call(`${P}/api/projects/${meta.id}/shares`, { method: 'POST', cookie: ada, json: { email: 'nobody@example.com', role: 'view' } })).status, 404);
  const shared = await call(`${P}/api/projects/${meta.id}/shares`, { method: 'POST', cookie: ada, json: { email: 'BOB@example.com', role: 'view' } });
  assert.equal(shared.status, 200);
  assert.equal(((await shared.json()) as unknown[]).length, 1);
  assert.match(mails.at(-1)!.subject, /Ada hat „Blinker 555“ mit dir geteilt/);

  const bobList = (await (await call(`${P}/api/projects`, { cookie: bob })).json()) as { own: unknown[]; shared: { id: string; role: string; owner: { name: string } }[] };
  assert.deepEqual(bobList.own, []);
  assert.equal(bobList.shared[0].role, 'view');
  assert.equal(bobList.shared[0].owner.name, 'Ada');
  const file = await call(`${P}/api/projects/${meta.id}`, { cookie: bob });
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
  assert.equal(file.headers.get('x-project-role'), 'view');
  assert.equal((await call(`${P}/api/projects/${meta.id}`, { method: 'PUT', cookie: bob, body: new Uint8Array([9]), headers: { 'if-match': '1' } })).status, 403);

  // edit: Bob saves version 2; Ada, still on version 1, is told
  await call(`${P}/api/projects/${meta.id}/shares`, { method: 'POST', cookie: ada, json: { email: 'bob@example.com', role: 'edit' } });
  const bobSave = await call(`${P}/api/projects/${meta.id}`, { method: 'PUT', cookie: bob, body: new Uint8Array([4, 5]), headers: { 'if-match': '1' } });
  assert.equal(bobSave.status, 200);
  assert.equal(((await bobSave.json()) as { version: number }).version, 2);
  const stale = await call(`${P}/api/projects/${meta.id}`, { method: 'PUT', cookie: ada, body: new Uint8Array([6]), headers: { 'if-match': '1' } });
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { version: number }).version, 2);

  // requests from another site are refused
  assert.equal((await call(`${P}/api/projects/${meta.id}`, { method: 'DELETE', cookie: ada, headers: { origin: 'https://evil.example' } })).status, 403);

  // Bob takes it off his list; Ada revokes nothing more, her project stays
  assert.equal((await call(`${P}/api/projects/${meta.id}`, { method: 'DELETE', cookie: bob })).status, 200);
  const adaShares = (await (await call(`${P}/api/projects/${meta.id}/shares`, { cookie: ada })).json()) as unknown[];
  assert.deepEqual(adaShares, []);
  assert.equal((await call(`${P}/api/projects/${meta.id}`, { cookie: ada })).status, 200);

  // too large
  assert.equal((await call(`${P}/api/projects?name=x`, { method: 'POST', cookie: ada, body: new Uint8Array(1024 * 1024 + 1) })).status, 413);
});

test('password reset by mail, and deleting the account takes the projects along', async () => {
  const { call, user, mails, linkIn, cookieOf } = await setup();
  const ada = await user('Ada', 'ada@example.com');
  const bob = await user('Bob', 'bob@example.com');
  const meta = (await (await call(`${P}/api/projects?name=a`, { method: 'POST', cookie: ada, body: new Uint8Array([1]) })).json()) as { id: string };
  await call(`${P}/api/projects/${meta.id}/shares`, { method: 'POST', cookie: ada, json: { email: 'bob@example.com', role: 'edit' } });

  const req = await call(`${P}/api/auth/request-password-reset`, { method: 'POST', json: { email: 'ada@example.com', redirectTo: `${P}/?view=reset` } });
  assert.equal(req.status, 200);
  const r = await call(linkIn(mails.findLast((m) => /Passwort/.test(m.subject))!));
  assert.equal(r.status, 302);
  const token = new URL(r.headers.get('location')!, ORIGIN).searchParams.get('token')!;
  assert.ok(token);
  assert.equal((await call(`${P}/api/auth/reset-password`, { method: 'POST', json: { newPassword: 'ganz-neu-456', token } })).status, 200);
  const signIn = await call(`${P}/api/auth/sign-in/email`, { method: 'POST', json: { email: 'ada@example.com', password: 'ganz-neu-456' } });
  assert.equal(signIn.status, 200);
  const fresh = cookieOf(signIn);

  const del = await call(`${P}/api/auth/delete-user`, { method: 'POST', cookie: fresh, json: { password: 'ganz-neu-456' } });
  assert.equal(del.status, 200, await del.clone().text());
  const bobList = (await (await call(`${P}/api/projects`, { cookie: bob })).json()) as { shared: unknown[] };
  assert.deepEqual(bobList.shared, []);
});

/** a compiler stand-in that answers every compile with a tiny HEX */
async function fakeCompiler() {
  const seen: string[] = [];
  const fake = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`${req.method} ${req.url} ${body}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hex: ':00000001FF\n', diagnostics: [], log: '', ms: 1 }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, seen, close: () => fake.close() };
}

test('compile: only with an account and a plan that has it, counted per day, the desktop app with a key', async () => {
  const fake = await fakeCompiler();
  try {
    const { call, user, server } = await setup({ COMPILER_URL: fake.url, MAX_COMPILES: '100', ADMIN_EMAILS: 'boss@example.com' });
    const compile = (init: { cookie?: string; headers?: Record<string, string> } = {}) =>
      call(`${P}/api/compile`, { method: 'POST', cookie: init.cookie, headers: { 'content-type': 'application/json', ...init.headers }, body: '{"files":[]}' });

    // no account: no compiler
    const anon = await compile();
    assert.equal(anon.status, 401);
    assert.equal(((await anon.json()) as { error: string }).error, 'login');

    // a new account is Professional: free of charge in the start phase, a daily limit
    const ada = await user('Ada', 'ada@example.com');
    server.plans.saveSettings({ ...server.plans.settings(), proDailyCompiles: 2, proFreeUntil: '2999-01-01' });
    const ok = await compile({ cookie: ada });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { hex: string }).hex, ':00000001FF\n');
    assert.equal(ok.headers.get('x-compile-used'), '1');
    assert.equal(ok.headers.get('x-compile-limit'), '2');
    assert.deepEqual(fake.seen, ['POST /compile {"files":[]}']);
    assert.equal((await compile({ cookie: ada })).status, 200);
    const quota = await compile({ cookie: ada });
    assert.equal(quota.status, 429);
    assert.equal(((await quota.json()) as { error: string }).error, 'quota');
    const me = (await (await call(`${P}/api/me`, { cookie: ada })).json()) as { plan: string; admin: boolean; compile: { ok: boolean; used: number; limit: number } };
    assert.deepEqual([me.plan, me.admin, me.compile.ok, me.compile.used, me.compile.limit], ['pro', false, true, 2, 2]);

    // after the free start Professional needs a payment
    const id = ((await (await call(`${P}/api/auth/get-session`, { cookie: ada })).json()) as { user: { id: string } }).user.id;
    server.plans.saveSettings({ ...server.plans.settings(), proFreeUntil: '2000-01-01' });
    assert.equal((await compile({ cookie: ada })).status, 402);
    server.plans.setPlan(id, { plan: 'pro', paidUntil: Date.now() + 86_400_000, note: '' });
    assert.equal((await compile({ cookie: ada })).status, 429);
    // Free has none, Commercial has no daily limit
    server.plans.setPlan(id, { plan: 'free', paidUntil: null, note: '' });
    assert.equal(((await (await compile({ cookie: ada })).json()) as { error: string }).error, 'plan');
    server.plans.setPlan(id, { plan: 'commercial', paidUntil: null, note: '' });
    const unlimited = await compile({ cookie: ada });
    assert.equal(unlimited.status, 200);
    assert.equal(unlimited.headers.get('x-compile-limit'), null);

    // the desktop app: the key from the account, from its own origin
    const { key } = (await (await call(`${P}/api/me/key`, { method: 'POST', cookie: ada })).json()) as { key: string };
    assert.match(key, /^bbk_/);
    const desktop = await compile({ headers: { origin: 'tauri://localhost', authorization: `Bearer ${key}` } });
    assert.equal(desktop.status, 200);
    assert.equal(desktop.headers.get('access-control-allow-origin'), 'tauri://localhost');
    assert.equal((await compile({ headers: { origin: 'tauri://localhost', authorization: 'Bearer bbk_wrongwrongwrongwrongwrong' } })).status, 401);
    // other sites may not use the session
    assert.equal((await compile({ cookie: ada, headers: { origin: 'https://evil.example' } })).status, 403);
    // too large
    const big = await call(`${P}/api/compile`, { method: 'POST', cookie: ada, headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1024 * 1024 + 1) });
    assert.equal(big.status, 413);
    // a new key replaces the old one
    await call(`${P}/api/me/key`, { method: 'POST', cookie: ada });
    assert.equal((await compile({ headers: { authorization: `Bearer ${key}` } })).status, 401);
  } finally {
    fake.close();
  }
  // no compiler behind it
  const { call, user } = await setup({ COMPILER_URL: fake.url });
  const bob = await user('Bob', 'bob@example.com');
  assert.equal((await call(`${P}/api/compile`, { method: 'POST', cookie: bob, headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503);
});

test('admin: only admins, accounts with plan, blocking and deleting, the plan settings', async () => {
  const { call, user, mails } = await setup({ ADMIN_EMAILS: 'Boss@Example.com' });
  const boss = await user('Boss', 'boss@example.com');
  const ada = await user('Ada', 'ada@example.com', 'geheim-123');
  assert.equal((await call(`${P}/api/admin/users`)).status, 401);
  assert.equal((await call(`${P}/api/admin/users`, { cookie: ada })).status, 403);

  const list = (await (await call(`${P}/api/admin/users?q=ada`, { cookie: boss })).json()) as { total: number; users: { id: string; email: string; plan: string; admin: boolean; providers: string[] }[] };
  assert.equal(list.total, 1);
  const a = list.users[0];
  assert.deepEqual([a.email, a.plan, a.admin, a.providers], ['ada@example.com', 'pro', false, ['credential']]);
  const stats = (await (await call(`${P}/api/admin/stats`, { cookie: boss })).json()) as { users: number; plans: Record<string, number> };
  assert.equal(stats.users, 2);
  assert.equal(stats.plans.pro, 2);

  // plan and payment
  assert.equal((await call(`${P}/api/admin/users/${a.id}`, { method: 'PATCH', cookie: boss, json: { plan: 'gold' } })).status, 400);
  assert.equal((await call(`${P}/api/admin/users/${a.id}`, { method: 'PATCH', cookie: boss, json: { plan: 'commercial', paidUntil: 1_900_000_000_000, note: 'Stripe cus_1' } })).status, 200);
  const me = (await (await call(`${P}/api/me`, { cookie: ada })).json()) as { plan: string; paidUntil: number };
  assert.deepEqual([me.plan, me.paidUntil], ['commercial', 1_900_000_000_000]);
  assert.equal(((await (await call(`${P}/api/admin/users?plan=commercial`, { cookie: boss })).json()) as { total: number }).total, 1);

  // the settings, checked
  assert.equal((await call(`${P}/api/admin/settings`, { method: 'PUT', cookie: boss, json: { proCheckoutUrl: 'javascript:alert(1)' } })).status, 400);
  const s = await call(`${P}/api/admin/settings`, { method: 'PUT', cookie: boss, json: { proCheckoutUrl: 'https://buy.stripe.com/test_pro', proDailyCompiles: 80 } });
  assert.equal(s.status, 200);
  const cfg = (await (await call(`${P}/api/config`)).json()) as { plans: { proCheckoutUrl: string; proDailyCompiles: number; proFreeUntil: string } };
  assert.deepEqual([cfg.plans.proCheckoutUrl, cfg.plans.proDailyCompiles, cfg.plans.proFreeUntil], ['https://buy.stripe.com/test_pro', 80, '2027-02-01']);

  // blocked: signed out, cannot sign in again; the admin cannot block himself
  assert.equal((await call(`${P}/api/admin/users/${a.id}`, { method: 'PATCH', cookie: boss, json: { banned: true, banReason: 'Spam' } })).status, 200);
  assert.equal((await call(`${P}/api/me`, { cookie: ada })).status, 401);
  const blocked = await call(`${P}/api/auth/sign-in/email`, { method: 'POST', json: { email: 'ada@example.com', password: 'geheim-123' } });
  assert.equal(blocked.status, 403);
  const bossId = ((await (await call(`${P}/api/auth/get-session`, { cookie: boss })).json()) as { user: { id: string } }).user.id;
  assert.equal((await call(`${P}/api/admin/users/${bossId}`, { method: 'PATCH', cookie: boss, json: { banned: true } })).status, 400);
  await call(`${P}/api/admin/users/${a.id}`, { method: 'PATCH', cookie: boss, json: { banned: false } });
  assert.equal((await call(`${P}/api/auth/sign-in/email`, { method: 'POST', json: { email: 'ada@example.com', password: 'geheim-123' } })).status, 200);

  // a password link on request
  assert.equal((await call(`${P}/api/admin/users/${a.id}/reset-password`, { method: 'POST', cookie: boss })).status, 200);
  assert.match(mails.at(-1)!.subject, /Passwort/);
  assert.equal(mails.at(-1)!.to, 'ada@example.com');

  // admin by role
  await call(`${P}/api/admin/users/${a.id}`, { method: 'PATCH', cookie: boss, json: { role: 'admin' } });
  const ada2 = await (async () => {
    const r = await call(`${P}/api/auth/sign-in/email`, { method: 'POST', json: { email: 'ada@example.com', password: 'geheim-123' } });
    return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  })();
  assert.equal((await call(`${P}/api/admin/stats`, { cookie: ada2 })).status, 200);

  // deleting takes everything along
  await call(`${P}/api/projects?name=x`, { method: 'POST', cookie: ada2, body: new Uint8Array([1]) });
  assert.equal((await call(`${P}/api/admin/users/${bossId}`, { method: 'DELETE', cookie: boss })).status, 400);
  assert.equal((await call(`${P}/api/admin/users/${a.id}`, { method: 'DELETE', cookie: boss })).status, 200);
  assert.equal(((await (await call(`${P}/api/admin/users`, { cookie: boss })).json()) as { total: number }).total, 1);
  assert.equal((await call(`${P}/api/me`, { cookie: ada2 })).status, 401);
  // from another site: refused
  assert.equal((await call(`${P}/api/admin/users/${bossId}`, { method: 'PATCH', cookie: boss, headers: { origin: 'https://evil.example' }, json: { plan: 'free' } })).status, 403);
});

test('newsletter: double opt-in, one-click unsubscribe, from the account, issues sent in the background', async () => {
  const { call, user, mails, server } = await setup({ ADMIN_EMAILS: 'boss@example.com', NEWSLETTER_PER_MINUTE: '60000' });
  const boss = await user('Boss', 'boss@example.com');
  const tokenIn = (m: Mail) => /token=([\w-]+)/.exec(m.text)![1];

  // sign-up on the landing page: a mail, nothing more until the click
  assert.equal((await call(`${P}/api/newsletter`, { method: 'POST', json: { email: 'nope' } })).status, 400);
  assert.equal((await call(`${P}/api/newsletter`, { method: 'POST', json: { email: 'eve@example.com', lang: 'en' } })).status, 200);
  const confirm = mails.at(-1)!;
  assert.equal(confirm.to, 'eve@example.com');
  assert.match(confirm.subject, /Newsletter bestätigen/);
  assert.match(confirm.text, /\?newsletter=confirm&token=/);
  // asking again soon sends no second mail, and says the same
  const before = mails.length;
  assert.equal((await call(`${P}/api/newsletter`, { method: 'POST', json: { email: 'EVE@example.com' } })).status, 200);
  assert.equal(mails.length, before);
  assert.deepEqual(server.news.counts(), { active: 0, pending: 1 });
  assert.equal((await call(`${P}/api/newsletter/confirm`, { method: 'POST', json: { token: 'wrong' } })).status, 404);
  assert.equal((await call(`${P}/api/newsletter/confirm`, { method: 'POST', json: { token: tokenIn(confirm) } })).status, 200);
  assert.deepEqual(server.news.counts(), { active: 1, pending: 0 });

  // from the account: one step, the address is confirmed
  const ada = await user('Ada', 'ada@example.com');
  const sub = await call(`${P}/api/newsletter/me`, { method: 'PUT', cookie: ada, json: { subscribed: true, lang: 'de' } });
  assert.equal(((await sub.json()) as { status: string }).status, 'active');
  assert.equal(((await (await call(`${P}/api/me`, { cookie: ada })).json()) as { newsletter: string }).newsletter, 'active');

  // an issue: draft, preview, test to the admin, then to everyone
  const draft = (await (
    await call(`${P}/api/admin/newsletter/issues`, {
      method: 'POST',
      cookie: boss,
      json: { subject: 'Neu: der Code-Editor', body: '# Hallo\n\nJetzt mit **C++** und [Demo](https://pueski.de/blackboard/?demo=mcu).\n\n- eins\n- zwei', subjectEn: 'New: the code editor', bodyEn: 'Now with C++.' },
    })
  ).json()) as { id: string; status: string };
  assert.equal(draft.status, 'draft');
  const preview = (await (await call(`${P}/api/admin/newsletter/preview`, { method: 'POST', cookie: boss, json: { subject: 'x', body: 'Hi <script>' } })).json()) as { html: string };
  assert.match(preview.html, /Hi &lt;script&gt;/);
  assert.equal((await call(`${P}/api/admin/newsletter/issues/${draft.id}/test`, { method: 'POST', cookie: boss })).status, 200);
  assert.deepEqual(mails.slice(-2).map((m) => [m.to, m.subject]), [['boss@example.com', '[Test] Neu: der Code-Editor'], ['boss@example.com', '[Test] New: the code editor']]);

  const sent = (await (await call(`${P}/api/admin/newsletter/issues/${draft.id}/send`, { method: 'POST', cookie: boss })).json()) as { status: string; total: number };
  assert.equal(sent.total, 2);
  await server.sender.idle();
  const done = (await (await call(`${P}/api/admin/newsletter/issues/${draft.id}`, { cookie: boss })).json()) as { status: string; sent: number; failed: number };
  assert.deepEqual([done.status, done.sent, done.failed], ['sent', 2, 0]);
  assert.equal((await call(`${P}/api/admin/newsletter/issues/${draft.id}`, { method: 'PUT', cookie: boss, json: { subject: 'y', body: 'y' } })).status, 409);
  const eve = mails.findLast((m) => m.to === 'eve@example.com')!;
  const adaMail = mails.findLast((m) => m.to === 'ada@example.com' && m.subject.startsWith('Neu'))!;
  assert.equal(eve.subject, 'New: the code editor');
  assert.match(adaMail.html, /<strong>C\+\+<\/strong>/);
  assert.match(adaMail.html, /<a href="https:\/\/pueski.de\/blackboard\/\?demo=mcu"/);
  assert.match(adaMail.text, /Demo \(https:\/\/pueski.de\/blackboard\/\?demo=mcu\)/);
  assert.match(eve.headers!['List-Unsubscribe'], /api\/newsletter\/unsubscribe\?token=/);
  assert.equal(eve.headers!['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  // one click in the mail program: gone
  const oneClick = new URL(eve.headers!['List-Unsubscribe'].slice(1, -1));
  const r = await call(oneClick.pathname + oneClick.search, { method: 'POST', headers: { origin: '', 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  assert.equal(((await r.json()) as { ok: boolean }).ok, true);
  assert.deepEqual(server.news.counts(), { active: 1, pending: 0 });
  const csv = await (await call(`${P}/api/admin/newsletter/subscribers.csv`, { cookie: boss })).text();
  assert.match(csv, /^email,lang,source,createdAt,confirmedAt\r\nada@example.com,de,account,/);

  // deleting the account ends the subscription
  await call(`${P}/api/auth/delete-user`, { method: 'POST', cookie: ada, json: { password: 'geheim-123' } });
  assert.deepEqual(server.news.counts(), { active: 0, pending: 0 });
});
