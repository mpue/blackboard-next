// Turns the C and C++ files of a program into an Intel HEX file for the
// ATmega328P, with the Arduino tools (arduino-cli, avr-gcc 7.3 and the Arduino
// AVR core). A sketch (.ino) is compiled the way the Arduino IDE does it; plain
// C or C++ with its own main() works as well (an empty sketch is added then,
// the Arduino core stays out of it as long as nothing calls into it).

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export interface SourceFile {
  name: string;
  content: string;
}

export interface CompileRequest {
  files: SourceFile[];
  /** clock in Hz, F_CPU */
  clock?: number;
}

export type Severity = 'error' | 'warning' | 'note';

export interface Diagnostic {
  /** file name as sent, or the base name of a core or library file */
  file: string;
  /** whether the file is one of the program's own */
  own: boolean;
  line: number;
  column: number;
  severity: Severity;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  hex?: string;
  /** program memory and RAM (data + bss) in bytes, as the Arduino IDE counts them */
  flash?: { used: number; max: number };
  ram?: { used: number; max: number };
  diagnostics: Diagnostic[];
  /** what the compiler printed, with the server's paths taken out */
  log: string;
  ms: number;
}

/** a request that cannot be compiled; `code` goes back to the client */
export class RequestError extends Error {}

export const LIMITS = { files: 16, bytes: 512 * 1024, log: 64 * 1024, minClock: 100_000, maxClock: 32_000_000, timeoutMs: 45_000 };

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}\.(ino|c|cpp|cc|cxx|h|hh|hpp|S)$/;
const FQBN = 'arduino:avr:uno';

/** Checks what came over the wire; throws a RequestError. */
export function validate(body: unknown): Required<CompileRequest> {
  const b = body as Partial<CompileRequest> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.files)) throw new RequestError('no files');
  if (!b.files.length || b.files.length > LIMITS.files) throw new RequestError('file count');
  const seen = new Set<string>();
  let bytes = 0;
  for (const f of b.files) {
    if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') throw new RequestError('bad file');
    if (!NAME.test(f.name) || f.name.includes('..')) throw new RequestError('file name');
    const key = f.name.toLowerCase();
    if (seen.has(key)) throw new RequestError('duplicate file');
    seen.add(key);
    bytes += Buffer.byteLength(f.content);
  }
  if (bytes > LIMITS.bytes) throw new RequestError('too large');
  const clock = b.clock ?? 16_000_000;
  if (!Number.isInteger(clock) || clock < LIMITS.minClock || clock > LIMITS.maxClock) throw new RequestError('clock');
  if (!b.files.some((f) => /\.(ino|c|cpp|cc|cxx|S)$/.test(f.name))) throw new RequestError('no source');
  return { files: b.files.map((f) => ({ name: f.name, content: f.content })), clock };
}

// ---- running the tools ----

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Runs a program in its own process group, so a timeout also ends the compilers it started. */
function run(cmd: string, args: string[], timeoutMs: number): Promise<Run> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false' } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    p.stdout.setEncoding('utf8').on('data', (d: string) => (stdout = stdout.length < 8 * LIMITS.log ? stdout + d : stdout));
    p.stderr.setEncoding('utf8').on('data', (d: string) => (stderr = stderr.length < LIMITS.log ? stderr + d : stderr));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-p.pid!, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

// ---- reading what the compiler says ----

const LINE = /^(.+?):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*)$/;
const LINKER = /^(.+?):(\d+): (undefined reference to .*|multiple definition of .*)$/;

/**
 * gcc's messages, one per "file:line:col: severity: text" line; `own` maps the
 * paths of the program's files back to their names.
 */
export function parseDiagnostics(text: string, own: (path: string) => string | undefined): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const m = LINE.exec(line);
    const l = m ? undefined : LINKER.exec(line);
    if (!m && !l) continue;
    const path = (m ?? l)![1];
    const name = own(path);
    const severity: Severity = m ? (m[4] === 'note' ? 'note' : m[4] === 'warning' ? 'warning' : 'error') : 'error';
    // warnings from the Arduino core and libraries are not the program's business
    if (!name && severity !== 'error') continue;
    out.push({
      file: name ?? basename(path),
      own: !!name,
      line: Number((m ?? l)![2]),
      column: m?.[3] ? Number(m[3]) : 1,
      severity,
      message: m ? m[5] : l![3],
    });
  }
  return out;
}

