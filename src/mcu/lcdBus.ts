// Character displays on the pins of a microcontroller, inside its worker: the
// controller sees every edge of E at the moment the firmware makes it (far
// faster than the circuit is recalculated), and takes RS and the data lines
// on the falling edge, like the HD44780 does.

import { Hd44780, type LcdState } from './hd44780.ts';

/** A display wired to a chip: chip pin numbers of its control and data lines (undefined: not wired). */
export interface LcdLink {
  id: string;
  /** supply above the controller's minimum (from the operating point) */
  powered: boolean;
  e: number;
  rs?: number;
  rw?: number;
  /** D0..D7 */
  d: (number | undefined)[];
}

interface Display {
  link: LcdLink;
  ctl: Hd44780;
  e: 0 | 1;
  sent: number;
}

export class LcdBus {
  private displays = new Map<string, Display>();
  /** every chip pin a display listens to */
  readonly pins = new Set<number>();

  /** New wiring and supply; a display that just got power starts from its reset state. */
  update(links: LcdLink[], level: (num: number | undefined) => 0 | 1) {
    const next = new Map<string, Display>();
    for (const link of links) {
      const old = this.displays.get(link.id);
      const ctl = old?.ctl ?? new Hd44780();
      if (!old || (link.powered && !old.link.powered) || !link.powered) ctl.reset();
      next.set(link.id, { link, ctl, e: level(link.e), sent: old && old.link.powered === link.powered ? old.sent : -1 });
    }
    this.displays = next;
    this.pins.clear();
    for (const { link } of next.values()) for (const n of [link.e, link.rs, link.rw, ...link.d]) if (n !== undefined) this.pins.add(n);
  }

  get size() {
    return this.displays.size;
  }

  /** A chip pin changed its level; `level` reads the others. */
  edge(num: number, now: 0 | 1, level: (num: number | undefined) => 0 | 1) {
    for (const d of this.displays.values()) {
      if (d.link.e !== num) continue;
      const falling = d.e === 1 && now === 0;
      d.e = now;
      if (!falling || !d.link.powered) continue;
      let data = 0;
      d.link.d.forEach((n, bit) => {
        if (level(n)) data |= 1 << bit;
      });
      d.ctl.latch(level(d.link.rs) === 1, level(d.link.rw) === 1, data);
    }
  }

  /** Displays whose content changed since the last call. */
  changed(): { id: string; state: LcdState }[] {
    const out: { id: string; state: LcdState }[] = [];
    for (const [id, d] of this.displays) {
      if (d.sent === d.ctl.version) continue;
      d.sent = d.ctl.version;
      out.push({ id, state: d.ctl.state() });
    }
    return out;
  }
}
