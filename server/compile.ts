// The code editor's compiler: C/C++ to Intel HEX for the ATmega328P. It runs in
// a container of its own (compiler/); this passes the requests on, at most
// MAX_COMPILES per visitor in ten minutes. The desktop app has no server of its
// own and compiles here too, so its origins may call this route.

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { Config } from './config.ts';

const WINDOW_MS = 10 * 60_000;
/** the compiler takes 512 KB of source; JSON escaping adds a little */
const MAX_BODY = 1024 * 1024;
const DESKTOP = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

export function compileRoutes(config: Config) {
  const app = new Hono();
  /** visitor -> times of the compiles in the window */
  const hits = new Map<string, number[]>();
  app.use('*', cors({ origin: (o) => (DESKTOP.includes(o) ? o : null), allowMethods: ['POST'], allowHeaders: ['content-type'], maxAge: 86400 }));
  app.post('/', bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: 'large' }, 413) }), async (c) => {
    // the proxy in front (nginx) puts the visitor's address there
    const visitor = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'local';
    const now = Date.now();
    const recent = (hits.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= config.maxCompiles) return c.json({ error: 'rate' }, 429);
    recent.push(now);
    hits.set(visitor, recent);
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
    return new Response(await r.arrayBuffer(), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
  return app;
}
