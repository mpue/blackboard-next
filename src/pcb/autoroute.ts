// Autorouter: a grid based maze router (A* over x, y and copper layer with bend
// and via costs). It works through the ratsnest shortest first, keeps the
// clearance to foreign copper by construction (and checks every result exactly)
// and rips up blocking routes when a connection fails.

import type { CopperSide, DesignRules, Doc, TrackItem, ViaItem } from '../model/types.ts';
import type { Pt } from '../geometry/geom.ts';
import { uid } from '../model/id.ts';
import { copperShapeBounds, footprintToWorld, isPowerNet, shapeGap, trackShape, viaShape, type CopperShape } from './geometry.ts';
import { computePcbConnectivity, ratsnest } from './connectivity.ts';
import { copperLayers, trackWidthFor } from './route.ts';
import { defaultRules } from './defaults.ts';
import { shapeCentroid } from './spatial.ts';
import { mm } from './units.ts';

export interface AutorouteOptions {
  /** grid pitch in board units; default mm(0.254), a tenth of the 2.54 mm raster */
  grid?: number;
  /** cost of a via in grid steps, default 12 */
  viaCost?: number;
  /** cost of a 45° bend in grid steps, default 2 */
  bendCost?: number;
  /** routing passes incl. the first; later passes rip up blocking routes. Default 3 */
  maxPasses?: number;
  /** only these nets (default: all unrouted) */
  nets?: string[];
  /** default 20000 */
  timeLimitMs?: number;
}

export interface AutorouteResult {
  /** new tracks (net set, layer = copper layer id) */
  tracks: TrackItem[];
  vias: ViaItem[];
  /** ratsnest connections routed */
  routed: number;
  failed: { net: string; a: Pt; b: Pt }[];
}

const FREE = -1;
const BLOCK = -2;
/** margin of the grid obstacle maps */
const EPS = 1e-3;
/** margin of the exact checks */
const SAFE = 1e-5;
const TOUCH = 1e-6;
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const FROM_VIA = 8;
const FROM_START = 9;
/** cost factor of the straight piece between a pad centre (or track) and its first grid cell */
const ATTACH = 1.2;
/** extra cost per grid step through foreign routes when looking for routes to rip up */
const RIP_PENALTY = 25;
/** extra cost factor for steps across the preferred direction of a layer (top: horizontal, bottom: vertical) */
const CROSS = 0.15;
const MAX_TRIES = 6;
/** A* expansions (at least, else 1/16 of the nodes) after which a search checks by flood fill whether a target is reachable at all */
const FLOOD_AFTER = 8192;
/** cells per layer; coarser grids beyond */
const MAX_CELLS = 1_500_000;

// ---- copper and geometry helpers ------------------------------------------------------------

