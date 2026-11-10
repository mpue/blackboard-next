import { describe, expect, it } from 'vitest';
import { Hd44780, lcdAddress, lcdText } from './hd44780.ts';
import { glyph } from './hd44780Font.ts';

/** a controller wired for 4 bit mode, initialised like Arduino's LiquidCrystal */
function fourBit() {
  const lcd = new Hd44780();
  lcd.reset();
  const nibble = (rs: boolean, n: number) => lcd.latch(rs, false, (n & 0x0f) << 4);
  const send = (rs: boolean, b: number) => {
    nibble(rs, b >> 4);
    nibble(rs, b);
  };
  for (const n of [3, 3, 3, 2]) nibble(false, n);
  for (const c of [0x28, 0x0c, 0x01, 0x06]) send(false, c);
  const print = (s: string) => [...s].forEach((c) => send(true, c.charCodeAt(0)));
  return { lcd, send, print };
}

describe('HD44780', () => {
  it('starts in 4 bit mode the way LiquidCrystal does and shows two lines', () => {
    const { lcd, send, print } = fourBit();
    print('Hallo');
    send(false, 0xc0);
    print('Welt');
    const s = lcd.state();
    expect(s.on).toBe(true);
    expect(s.cursor).toBe(false);
    expect(s.twoLine).toBe(true);
    expect(lcdText(s, 16, 2)).toEqual(['Hallo           ', 'Welt            ']);
    expect(s.ac).toBe(0x44);
  });

  it('runs the cursor from the end of line 1 into line 2 and clears', () => {
    const { lcd, send, print } = fourBit();
    send(false, 0x80 | 0x26);
    print('ab');
    expect(lcd.state().ac).toBe(0x40);
    print('c');
    expect(lcd.state().ddram[0x40]).toBe('c'.charCodeAt(0));
    send(false, 0x01);
    expect(lcdText(lcd.state(), 16, 2)).toEqual([' '.repeat(16), ' '.repeat(16)]);
  });

  it('takes 8 bit data, user characters and shifts the display', () => {
    const lcd = new Hd44780();
    lcd.reset();
    const cmd = (c: number) => lcd.latch(false, false, c);
    const data = (d: number) => lcd.latch(true, false, d);
    cmd(0x38);
    cmd(0x0f);
    // a smiley as user character 1
    cmd(0x40 | 8);
    for (const row of [0, 0x0a, 0, 0x11, 0x0e, 0, 0, 0]) data(row);
    cmd(0x80);
    data(1);
    data('A'.charCodeAt(0));
    const s = lcd.state();
    expect(s.blink).toBe(true);
    expect(glyph(s.ddram[0], s.cgram)).toEqual([0, 0x0a, 0, 0x11, 0x0e, 0, 0, 0]);
    expect(glyph(0x41, s.cgram).slice(0, 2)).toEqual([0x0e, 0x11]);
    cmd(0x1c);
    // shifted right: column 1 shows address 0
    expect(lcdAddress(lcd.state(), 16, 0, 1)).toBe(0);
    expect(lcdText(lcd.state(), 16, 1)[0].slice(1, 3)).toBe('\x01A');
  });

  it('maps the rows of a 20x4 display', () => {
    const s = { twoLine: true, shift: 0 };
    expect([0, 1, 2, 3].map((r) => lcdAddress(s, 20, r, 0))).toEqual([0x00, 0x40, 0x14, 0x54]);
  });
});
