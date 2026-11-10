// Character displays drawn into their symbols: the 5x8 dot matrix of every
// character with what the controller holds, lit by the backlight current of
// the live values, as dark as VDD - V0 allows.

import { memo } from 'react';
import type { Doc, SymbolItem } from '../model/types.ts';
import { symbolTransform } from '../geometry/geom.ts';
import { useLive } from '../store/live.ts';
import { useMcu, type LcdView } from '../mcu/controller.ts';
import { isLcd, LCD_GEOMETRY as G, lcdBacklight, lcdSize, type Backlight } from '../mcu/lcd.ts';
import { lcdAddress, type LcdState } from '../mcu/hd44780.ts';
import { glyph } from '../mcu/hd44780Font.ts';

const COLORS: Record<Backlight, { lit: [number, number, number]; dark: [number, number, number]; dot: string; ghost: string }> = {
  green: { lit: [166, 209, 58], dark: [92, 108, 64], dot: '#1d2810', ghost: '#5f7f1c' },
  blue: { lit: [36, 104, 220], dark: [26, 38, 70], dot: '#eef5ff', ghost: '#5d8fe8' },
};

const mix = (a: [number, number, number], b: [number, number, number], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

const DOT = G.dot - 0.5;

export const LcdOverlay = memo(function LcdOverlay({ doc }: { doc: Doc }) {
  const displays = doc.items.filter((i): i is SymbolItem => isLcd(i));
  if (!displays.length) return null;
  return (
    <g pointerEvents="none">
      {displays.map((s) => (
        <g key={s.id} transform={symbolTransform(s)}>
          <Display s={s} />
        </g>
      ))}
    </g>
  );
});

function Display({ s }: { s: SymbolItem }) {
  const live = useLive((x) => x.on && x.mode === 'dc');
  const view: LcdView | undefined = useMcu((x) => x.lcdView[s.id]);
  const state: LcdState | undefined = useMcu((x) => x.lcds[s.id]);
  const { cols, rows } = lcdSize(s);
  const c = COLORS[lcdBacklight(s)];
  const lit = live && view ? view.backlight : 0;
  const w = cols * G.cellW;
  const h = rows * G.cellH;
  const shows = live && view?.powered && state?.on;
  const contrast = shows ? view!.contrast : 0;
  const pattern = `bb-lcd-${s.id}`;

  let dots = '';
  let cursor: { x: number; y: number } | undefined;
  if (shows && state) {
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const a = lcdAddress(state, cols, r, col);
        if (a < 0) continue;
        const x0 = G.x + col * G.cellW;
        const y0 = G.y + r * G.cellH;
        glyph(state.ddram[a] ?? 0x20, state.cgram).forEach((bits, py) => {
          for (let px = 0; px < 5; px++) if (bits & (0x10 >> px)) dots += `M${x0 + px * G.dot} ${y0 + py * G.dot}h${DOT}v${DOT}h${-DOT}z`;
        });
        if (a === state.ac) cursor = { x: x0, y: y0 };
      }
    }
  }
  return (
    <g>
      <defs>
        <pattern id={pattern} width={G.dot} height={G.dot} patternUnits="userSpaceOnUse" x={G.x} y={G.y}>
          <rect width={DOT} height={DOT} fill={c.ghost} />
        </pattern>
      </defs>
      <rect x={G.x - 4} y={G.y - 4} width={w + 8} height={h + 8} fill={mix(c.dark, c.lit, lit)} />
      {/* the dots that are off show faintly at high contrast, like on the real glass */}
      {contrast > 0.6 &&
        Array.from({ length: rows * cols }, (_, i) => (
          <rect
            key={i}
            x={G.x + (i % cols) * G.cellW}
            y={G.y + Math.floor(i / cols) * G.cellH}
            width={5 * G.dot}
            height={8 * G.dot}
            fill={`url(#${pattern})`}
            opacity={(contrast - 0.6) * 0.5}
          />
        ))}
      {dots && <path d={dots} fill={c.dot} opacity={contrast} />}
      {cursor && state?.cursor && <rect x={cursor.x} y={cursor.y + 7 * G.dot} width={5 * G.dot - 0.5} height={DOT} fill={c.dot} opacity={contrast} />}
      {cursor && state?.blink && (
        <rect x={cursor.x} y={cursor.y} width={5 * G.dot - 0.5} height={8 * G.dot - 0.5} fill={c.dot} opacity={contrast}>
          <animate attributeName="opacity" values={`${contrast};${contrast};0;0`} keyTimes="0;0.5;0.5;1" dur="0.82s" repeatCount="indefinite" />
        </rect>
      )}
    </g>
  );
}
