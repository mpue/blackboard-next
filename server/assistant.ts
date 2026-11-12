// Claude as design assistant in the schematic editor (src/assistant/).
// Accounts with Professional or Commercial keep their own Anthropic API key
// here: it is stored encrypted (AES-256-GCM with a key derived from the
// session secret) and never leaves the server again, only its last characters
// are shown. The editor keeps the conversation and executes the tools on the
// open schematic; this route adds the key, the system prompt and the tool
// definitions (assistantTools.ts) and streams Claude's answer back as JSON
// lines.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isAdmin, type Auth } from './auth.ts';
import type { Config } from './config.ts';
import { assistantAccess, type PlanStore } from './plans.ts';
import { SYSTEM_PROMPT, TOOLS } from './assistantTools.ts';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

export const MODELS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' } as const;
export type ModelChoice = keyof typeof MODELS;

/** a long conversation with the circuit in it; the context window is far larger */
const MAX_BODY = 6 * 1024 * 1024;
const MAX_MESSAGES = 600;
const WINDOW_MS = 10 * 60_000;
const KEY_RE = /^sk-ant-(?!admin)[A-Za-z0-9_-]{20,300}$/;

/** The Anthropic client for a key; tests pass one that talks to a fake API. */
export type ClaudeFactory = (apiKey: string) => Anthropic;
const defaultClaude: ClaudeFactory = (apiKey) => new Anthropic({ apiKey });

export interface KeyInfo {
  /** "sk-ant-…a1B2" */
  hint: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export class AssistantKeyStore {
  private readonly db: DatabaseSync;
  private readonly key: Buffer;

  constructor(db: DatabaseSync, secret: string) {
    this.db = db;
    this.key = Buffer.from(hkdfSync('sha256', secret, 'blackboard', 'assistant api key', 32));
    db.exec(`create table if not exists assistantKey (
      userId text primary key, cipher text not null, hint text not null, createdAt integer not null, lastUsedAt integer)`);
  }

  set(userId: string, apiKey: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(apiKey, 'utf8'), c.final()]);
    const cipher = `v1:${Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url')}`;
    this.db
      .prepare(
        `insert into assistantKey (userId, cipher, hint, createdAt) values (?, ?, ?, ?)
         on conflict(userId) do update set cipher = excluded.cipher, hint = excluded.hint, createdAt = excluded.createdAt, lastUsedAt = null`,
      )
      .run(userId, cipher, `sk-ant-…${apiKey.slice(-4)}`, Date.now());
  }

  /** the key in plain text; undefined without one or when it cannot be read (AUTH_SECRET changed) */
  get(userId: string): string | undefined {
    const r = this.db.prepare('select cipher from assistantKey where userId = ?').get(userId) as { cipher: string } | undefined;
    if (!r?.cipher.startsWith('v1:')) return undefined;
    try {
      const raw = Buffer.from(r.cipher.slice(3), 'base64url');
      const d = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    } catch {
      return undefined;
    }
  }

  info(userId: string): KeyInfo | undefined {
    return this.db.prepare('select hint, createdAt, lastUsedAt from assistantKey where userId = ?').get(userId) as KeyInfo | undefined;
  }

  touch(userId: string) {
    this.db.prepare('update assistantKey set lastUsedAt = ? where userId = ?').run(Date.now(), userId);
  }

  remove(userId: string) {
    this.db.prepare('delete from assistantKey where userId = ?').run(userId);
  }
}

/** The conversation as the editor sends it: user and assistant turns only, starting with the user. */
export function checkMessages(raw: unknown): MessageParam[] | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_MESSAGES) return undefined;
  for (const m of raw as { role?: unknown; content?: unknown }[]) {
    if (!m || typeof m !== 'object' || (m.role !== 'user' && m.role !== 'assistant')) return undefined;
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) return undefined;
  }
  return (raw as MessageParam[])[0].role === 'user' ? (raw as MessageParam[]) : undefined;
}

/**
 * The answer as it goes back into the conversation. After a fallback in the
 * middle of the output, only the text of the declined part stays: its thinking
 * and tool calls belong to the model that declined.
 */
export function echoable(content: ContentBlock[]): ContentBlock[] {
  const last = content.findLastIndex((b) => b.type === 'fallback');
  if (last < 0) return content;
  return content.filter((b, i) => i > last || b.type === 'text');
}

/** What went wrong at Anthropic, in words the editor translates. */
function problem(e: unknown): { error: string; message?: string } {
  if (e instanceof Anthropic.AuthenticationError) return { error: 'key' };
  if (e instanceof Anthropic.PermissionDeniedError) return { error: 'permission', message: e.message };
  if (e instanceof Anthropic.RateLimitError) return { error: 'rate' };
  if (e instanceof Anthropic.BadRequestError) return /credit balance/i.test(e.message) ? { error: 'credit' } : { error: 'request', message: e.message };
  if (e instanceof Anthropic.APIConnectionError) return { error: 'network' };
  if (e instanceof Anthropic.APIError) return e.status === 529 ? { error: 'overloaded' } : { error: 'server', message: e.message };
  return { error: 'server', message: (e as Error)?.message };
}

