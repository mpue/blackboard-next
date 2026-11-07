// Minimal, dependency free XML reader/writer. The legacy BlackBoard files are
// produced by JAXB, so we only need elements, attributes, text, comments,
// processing instructions and CDATA. Works identically in Node and the browser.

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') {
      const end = src.indexOf('>', lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) throw new Error('Unterminated tag at ' + lt);
    if (src[lt + 1] === '/') {
      const name = src.slice(lt + 2, gt).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new Error(`Mismatched closing tag </${name}>`);
      i = gt + 1;
      continue;
    }
    let body = src.slice(lt + 1, gt);
    const selfClosing = body.endsWith('/');
    if (selfClosing) body = body.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(body);
    if (!m) throw new Error('Invalid tag at ' + lt);
    const node: XmlNode = { name: m[1], attrs: {}, children: [], text: '' };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = body.slice(m[1].length);
    while ((a = attrRe.exec(rest))) node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }
  const doc = root.children[0];
  if (!doc) throw new Error('Empty XML document');
  return doc;
}

// ---- convenience accessors -------------------------------------------------

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

export function text(node: XmlNode | undefined, name: string, fallback = ''): string {
  const c = child(node, name);
  return c ? c.text.trim() : fallback;
}

export function rawText(node: XmlNode | undefined, name: string): string | undefined {
  return child(node, name)?.text;
}

export function num(node: XmlNode | undefined, name: string, fallback = 0): number {
  const c = child(node, name);
  if (!c) return fallback;
  const v = parseFloat(c.text);
  return Number.isFinite(v) ? v : fallback;
}

export function bool(node: XmlNode | undefined, name: string, fallback = false): boolean {
  const c = child(node, name);
  return c ? c.text.trim() === 'true' : fallback;
}

// ---- writer ----------------------------------------------------------------

/** Tiny builder producing indented XML similar to JAXB's formatted output. */
export class XmlWriter {
  private out: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  private depth = 0;

  open(name: string, attrs?: Record<string, string>): this {
    this.out.push(`${this.pad()}<${name}${fmtAttrs(attrs)}>`);
    this.depth++;
    return this;
  }

  close(name: string): this {
    this.depth--;
    this.out.push(`${this.pad()}</${name}>`);
    return this;
  }

  leaf(name: string, value: string | number | boolean | undefined | null, attrs?: Record<string, string>): this {
    if (value === undefined || value === null) return this;
    this.out.push(`${this.pad()}<${name}${fmtAttrs(attrs)}>${escapeXml(String(value))}</${name}>`);
    return this;
  }

  /** JAXB writes floats with at least one decimal ("2.0"). */
  float(name: string, value: number | undefined): this {
    if (value === undefined) return this;
    return this.leaf(name, Number.isInteger(value) ? value.toFixed(1) : String(value));
  }

  toString(): string {
    return this.out.join('\n') + '\n';
  }

  private pad(): string {
    return '    '.repeat(this.depth);
  }
}

function fmtAttrs(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
}
