// The newsletter: sign-up with double opt-in (a mail with a link; without the
// click nothing is sent), one-click unsubscribe in every mail (also as
// List-Unsubscribe header), issues written on the admin page in a little
// Markdown and sent one after the other in the background. Signed-in users
// subscribe from their account in one step, their address is confirmed already.

import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import type { Auth } from './auth.ts';
import type { Config } from './config.ts';
import { buttonMail, esc, type Mail, type Mailer } from './mail.ts';

export type Lang = 'de' | 'en';
export type SubscriberStatus = 'pending' | 'active';

export interface Subscriber {
  id: string;
  email: string;
  lang: Lang;
  status: SubscriberStatus;
  token: string;
  userId: string | null;
  /** 'web' (landing page), 'account' */
  source: string;
  createdAt: number;
  confirmedAt: number | null;
  mailedAt: number | null;
}

export interface Issue {
  id: string;
  subject: string;
  body: string;
  /** the English version; empty: everyone gets the German one */
  subjectEn: string;
  bodyEn: string;
  status: 'draft' | 'sending' | 'sent';
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
  total: number;
  sent: number;
  failed: number;
}

/** an unconfirmed sign-up is forgotten after a week */
const PENDING_MS = 7 * 24 * 3600_000;
/** the confirmation mail again at most every ten minutes */
const RESEND_MS = 10 * 60_000;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export const validEmail = (e: unknown): e is string => typeof e === 'string' && e.length <= 254 && EMAIL.test(e);
const asLang = (l: unknown): Lang | undefined => (l === 'en' || l === 'de' ? l : undefined);

// ---- the mails ----

/** One line of text: links, images, **bold** and *italic*; everything else escaped. */
function inline(raw: string): string {
  return esc(raw)
    .replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0">')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2" style="color:#4f46e5;font-weight:600">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
}

const plain = (raw: string) =>
  raw
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1$2');

/**
 * The text of an issue as HTML and plain text. Markdown in small: # and ##
 * headings, paragraphs (empty line), lists with - or 1., --- for a line,
 * [text](https://…), ![picture](https://…), **bold**, *italic*.
 */
export function renderBody(md: string): { html: string; text: string } {
  const html: string[] = [];
  const text: string[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (para.length) {
      html.push(`<p style="margin:0 0 14px;line-height:1.6">${para.map(inline).join('<br>')}</p>`);
      text.push(para.map(plain).join('\n'));
      para = [];
    }
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      html.push(`<${tag} style="margin:0 0 14px;padding-left:22px;line-height:1.6">${list.items.map((i) => `<li style="margin:2px 0">${inline(i)}</li>`).join('')}</${tag}>`);
      text.push(list.items.map((i, n) => `${list!.ordered ? `${n + 1}.` : '-'} ${plain(i)}`).join('\n'));
      list = null;
    }
  };
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if (!t) flush();
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) {
      flush();
      const size = [24, 19, 16][m[1].length - 1];
      html.push(`<h${m[1].length + 1} style="margin:22px 0 10px;font-size:${size}px;line-height:1.3;color:#0f172a">${inline(m[2])}</h${m[1].length + 1}>`);
      text.push(plain(m[2]).toUpperCase());
    } else if (/^(-{3,}|\*{3,})$/.test(t)) {
      flush();
      html.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">');
      text.push('----');
    } else if ((m = /^(?:[-*]|(\d+)\.)\s+(.*)$/.exec(t))) {
      if (para.length || (list && list.ordered !== !!m[1])) flush();
      list ??= { ordered: !!m[1], items: [] };
      list.items.push(m[2]);
    } else {
      if (list) flush();
      para.push(t);
    }
  }
  flush();
  return { html: html.join('\n'), text: text.join('\n\n') };
}

export interface Links {
  /** the page for unsubscribing (landing page), and the one-click address of the API */
  unsubscribePage: string;
  unsubscribeApi: string;
  imprint: string;
}