interface Cu {
  shape: CopperShape;
  /** bit 1 top, bit 2 bottom */
  sides: number;
  /** net index; BLOCK for holes */
  net: number;
  /** union-find node: island of the copper or route node; -1 for holes */
  node: number;
  /** where tracks attach: pad or via centre; tracks attach anywhere on their centre line */
  anchor?: Pt;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function makeCu(shape: CopperShape, sides: number, net: number, node: number, anchor?: Pt): Cu {
  const b = copperShapeBounds(shape);
  return { shape, sides, net, node, anchor, x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Gap between a point and a copper shape (negative inside; inside depth is not exact). */
function gapAt(px: number, py: number, s: CopperShape): number {
  const p = s.pts;
  if (p.length === 1) return Math.hypot(px - p[0].x, py - p[0].y) - s.r;
  if (p.length === 2) return segDist(px, py, p[0].x, p[0].y, p[1].x, p[1].y) - s.r;
  let sign = 0;
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const c = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (c > 1e-9) {
      if (sign < 0) inside = false;
      sign = 1;
    } else if (c < -1e-9) {
      if (sign > 0) inside = false;
      sign = -1;
    }
    const d = segDist(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return inside ? -s.r : best - s.r;
}

/** Signed distance to the (rounded) board rectangle, negative inside. */
function boardSdf(w: number, h: number, r: number, x: number, y: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const n = out.length;
    const b = out[n - 1];
    if (b && Math.abs(b.x - p.x) < 1e-9 && Math.abs(b.y - p.y) < 1e-9) continue;
    if (n >= 2) {
      const a = out[n - 2];
      const ux = b.x - a.x, uy = b.y - a.y, vx = p.x - b.x, vy = p.y - b.y;
      if (Math.abs(ux * vy - uy * vx) <= 1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && ux * vx + uy * vy > 0) {
        out[n - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

class UnionFind {
  readonly p: Int32Array;
  constructor(n: number) {
    this.p = new Int32Array(n);
    this.reset();
  }
  reset(): void {
    for (let i = 0; i < this.p.length; i++) this.p[i] = i;
  }
  find(i: number): number {
    const p = this.p;
    let r = i;
    while (p[r] !== r) r = p[r];
    while (p[i] !== r) {
      const n = p[i];
      p[i] = r;
      i = n;
    }
    return r;
  }
  union(a: number, b: number): void {
    const x = this.find(a);
    const y = this.find(b);
    if (x !== y) this.p[x] = y;
  }
}

// ---- grid and search -------------------------------------------------------------------------

interface Attach {
  node: number;
  cost: number;
  cu: Cu;
  /** anchor the track starts from */
  ax: number;
  ay: number;
}

/**
 * Obstacle maps per width class and layer: FREE, the only net allowed there or
 * BLOCK. A cell is taken by foreign copper when a track centre there could come
 * closer than clearance + w/2 to it; the margin covers the straight piece to
 * the next cell (also diagonally), so paths between free cells are clean.
 */
class Grid {
  readonly g: number;
  readonly nx: number;
  readonly ny: number;
  readonly N: number;
  readonly L: number;
  readonly bits: number[];
  readonly widths: number[];
  readonly clearance: number;
  readonly viaR: number;
  readonly viaCost: number;
  readonly turn: number[];
  readonly pref: Float64Array;
  /** static obstacles (pads, existing copper, holes, board edge): [class * L + layer] */
  readonly sT: Int32Array[];
  readonly sV: Int32Array | undefined;
  /** static obstacles + routes */
  fT: Int32Array[] = [];
  fV: Int32Array | undefined;
  /** static obstacles + routes that may not be ripped up any more */
  lT: Int32Array[] = [];
  lV: Int32Array | undefined;
  readonly deadline: number;
  timedOut = false;
  private readonly gc: Float64Array;
  private readonly st: Uint32Array;
  private readonly from: Int8Array;
  private readonly ts: Uint32Array;
  private readonly fs: Uint32Array;
  private readonly fq: Int32Array;
  private sid = 0;
  private hn = new Int32Array(4096);
  private hk = new Float64Array(4096);
  private hs = 0;

  constructor(doc: Doc, rules: DesignRules, g: number, bits: number[], widths: number[], o: { viaCost: number; bendCost: number; deadline: number }) {
    this.g = g;
    this.nx = Math.floor(doc.width / g) + 1;
    this.ny = Math.floor(doc.height / g) + 1;
    this.N = this.nx * this.ny;
    this.L = bits.length;
    this.bits = bits;
    this.widths = widths;
    this.clearance = rules.clearance;
    this.viaR = rules.viaDiameter / 2;
    this.viaCost = o.viaCost;
    this.deadline = o.deadline;
    const b = o.bendCost;
    this.turn = [0, b, 2 * b, 6 * b];
    this.pref = new Float64Array(this.L * 8).fill(1);
    if (this.L === 2) {
      for (let d = 0; d < 8; d++) {
        const horiz = DY[d] === 0, vert = DX[d] === 0;
        this.pref[d] = vert ? 1 + CROSS : horiz ? 1 : 1 + CROSS / 2;
        this.pref[8 + d] = horiz ? 1 + CROSS : vert ? 1 : 1 + CROSS / 2;
      }
    }
    const n2 = this.N * this.L;
    this.gc = new Float64Array(n2);
    this.st = new Uint32Array(n2);
    this.from = new Int8Array(n2);
    this.ts = new Uint32Array(n2);
    this.fs = new Uint32Array(n2);
    this.fq = new Int32Array(n2);

    this.sT = [];
    for (let k = 0; k < widths.length * this.L; k++) this.sT.push(new Int32Array(this.N).fill(FREE));
    this.sV = this.L === 2 ? new Int32Array(this.N).fill(FREE) : undefined;
    const cr = Math.max(0, Math.min(doc.pcb?.cornerRadius ?? 0, doc.width / 2, doc.height / 2));
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const inside = -boardSdf(doc.width, doc.height, cr, i * g, j * g);
        const idx = j * this.nx + i;
        for (let c = 0; c < widths.length; c++) {
          if (inside < rules.edgeClearance + widths[c] / 2 + EPS) for (let li = 0; li < this.L; li++) this.sT[c * this.L + li][idx] = BLOCK;
        }
        if (this.sV && inside < rules.edgeClearance + this.viaR + EPS) this.sV[idx] = BLOCK;
      }
    }
  }

  /** Blocking distance (gap to the shape) for tracks of class c around copper with radius rho. */
  thr(c: number, rho: number): number {
    const r = this.clearance + this.widths[c] / 2 + rho;
    return Math.sqrt(r * r + (this.g * this.g) / 2) - rho + EPS;
  }

  viaThr(): number {
    return this.clearance + this.viaR + EPS;
  }

  private s0 = 0;
  private s1 = 0;

  /** Cell columns [s0, s1] of the row at y within gap m of the copper (bounding box, tightened for segments). */
  private span(cu: Cu, m: number, y: number): boolean {
    let x1 = cu.x1 - m, x2 = cu.x2 + m;
    const p = cu.shape.pts;
    if (p.length === 2) {
      const R = m + cu.shape.r;
      const a = p[0], b = p[1];
      const dy = b.y - a.y;
      let t0 = 0, t1 = 1;
      if (Math.abs(dy) > 1e-12) {
        const u = (y - R - a.y) / dy, v = (y + R - a.y) / dy;
        t0 = Math.max(0, Math.min(u, v));
        t1 = Math.min(1, Math.max(u, v));
        if (t0 > t1) return false;
      }
      const xa = a.x + (b.x - a.x) * t0, xb = a.x + (b.x - a.x) * t1;
      x1 = Math.max(x1, Math.min(xa, xb) - R);
      x2 = Math.min(x2, Math.max(xa, xb) + R);
    }
    this.s0 = Math.max(0, Math.ceil(x1 / this.g));
    this.s1 = Math.min(this.nx - 1, Math.floor(x2 / this.g));
    return this.s0 <= this.s1;
  }

  /** Marks foreign copper into obstacle maps. */
  mark(cu: Cu, T: Int32Array[], V: Int32Array | undefined): void {
    const { g, nx, L } = this;
    const C = this.widths.length;
    const thr = this.widths.map((_, c) => this.thr(c, cu.shape.r));
    const tv = V ? this.viaThr() : -Infinity;
    const m = Math.max(tv, ...thr);
    const j0 = Math.max(0, Math.ceil((cu.y1 - m) / g)), j1 = Math.min(this.ny - 1, Math.floor((cu.y2 + m) / g));
    const net = cu.net;
    for (let j = j0; j <= j1; j++) {
      if (!this.span(cu, m, j * g)) continue;
      for (let i = this.s0; i <= this.s1; i++) {
        const d = gapAt(i * g, j * g, cu.shape);
        if (d >= m) continue;
        const idx = j * nx + i;
        for (let li = 0; li < L; li++) {
          if (!(cu.sides & this.bits[li])) continue;
          for (let c = 0; c < C; c++) {
            if (d >= thr[c]) continue;
            const a = T[c * L + li];
            const o = a[idx];
            if (o === FREE) a[idx] = net;
            else if (o !== net) a[idx] = BLOCK;
          }
        }
        if (V && d < tv) {
          const o = V[idx];
          if (o === FREE) V[idx] = net;
          else if (o !== net) V[idx] = BLOCK;
        }
      }
    }
  }

  resetFull(): void {
    this.fT = this.sT.map((a) => a.slice());
    this.fV = this.sV?.slice();
  }

  initLocked(): void {
    this.lT = this.sT.map((a) => a.slice());
    this.lV = this.sV?.slice();
  }

  /** Grid nodes a track of class c can start from on copper of the own island. */
  attach(cus: Cu[], net: number, c: number, T: Int32Array[], banned: Set<number>): Map<number, Attach> {
    const { g, nx, N, L } = this;
    const out = new Map<number, Attach>();
    const tol = g / 2;
    for (const cu of cus) {
      const j0 = Math.max(0, Math.ceil((cu.y1 - tol) / g)), j1 = Math.min(this.ny - 1, Math.floor((cu.y2 + tol) / g));
      for (let j = j0; j <= j1; j++) {
        if (!this.span(cu, tol, j * g)) continue;
        for (let i = this.s0; i <= this.s1; i++) {
          const x = i * g, y = j * g;
          if (gapAt(x, y, cu.shape) > tol) continue;
          const idx = j * nx + i;
          let ax: number, ay: number;
          if (cu.anchor) {
            ax = cu.anchor.x;
            ay = cu.anchor.y;
          } else {
            const [p, q] = cu.shape.pts;
            const dx = q.x - p.x, dy = q.y - p.y;
            const l2 = dx * dx + dy * dy;
            const t = l2 ? Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2)) : 0;
            ax = p.x + t * dx;
            ay = p.y + t * dy;
          }
          const cost = (ATTACH * Math.hypot(ax - x, ay - y)) / g;
          for (let li = 0; li < L; li++) {
            if (!(cu.sides & this.bits[li])) continue;
            const o = T[c * L + li][idx];
            if (o !== FREE && o !== net) continue;
            const node = li * N + idx;
            if (banned.has(node)) continue;
            const prev = out.get(node);
            if (!prev || cost < prev.cost) out.set(node, { node, cost, cu, ax, ay });
          }
        }
      }
    }
    return out;
  }

  private push(n: number, k: number): void {
    if (this.hs === this.hn.length) {
      const hn = new Int32Array(this.hs * 2);
      const hk = new Float64Array(this.hs * 2);
      hn.set(this.hn);
      hk.set(this.hk);
      this.hn = hn;
      this.hk = hk;
    }
    const hn = this.hn, hk = this.hk;
    let i = this.hs++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hn[i] = hn[p];
      hk[i] = hk[p];
      i = p;
    }
    hn[i] = n;
    hk[i] = k;
  }

  private pop(): number {
    const hn = this.hn, hk = this.hk;
    const top = hn[0];
    const size = --this.hs;
    if (size === 0) return top;
    const n = hn[size], k = hk[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hn[i] = hn[c];
      hk[i] = hk[c];
      i = c;
    }
    hn[i] = n;
    hk[i] = k;
    return top;
  }

  /**
   * Flood fill from the targets under the same move rules until it meets a node
   * the running search (stamp sid) has reached: is any target reachable at all?
   */
  private reachable(net: number, c: number, hard: Int32Array[], hardV: Int32Array | undefined, sid: number, targets: Iterable<number>): boolean {
    const { nx, ny, N, L, st, fs, fq } = this;
    const open = sid * 2, closed = open + 1;
    let head = 0, tail = 0;
    for (const n of targets) {
      fs[n] = sid;
      fq[tail++] = n;
    }
    while (head < tail) {
      const n = fq[head++];
      if (st[n] === open || st[n] === closed) return true;
      const li = (n / N) | 0;
      const cell = n - li * N;
      const x = cell % nx, y = (cell - x) / nx;
      const grid = hard[c * L + li];
      for (let d = 0; d < 8; d++) {
        const x2 = x + DX[d], y2 = y + DY[d];
        if (x2 < 0 || y2 < 0 || x2 >= nx || y2 >= ny) continue;
        const c2 = cell + DX[d] + DY[d] * nx;
        const m = li * N + c2;
        if (fs[m] === sid) continue;
        const o = grid[c2];
        if (o !== FREE && o !== net) continue;
        if (d & 1) {
          const oa = grid[cell + DX[d]], ob = grid[cell + DY[d] * nx];
          if (oa !== FREE && oa !== net && ob !== FREE && ob !== net) continue;
        }
        fs[m] = sid;
        fq[tail++] = m;
      }
      if (L === 2 && hardV) {
        const m = (1 - li) * N + cell;
        const vo = hardV[cell], o = hard[c * L + 1 - li][cell];
        if (fs[m] !== sid && (vo === FREE || vo === net) && (o === FREE || o === net)) {
          fs[m] = sid;
          fq[tail++] = m;
        }
      }
    }
    return false;
  }

  /**
   * A* from the start nodes to any target node. `soft`: only static copper and
   * locked routes block, other routes cost RIP_PENALTY per step (rip-up candidates).
   * Returns the path as node list (start first).
   */
  search(net: number, c: number, starts: Iterable<Attach>, targets: Map<number, Attach>, soft: boolean): number[] | null {
    const { nx, ny, N, L, gc, st, from, ts, turn, pref } = this;
    const sid = ++this.sid;
    const open = sid * 2, closed = open + 1;
    let tx1 = Infinity, ty1 = Infinity, tx2 = -Infinity, ty2 = -Infinity;
    for (const t of targets.values()) {
      const cell = t.node % N;
      const x = cell % nx, y = (cell - x) / nx;
      if (x < tx1) tx1 = x;
      if (x > tx2) tx2 = x;
      if (y < ty1) ty1 = y;
      if (y > ty2) ty2 = y;
      ts[t.node] = sid;
    }
    const hard = soft ? this.lT : this.fT;
    const hardV = soft ? this.lV : this.fV;
    const cost = this.fT;
    const costV = this.fV;
    const H = (x: number, y: number) => {
      const hx = x < tx1 ? tx1 - x : x > tx2 ? x - tx2 : 0;
      const hy = y < ty1 ? ty1 - y : y > ty2 ? y - ty2 : 0;
      return hx + hy - 0.5857864376269049 * (hx < hy ? hx : hy);
    };
    this.hs = 0;
    for (const s of starts) {
      const n = s.node;
      if (st[n] === open && gc[n] <= s.cost) continue;
      gc[n] = s.cost;
      from[n] = FROM_START;
      st[n] = open;
      const cell = n % N;
      const x = cell % nx;
      this.push(n, s.cost + H(x, (cell - x) / nx));
    }
    let best = Infinity;
    let bestNode = -1;
    let pops = 0;
    let flood = Math.max(FLOOD_AFTER, (N * L) >> 4);
    while (this.hs > 0) {
      const f = this.hk[0];
      if (f >= best) break;
      const n = this.pop();
      if (st[n] === closed) continue;
      st[n] = closed;
      if ((++pops & 4095) === 0) {
        if (performance.now() > this.deadline) {
          this.timedOut = true;
          return null;
        }
        // long searches: give up early when no target is reachable at all
        if (pops >= flood && bestNode < 0) {
          if (!this.reachable(net, c, hard, hardV, sid, targets.keys())) return null;
          flood = Infinity;
        }
      }
      const g0 = gc[n];
      if (ts[n] === sid) {
        const total = g0 + targets.get(n)!.cost;
        if (total < best) {
          best = total;
          bestNode = n;
        }
      }
      const li = (n / N) | 0;
      const cell = n - li * N;
      const x = cell % nx, y = (cell - x) / nx;
      const grid = hard[c * L + li];
      const cgrid = cost[c * L + li];
      const d0 = from[n];
      const base = li * N;
      for (let d = 0; d < 8; d++) {
        let t = 0;
        if (d0 < 8) {
          let diff = d > d0 ? d - d0 : d0 - d;
          if (diff > 4) diff = 8 - diff;
          if (diff === 4) continue;
          t = turn[diff];
        }
        const x2 = x + DX[d], y2 = y + DY[d];
        if (x2 < 0 || y2 < 0 || x2 >= nx || y2 >= ny) continue;
        const c2 = cell + DX[d] + DY[d] * nx;
        const o = grid[c2];
        if (o !== FREE && o !== net) continue;
        let step = 1;
        if (d & 1) {
          const oa = grid[cell + DX[d]], ob = grid[cell + DY[d] * nx];
          if (oa !== FREE && oa !== net && ob !== FREE && ob !== net) continue;
          step = Math.SQRT2;
        }
        let ng = g0 + step * pref[li * 8 + d] + t;
        if (soft) {
          const o2 = cgrid[c2];
          if (o2 !== FREE && o2 !== net) ng += RIP_PENALTY;
        }
        const m = base + c2;
        const sm = st[m];
        if (sm === closed || (sm === open && ng >= gc[m])) continue;
        gc[m] = ng;
        from[m] = d;
        st[m] = open;
        this.push(m, ng + H(x2, y2));
      }
      if (L === 2 && d0 !== FROM_VIA && hardV) {
        const vo = hardV[cell];
        const l2 = 1 - li;
        const o = hard[c * L + l2][cell];
        if ((vo === FREE || vo === net) && (o === FREE || o === net)) {
          let ng = g0 + this.viaCost;
          if (soft) {
            const a = costV![cell], b = cost[c * L + l2][cell];
            if ((a !== FREE && a !== net) || (b !== FREE && b !== net)) ng += RIP_PENALTY;
          }
          const m = l2 * N + cell;
          const sm = st[m];
          if (sm !== closed && !(sm === open && ng >= gc[m])) {
            gc[m] = ng;
            from[m] = FROM_VIA;
            st[m] = open;
            this.push(m, ng + H(x, y));
          }
        }
      }
    }
    if (bestNode < 0) return null;
    const path: number[] = [];
    let n = bestNode;
    for (let guard = 0; guard <= N * L; guard++) {
      path.push(n);
      const code = from[n];
      if (code === FROM_START) break;
      if (code === FROM_VIA) n = n < N ? n + N : n - N;
      else n -= DX[code] + DY[code] * nx;
    }
    return path.reverse();
  }
}

// ---- router ---------------------------------------------------------------------------------

interface Conn {
  name: string;
  net: number;
  power: boolean;
  a: Pt;
  b: Pt;
  ia: number;
  ib: number;
  len: number;
}

interface Route {
  conn: number;
  net: number;
  tracks: TrackItem[];
  vias: ViaItem[];
  cu: Cu[];
  /** union-find nodes of same net copper the route touches */
  touches: number[];
}

export function autoroute(doc: Doc, opts: AutorouteOptions = {}, onProgress?: (done: number, total: number) => void): AutorouteResult {
  const deadline = performance.now() + (opts.timeLimitMs ?? 20000);
  const rules = doc.pcb?.rules ?? defaultRules();
  const ids = copperLayers(doc);
  const sides: CopperSide[] = [];
  if (rules.copperLayers === 1) {
    if (ids.bottom) sides.push('bottom');
    else if (ids.top) sides.push('top');
  } else {
    if (ids.top) sides.push('top');
    if (ids.bottom) sides.push('bottom');
  }
  const layerIds = sides.map((s) => ids[s]!);
  const bitOf = (s: CopperSide) => (s === 'top' ? 1 : 2);

  const conn = computePcbConnectivity(doc);
  const only = opts.nets ? new Set(opts.nets) : undefined;
  const rats = ratsnest(doc, conn).filter((r) => !only || only.has(r.net));
  const fail = (list: { net: string; a: Pt; b: Pt }[]) => list.map(({ net, a, b }) => ({ net, a, b }));
  if (!rats.length || !sides.length || doc.width <= 0 || doc.height <= 0) return { tracks: [], vias: [], routed: 0, failed: fail(rats) };

  // nets and static copper
  const netIds = new Map<string, number>();
  const netId = (name: string) => {
    let i = netIds.get(name);
    if (i === undefined) netIds.set(name, (i = netIds.size));
    return i;
  };
  let pseudo = 0x40000000;
  const statics: Cu[] = [];
  const byNet = new Map<number, Cu[]>();
  const at = new Map<string, number[]>();
  const key = (p: Pt) => `${p.x},${p.y}`;
  let islands = 0;
  conn.objects.forEach((o, i) => {
    if (!o.shape) return;
    const name = o.kind === 'pad' ? o.net : (conn.netOfItem.get(o.itemId) ?? o.net);
    const net = name ? netId(name) : pseudo++;
    let sb = 0;
    for (const s of o.sides) sb |= bitOf(s);
    const anchor = o.kind === 'pad' ? shapeCentroid(o.shape) : o.kind === 'via' ? o.shape.pts[0] : undefined;
    const cu = makeCu(o.shape, sb, net, conn.island[i], anchor);
    statics.push(cu);
    if (name) (byNet.get(net) ?? byNet.set(net, []).get(net)!).push(cu);
    islands = Math.max(islands, conn.island[i] + 1);
    for (const p of o.kind === 'pad' ? [shapeCentroid(o.shape)] : o.shape.pts) (at.get(key(p)) ?? at.set(key(p), []).get(key(p))!).push(conn.island[i]);
  });
  for (const it of doc.items) {
    if (it.kind !== 'footprint') continue;
    for (const pad of it.footprint.pads) {
      const d = pad.npth ? (pad.drill ?? Math.min(pad.w, pad.h)) : 0;
      if (d > 0) statics.push(makeCu({ pts: [footprintToWorld(it, pad)], r: d / 2 }, 3, BLOCK, -1));
    }
  }
  const islandOf = (p: Pt, net: string) => {
    const list = at.get(key(p)) ?? [];
    return list.find((k) => conn.islandNets.get(k)?.has(net)) ?? list[0] ?? -1;
  };

  const conns: Conn[] = rats.map((r) => ({
    name: r.net,
    net: netId(r.net),
    power: isPowerNet(r.net),
    a: r.a,
    b: r.b,
    ia: islandOf(r.a, r.net),
    ib: islandOf(r.b, r.net),
    len: Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y),
  }));
  const nConn = conns.length;

  // grid
  let g = opts.grid && opts.grid > 0 ? opts.grid : mm(0.254);
  while ((Math.floor(doc.width / g) + 1) * (Math.floor(doc.height / g) + 1) > MAX_CELLS) g *= 1.25;
  const signalW = rules.trackWidth;
  const powerW = trackWidthFor(doc, 'GND');
  const widths = Math.abs(signalW - powerW) < 1e-9 ? [signalW] : [signalW, powerW];
  const classOf = (power: boolean) => (power && widths.length > 1 ? 1 : 0);
  const grid = new Grid(doc, rules, g, sides.map(bitOf), widths, { viaCost: opts.viaCost ?? 12, bendCost: opts.bendCost ?? 2, deadline });
  for (const cu of statics) grid.mark(cu, grid.sT, grid.sV);
  grid.resetFull();
  grid.initLocked();
  const { N, L, nx } = grid;

  const routes: (Route | null)[] = new Array(nConn).fill(null);
  const uf = new UnionFind(islands + nConn);
  /** rip-ups per connection; routes ripped maxRips times are locked */
  const maxRips = Math.max(1, opts.maxPasses ?? 3) - 1;
  const rips = new Int32Array(nConn);
  const rebuild = () => {
    grid.resetFull();
    grid.initLocked();
    uf.reset();
    routes.forEach((r) => {
      if (!r) return;
      const locked = maxRips > 0 && rips[r.conn] >= maxRips;
      for (const cu of r.cu) {
        grid.mark(cu, grid.fT, grid.fV);
        if (locked) grid.mark(cu, grid.lT, grid.lV);
      }
      for (const t of r.touches) uf.union(islands + r.conn, t);
    });
  };
  const satisfied = (k: number) => conns[k].ia >= 0 && conns[k].ib >= 0 && uf.find(conns[k].ia) === uf.find(conns[k].ib);

  /** copper of the union-find group `root` (net `net`) */
  const group = (net: number, root: number): Cu[] => {
    const out = (byNet.get(net) ?? []).filter((cu) => uf.find(cu.node) === root);
    for (const r of routes) if (r && r.net === net && uf.find(islands + r.conn) === root) out.push(...r.cu);
    return out;
  };

  /** foreign copper for exact checks */
  const obstacles = (net: number): Cu[] => {
    const out = statics.filter((cu) => cu.net !== net);
    for (const r of routes) if (r && r.net !== net) out.push(...r.cu);
    return out;
  };

  const cr = Math.max(0, Math.min(doc.pcb?.cornerRadius ?? 0, doc.width / 2, doc.height / 2));
  const edgeOk = (p: Pt, r: number) => -boardSdf(doc.width, doc.height, cr, p.x, p.y) - r >= rules.edgeClearance + SAFE;

  /** exact clearance check of one piece of copper against foreign copper */
  const clean = (shape: CopperShape, sides: number, obs: Cu[]): boolean => {
    const b = copperShapeBounds(shape);
    const m = rules.clearance;
    for (const cu of obs) {
      if (!(cu.sides & sides) || cu.x1 > b.x + b.w + m || cu.x2 < b.x - m || cu.y1 > b.y + b.h + m || cu.y2 < b.y - m) continue;
      if (shapeGap(shape, cu.shape) < rules.clearance + SAFE) return false;
    }
    return shape.pts.every((p) => edgeOk(p, shape.r));
  };

  const cellPt = (n: number): Pt => {
    const cell = n % N;
    const x = cell % nx;
    return { x: x * g, y: ((cell - x) / nx) * g };
  };

  interface Geo {
    runs: { li: number; pts: Pt[] }[];
    vias: Pt[];
  }

  const geometry = (path: number[], sa: Attach, ta: Attach, useA: boolean, useB: boolean): Geo => {
    const runs: Geo['runs'] = [];
    const vias: Pt[] = [];
    for (const n of path) {
      const li = (n / N) | 0;
      const p = cellPt(n);
      if (!runs.length || runs[runs.length - 1].li !== li) {
        if (runs.length) vias.push(p);
        runs.push({ li, pts: [] });
      }
      runs[runs.length - 1].pts.push(p);
    }
    if (useA) runs[0].pts.unshift({ x: sa.ax, y: sa.ay });
    if (useB) runs[runs.length - 1].pts.push({ x: ta.ax, y: ta.ay });
    for (const r of runs) r.pts = simplify(r.pts);
    return { runs, vias };
  };

  /** Route connection k with tracks of class c; null when no clean path exists. */
  const routeOne = (k: number, c: number): Route | null => {
    const cn = conns[k];
    if (cn.ia < 0 || cn.ib < 0) return null;
    const w = widths[c];
    const ga = group(cn.net, uf.find(cn.ia));
    const gb = group(cn.net, uf.find(cn.ib));
    const banA = new Set<number>(), banB = new Set<number>();
    const restore: [Int32Array, number, number][] = [];
    const done = (r: Route | null) => {
      for (const [a, i, v] of restore) a[i] = v;
      return r;
    };
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const A = grid.attach(ga, cn.net, c, grid.fT, banA);
      const B = grid.attach(gb, cn.net, c, grid.fT, banB);
      if (!A.size || !B.size) return done(null);
      // search towards the more compact island: tighter heuristic
      const swap = spread(A, N, nx) < spread(B, N, nx);
      const S = swap ? B : A, T = swap ? A : B;
      const banS = swap ? banB : banA, banT = swap ? banA : banB;
      const path = grid.search(cn.net, c, S.values(), T, false);
      if (!path) return done(null);
      const sa = S.get(path[0])!;
      const ta = T.get(path[path.length - 1])!;
      const obs = obstacles(cn.net);
      let useA = true, useB = true;
      for (let fix = 0; fix < 3; fix++) {
        const geo = geometry(path, sa, ta, useA, useB);
        const bad = verify(geo, w, obs);
        if (!bad) {
          smooth(geo, w, obs);
          return done(makeRoute(k, cn, geo, w));
        }
        const runs = geo.runs;
        const first = bad.run === 0 && bad.seg === 0 && useA;
        const last = bad.run === runs.length - 1 && bad.seg === runs[bad.run].pts.length - 2 && useB;
        if (first || last) {
          // drop the straight piece to the anchor when the cell itself is on the copper
          const att = first ? sa : ta;
          const node = first ? path[0] : path[path.length - 1];
          const p = cellPt(node);
          if (gapAt(p.x, p.y, att.cu.shape) < w / 2 - TOUCH) {
            if (first) useA = false;
            else useB = false;
            continue;
          }
          (first ? banS : banT).add(node);
        } else if (bad.via >= 0) {
          const p = geo.vias[bad.via];
          blockCell(Math.round(p.x / g) + Math.round(p.y / g) * nx, restore, true);
        } else {
          const r = runs[bad.run];
          const p = r.pts[bad.seg], q = r.pts[bad.seg + 1];
          const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / g));
          for (let s = 0; s <= steps; s++) {
            const x = p.x + ((q.x - p.x) * s) / steps, y = p.y + ((q.y - p.y) * s) / steps;
            blockCell(Math.round(x / g) + Math.round(y / g) * nx, restore, false, r.li, c);
          }
        }
        break;
      }
    }
    return done(null);
  };

  const blockCell = (cell: number, restore: [Int32Array, number, number][], via: boolean, li = 0, c = 0) => {
    if (cell < 0 || cell >= N) return;
    const arrs = via ? (grid.fV ? [grid.fV] : []) : [grid.fT[c * L + li]];
    for (const a of arrs) {
      restore.push([a, cell, a[cell]]);
      a[cell] = BLOCK;
    }
  };

  const verify = (geo: Geo, w: number, obs: Cu[]): { run: number; seg: number; via: number } | undefined => {
    for (let r = 0; r < geo.runs.length; r++) {
      const { li, pts } = geo.runs[r];
      for (let s = 0; s + 1 < pts.length; s++) {
        if (!clean({ pts: [pts[s], pts[s + 1]], r: w / 2 }, grid.bits[li], obs)) return { run: r, seg: s, via: -1 };
      }
    }
    for (let v = 0; v < geo.vias.length; v++) {
      if (!clean({ pts: [geo.vias[v]], r: rules.viaDiameter / 2 }, 3, obs)) return { run: -1, seg: -1, via: v };
    }
    return undefined;
  };

  /** Removes small kinks (off-grid pad centres, grid rounding) where the straight piece is clean. */
  const smooth = (geo: Geo, w: number, obs: Cu[]) => {
    for (const run of geo.runs) {
      const p = run.pts;
      for (let i = 1; i + 1 < p.length; ) {
        const a = p[i - 1], b = p[i], c = p[i + 1];
        const kink = Math.min(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - b.x, c.y - b.y)) <= 1.5 * g && segDist(b.x, b.y, a.x, a.y, c.x, c.y) <= 0.5 * g;
        if (kink && clean({ pts: [a, c], r: w / 2 }, grid.bits[run.li], obs)) {
          p.splice(i, 1);
          if (i > 1) i--;
        } else i++;
      }
      run.pts = simplify(p);
    }
  };

  const makeRoute = (k: number, cn: Conn, geo: Geo, w: number): Route => {
    const node = islands + k;
    const tracks: TrackItem[] = [];
    const cu: Cu[] = [];
    for (const { li, pts } of geo.runs) {
      for (let s = 0; s + 1 < pts.length; s++) {
        const t: TrackItem = { id: uid(), kind: 'track', layer: layerIds[li], x1: pts[s].x, y1: pts[s].y, x2: pts[s + 1].x, y2: pts[s + 1].y, width: w, net: cn.name };
        tracks.push(t);
        cu.push(makeCu(trackShape(t), grid.bits[li], cn.net, node));
      }
    }
    const vias = geo.vias.map((p): ViaItem => {
      const v: ViaItem = { id: uid(), kind: 'via', layer: ids.top ?? layerIds[0], x: p.x, y: p.y, diameter: rules.viaDiameter, drill: rules.viaDrill, net: cn.name };
      cu.push(makeCu(viaShape(v), 3, cn.net, node, p));
      return v;
    });
    // same net copper the new copper touches joins its group
    const own = [...(byNet.get(cn.net) ?? [])];
    for (const r of routes) if (r && r.net === cn.net) own.push(...r.cu);
    const touches = new Set<number>();
    for (const a of cu) {
      for (const b of own) {
        if (touches.has(b.node) || !(a.sides & b.sides) || b.x1 > a.x2 + TOUCH || b.x2 < a.x1 - TOUCH || b.y1 > a.y2 + TOUCH || b.y2 < a.y1 - TOUCH) continue;
        if (shapeGap(a.shape, b.shape) <= TOUCH) touches.add(b.node);
      }
    }
    return { conn: k, net: cn.net, tracks, vias, cu, touches: [...touches] };
  };

  const commit = (r: Route) => {
    routes[r.conn] = r;
    const locked = maxRips > 0 && rips[r.conn] >= maxRips;
    for (const cu of r.cu) {
      grid.mark(cu, grid.fT, grid.fV);
      if (locked) grid.mark(cu, grid.lT, grid.lV);
    }
    for (const t of r.touches) uf.union(islands + r.conn, t);
  };

  /** Routes in the way of connection k (from a search that may cross routes that are not locked yet). */
  const blockers = (k: number): Set<number> | null => {
    const cn = conns[k];
    if (cn.ia < 0 || cn.ib < 0) return null;
    const c = classOf(cn.power);
    const none = new Set<number>();
    const A = grid.attach(group(cn.net, uf.find(cn.ia)), cn.net, c, grid.lT, none);
    const B = grid.attach(group(cn.net, uf.find(cn.ib)), cn.net, c, grid.lT, none);
    if (!A.size || !B.size) return null;
    const path = grid.search(cn.net, c, A.values(), B, true);
    if (!path) return null;
    const out = new Set<number>();
    const tv = grid.viaThr();
    const hit = (p: Pt, bits: number, thr: (cu: Cu) => number) => {
      for (const r of routes) {
        if (!r || r.net === cn.net || out.has(r.conn) || rips[r.conn] >= maxRips) continue;
        if (r.cu.some((cu) => (cu.sides & bits) !== 0 && gapAt(p.x, p.y, cu.shape) < thr(cu))) out.add(r.conn);
      }
    };
    path.forEach((n, i) => {
      const li = (n / N) | 0;
      const cell = n - li * N;
      const p = cellPt(n);
      const o = grid.fT[c * L + li][cell];
      if (o !== FREE && o !== cn.net) hit(p, grid.bits[li], (cu) => grid.thr(c, cu.shape.r));
      if (i > 0 && path[i - 1] % N === cell) {
        const v = grid.fV?.[cell] ?? FREE;
        if (v !== FREE && v !== cn.net) hit(p, 3, () => tv);
      }
    });
    return out;
  };

  // order: supply nets first (wide tracks), then shortest first
  const order = conns.map((_, k) => k).sort((p, q) => Number(conns[q].power) - Number(conns[p].power) || conns[p].len - conns[q].len);
  const routeAny = (k: number) => {
    const c = classOf(conns[k].power);
    return routeOne(k, c) ?? (c > 0 && !grid.timedOut ? routeOne(k, 0) : null);
  };
  const countSatisfied = () => conns.reduce((s, _, k) => s + Number(satisfied(k)), 0);
  const expired = () => grid.timedOut || (grid.timedOut = performance.now() > deadline);
  let done = 0;
  let total = nConn;

  /**
   * Rip-up and reroute for a failed connection k: remove the routes in its
   * way, route k, reroute the removed ones. Kept only when more connections
   * are routed than before, otherwise rolled back.
   */
  const ripUp = (k: number): boolean => {
    const b = blockers(k);
    if (!b?.size) return false;
    const before = countSatisfied();
    const saved = routes.slice();
    const savedRips = rips.slice();
    const removed = [...b];
    for (const j of b) {
      routes[j] = null;
      rips[j]++;
    }
    // routes that hung on ripped copper of their net
    for (let changed = true; changed; ) {
      rebuild();
      changed = false;
      for (const rt of routes) {
        if (rt && !satisfied(rt.conn)) {
          routes[rt.conn] = null;
          removed.push(rt.conn);
          changed = true;
        }
      }
    }
    const r = routeAny(k);
    if (r) {
      commit(r);
      removed.sort((p, q) => conns[p].len - conns[q].len);
      for (const j of removed) {
        if (expired()) break;
        if (satisfied(j)) continue;
        const rj = routeAny(j);
        if (!rj) break;
        commit(rj);
      }
      if (countSatisfied() > before) return true;
    }
    routes.splice(0, nConn, ...saved);
    rips.set(savedRips);
    rebuild();
    return false;
  };

  // a failing connection rips up the routes in its way right away; later
  // passes retry what is left (space may have been freed meanwhile)
  for (let pass = 0; pass < maxRips + 1 && !grid.timedOut; pass++) {
    const pending = order.filter((k) => !satisfied(k));
    if (pass > 0) total += pending.length;
    let gained = false;
    for (const k of pending) {
      if (expired()) break;
      if (!satisfied(k)) {
        const r = routeAny(k);
        if (r) commit(r);
        if (r || (maxRips > 0 && !expired() && ripUp(k))) gained = true;
      }
      onProgress?.(++done, total);
    }
    if (!gained) break;
  }
  onProgress?.(total, total);

  const result: AutorouteResult = { tracks: [], vias: [], routed: 0, failed: [] };
  for (const r of routes) {
    if (!r) continue;
    result.tracks.push(...r.tracks);
    result.vias.push(...r.vias);
  }
  conns.forEach((cn, k) => {
    if (satisfied(k)) result.routed++;
    else result.failed.push({ net: cn.name, a: cn.a, b: cn.b });
  });
  return result;
}

/** Bounding box area (in cells) of a node set. */
function spread(m: Map<number, Attach>, N: number, nx: number): number {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of m.keys()) {
    const cell = n % N;
    const x = cell % nx, y = (cell - x) / nx;
    x1 = Math.min(x1, x);
    x2 = Math.max(x2, x);
    y1 = Math.min(y1, y);
    y2 = Math.max(y2, y);
  }
  return (x2 - x1 + 1) * (y2 - y1 + 1);
}
