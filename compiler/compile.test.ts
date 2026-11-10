// node --test: what the compile service accepts, how it reads gcc's messages,
// and (where arduino-cli is installed, e.g. in the image) a real compile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { BusyError, compile, limiter, parseDiagnostics, RequestError, validate } from './compile.ts';

const ino = (content: string, name = 'Blink.ino') => ({ files: [{ name, content }] });

test('accepts sketches and plain C, refuses odd names and sizes', () => {
  assert.equal(validate(ino('void setup(){}')).clock, 16_000_000);
  assert.equal(validate({ files: [{ name: 'main.c', content: 'int main(){}' }], clock: 8_000_000 }).clock, 8_000_000);
  for (const bad of [
    null,
    { files: [] },
    ino('', '../x.ino'),
    ino('', 'x/y.ino'),
    ino('', '.hidden.ino'),
    ino('', 'x.exe'),
    ino('', 'platform.txt'),
    { files: [{ name: 'a.h', content: '' }] },
    { files: [{ name: 'a.ino', content: '' }, { name: 'A.ino', content: '' }] },
    { files: [{ name: 'a.ino', content: 'x'.repeat(600 * 1024) }] },
    { ...ino(''), clock: 1.5e6 + 0.5 },
    { ...ino(''), clock: 1e9 },
  ])
    assert.throws(() => validate(bad), RequestError, JSON.stringify(bad)?.slice(0, 60));
});

test('reads errors, warnings and linker errors; drops core warnings', () => {
  const own = (p: string) => (p.startsWith('/tmp/bb-1/Blink/') ? p.slice(16) : undefined);
  const d = parseDiagnostics(
    [
      "/tmp/bb-1/Blink/Blink.ino: In function 'void setup()':",
      "/tmp/bb-1/Blink/Blink.ino:7:1: error: expected ';' before '}' token",
      "/tmp/bb-1/Blink/Blink.ino:11:7: warning: unused variable 'unused' [-Wunused-variable]",
      "/home/node/.arduino15/packages/arduino/hardware/avr/1.8.6/cores/arduino/new.cpp:59:60: warning: unused parameter 'tag'",
      '/home/node/Arduino/libraries/Servo/src/Servo.h:3:1: error: broken',
      "/tmp/bb-1/Blink/Blink.ino:2: undefined reference to `bar()'",
      'collect2: error: ld returned 1 exit status',
    ].join('\n'),
    own,
  );
  assert.deepEqual(
    d.map((x) => [x.file, x.own, x.line, x.column, x.severity]),
    [
      ['Blink.ino', true, 7, 1, 'error'],
      ['Blink.ino', true, 11, 7, 'warning'],
      ['Servo.h', false, 3, 1, 'error'],
      ['Blink.ino', true, 2, 1, 'error'],
    ],
  );
  assert.equal(d[3].message, "undefined reference to `bar()'");
});

test('runs a limited number of compiles at once', async () => {
  const slot = limiter(1, 1);
  let release!: () => void;
  const first = slot(() => new Promise<void>((r) => (release = r)));
  const second = slot(async () => 'second');
  await assert.rejects(slot(async () => 'third'), BusyError);
  release();
  await first;
  assert.equal(await second, 'second');
});

const hasCli = spawnSync('arduino-cli', ['version']).status === 0;

test('compiles a sketch and plain C into HEX', { skip: !hasCli && 'arduino-cli not installed' }, async () => {
  const sketch = await compile(validate(ino('void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); }\n')));
  assert.ok(sketch.ok, sketch.log);
  assert.match(sketch.hex!, /^:10000000/);
  assert.ok(sketch.flash!.used > 400 && sketch.flash!.max === 32256);
  const c = await compile(validate({ files: [{ name: 'main.c', content: '#include <avr/io.h>\nint main(void) { DDRB = 1; for (;;); }\n' }] }));
  assert.ok(c.ok && c.flash!.used < 400, c.log);
  const bad = await compile(validate(ino('void setup() { nope(); }\nvoid loop() {}\n')));
  assert.equal(bad.ok, false);
  assert.deepEqual(
    bad.diagnostics.filter((x) => x.severity === 'error').map((x) => [x.file, x.line]),
    [['Blink.ino', 1]],
  );
});