export function linksFor(config: Config, token: string): Links {
  const site = `${config.origin}${config.publicPath}`;
  return {
    unsubscribePage: `${site}/?newsletter=unsubscribe&token=${token}`,
    unsubscribeApi: `${site}/api/newsletter/unsubscribe?token=${token}`,
    imprint: `${site}/?page=impressum`,
  };
}

/** An issue as mail to one subscriber, with the way out at the bottom and in the headers. */
export function issueMail(to: string, lang: Lang, subject: string, body: string, links: Links): Mail {
  const { html, text } = renderBody(body);
  const why =
    lang === 'en'
      ? ['You get this mail because you subscribed to the BlackBoard newsletter.', 'Unsubscribe', 'Legal notice']
      : ['Du bekommst diese Mail, weil du den BlackBoard-Newsletter abonniert hast.', 'Abmelden', 'Impressum'];
  return {
    to,
    subject,
    text: `${text}\n\n--\n${why[0]}\n${why[1]}: ${links.unsubscribePage}\n${why[2]}: ${links.imprint}\n`,
    html: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1e293b;font-size:15px;max-width:600px;margin:0 auto;padding:24px 12px">
<div style="background:#ffffff;border-radius:14px;padding:28px 26px 18px">
<p style="margin:0 0 18px;font-weight:700;font-size:17px;color:#4f46e5">BlackBoard Next</p>
${html}
</div>
<p style="font-size:12px;line-height:1.6;color:#64748b;margin:16px 10px">${esc(why[0])}<br>
<a href="${esc(links.unsubscribePage)}" style="color:#64748b">${esc(why[1])}</a> · <a href="${esc(links.imprint)}" style="color:#64748b">${esc(why[2])}</a></p>
</div></body></html>`,
    headers: { 'List-Unsubscribe': `<${links.unsubscribeApi}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

const confirmMail = (to: string, url: string) =>
  buttonMail(
    to,
    'BlackBoard: Newsletter bestätigen / confirm the newsletter',
    [
      'Bitte bestätige, dass du den Newsletter von BlackBoard Next bekommen möchtest: Neuigkeiten, neue Funktionen und Anleitungen, höchstens ein paar Mal im Jahr. Abmelden geht jederzeit mit einem Klick.',
      'Please confirm that you want to get the BlackBoard Next newsletter. You can unsubscribe at any time with one click.',
      'Wenn du das nicht warst, ignoriere diese Mail – ohne Bestätigung bekommst du nichts. / If that was not you, ignore this mail.',
    ],
    'Newsletter bestätigen / Confirm',
    url,
  );

// ---- the data ----

const ISSUE = `select i.*,
  (select count(*) from newsletterDelivery d where d.issueId = i.id) as total,
  (select count(*) from newsletterDelivery d where d.issueId = i.id and d.status = 'sent') as sent,
  (select count(*) from newsletterDelivery d where d.issueId = i.id and d.status = 'failed') as failed
  from newsletterIssue i`;

export class NewsletterStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      create table if not exists newsletterSubscriber (
        id text primary key, email text not null unique collate nocase, lang text not null, status text not null,
        token text not null unique, userId text, source text not null, createdAt integer not null,
        confirmedAt integer, mailedAt integer);
      create table if not exists newsletterIssue (
        id text primary key, subject text not null, body text not null, subjectEn text not null default '',
        bodyEn text not null default '', status text not null, createdAt integer not null, updatedAt integer not null, sentAt integer);
      create table if not exists newsletterDelivery (
        issueId text not null, subscriberId text not null, status text not null, error text, at integer,
        primary key (issueId, subscriberId));`);
  }

  byEmail(email: string): Subscriber | undefined {
    return this.db.prepare('select * from newsletterSubscriber where email = ?').get(email.trim()) as Subscriber | undefined;
  }

  /** A sign-up; `active` for addresses that are confirmed already (accounts). Without `lang` a known address keeps its language. */
  subscribe(email: string, lang: Lang | undefined, source: string, opts: { userId?: string; active?: boolean } = {}): Subscriber {
    const now = Date.now();
    const old = this.byEmail(email);
    if (old) {
      if (opts.active && old.status !== 'active') this.db.prepare(`update newsletterSubscriber set status = 'active', confirmedAt = ?, userId = coalesce(userId, ?) where id = ?`).run(now, opts.userId ?? null, old.id);
      if (lang) this.db.prepare('update newsletterSubscriber set lang = ? where id = ?').run(lang, old.id);
      return this.byEmail(email)!;
    }
    this.db
      .prepare('insert into newsletterSubscriber (id, email, lang, status, token, userId, source, createdAt, confirmedAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), email.trim(), lang ?? 'de', opts.active ? 'active' : 'pending', randomBytes(24).toString('base64url'), opts.userId ?? null, source, now, opts.active ? now : null);
    return this.byEmail(email)!;
  }

  markMailed(id: string) {
    this.db.prepare('update newsletterSubscriber set mailedAt = ? where id = ?').run(Date.now(), id);
  }

  confirm(token: string): Subscriber | undefined {
    const s = this.db.prepare('select * from newsletterSubscriber where token = ?').get(token) as Subscriber | undefined;
    if (!s) return undefined;
    if (s.status === 'pending') this.db.prepare(`update newsletterSubscriber set status = 'active', confirmedAt = ? where id = ?`).run(Date.now(), s.id);
    return { ...s, status: 'active' };
  }

  /** Unsubscribing deletes the address; true when there was one. */
  unsubscribe(token: string): boolean {
    const s = this.db.prepare('select id from newsletterSubscriber where token = ?').get(token) as { id: string } | undefined;
    if (s) this.remove(s.id);
    return !!s;
  }

  remove(id: string) {
    this.db.prepare(`delete from newsletterDelivery where subscriberId = ? and status = 'queued'`).run(id);
    this.db.prepare('delete from newsletterSubscriber where id = ?').run(id);
  }

  removeEmail(email: string) {
    const s = this.byEmail(email);
    if (s) this.remove(s.id);
  }

  /** forgets sign-ups nobody confirmed */
  cleanup(now = Date.now()) {
    for (const { id } of this.db.prepare(`select id from newsletterSubscriber where status = 'pending' and createdAt < ?`).all(now - PENDING_MS) as unknown as { id: string }[]) this.remove(id);
  }

  list(q = '', status = '', offset = 0, limit = 50): { total: number; subscribers: Omit<Subscriber, 'token'>[] } {
    const where = `where email like ? escape '\\' and (? = '' or status = ?)`;
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const total = (this.db.prepare(`select count(*) as n from newsletterSubscriber ${where}`).get(like, status, status) as { n: number }).n;
    const subscribers = this.db
      .prepare(`select id, email, lang, status, userId, source, createdAt, confirmedAt, mailedAt from newsletterSubscriber ${where} order by createdAt desc limit ? offset ?`)
      .all(like, status, status, limit, offset) as unknown as Omit<Subscriber, 'token'>[];
    return { total, subscribers };
  }

  counts(): { active: number; pending: number } {
    const rows = this.db.prepare('select status, count(*) as n from newsletterSubscriber group by status').all() as unknown as { status: string; n: number }[];
    return { active: rows.find((r) => r.status === 'active')?.n ?? 0, pending: rows.find((r) => r.status === 'pending')?.n ?? 0 };
  }

  issues(): Issue[] {
    return this.db.prepare(`${ISSUE} order by i.createdAt desc`).all() as unknown as Issue[];
  }

  issue(id: string): Issue | undefined {
    return this.db.prepare(`${ISSUE} where i.id = ?`).get(id) as Issue | undefined;
  }

  saveIssue(id: string | undefined, f: Pick<Issue, 'subject' | 'body' | 'subjectEn' | 'bodyEn'>): Issue {
    const now = Date.now();
    if (id) this.db.prepare('update newsletterIssue set subject = ?, body = ?, subjectEn = ?, bodyEn = ?, updatedAt = ? where id = ?').run(f.subject, f.body, f.subjectEn, f.bodyEn, now, id);
    else {
      id = randomUUID();
      this.db
        .prepare(`insert into newsletterIssue (id, subject, body, subjectEn, bodyEn, status, createdAt, updatedAt) values (?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run(id, f.subject, f.body, f.subjectEn, f.bodyEn, now, now);
    }
    return this.issue(id)!;
  }

  deleteIssue(id: string) {
    this.db.prepare('delete from newsletterDelivery where issueId = ?').run(id);
    this.db.prepare('delete from newsletterIssue where id = ?').run(id);
  }

  /** Puts every confirmed subscriber in line for the issue; returns how many. */
  queue(id: string): number {
    const now = Date.now();
    const r = this.db
      .prepare(`insert or ignore into newsletterDelivery (issueId, subscriberId, status) select ?, id, 'queued' from newsletterSubscriber where status = 'active' order by createdAt`)
      .run(id);
    this.db.prepare(`update newsletterIssue set status = 'sending', updatedAt = ? where id = ?`).run(now, id);
    this.finishIfDone(id);
    return Number(r.changes);
  }

  /** the next mail to send, of any issue being sent */
  next(): { issue: Issue; subscriber: Subscriber } | undefined {
    const r = this.db
      .prepare(
        `select d.issueId, d.subscriberId from newsletterDelivery d join newsletterIssue i on i.id = d.issueId
         where d.status = 'queued' and i.status = 'sending' order by i.createdAt, d.rowid limit 1`,
      )
      .get() as { issueId: string; subscriberId: string } | undefined;
    if (!r) return undefined;
    const subscriber = this.db.prepare('select * from newsletterSubscriber where id = ?').get(r.subscriberId) as Subscriber | undefined;
    if (!subscriber) {
      this.db.prepare('delete from newsletterDelivery where issueId = ? and subscriberId = ?').run(r.issueId, r.subscriberId);
      return this.next();
    }
    return { issue: this.issue(r.issueId)!, subscriber };
  }

  delivered(issueId: string, subscriberId: string, error?: string) {
    this.db
      .prepare('update newsletterDelivery set status = ?, error = ?, at = ? where issueId = ? and subscriberId = ?')
      .run(error ? 'failed' : 'sent', error?.slice(0, 300) ?? null, Date.now(), issueId, subscriberId);
    this.finishIfDone(issueId);
  }

  /** stops sending: what is still in line is dropped */
  cancel(id: string) {
    this.db.prepare(`delete from newsletterDelivery where issueId = ? and status = 'queued'`).run(id);
    this.finishIfDone(id);
  }

  private finishIfDone(id: string) {
    const left = (this.db.prepare(`select count(*) as n from newsletterDelivery where issueId = ? and status = 'queued'`).get(id) as { n: number }).n;
    if (!left) this.db.prepare(`update newsletterIssue set status = 'sent', sentAt = coalesce(sentAt, ?) where id = ? and status = 'sending'`).run(Date.now(), id);
  }

  failures(id: string): { email: string; error: string }[] {
    return this.db
      .prepare(`select coalesce(s.email, '?') as email, d.error from newsletterDelivery d left join newsletterSubscriber s on s.id = d.subscriberId where d.issueId = ? and d.status = 'failed' limit 100`)
      .all(id) as unknown as { email: string; error: string }[];
  }

  /** A deleted account takes its subscription along. */
  deleteUser(userId: string, email: string) {
    for (const { id } of this.db.prepare('select id from newsletterSubscriber where userId = ? or email = ?').all(userId, email) as unknown as { id: string }[]) this.remove(id);
  }
}

