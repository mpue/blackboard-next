// Projects in the cloud: .bb files of a user, and their shares with other
// users (view or edit). Every change counts a version up; saving names the
// version it started from, so two people cannot overwrite each other unseen.

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import type { Auth } from './auth.ts';
import type { Config } from './config.ts';
import { buttonMail, type Mailer } from './mail.ts';

export type Role = 'owner' | 'edit' | 'view';

export interface ProjectMeta {
  id: string;
  name: string;
  size: number;
  version: number;
  updatedAt: number;
  owner: { id: string; name: string; email: string };
  role: Role;
  /** number of people it is shared with (own projects) */
  shares: number;
}

interface Row {
  id: string;
  ownerId: string;
  name: string;
  size: number;
  version: number;
  updatedAt: number;
  ownerName: string;
  ownerEmail: string;
  role: string | null;
  shares: number;
}

const META = `select p.id, p.ownerId, p.name, p.size, p.version, p.updatedAt, u.name as ownerName, u.email as ownerEmail,
  (select count(*) from projectShare s where s.projectId = p.id) as shares`;

export class ProjectStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      create table if not exists project (
        id text primary key, ownerId text not null, name text not null, data blob not null,
        size integer not null, version integer not null, createdAt integer not null, updatedAt integer not null);
      create index if not exists projectOwner on project(ownerId);
      create table if not exists projectShare (
        projectId text not null, userId text not null, role text not null, createdAt integer not null,
        primary key (projectId, userId));
      create index if not exists projectShareUser on projectShare(userId);`);
  }

  private meta(r: Row, role: Role): ProjectMeta {
    return { id: r.id, name: r.name, size: r.size, version: r.version, updatedAt: r.updatedAt, owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail }, role, shares: r.shares };
  }

  list(userId: string): { own: ProjectMeta[]; shared: ProjectMeta[] } {
    const own = this.db.prepare(`${META} from project p join user u on u.id = p.ownerId where p.ownerId = ? order by p.updatedAt desc`).all(userId) as unknown as Row[];
    const shared = this.db
      .prepare(`${META}, s.role as role from project p join projectShare s on s.projectId = p.id join user u on u.id = p.ownerId where s.userId = ? order by p.updatedAt desc`)
      .all(userId) as unknown as Row[];
    return { own: own.map((r) => this.meta(r, 'owner')), shared: shared.map((r) => this.meta(r, r.role as Role)) };
  }

  /** what a user may do with a project, undefined: nothing (not even know it exists) */
  role(id: string, userId: string): Role | undefined {
    const p = this.db.prepare('select ownerId from project where id = ?').get(id) as { ownerId: string } | undefined;
    if (!p) return undefined;
    if (p.ownerId === userId) return 'owner';
    const s = this.db.prepare('select role from projectShare where projectId = ? and userId = ?').get(id, userId) as { role: Role } | undefined;
    return s?.role;
  }

  get(id: string, userId: string): ProjectMeta | undefined {
    const role = this.role(id, userId);
    if (!role) return undefined;
    const r = this.db.prepare(`${META} from project p join user u on u.id = p.ownerId where p.id = ?`).get(id) as unknown as Row;
    return this.meta(r, role);
  }

  data(id: string): Uint8Array {
    return (this.db.prepare('select data from project where id = ?').get(id) as { data: Uint8Array }).data;
  }

  count(userId: string): number {
    return (this.db.prepare('select count(*) as n from project where ownerId = ?').get(userId) as { n: number }).n;
  }

  create(userId: string, name: string, data: Uint8Array): string {
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare('insert into project (id, ownerId, name, data, size, version, createdAt, updatedAt) values (?, ?, ?, ?, ?, 1, ?, ?)').run(id, userId, name, data, data.length, now, now);
    return id;
  }

  /** Saves new content when `version` is the current one; returns the current version otherwise. */
  save(id: string, version: number, data: Uint8Array, name?: string): { ok: boolean; version: number } {
    const now = Date.now();
    const r = name
      ? this.db.prepare('update project set data = ?, size = ?, name = ?, version = version + 1, updatedAt = ? where id = ? and version = ?').run(data, data.length, name, now, id, version)
      : this.db.prepare('update project set data = ?, size = ?, version = version + 1, updatedAt = ? where id = ? and version = ?').run(data, data.length, now, id, version);
    const current = (this.db.prepare('select version from project where id = ?').get(id) as { version: number }).version;
    return { ok: r.changes === 1, version: current };
  }

  rename(id: string, name: string) {
    this.db.prepare('update project set name = ?, version = version + 1, updatedAt = ? where id = ?').run(name, Date.now(), id);
  }

  remove(id: string) {
    this.db.prepare('delete from projectShare where projectId = ?').run(id);
    this.db.prepare('delete from project where id = ?').run(id);
  }

  shares(id: string): { user: { id: string; name: string; email: string }; role: Role }[] {
    const rows = this.db
      .prepare('select u.id, u.name, u.email, s.role from projectShare s join user u on u.id = s.userId where s.projectId = ? order by u.name')
      .all(id) as unknown as { id: string; name: string; email: string; role: Role }[];
    return rows.map((r) => ({ user: { id: r.id, name: r.name, email: r.email }, role: r.role }));
  }

  share(id: string, userId: string, role: Role) {
    this.db.prepare('insert into projectShare (projectId, userId, role, createdAt) values (?, ?, ?, ?) on conflict(projectId, userId) do update set role = excluded.role').run(id, userId, role, Date.now());
  }

  unshare(id: string, userId: string) {
    this.db.prepare('delete from projectShare where projectId = ? and userId = ?').run(id, userId);
  }

  userByEmail(email: string): { id: string; name: string; email: string } | undefined {
    return this.db.prepare('select id, name, email from user where lower(email) = lower(?) and emailVerified = 1').get(email.trim()) as
      | { id: string; name: string; email: string }
      | undefined;
  }

  /** A deleted account takes its projects and its shares with it. */
  deleteUser(userId: string) {
    for (const { id } of this.db.prepare('select id from project where ownerId = ?').all(userId) as unknown as { id: string }[]) this.remove(id);
    this.db.prepare('delete from projectShare where userId = ?').run(userId);
  }
}

const cleanName = (raw: string | undefined | null) => (raw ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);

export function projectRoutes(config: Config, auth: Auth, store: ProjectStore, mail: Mailer) {
  const app = new Hono<{ Variables: { user: { id: string; name: string; email: string } } }>();

  app.use('*', async (c, next) => {
    // state changes only from the app itself (cookies alone are not enough)
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && origin && origin !== config.origin) return c.json({ error: 'origin' }, 403);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthorized' }, 401);
    c.set('user', { id: session.user.id, name: session.user.name, email: session.user.email });
    await next();
  });

  const body = async (req: Request): Promise<Uint8Array | 'large'> => {
    if (Number(req.headers.get('content-length') ?? 0) > config.maxProjectBytes) return 'large';
    const data = new Uint8Array(await req.arrayBuffer());
    return data.length > config.maxProjectBytes ? 'large' : data;
  };

  app.get('/', (c) => c.json(store.list(c.get('user').id)));

  app.post('/', async (c) => {
    const user = c.get('user');
    if (store.count(user.id) >= config.maxProjectsPerUser) return c.json({ error: 'quota' }, 403);
    const data = await body(c.req.raw);
    if (data === 'large') return c.json({ error: 'large' }, 413);
    if (!data.length) return c.json({ error: 'empty' }, 400);
    const id = store.create(user.id, cleanName(c.req.query('name')) || 'Unbenannt', data);
    return c.json(store.get(id, user.id), 201);
  });

  app.get('/:id', (c) => {
    const meta = store.get(c.req.param('id'), c.get('user').id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    return c.body(store.data(meta.id) as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'application/octet-stream',
      'x-project-version': String(meta.version),
      'x-project-name': encodeURIComponent(meta.name),
      'x-project-role': meta.role,
      'cache-control': 'no-store',
    });
  });

  app.put('/:id', async (c) => {
    const user = c.get('user');
    const meta = store.get(c.req.param('id'), user.id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    if (meta.role === 'view') return c.json({ error: 'read only' }, 403);
    const data = await body(c.req.raw);
    if (data === 'large') return c.json({ error: 'large' }, 413);
    const version = Number(c.req.header('if-match'));
    const name = meta.role === 'owner' ? cleanName(c.req.query('name')) || undefined : undefined;
    const r = store.save(meta.id, version, data, name);
    if (!r.ok) return c.json({ error: 'conflict', version: r.version }, 409);
    return c.json(store.get(meta.id, user.id));
  });

  app.patch('/:id', async (c) => {
    const user = c.get('user');
    const meta = store.get(c.req.param('id'), user.id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    if (meta.role !== 'owner') return c.json({ error: 'owner only' }, 403);
    const name = cleanName(((await c.req.json().catch(() => ({}))) as { name?: string }).name);
    if (!name) return c.json({ error: 'name' }, 400);
    store.rename(meta.id, name);
    return c.json(store.get(meta.id, user.id));
  });

  app.delete('/:id', (c) => {
    const user = c.get('user');
    const meta = store.get(c.req.param('id'), user.id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    // the owner deletes it; someone it was shared with only takes it off their list
    if (meta.role === 'owner') store.remove(meta.id);
    else store.unshare(meta.id, user.id);
    return c.json({ ok: true });
  });

  app.get('/:id/shares', (c) => {
    const meta = store.get(c.req.param('id'), c.get('user').id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    if (meta.role !== 'owner') return c.json({ error: 'owner only' }, 403);
    return c.json(store.shares(meta.id));
  });

  app.post('/:id/shares', async (c) => {
    const user = c.get('user');
    const meta = store.get(c.req.param('id'), user.id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    if (meta.role !== 'owner') return c.json({ error: 'owner only' }, 403);
    const { email, role } = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
    if (role !== 'view' && role !== 'edit') return c.json({ error: 'role' }, 400);
    const other = email ? store.userByEmail(email) : undefined;
    if (!other) return c.json({ error: 'no user' }, 404);
    if (other.id === user.id) return c.json({ error: 'self' }, 400);
    const fresh = !store.shares(meta.id).some((s) => s.user.id === other.id);
    store.share(meta.id, other.id, role);
    if (fresh) {
      const url = `${config.origin}${config.publicPath}/?project=${encodeURIComponent(meta.id)}`;
      await mail(
        buttonMail(
          other.email,
          `BlackBoard: ${user.name} hat „${meta.name}“ mit dir geteilt`,
          [`${user.name} (${user.email}) hat das Projekt „${meta.name}“ mit dir geteilt – ${role === 'edit' ? 'du darfst es bearbeiten' : 'zum Ansehen'}.`, `${user.name} shared the project “${meta.name}” with you (${role === 'edit' ? 'can edit' : 'view only'}).`],
          'Projekt öffnen / Open project',
          url,
        ),
      ).catch(() => undefined);
    }
    return c.json(store.shares(meta.id));
  });

  app.delete('/:id/shares/:userId', (c) => {
    const meta = store.get(c.req.param('id'), c.get('user').id);
    if (!meta) return c.json({ error: 'not found' }, 404);
    if (meta.role !== 'owner') return c.json({ error: 'owner only' }, 403);
    store.unshare(meta.id, c.req.param('userId'));
    return c.json(store.shares(meta.id));
  });

  return app;
}
