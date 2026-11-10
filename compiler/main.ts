// The compile service: POST /compile with { files: [{ name, content }], clock }
// answers with the HEX file, the memory use and the compiler's messages
// (compile.ts). It runs code from the web through the compiler, so it lives in
// a container of its own without secrets and without network access; the
// BlackBoard server passes the requests on (server/compile.ts).
//
//   node main.ts           serve on PORT (8789)
//   node main.ts --check   compile a blink sketch once (image build)

import { createServer, type IncomingMessage } from 'node:http';
import { BusyError, compile, limiter, LIMITS, RequestError, validate } from './compile.ts';

const PORT = Number(process.env.PORT ?? 8789);
const JOBS = Number(process.env.JOBS ?? 2);
const slot = limiter(JOBS, Number(process.env.QUEUE ?? 16));

const BLINK = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, !digitalRead(13)); delay(500); }\n';

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new RequestError('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

if (process.argv.includes('--check')) {
  const r = await compile({ files: [{ name: 'blink.ino', content: BLINK }], clock: 16_000_000 }, { jobs: JOBS });
  if (!r.ok || !r.hex) {
    console.error(r.log);
    process.exit(1);
  }
  console.log(`compiler ok: blink ${r.flash?.used} bytes in ${r.ms} ms`);
} else {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
      if (req.method !== 'POST' || req.url !== '/compile') return send(404, { error: 'not found' });
      // the files may grow a little in JSON (escaped quotes and line breaks)
      const body = await readBody(req, 2 * LIMITS.bytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new RequestError('bad json');
      }
      const job = validate(parsed);
      send(200, await slot(() => compile(job, { jobs: JOBS })));
    } catch (e) {
      if (e instanceof RequestError) send(400, { error: e.message });
      else if (e instanceof BusyError) send(503, { error: 'busy' });
      else {
        console.error(e);
        send(500, { error: 'compiler failed' });
      }
    }
  });
  server.listen(PORT, () => console.log(`BlackBoard compiler on :${PORT}, ${JOBS} at once`));
}