// ---- sending ----

/** Sends what is in line, one mail after the other with a pause between. */
export class NewsletterSender {
  private running: Promise<void> | undefined;
  private readonly store: NewsletterStore;
  private readonly mail: Mailer;
  private readonly config: Config;
  private readonly gapMs: number;

  constructor(store: NewsletterStore, mail: Mailer, config: Config) {
    this.store = store;
    this.mail = mail;
    this.config = config;
    this.gapMs = 60_000 / Math.max(config.newsletterPerMinute, 1);
  }

  /** starts sending unless it already runs (also after a restart: what was in line goes on) */
  kick() {
    this.running ??= this.loop().finally(() => (this.running = undefined));
  }

  /** resolves when nothing is left to send */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async loop() {
    for (let n = this.store.next(); n; n = this.store.next()) {
      const { issue, subscriber: s } = n;
      const en = s.lang === 'en' && issue.subjectEn.trim() && issue.bodyEn.trim();
      try {
        await this.mail(issueMail(s.email, en ? 'en' : 'de', en ? issue.subjectEn : issue.subject, en ? issue.bodyEn : issue.body, linksFor(this.config, s.token)));
        this.store.delivered(issue.id, s.id);
      } catch (e) {
        this.store.delivered(issue.id, s.id, e instanceof Error ? e.message : String(e));
      }
      await new Promise((r) => setTimeout(r, this.gapMs));
    }
  }
}

