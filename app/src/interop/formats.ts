// Files exported by other programs, read into EgoCraft's three tables. Each
// reader follows the program's published description of its export format
// (see each file); none is based on another program's code.

import { unzipSync } from 'fflate';
import type { ThreeTables } from './graphml.ts';
import { graphmlToTables } from './graphml.ts';

export type { ThreeTables } from './graphml.ts';

export interface InFile {
  name: string;
  bytes: Uint8Array;
}

export interface OtherFormat {
  id: string;
  title: string;
  text: string;
  /** For the file picker. */
  accept: string;
  read: (files: InFile[]) => Promise<ThreeTables> | ThreeTables;
}

const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');

/** ZIP files are opened and their files used as if chosen one by one (folders inside are ignored). */
export function expandZips(files: InFile[]): InFile[] {
  const out: InFile[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push(f);
      continue;
    }
    let inner: Record<string, Uint8Array>;
    try {
      inner = unzipSync(f.bytes);
    } catch {
      throw new Error(`${f.name} could not be opened as a ZIP file.`);
    }
    for (const [path, bytes] of Object.entries(inner)) {
      const name = path.replace(/^.*\//, '');
      if (!name || path.endsWith('/') || name.startsWith('.') || path.startsWith('__MACOSX/')) continue;
      out.push({ name, bytes });
    }
  }
  return out;
}

export const OTHER_FORMATS: OtherFormat[] = [
  {
    id: 'graphml',
    title: 'GraphML',
    text: 'One <graph> per person interviewed (in one file or one file each). Graph attributes are the ego’s variables, nodes the alters, edges the alter–alter ties; a node marked as the ego is taken out.',
    accept: '.graphml,.xml,.zip',
    read: (files) => graphmlToTables(expandZips(files).filter((f) => /\.(graphml|xml)$/i.test(f.name)).map((f) => ({ name: f.name, text: decode(f.bytes) }))),
  },
];
