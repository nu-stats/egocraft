// Readers for other egocentric network programs' export files, written from
// their published documentation only (never their code):
//  - Network Canvas: the CSV export as described in its documentation
//    ("Data export", "Data dictionary"): per session an ego file, an
//    attribute list per node type and an edge list per edge type.
//  - EgoWeb 2.0: the "Export Ego-Alter Data" and "Export Alter-Pair Data"
//    files described on its Data Processing help page.
//  - EgoNet: no public description of its export exists; this reads the
//    layout the egor package documents for EgoNet data (an ego file and one
//    alter file and one edge file per ego).
//  - E-Net: the row-wise text file (*ego data, *alter data, *alter-alter
//    data) described by Halgin and Borgatti (2012). Its column-wise Excel
//    layout is EgoCraft's "one wide file".

import type { Cell, DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { parseCsv } from '../io/table.ts';
import type { InFile } from './formats.ts';
import type { ThreeTables } from './graphml.ts';

const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A CSV file (commas, semicolons or tabs) as header + text rows. */
function readTextTable(f: InFile): { columns: string[]; rows: string[][] } {
  const t = parseCsv(decode(f.bytes));
  return { columns: t.columns.map((c) => String(c).trim()), rows: t.rows.map((r) => r.map((v) => (v === null ? '' : String(v)))) };
}

/** Stack tables with different columns: the union of columns, in the order first seen. */
function stack(parts: { columns: string[]; rows: string[][]; extra?: Record<string, string> }[]): { columns: string[]; rows: string[][] } {
  const columns: string[] = [];
  for (const p of parts) for (const c of [...p.columns, ...Object.keys(p.extra ?? {})]) if (!columns.includes(c)) columns.push(c);
  const rows: string[][] = [];
  for (const p of parts) {
    const at = new Map(p.columns.map((c, j) => [c, j]));
    for (const r of p.rows) rows.push(columns.map((c) => (at.has(c) ? (r[at.get(c)!] ?? '') : (p.extra?.[c] ?? ''))));
  }
  return { columns, rows };
}

const toTable = (name: string, t: { columns: string[]; rows: string[][] }) => tableFromText(name, t.columns, t.rows);

/**
 * Columns whose answers are all true/false become 1/0 (Yes/No), as
 * Network Canvas and GraphML write yes/no answers and categorical options.
 */
export function booleansToNumbers(t: DataTable): DataTable {
  const flip = t.columns.map((c, j) => {
    let seen = false;
    for (const r of t.rows) {
      const v = r[j];
      if (v === null || v === undefined || String(v).trim() === '') continue;
      if (!/^(true|false)$/i.test(String(v).trim())) return false;
      seen = true;
    }
    return seen;
  });
  if (!flip.some(Boolean)) return t;
  return {
    ...t,
    columns: t.columns.map((c, j) => (flip[j] ? { ...c, kind: 'numeric' as const, valueLabels: { '1': 'Yes', '0': 'No' } } : c)),
    rows: t.rows.map((r) => r.map((v, j): Cell => (flip[j] && v !== null && String(v).trim() !== '' ? (/^true$/i.test(String(v).trim()) ? 1 : 0) : v))),
  };
}

/** Make the given codes missing everywhere except in ID columns (EgoWeb and others write missing, don't know and refused as codes the study chose). */
export function codesToMissing(t: DataTable, codes: string[], keep: string[]): DataTable {
  const set = new Set(codes.map((c) => c.trim()).filter(Boolean));
  if (!set.size) return t;
  const skip = new Set(keep);
  return { ...t, rows: t.rows.map((r) => r.map((v, j) => (!skip.has(t.columns[j]!.name) && v !== null && set.has(String(v).trim()) ? null : v))) };
}

// ---------- Network Canvas ----------

const NC_EGO = /_ego\.csv$/i;
const NC_NODES = /_attributeList_(.+)\.csv$/i;
const NC_EDGES = /_edgeList_(.+)\.csv$/i;

/** Network Canvas writes text starting with = + - @ with a leading apostrophe (so spreadsheets don't run it); take it off again. */
const ncText = (rows: string[][]) => rows.map((r) => r.map((v) => (/^'[=+\-@\t]/.test(v) ? v.slice(1) : v)));

export function networkCanvasCsv(files: InFile[]): ThreeTables {
  const egos: { columns: string[]; rows: string[][] }[] = [];
  const nodes: { columns: string[]; rows: string[][]; extra: Record<string, string> }[] = [];
  const edges: { columns: string[]; rows: string[][]; extra: Record<string, string> }[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!/\.csv$/i.test(f.name)) continue;
    const t = readTextTable(f);
    t.rows = ncText(t.rows);
    const n = NC_NODES.exec(f.name);
    const e = NC_EDGES.exec(f.name);
    if (NC_EGO.test(f.name)) egos.push(t);
    else if (n) nodes.push({ ...t, extra: { node_type: n[1]! } });
    else if (e) edges.push({ ...t, extra: { edge_type: e[1]! } });
    else skipped.push(f.name);
  }
  if (!egos.length || !nodes.length) throw new Error('These are not a Network Canvas CSV export: it needs the ego files (…_ego.csv) and the attribute lists (…_attributeList_<type>.csv). Choose all the files of the export, or the ZIP files.');
  const ego = stack(egos);
  const alters = stack(nodes);
  const ties = edges.length ? stack(edges) : null;
  const egoId = ego.columns.find((c) => key(c) === 'networkcanvasegouuid') ?? ego.columns.find((c) => key(c) === 'egoid');
  if (!egoId) throw new Error('The Network Canvas ego file has no networkCanvasEgoUUID (or ego_id) column.');
  const notes = [
    `Read ${ego.rows.length} interview${ego.rows.length === 1 ? '' : 's'} from a Network Canvas CSV export: ${alters.rows.length} people named (${[...new Set(nodes.map((p) => p.extra.node_type))].join(', ')})${ties ? ` and ${ties.rows.length} ties (${[...new Set(edges.map((p) => p.extra.edge_type))].join(', ')})` : ''}. Alters are matched to their interview by networkCanvasEgoUUID and to ties by nodeID.`,
    'Yes/no answers and the options of categorical questions (one true/false column per option) became 1/0. Network Canvas writes an unanswered categorical question as false in every option, so "none chosen" and "not answered" look the same.',
  ];
  if (alters.rows.some((r) => r.includes('ENCRYPTED')) || ego.rows.some((r) => r.includes('ENCRYPTED'))) notes.push('Some values are ENCRYPTED: Network Canvas anonymised those variables, and EgoCraft can’t read them.');
  if (skipped.length) notes.push(`Left out ${skipped.length} file${skipped.length === 1 ? '' : 's'} that aren’t part of the CSV export (${skipped.slice(0, 3).join(', ')}).`);
  return {
    egos: booleansToNumbers(toTable('Network Canvas (egos)', ego)),
    alters: booleansToNumbers(toTable('Network Canvas (alters)', alters)),
    ties: ties ? booleansToNumbers(toTable('Network Canvas (ties)', ties)) : null,
    notes,
  };
}

// ---------- EgoWeb 2.0 ----------

/** EgoWeb's ID columns under the names EgoCraft guesses; the original name stays as the label. */
const STANDARD: Record<string, string> = { egoid: 'ego_id', alternumber: 'alter_id', alter1number: 'alter_a', alter2number: 'alter_b' };

export function egoWeb(files: InFile[], missingCodes: string[]): ThreeTables {
  let egoAlter: { columns: string[]; rows: string[][] } | null = null;
  let pairs: { columns: string[]; rows: string[][] } | null = null;
  for (const f of files) {
    if (!/\.(csv|txt)$/i.test(f.name)) continue;
    const t = readTextTable(f);
    const k = t.columns.map(key);
    if (k.includes('alter1number') && k.includes('alter2number')) pairs = pairs ? stack([pairs, t]) : t;
    else if (k.includes('alternumber')) egoAlter = egoAlter ? stack([egoAlter, t]) : t;
  }
  if (!egoAlter) throw new Error('No EgoWeb ego-alter file was found (a CSV with an “Alter Number” column, from Data Processing ▸ Export Ego-Alter Data).');
  const k = egoAlter.columns.map(key);
  const egoCol = k.findIndex((c) => c === 'egoid');
  if (egoCol < 0) throw new Error('The EgoWeb ego-alter file has no EgoID column.');
  const alterNo = k.indexOf('alternumber');
  // Ego variables come before "Alter Number" and repeat on every alter's row; alter variables come from it on.
  const egoCols = egoAlter.columns.slice(0, alterNo);
  const seen = new Set<string>();
  const egoRows: string[][] = [];
  for (const r of egoAlter.rows) {
    const id = r[egoCol] ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    egoRows.push(r.slice(0, alterNo));
  }
  const alterCols = [egoAlter.columns[egoCol]!, ...egoAlter.columns.slice(alterNo)];
  const alterRows = egoAlter.rows.filter((r) => (r[alterNo] ?? '') !== '').map((r) => [r[egoCol] ?? '', ...r.slice(alterNo)]);
  let ties: DataTable | null = null;
  const notes = [`Read an EgoWeb ego-alter file: ${egoRows.length} egos and ${alterRows.length} alters (alter numbers count from 1 within each ego).`];
  if (pairs) {
    const pk = pairs.columns.map(key);
    const pEgo = pk.indexOf('egoid');
    if (pEgo < 0) notes.push('The alter-pair file has no EgoID column, so its ties could not be matched to egos; it was left out.');
    else {
      ties = toTable('EgoWeb (alter pairs)', pairs);
      notes.push(`Read an EgoWeb alter-pair file: ${pairs.rows.length} pairs, each listed once.`);
    }
  } else notes.push('No alter-pair file was chosen (Data Processing ▸ Export Alter-Pair Data), so there are no alter–alter ties.');
  if (missingCodes.length) notes.push(`These codes were made missing: ${missingCodes.join(', ')}.`);
  else notes.push('EgoWeb writes missing, don’t know and refused answers as codes the study chose (Missing Data Export Value Controls). Type those codes above so they become missing.');
  const rename = (t: DataTable): DataTable => ({ ...t, columns: t.columns.map((c) => ({ ...c, name: STANDARD[key(c.name)] ?? c.name, ...(STANDARD[key(c.name)] ? { label: c.name } : {}) })) });
  const ids = ['ego_id', 'alter_id', 'alter_a', 'alter_b'];
  return {
    egos: codesToMissing(rename(toTable('EgoWeb (egos)', { columns: egoCols, rows: egoRows })), missingCodes, ids),
    alters: codesToMissing(rename(toTable('EgoWeb (alters)', { columns: alterCols, rows: alterRows })), missingCodes, ids),
    ties: ties ? codesToMissing(rename(ties), missingCodes, ids) : null,
    notes,
  };
}

// ---------- EgoNet (the layout egor documents) ----------

export function egoNet(files: InFile[]): ThreeTables {
  const egoParts: { columns: string[]; rows: string[][] }[] = [];
  const alterParts: { columns: string[]; rows: string[][]; extra: Record<string, string> }[] = [];
  const edgeParts: { columns: string[]; rows: string[][]; extra: Record<string, string> }[] = [];
  for (const f of files) {
    if (!/\.(csv|txt)$/i.test(f.name)) continue;
    const t = readTextTable(f);
    const k = t.columns.map(key);
    const path = f.name.toLowerCase();
    const idFromName = /(\d+)(?=\.[a-z]+$)/.exec(f.name)?.[1] ?? '';
    const extra: Record<string, string> = k.includes('egoid') ? {} : { egoID: idFromName };
    if (k.includes('source') && k.includes('target')) edgeParts.push({ ...t, extra });
    else if (k.includes('alterid') || /(^|\/)alters?[_/]/.test(path)) alterParts.push({ ...t, extra });
    else if (k.includes('egoid')) egoParts.push(t);
  }
  if (!egoParts.length || !alterParts.length) throw new Error('These don’t look like EgoNet files: EgoCraft expects an ego file (with egoID) and alter files (with alterID), plus edge files (Source, Target) if there are ties. Choose the ZIP of the export folder, or all the files.');
  const alters = stack(alterParts);
  const edges = edgeParts.length ? stack(edgeParts) : null;
  return {
    egos: toTable('EgoNet (egos)', stack(egoParts)),
    alters: toTable('EgoNet (alters)', alters),
    ties: edges ? toTable('EgoNet (ties)', edges) : null,
    notes: [
      `Read ${egoParts.reduce((n, p) => n + p.rows.length, 0)} egos, ${alters.rows.length} alters from ${alterParts.length} alter file${alterParts.length === 1 ? '' : 's'}, and ${edges?.rows.length ?? 0} ties.`,
      'EgoNet’s export has no public description; this follows the layout the egor package documents for EgoNet data (egoID, alterID, Source, Target). Check the columns carefully, and tell the EgoCraft team if your files differ.',
    ],
  };
}

// ---------- E-Net row-wise text file ----------

/** Words separated by spaces or tabs; "double quotes" keep spaces inside a value. */
function words(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(line); m; m = re.exec(line)) out.push(m[1] ?? m[2]!);
  return out;
}

export function eNet(files: InFile[]): ThreeTables {
  const f = files.find((x) => /\.(vna|txt|dat)$/i.test(x.name)) ?? files[0];
  if (!f) throw new Error('Choose the E-Net data file (.vna or .txt).');
  const sections: Record<string, { columns: string[]; rows: string[][] }> = {};
  let current: string | null = null;
  for (const raw of decode(f.bytes).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('*')) {
      const name = key(line.slice(1));
      current = name.startsWith('egodata') ? 'ego' : name.startsWith('alteralterdata') || name.startsWith('alteralter') ? 'alterAlter' : name.startsWith('alterdata') ? 'alter' : null;
      if (current) sections[current] = { columns: [], rows: [] };
      continue;
    }
    if (!current) continue;
    const s = sections[current]!;
    if (!s.columns.length) s.columns = words(line);
    else s.rows.push(words(line));
  }
  if (!sections.ego || !sections.alter) throw new Error(`${f.name} is not an E-Net row-wise file: it needs a *ego data and an *alter data section.`);
  const alter = sections.alter;
  const ak = alter.columns.map(key);
  const from = ak.indexOf('from');
  const to = ak.indexOf('to');
  if (from < 0 || to < 0) throw new Error('The *alter data section needs From (the ego) and To (the alter) columns.');
  const alterCols = ['ego_id', 'alter_id', ...alter.columns.filter((_, j) => j !== from && j !== to)];
  const alterRows = alter.rows.map((r) => [r[from] ?? '', r[to] ?? '', ...r.filter((_, j) => j !== from && j !== to)]);
  const egoOf = new Map(alterRows.map((r) => [r[1]!, r[0]!]));
  const ego = sections.ego;
  let ties: DataTable | null = null;
  const notes = [`Read an E-Net file: ${ego.rows.length} egos, ${alterRows.length} alters.`];
  const aa = sections.alterAlter;
  if (aa && aa.rows.length) {
    const k = aa.columns.map(key);
    const a = k.indexOf('from');
    const b = k.indexOf('to');
    if (a < 0 || b < 0) throw new Error('The *alter-alter data section needs From and To columns.');
    const rows: string[][] = [];
    let unknown = 0;
    for (const r of aa.rows) {
      const e = egoOf.get(r[a] ?? '');
      if (!e || egoOf.get(r[b] ?? '') !== e) {
        unknown++;
        continue;
      }
      rows.push([e, r[a]!, r[b]!, ...r.filter((_, j) => j !== a && j !== b)]);
    }
    ties = toTable('E-Net (alter-alter)', { columns: ['ego_id', 'alter_a', 'alter_b', ...aa.columns.filter((_, j) => j !== a && j !== b)], rows });
    notes.push(`${rows.length} alter–alter rows, matched to egos through the *alter data section.${unknown ? ` ${unknown} rows name alters of different egos or alters not in *alter data, and were left out.` : ''}`);
  }
  const egoTable = toTable('E-Net (egos)', ego);
  return { egos: egoTable, alters: toTable('E-Net (alters)', { columns: alterCols, rows: alterRows }), ties, notes };
}
