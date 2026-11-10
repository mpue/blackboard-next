// Intel HEX, the format avr-gcc and the Arduino IDE ("Export compiled binary")
// write firmware in.

export type HexProblem = 'format' | 'checksum' | 'size' | 'empty';

export class HexError extends Error {
  readonly problem: HexProblem;
  /** 1 based line of the broken record, 0 for the whole file */
  readonly line: number;

  constructor(problem: HexProblem, line = 0) {
    super(line ? `Intel HEX: ${problem} (line ${line})` : `Intel HEX: ${problem}`);
    this.problem = problem;
    this.line = line;
  }
}

export interface Firmware {
  /** flash image */
  flash: Uint8Array;
  /** bytes up to the highest address written */
  used: number;
}

/** Reads an Intel HEX file into a flash image of `size` bytes (32 KiB = ATmega328P). */
export function parseHex(text: string, size = 0x8000): Firmware {
  const flash = new Uint8Array(size).fill(0xff);
  let base = 0;
  let used = 0;
  let any = false;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (!/^:([0-9a-f]{2})+$/i.test(line) || line.length < 11) throw new HexError('format', n + 1);
    const bytes = new Uint8Array((line.length - 1) / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(line.slice(1 + 2 * i, 3 + 2 * i), 16);
    const count = bytes[0];
    if (bytes.length !== count + 5) throw new HexError('format', n + 1);
    if (bytes.reduce((a, b) => a + b, 0) & 0xff) throw new HexError('checksum', n + 1);
    const addr = (bytes[1] << 8) | bytes[2];
    switch (bytes[3]) {
      case 0x00:
        for (let i = 0; i < count; i++) {
          const a = base + addr + i;
          if (a >= size) throw new HexError('size', n + 1);
          flash[a] = bytes[4 + i];
          used = Math.max(used, a + 1);
        }
        any = true;
        break;
      case 0x01:
        n = lines.length;
        break;
      case 0x02:
        base = ((bytes[4] << 8) | bytes[5]) << 4;
        break;
      case 0x04:
        base = ((bytes[4] << 8) | bytes[5]) * 0x10000;
        break;
      // 0x03 / 0x05: start address, not needed (the AVR starts at 0)
    }
  }
  if (!any) throw new HexError('empty');
  return { flash, used };
}

/** Writes bytes (from address 0) as Intel HEX. */
export function toHex(bytes: Uint8Array): string {
  const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');
  const out: string[] = [];
  for (let addr = 0; addr < bytes.length; addr += 16) {
    const chunk = bytes.subarray(addr, Math.min(bytes.length, addr + 16));
    const rec = [chunk.length, (addr >> 8) & 0xff, addr & 0xff, 0, ...chunk];
    const sum = (0x100 - (rec.reduce((a, b) => a + b, 0) & 0xff)) & 0xff;
    out.push(`:${rec.map(hex2).join('')}${hex2(sum)}`);
  }
  out.push(':00000001FF');
  return out.join('\n') + '\n';
}
