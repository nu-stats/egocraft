// Files exported by other programs, read into EgoCraft's three tables. Each
// reader follows the program's published description of its export format
// (see each file); none is based on another program's code.

import { unzipSync } from 'fflate';
import { booleansToNumbers, codesToMissing, egoNet, egoWeb, eNet, networkCanvasCsv } from './exports.ts';
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
  read: (files: InFile[], o: ReadOptions) => ThreeTables;
}

export interface ReadOptions {
  /** Answers that mean missing (don't know, refused …), made empty everywhere but in ID columns. */
  missingCodes: string[];
}

/** The codes typed for "missing", applied to any format (EgoWeb's reader applies them itself). */
function withMissing(t: ThreeTables, codes: string[]): ThreeTables {
  if (!codes.length || t.notes.some((n) => n.startsWith('These codes were made missing'))) return t;
  const ids = ['ego_id', 'alter_id', 'alter_a', 'alter_b', 'nodeID', 'from', 'to', 'networkCanvasEgoUUID', 'egoID', 'alterID', 'Source', 'Target', 'ID'];
  return {
    egos: codesToMissing(t.egos, codes, ids),
    alters: codesToMissing(t.alters, codes, ids),
    ties: t.ties ? codesToMissing(t.ties, codes, ids) : null,
    notes: [...t.notes, `These codes were made missing: ${codes.join(', ')}.`],
  };
}

export function readOther(format: OtherFormat, files: InFile[], o: ReadOptions): ThreeTables {
  return withMissing(format.read(expandZips(files), o), o.missingCodes);
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
    read: (files) => {
      const t = graphmlToTables(files.filter((f) => /\.(graphml|xml)$/i.test(f.name)).map((f) => ({ name: f.name, text: decode(f.bytes) })));
      return { ...t, egos: booleansToNumbers(t.egos), alters: booleansToNumbers(t.alters), ties: t.ties ? booleansToNumbers(t.ties) : null };
    },
  },
  {
    id: 'networkCanvas',
    title: 'Network Canvas (CSV export)',
    text: 'The CSV files Network Canvas exports for each interview: …_ego.csv, …_attributeList_<type>.csv and …_edgeList_<type>.csv. Choose all of them, or the ZIP files. (For its GraphML export, choose GraphML.)',
    accept: '.csv,.zip',
    read: (files) => networkCanvasCsv(files),
  },
  {
    id: 'egoWeb',
    title: 'EgoWeb 2.0',
    text: 'The ego-alter file (Data Processing ▸ Export Ego-Alter Data) and, for ties, the alter-pair file (Export Alter-Pair Data). Type the study’s missing-data codes below so they become missing.',
    accept: '.csv,.zip',
    read: (files, o) => egoWeb(files, o.missingCodes),
  },
  {
    id: 'egoNet',
    title: 'EgoNet',
    text: 'An ego file (egoID), and an alter file (alterID) and an edge file (Source, Target) for each ego. Choose the ZIP of the folder, or all the files. EgoNet’s export has no public description, so this follows the layout documented by the egor package.',
    accept: '.csv,.txt,.zip',
    read: (files) => egoNet(files),
  },
  {
    id: 'eNet',
    title: 'E-Net (row-wise file)',
    text: 'One text file with *ego data, *alter data and *alter-alter data sections. (E-Net’s column-wise Excel layout is the “One wide file” layout above.)',
    accept: '.vna,.txt,.dat',
    read: (files) => eNet(files),
  },
];
