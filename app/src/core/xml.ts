// From QualCraft (nu-stats/qualcraft, MIT OR Apache-2.0).
// XML in and out, the same in Node and the browser (via @xmldom/xmldom).

import { DOMParser } from '@xmldom/xmldom';

// Characters XML 1.0 can't carry, even escaped.
// eslint-disable-next-line no-control-regex
const INVALID = /[^\u0009\u000A\u000D -퟿-�\uD800-􏰀-\uDFFF]/g;

export function escapeText(s: string): string {
  return s.replace(INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

/** Builds indented XML text. Attributes with undefined values are left out. */
export class XmlWriter {
  private parts: string[] = ['<?xml version="1.0" encoding="utf-8"?>\n'];
  private depth = 0;
  private stack: string[] = [];

  private attrs(a: Record<string, string | number | boolean | undefined>): string {
    let out = '';
    for (const [k, v] of Object.entries(a)) if (v !== undefined) out += ` ${k}="${escapeAttr(String(v))}"`;
    return out;
  }

  open(name: string, a: Record<string, string | number | boolean | undefined> = {}): this {
    this.parts.push(`${'  '.repeat(this.depth)}<${name}${this.attrs(a)}>\n`);
    this.stack.push(name);
    this.depth++;
    return this;
  }

  close(): this {
    const name = this.stack.pop();
    this.depth--;
    this.parts.push(`${'  '.repeat(this.depth)}</${name}>\n`);
    return this;
  }

  empty(name: string, a: Record<string, string | number | boolean | undefined> = {}): this {
    this.parts.push(`${'  '.repeat(this.depth)}<${name}${this.attrs(a)}/>\n`);
    return this;
  }

  /** <name>text</name>, text kept exactly (no indentation inside). */
  text(name: string, value: string, a: Record<string, string | number | boolean | undefined> = {}): this {
    this.parts.push(`${'  '.repeat(this.depth)}<${name}${this.attrs(a)}>${escapeText(value)}</${name}>\n`);
    return this;
  }

  toString(): string {
    return this.parts.join('');
  }
}

export type XmlElement = Element;

export function parseXml(xml: string, what = 'file'): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') errors.push(msg);
    },
  }).parseFromString(xml.replace(/^﻿/, ''), 'text/xml') as unknown as Document;
  if (errors.length || !doc.documentElement) {
    throw new Error(`The ${what} is not valid XML${errors[0] ? `: ${errors[0].split('\n')[0]}` : '.'}`);
  }
  return doc;
}

/** Element children, optionally only those with this local name. */
export function kids(el: Element | null | undefined, localName?: string): Element[] {
  const out: Element[] = [];
  if (!el) return out;
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!localName || (n as Element).localName === localName)) out.push(n as Element);
  }
  return out;
}

export function kid(el: Element | null | undefined, localName: string): Element | undefined {
  return kids(el, localName)[0];
}

export function textOf(el: Element | null | undefined): string {
  return el?.textContent ?? '';
}

export function attr(el: Element | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v === null || v === '' ? (el.hasAttribute(name) ? '' : undefined) : v;
}