type User = { id: string; email: string; emailVerified: boolean; role?: string | null };

export function assistantRoutes(config: Config, auth: Auth, plans: PlanStore, keys: AssistantKeyStore, claude: ClaudeFactory = defaultClaude) {
  const app = new Hono<{ Variables: { user: User } }>();
  /** account -> times of the requests in the window */
  const hits = new Map<string, number[]>();

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && origin && origin !== config.origin) return c.json({ error: 'origin' }, 403);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'login' }, 401);
    c.set('user', session.user as User);
    await next();
  });

  const access = (u: User) => assistantAccess(plans.planOf(u.id), isAdmin(config, u), plans.settings());

  // may the account use Claude, and is there a key
  app.get('/', (c) => {
    const u = c.get('user');
    return c.json({ access: access(u), key: keys.info(u.id) ?? null, models: Object.keys(MODELS) });
  });

  // a new key is tried at Anthropic first, so a typo shows up right away
  app.put('/key', async (c) => {
    const u = c.get('user');
    const a = access(u);
    if (!a.ok) return c.json({ error: a.reason }, a.reason === 'payment' ? 402 : 403);
    const { key } = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    const apiKey = typeof key === 'string' ? key.trim() : '';
    if (!KEY_RE.test(apiKey)) return c.json({ error: 'format' }, 400);
    try {
      await claude(apiKey).models.retrieve(MODELS.opus);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return c.json({ error: 'invalid' }, 422);
      if (e instanceof Anthropic.APIConnectionError) return c.json({ error: 'unreachable' }, 503);
      // anything else means the key itself was accepted
    }
    keys.set(u.id, apiKey);
    return c.json({ key: keys.info(u.id) });
  });

  app.delete('/key', (c) => {
    keys.remove(c.get('user').id);
    return c.json({ ok: true });
  });

  app.post('/messages', bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: 'large' }, 413) }), async (c) => {
    const u = c.get('user');
    const a = access(u);
    if (!a.ok) return c.json({ error: a.reason }, a.reason === 'payment' ? 402 : 403);
    const apiKey = keys.get(u.id);
    if (!apiKey) return c.json({ error: 'nokey' }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { model?: unknown; messages?: unknown };
    const model = MODELS[body.model as ModelChoice] ?? MODELS.opus;
    const messages = checkMessages(body.messages);
    if (!messages) return c.json({ error: 'messages' }, 400);

    const now = Date.now();
    const recent = (hits.get(u.id) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= config.maxAssistantRequests) return c.json({ error: 'busy' }, 429);
    recent.push(now);
    hits.set(u.id, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    keys.touch(u.id);

    const stream = claude(apiKey).beta.messages.stream(
      {
        model,
        max_tokens: 32_000,
        // on a policy decline Anthropic retries on its recommended fallback model
        betas: ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18'],
        fallbacks: 'default',
        // short progress notes between the tool calls, shown as status lines
        thinking: { type: 'adaptive', display: 'updates' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM_PROMPT,
        tools: TOOLS as Anthropic.Beta.BetaTool[],
        messages,
      },
      { signal: c.req.raw.signal },
    );

    const enc = new TextEncoder();
    const body$ = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const send = (o: unknown) => ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        // proxies close connections that stay silent while Claude thinks
        const ping = setInterval(() => send({ t: 'ping' }), 15_000);
        try {
          for await (const ev of stream) {
            if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') send({ t: 'tool', name: ev.content_block.name });
            else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send({ t: 'text', i: ev.index, d: ev.delta.text });
            else if (ev.type === 'content_block_delta' && ev.delta.type === 'thinking_delta') send({ t: 'note', i: ev.index, d: ev.delta.thinking });
          }
          const m = await stream.finalMessage();
          send({
            t: 'done',
            message: { role: 'assistant', content: echoable(m.content) },
            stop: m.stop_reason,
            model: m.model,
            usage: { input: m.usage.input_tokens + (m.usage.cache_read_input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0), output: m.usage.output_tokens },
          });
        } catch (e) {
          if (!(e instanceof Anthropic.APIUserAbortError)) send({ t: 'error', ...problem(e) });
        } finally {
          clearInterval(ping);
          try {
            ctrl.close();
          } catch {
            /* the editor went away */
          }
        }
      },
      cancel() {
        stream.abort();
      },
    });
    return new Response(body$, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
  });

  return app;
}
