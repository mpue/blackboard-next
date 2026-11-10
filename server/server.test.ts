// node --test: the whole account and project flow against the real server,
// with the mails captured instead of sent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { createServer } from './main.ts';
import type { Mail } from './mail.ts';

const ORIGIN = 'http://localhost:5173';
const P = '/blackboard';

async function setup() {
  const config = loadConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'bb-')), ORIGIN, PUBLIC_PATH: P, MAX_PROJECT_MB: '1' });
  const mails: Mail[] = [];
  const { app } = await createServer(config, { file: ':memory:', mailer: async (m) => void mails.push(m) });
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
  return { call, cookieOf, user, mails, linkIn };
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