interface CliResult {
  success?: boolean;
  compiler_out?: string;
  compiler_err?: string;
  // sizes of 0 are left out
  builder_result?: { executable_sections_size?: { name: string; size?: number; max_size?: number }[] };
}

/** Compiles; resolves also when the program has errors (ok false), rejects only when the tools fail. */
export async function compile(req: Required<CompileRequest>, opts: { cli?: string; jobs?: number; timeoutMs?: number } = {}): Promise<CompileResult> {
  const started = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'bb-'));
  try {
    const files = [...req.files];
    // the sketch folder is named after the first .ino file; plain C/C++ gets an empty sketch
    let main = files.find((f) => f.name.endsWith('.ino'))?.name;
    if (!main) {
      main = files.some((f) => f.name.toLowerCase() === 'sketch.ino') ? 'program.ino' : 'sketch.ino';
      files.push({ name: main, content: '// plain C/C++: main() is in the other files\n' });
    }
    const sketch = join(dir, main.slice(0, -4));
    const build = join(dir, 'build');
    const output = join(dir, 'out');
    await mkdir(sketch);
    for (const f of files) await writeFile(join(sketch, f.name), f.content);
    const r = await run(
      opts.cli ?? 'arduino-cli',
      ['compile', '--fqbn', FQBN, '--build-property', `build.f_cpu=${req.clock}L`, '--warnings', 'more', '--format', 'json', '--no-color', '--jobs', String(opts.jobs ?? 2), '--build-path', build, '--output-dir', output, sketch],
      opts.timeoutMs ?? LIMITS.timeoutMs,
    );
    const ms = Date.now() - started;
    if (r.timedOut) return { ok: false, diagnostics: [], log: 'timeout', ms };
    let cli: CliResult;
    try {
      cli = JSON.parse(r.stdout) as CliResult;
    } catch {
      throw new Error(`arduino-cli: ${(r.stderr || r.stdout).slice(0, 2000)}`);
    }
    const names = new Set(req.files.map((f) => f.name));
    const prefixes = [`${sketch}/`, `${build}/sketch/`];
    const own = (path: string) => {
      for (const p of prefixes) if (path.startsWith(p) && names.has(path.slice(p.length))) return path.slice(p.length);
      return undefined;
    };
    const text = `${cli.compiler_out ?? ''}${cli.compiler_err ?? ''}`;
    const log = text
      .split(`${sketch}/`)
      .join('')
      .split(`${build}/sketch/`)
      .join('')
      .split(`${build}/`)
      .join('')
      .replace(/\/home\/[^/\s]+\/(\.arduino15\/packages\/arduino\/|Arduino\/libraries\/)/g, '')
      .slice(0, LIMITS.log);
    const diagnostics = parseDiagnostics(text, own);
    if (!cli.success) {
      // e.g. a library that is not there: no "file:line" message, the log says it
      return { ok: false, diagnostics, log: log || (cli as { error?: string }).error || r.stderr.slice(0, 2000), ms };
    }
    const hex = await readFile(join(output, `${main}.hex`), 'utf8');
    const section = (n: string) => {
      const s = cli.builder_result?.executable_sections_size?.find((x) => x.name === n);
      return s && { used: s.size ?? 0, max: s.max_size ?? 0 };
    };
    return {
      ok: true,
      hex,
      flash: section('text'),
      ram: section('data'),
      diagnostics,
      log,
      ms,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** At most `jobs` compiles at once and `queue` waiting; more get a BusyError. */
export class BusyError extends Error {}

export function limiter(jobs: number, queue: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= jobs) {
      if (waiting.length >= queue) throw new BusyError('busy');
      await new Promise<void>((r) => waiting.push(r));
    } else running++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
