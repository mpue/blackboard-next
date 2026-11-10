// The C/C++ program of an ATmega, written in the code editor: its files are
// kept in the chip symbol (property `code`, JSON) next to the HEX it was
// compiled into, so a saved schematic carries both. Compiling happens on the
// BlackBoard server (server/compile.ts, which hands it to compiler/): avr-gcc
// and the Arduino core, the same as the Arduino IDE.

import type { Draft } from 'immer';
import type { Item, SymbolItem } from '../model/types.ts';
import { commitDoc } from '../store/store.ts';
import { isTauri } from '../platform/files.ts';
import { exampleById, type ExampleId } from './examples.ts';
import CLOCK from './templates/uhr.ino?raw';

export interface SourceFile {
  name: string;
  content: string;
}

export type Severity = 'error' | 'warning' | 'note';

/** one message of the compiler (compiler/compile.ts) */
export interface Diagnostic {
  file: string;
  /** one of the program's files (else a core or library file) */
  own: boolean;
  line: number;
  column: number;
  severity: Severity;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  hex?: string;
  flash?: { used: number; max: number };
  ram?: { used: number; max: number };
  diagnostics: Diagnostic[];
  log: string;
  ms: number;
}

/** what the compiler service accepts as a file name */
export const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}\.(ino|c|cpp|cc|cxx|h|hh|hpp|S)$/;
export const SOURCE_EXTENSIONS = ['.ino', '.c', '.cpp', '.cc', '.cxx', '.h', '.hh', '.hpp', '.S'];
export const MAX_FILES = 16;

/** The files of a chip's program, undefined when it has none yet. */
export function sketchFiles(item: SymbolItem): SourceFile[] | undefined {
  const raw = item.properties?.code;
  if (!raw) return undefined;
  try {
    const files = (JSON.parse(raw) as { files?: SourceFile[] }).files;
    return files?.length ? files.filter((f) => typeof f.name === 'string' && typeof f.content === 'string') : undefined;
  } catch {
    return undefined;
  }
}

/** the `code` property */
export const encodeSketch = (files: SourceFile[]) => JSON.stringify({ files: files.map((f) => ({ name: f.name, content: f.content })) });

/** One undo step, none when nothing changes. */
function patchChip(docId: string, chipId: string, patch: Record<string, string>) {
  commitDoc(docId, (d) => {
    const it = d.items.find((i) => i.id === chipId) as Draft<Item> | undefined;
    if (it?.kind !== 'symbol' || Object.entries(patch).every(([k, v]) => it.properties?.[k] === v)) return;
    it.properties = { ...(it.properties ?? {}), ...patch };
  });
}

/** Keeps the program's files in the chip. */
export function storeSketch(docId: string, chipId: string, files: SourceFile[]) {
  patchChip(docId, chipId, { code: encodeSketch(files) });
}

/** The compiled program goes onto the chip together with its source; a running simulation restarts the chip. */
export function flashSketch(docId: string, chipId: string, files: SourceFile[], hex: string) {
  patchChip(docId, chipId, { code: encodeSketch(files), firmware: hex, firmwareName: mainFile(files) });
}

/** The file the program is named after: the sketch (.ino), else the first source file. */
export const mainFile = (files: SourceFile[]) => (files.find((f) => f.name.endsWith('.ino')) ?? files.find((f) => !/\.(h|hh|hpp)$/.test(f.name)) ?? files[0]).name;

// ---- templates ----

export type TemplateId = 'empty' | 'clock' | 'c' | ExampleId;

export const TEMPLATES: TemplateId[] = ['empty', 'blink', 'button', 'chaser', 'dimmer', 'serial', 'demo', 'lcd', 'clock', 'c'];

/** the firmware example a template is the sketch of (it has a wiring hint and a name there) */
export const exampleOf = (id: TemplateId): ExampleId | undefined => (id === 'empty' || id === 'clock' || id === 'c' ? undefined : id);

const EMPTY = `void setup() {
  // läuft einmal nach dem Start
}

void loop() {
  // läuft danach immer wieder
}
`;

const PLAIN_C = `// Blinken in reinem C, ohne die Arduino-Bibliothek: direkt mit den
// Registern des ATmega328P (avr-libc). D13 ist Port B, Bit 5.
#include <avr/io.h>
#include <util/delay.h>

int main(void) {
  DDRB |= _BV(PB5);       // PB5 (D13) ist ein Ausgang
  for (;;) {
    PORTB ^= _BV(PB5);    // umschalten
    _delay_ms(500);       // F_CPU ist der Takt des Chips
  }
}
`;

/** The files of a template; `wire` is the wiring hint of an example (shown as the first comment). */
export function templateFiles(id: TemplateId, wire?: string): SourceFile[] {
  if (id === 'empty') return [{ name: 'sketch.ino', content: EMPTY }];
  if (id === 'c') return [{ name: 'main.c', content: PLAIN_C }];
  if (id === 'clock') return [{ name: 'uhr.ino', content: CLOCK }];
  const sketch = exampleById(id)!.sketch;
  return [{ name: `${id}.ino`, content: `${wire ? `// ${wire}\n\n` : ''}${sketch.endsWith('\n') ? sketch : `${sketch}\n`}` }];
}

// ---- compiling ----

export type CompileProblem = 'offline' | 'unavailable' | 'rate' | 'busy' | 'rejected';

export class CompileError extends Error {
  readonly problem: CompileProblem;

  constructor(problem: CompileProblem, detail = '') {
    super(detail ? `${problem}: ${detail}` : problem);
    this.problem = problem;
  }
}

/** The web app compiles on its own server; the desktop app on the public one. */
const compileUrl = () => (isTauri() ? 'https://pueski.de/blackboard/api/compile' : new URL('api/compile', document.baseURI).href);

/** Compiles for an ATmega328P at `clock` Hz; a program with errors resolves (ok false), a missing compiler throws a CompileError. */
export async function compileSketch(files: SourceFile[], clock: number): Promise<CompileResult> {
  let r: Response;
  try {
    r = await fetch(compileUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files, clock }) });
  } catch {
    throw new CompileError(navigator.onLine ? 'unavailable' : 'offline');
  }
  const json = (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json().catch(() => null)) as (CompileResult & { error?: string }) | null) : null;
  if (r.ok && json && typeof json.ok === 'boolean') return json;
  if (r.status === 429) throw new CompileError('rate');
  if (r.status === 503 && json?.error === 'busy') throw new CompileError('busy');
  if (r.status === 400 || r.status === 413) throw new CompileError('rejected', json?.error);
  // no API (static hosting, dev server without `npm run server`) or no compiler behind it
  throw new CompileError('unavailable', json?.error ?? String(r.status));
}
