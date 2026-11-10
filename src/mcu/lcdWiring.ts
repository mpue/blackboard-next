// What an operating point says about the character displays of a schematic:
// which chip pins drive their lines (a display line on the same net as a chip
// pin is wired to it), and supply, contrast and backlight for the drawing.

import type { NetlistResult } from '../spice/netlist.ts';
import type { LcdLink } from './lcdBus.ts';
import { LCD_D0, LCD_E, LCD_MIN_VOLTS, LCD_RS, LCD_RW, LCD_V0, LCD_VDD, LCD_VSS, lcdContrast } from './lcd.ts';
import { MODELS } from './pinout.ts';

export interface LcdView {
  powered: boolean;
  /** 0..1 from VDD - V0 */
  contrast: number;
  /** backlight brightness 0..1 (20 mA = full) */
  backlight: number;
  /** chip that drives it, if any */
  chip?: string;
}

export function wireDisplays(nl: NetlistResult, vectors: Map<string, number>): { links: Map<string, LcdLink[]>; view: Record<string, LcdView> } {
  const volts = (node: string | undefined) => (node === undefined ? undefined : node === '0' ? 0 : vectors.get(`v(${node})`));
  const links = new Map<string, LcdLink[]>();
  const view: Record<string, LcdView> = {};
  for (const l of nl.lcds) {
    const vss = volts(l.nodes[LCD_VSS]) ?? 0;
    const vdd = l.nodes[LCD_VSS] === undefined ? 0 : (volts(l.nodes[LCD_VDD]) ?? vss) - vss;
    const v0 = volts(l.nodes[LCD_V0]);
    const powered = vdd >= LCD_MIN_VOLTS;
    const name = l.backlight?.toLowerCase();
    const bl = name ? (vectors.get(`@${name}[id]`) ?? vectors.get(`i(@${name}[id])`) ?? 0) : 0;
    const v: LcdView = { powered, contrast: lcdContrast(vdd, v0 === undefined ? undefined : v0 - vss), backlight: Math.min(1, Math.max(0, bl / 0.02)) };
    const e = l.nodes[LCD_E];
    for (const m of nl.mcus) {
      if (e === undefined) break;
      const pinOn = (node: string | undefined) => (node === undefined ? undefined : MODELS[m.kind].io.find((p) => m.nodes[p.num] === node)?.num);
      const en = pinOn(e);
      if (en === undefined) continue;
      const link: LcdLink = { id: l.symbolId, powered, e: en, rs: pinOn(l.nodes[LCD_RS]), rw: pinOn(l.nodes[LCD_RW]), d: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => pinOn(l.nodes[LCD_D0 + i])) };
      links.set(m.symbolId, [...(links.get(m.symbolId) ?? []), link]);
      v.chip = m.symbolId;
      break;
    }
    view[l.symbolId] = v;
  }
  return { links, view };
}
