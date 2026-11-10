// S-expressions as used by KiCad files: nested lists of symbols, numbers and
// quoted strings with C style escapes. Atoms are kept as (unescaped) strings and
// converted on access; the writer pretty prints with explicit quoting.

export type SExpr = string | SExpr[];

export class SexprError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, text: string, pos: number) {
    let line = 1;
    let start = 0;
    for (let i = 0; i < pos && i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        line++;
        start = i + 1;
      }
    }
    super(`${message} (line ${line}, column ${pos - start + 1})`);
    this.name = 'SexprError';
    this.line = line;
    this.column = pos - start + 1;
  }
}

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;
/** ( ) " and white space end a symbol */
const isDelim = (c: number) => c === 40 || c === 41 || c === 34 || isSpace(c);
const isOctal = (c: string | undefined) => c !== undefined && c >= '0' && c <= '7';
const isHex = (c: string | undefined) => c !== undefined && /^[0-9a-fA-F]$/.test(c);

const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v' };

/** All top level expressions of a text. Throws SexprError on unbalanced lists or unterminated strings. */
export function parseSexpr(text: string): SExpr[] {
  const top: SExpr[] = [];
  const stack: SExpr[][] = [top];
  const opened: number[] = [];
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (isSpace(c)) {
      i++;
    } else if (c === 40) {
      const list: SExpr[] = [];
      stack[stack.length - 1].push(list);
      stack.push(list);
      opened.push(i);
      i++;
    } else if (c === 41) {
      if (stack.length === 1) throw new SexprError('unexpected ")"', text, i);
      stack.pop();
      opened.pop();
      i++;
    } else if (c === 34) {
      let out = '';
      let j = i + 1;
      let run = j;
      for (;;) {
        if (j >= n) throw new SexprError('unterminated string', text, i);
        const ch = text[j];
        if (ch === '"') break;
        if (ch !== '\\') {
          j++;
          continue;
        }
        out += text.slice(run, j);
        const e = text[j + 1];
        if (e === undefined) throw new SexprError('unterminated string', text, i);
        if (e in ESCAPES) {
          out += ESCAPES[e];
          j += 2;
        } else if (e === 'x' && isHex(text[j + 2])) {
          let k = j + 2;
          while (k < j + 4 && isHex(text[k])) k++;
          out += String.fromCharCode(parseInt(text.slice(j + 2, k), 16));
          j = k;
        } else if (isOctal(e)) {
          let k = j + 1;
          while (k < j + 4 && isOctal(text[k])) k++;
          out += String.fromCharCode(parseInt(text.slice(j + 1, k), 8));
          j = k;
        } else {
          // unknown escape (e.g. an unescaped Windows path): kept literally
          out += '\\' + e;
          j += 2;
        }
        run = j;
      }
      out += text.slice(run, j);
      stack[stack.length - 1].push(out);
      i = j + 1;
    } else {
      let j = i + 1;
      while (j < n && !isDelim(text.charCodeAt(j))) j++;
      stack[stack.length - 1].push(text.slice(i, j));
      i = j;
    }
  }
  if (stack.length > 1) throw new SexprError('missing ")"', text, opened[opened.length - 1]);
  return top;
}

// ---- access ------------------------------------------------------------------------------

export const isList = (e: SExpr | undefined): e is SExpr[] => Array.isArray(e);

/** first atom of a list: its keyword */
export const head = (e: SExpr | undefined): string | undefined => (isList(e) && typeof e[0] === 'string' ? e[0] : undefined);

/** first child list with the given keyword */
export function find(list: SExpr[] | undefined, name: string): SExpr[] | undefined {
  if (!list) return undefined;
  for (const c of list) if (isList(c) && c[0] === name) return c;
  return undefined;
}

export function findAll(list: SExpr[] | undefined, name: string): SExpr[][] {
  return list ? list.filter((c): c is SExpr[] => isList(c) && c[0] === name) : [];
}

/** atom at idx (0 = keyword) */
export function str(list: SExpr[] | undefined, idx: number): string | undefined {
  const v = list?.[idx];
  return typeof v === 'string' ? v : undefined;
}

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** numeric atom at idx; undefined when missing or not a number */
export function num(list: SExpr[] | undefined, idx: number): number | undefined {
  const v = str(list, idx);
  return v !== undefined && NUMBER_RE.test(v) ? parseFloat(v) : undefined;
}

/** the atoms after the keyword */
export const atoms = (list: SExpr[] | undefined): string[] => (list ? list.slice(1).filter((c): c is string => typeof c === 'string') : []);

// ---- writing -----------------------------------------------------------------------------

export interface Quoted {
  q: string;
}
/** string = bare symbol, number = formatted number, { q } = quoted string */
export type SOut = string | number | Quoted | SOut[];

export const q = (s: string): Quoted => ({ q: s });

export function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
}

/** up to 6 decimals, no exponent, no trailing zeros */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) < 5e-7) return '0';
  const s = v.toFixed(6).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

function atom(e: Exclude<SOut, SOut[]>): string {
  if (typeof e === 'number') return fmtNum(e);
  if (typeof e === 'string') return e;
  return quote(e.q);
}

function flat(e: SOut): string {
  return Array.isArray(e) ? `(${e.map(flat).join(' ')})` : atom(e);
}

/** KiCad like layout: a list stays on one line when it fits, otherwise its child lists go on lines of their own. */
export function writeSexpr(e: SOut, width = 120, indent = ''): string {
  if (!Array.isArray(e)) return atom(e);
  const one = flat(e);
  if (indent.length + one.length <= width) return one;
  const inner = indent + '  ';
  let line = '(';
  let i = 0;
  // keyword and leading atoms on the first line
  for (; i < e.length && !Array.isArray(e[i]); i++) line += (i ? ' ' : '') + atom(e[i] as Exclude<SOut, SOut[]>);
  const rest = e.slice(i).map((c) => inner + writeSexpr(c, width, inner));
  return rest.length ? `${line}\n${rest.join('\n')}\n${indent})` : `${line})`;
}