// ---- the routes of the landing page and the account ----

const WINDOW_MS = 3600_000;
const PER_VISITOR = 5;

export function newsletterRoutes(config: Config, auth: Auth, store: NewsletterStore, mail: Mailer) {
  const app = new Hono();
  /** visitor -> times of sign-ups in the last hour */
  const hits = new Map<string, number[]>();

  app.use('*', async (c, next) => {
    // the landing page posts from the app's own origin; the one-click unsubscribe of mail programs comes without one
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && origin && origin !== config.origin) return c.json({ error: 'origin' }, 403);
    await next();
  });

  app.post('/', async (c) => {
    const { email, lang } = (await c.req.json().catch(() => ({}))) as { email?: unknown; lang?: unknown };
    if (!validEmail(typeof email === 'string' ? email.trim() : email)) return c.json({ error: 'email' }, 400);
    const visitor = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'local';
    const now = Date.now();
    const recent = (hits.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= PER_VISITOR) return c.json({ error: 'rate' }, 429);
    recent.push(now);
    hits.set(visitor, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    store.cleanup(now);
    const s = store.subscribe((email as string).trim(), asLang(lang), 'web');
    // the answer is the same whether the address was known or not
    if (s.status === 'pending' && (s.mailedAt ?? 0) < now - RESEND_MS) {
      await mail(confirmMail(s.email, `${config.origin}${config.publicPath}/?newsletter=confirm&token=${s.token}`));
      store.markMailed(s.id);
    }
    return c.json({ ok: true });
  });

  const tokenOf = async (req: Request) => {
    const q = new URL(req.url).searchParams.get('token');
    if (q) return q;
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    return typeof body.token === 'string' ? body.token : '';
  };

  app.post('/confirm', async (c) => {
    const s = store.confirm(await tokenOf(c.req.raw));
    return s ? c.json({ ok: true }) : c.json({ error: 'token' }, 404);
  });

  // RFC 8058: mail programs post "List-Unsubscribe=One-Click" to the address in the header
  app.post('/unsubscribe', async (c) => {
    const url = new URL(c.req.url);
    const token = url.searchParams.get('token') ?? (c.req.header('content-type')?.includes('json') ? await tokenOf(c.req.raw) : '');
    return c.json({ ok: store.unsubscribe(token ?? '') });
  });
  // an address opened in the browser: the page of the landing page does it
  app.get('/unsubscribe', (c) => c.redirect(`${config.publicPath}/?newsletter=unsubscribe&token=${encodeURIComponent(c.req.query('token') ?? '')}`));

  // the signed-in user's own subscription
  const user = async (req: Request) => (await auth.api.getSession({ headers: req.headers }))?.user;
  app.get('/me', async (c) => {
    const u = await user(c.req.raw);
    if (!u) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ status: store.byEmail(u.email)?.status ?? null });
  });
  app.put('/me', async (c) => {
    const u = await user(c.req.raw);
    if (!u) return c.json({ error: 'unauthorized' }, 401);
    const { subscribed, lang } = (await c.req.json().catch(() => ({}))) as { subscribed?: boolean; lang?: unknown };
    if (subscribed) store.subscribe(u.email, asLang(lang), 'account', { userId: u.id, active: u.emailVerified });
    else store.removeEmail(u.email);
    return c.json({ status: store.byEmail(u.email)?.status ?? null });
  });

  return app;
}
