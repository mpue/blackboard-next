// The HD44780 character LCD controller (and its compatibles: KS0066, ST7066),
// driven by the levels on its pins: on the falling edge of E it takes RS and
// the data lines, in 8 or 4 bit mode. Instruction set, DDRAM and CGRAM as in
// the Hitachi datasheet; busy times are not modelled (the commands complete
// at once), reading (RW high) returns nothing.

export interface LcdState {
  /** display data RAM, addresses 0x00..0x67 */
  ddram: number[];
  /** character generator RAM, 8 characters x 8 rows of 5 bits */
  cgram: number[];
  on: boolean;
  cursor: boolean;
  blink: boolean;
  /** display shift in characters (positive: the text moved right) */
  shift: number;
  /** address counter (where the cursor is) */
  ac: number;
  twoLine: boolean;
}

export class Hd44780 {
  private ddram = new Uint8Array(0x80).fill(0x20);
  private cgram = new Uint8Array(64);
  private ac = 0;
  private toCgram = false;
  private increment = true;
  private shiftOnWrite = false;
  private on = false;
  private cursor = false;
  private blink = false;
  private shift = 0;
  private eightBit = true;
  private twoLine = false;
  private high: number | null = null;
  /** counts every change of what the display shows */
  version = 0;

  /** Power-on reset: blank, 8 bit interface, one line, display off. */
  reset() {
    this.ddram.fill(0x20);
    this.cgram.fill(0);
    this.ac = 0;
    this.toCgram = false;
    this.increment = true;
    this.shiftOnWrite = false;
    this.on = this.cursor = this.blink = false;
    this.shift = 0;
    this.eightBit = true;
    this.twoLine = false;
    this.high = null;
    this.version++;
  }

  /**
   * Falling edge of E: `data` holds D7..D0 (in 4 bit mode only D7..D4 are
   * read, as one nibble; two nibbles make a byte, the high one first).
   */
  latch(rs: boolean, rw: boolean, data: number) {
    let byte: number;
    if (this.eightBit) byte = data & 0xff;
    else {
      const nibble = (data >> 4) & 0x0f;
      if (this.high === null) {
        this.high = nibble;
        return;
      }
      byte = (this.high << 4) | nibble;
      this.high = null;
    }
    if (rw) return;
    if (rs) this.write(byte);
    else this.command(byte);
    this.version++;
  }

  private step(dir: 1 | -1) {
    if (this.toCgram) {
      this.ac = (this.ac + dir) & 0x3f;
      return;
    }
    let a = this.ac + dir;
    if (this.twoLine) {
      // 0x00..0x27 and 0x40..0x67, each line wrapping into the other
      if (dir > 0 && a === 0x28) a = 0x40;
      else if (dir > 0 && a === 0x68) a = 0x00;
      else if (dir < 0 && a === -1) a = 0x67;
      else if (dir < 0 && a === 0x3f) a = 0x27;
    } else a = (a + 0x50) % 0x50;
    this.ac = a;
  }

  private write(byte: number) {
    if (this.toCgram) this.cgram[this.ac & 0x3f] = byte & 0x1f;
    else {
      this.ddram[this.ac & 0x7f] = byte;
      if (this.shiftOnWrite) this.shift += this.increment ? -1 : 1;
    }
    this.step(this.increment ? 1 : -1);
  }

  private command(c: number) {
    if (c & 0x80) {
      this.ac = c & 0x7f;
      this.toCgram = false;
    } else if (c & 0x40) {
      this.ac = c & 0x3f;
      this.toCgram = true;
    } else if (c & 0x20) {
      // function set: DL (8 bit), N (two lines); F (5x10 font) is not drawn
      this.eightBit = !!(c & 0x10);
      this.twoLine = !!(c & 0x08);
      this.high = null;
    } else if (c & 0x10) {
      const right = !!(c & 0x04);
      if (c & 0x08) this.shift += right ? 1 : -1;
      else this.step(right ? 1 : -1);
    } else if (c & 0x08) {
      this.on = !!(c & 0x04);
      this.cursor = !!(c & 0x02);
      this.blink = !!(c & 0x01);
    } else if (c & 0x04) {
      this.increment = !!(c & 0x02);
      this.shiftOnWrite = !!(c & 0x01);
    } else if (c & 0x02) {
      this.ac = 0;
      this.toCgram = false;
      this.shift = 0;
    } else if (c & 0x01) {
      this.ddram.fill(0x20);
      this.ac = 0;
      this.toCgram = false;
      this.increment = true;
      this.shift = 0;
    }
  }

  state(): LcdState {
    return {
      ddram: [...this.ddram.subarray(0, 0x68)],
      cgram: [...this.cgram],
      on: this.on,
      cursor: this.cursor,
      blink: this.blink,
      shift: this.shift,
      ac: this.toCgram ? -1 : this.ac,
      twoLine: this.twoLine,
    };
  }
}

/**
 * DDRAM address shown at row/column of a display: lines start at 0x00 and
 * 0x40, a 4-line display continues them in rows 3 and 4 (0x14, 0x54 on 20
 * columns); the display shift moves every line within its 40 characters.
 */
export function lcdAddress(state: Pick<LcdState, 'twoLine' | 'shift'>, cols: number, row: number, col: number): number {
  const base = [0x00, 0x40, cols, 0x40 + cols][row] ?? 0;
  if (!state.twoLine) return row === 0 ? (((col - state.shift) % 80) + 80) % 80 : -1;
  const lineStart = base & 0x40;
  const offset = (base & 0x3f) + col - state.shift;
  return lineStart + (((offset % 40) + 40) % 40);
}

/** The text a display shows, row by row (CGRAM characters as their code). */
export function lcdText(state: LcdState, cols: number, rows: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const a = lcdAddress(state, cols, r, c);
      line += a < 0 ? ' ' : String.fromCharCode(state.ddram[a] ?? 0x20);
    }
    out.push(line);
  }
  return out;
}
