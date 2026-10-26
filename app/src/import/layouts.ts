// Other file layouts, turned into the three tables (P1.2):
//
// - two files: the alter file carries the alter–alter ties as columns, one
//   per alter number (knows_1, knows_2 …);
// - one wide file: one row per ego, alter answers spread across columns
//   (alter1_age, alter2_age … or age_1, age_2 …) and alter–alter ties as
//   columns named after the pair (tie_1_2, tie_1_3 …), as survey programs
//   such as Qualtrics and REDCap export them.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, idText, isMissing, requireColumn } from '../core/data.ts';

// ---------- two files: tie columns in the alter file ----------

export interface TieColumnGroup {
  prefix: string;
  /** Column name → the alter ID it refers to. */
  columns: { column: string; alter: string }[];
}

/** Groups of columns that look like one column per alter (knows_1, knows_2 …). */
export function findTieColumns(alters: DataTable): TieColumnGroup[] {
  const groups = new Map<string, { column: string; alter: string }[]>();
  for (const c of alters.columns) {
    const m = /^(.*?[A-Za-z_])(\d+)$/.exec(c.name);
    if (!m) continue;
    const list = groups.get(m[1]!) ?? [];
    list.push({ column: c.name, alter: String(Number(m[2])) });
    groups.set(m[1]!, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([prefix, columns]) => ({ prefix, columns }))
    .sort((a, b) => b.columns.length - a.columns.length);
}

export interface TwoFileOptions {
  egoId: string;
  alterId: string;
  wave: string | null;
  group: TieColumnGroup;
}

/**
 * Move tie columns out of the alter file into a tie file. Each pair is
 * written once (the first time it is seen); the value is kept as `knows`,
 * so 0 means "not tied" and an empty cell means "not known".
 */
export function tiesFromAlterColumns(alters: DataTable, o: TwoFileOptions): { alters: DataTable; ties: DataTable } {
  const eId = requireColumn(alters, o.egoId);
  const aId = requireColumn(alters, o.alterId);
  const wv = o.wave ? requireColumn(alters, o.wave) : -1;
  const drop = new Set(o.group.columns.map((c) => columnIndex(alters, c.column)));
  const columns: Column[] = [
    { ...alters.columns[eId]!, name: 'ego_id' },
    ...(wv >= 0 ? [{ ...alters.columns[wv]!, name: 'wave' }] : []),
    { name: 'alter_a', kind: 'string' },
    { name: 'alter_b', kind: 'string' },
    { name: 'knows', label: `From the alter file's ${o.group.prefix}… columns`, kind: 'numeric' },
  ];
  const rows: Cell[][] = [];
  const seen = new Set<string>();
  let textValues = false;
  // Only pairs of alters the ego actually named.
  const egoOf = (r: Cell[]) => `${idText(r[eId])}${wv >= 0 ? idText(r[wv]) : ''}`;
  const named = new Map<string, Set<string>>();
  for (const r of alters.rows) {
    const a = idText(r[aId]);
    if (a === null) continue;
    const set = named.get(egoOf(r)) ?? new Set<string>();
    set.add(a);
    named.set(egoOf(r), set);
  }
  for (const r of alters.rows) {
    const ego = r[eId] ?? null;
    const a = idText(r[aId]);
    if (a === null || isMissing(ego)) continue;
    for (const { column, alter: b } of o.group.columns) {
      if (b === a || !named.get(egoOf(r))?.has(b)) continue;
      const k = [idText(ego), wv >= 0 ? idText(r[wv]) : '', a < b ? a : b, a < b ? b : a].join('\u0001');
      const v = r[columnIndex(alters, column)] ?? null;
      if (seen.has(k)) {
        // The other direction said "tied" where this one was empty: keep the answer.
        continue;
      }
      seen.add(k);
      if (typeof v === 'string') textValues = true;
      rows.push([ego, ...(wv >= 0 ? [r[wv] ?? null] : []), a, b, v]);
    }
  }
  if (textValues) columns[columns.length - 1] = { ...columns[columns.length - 1]!, kind: 'string' };
  return {
    alters: { ...alters, columns: alters.columns.filter((_, j) => !drop.has(j)), rows: alters.rows.map((r) => r.filter((_, j) => !drop.has(j))) },
    ties: { name: `${alters.name} (ties)`, columns, rows },
  };
}

// ---------- one wide file ----------

export interface WideLayout {
  /** Alter variables: variable name → column per alter number. */
  alterVariables: { variable: string; byAlter: Map<number, string> }[];
  /** Tie columns: column → the pair of alter numbers. */
  tieColumns: { column: string; a: number; b: number }[];
  /** Columns left for the ego file. */
  egoColumns: string[];
  maxAlters: number;
}

// tie_1_2, knows_1_2, and E-Net's column-wise knows1-2.
const TIE = /^(?:tie|ties|knows|know|kn|t|alter_?tie|aa|close)_?(\d+)[_-](\d+)$/i;
const ALTER_FIRST = /^(?:alter|alt|a|nom|name|nam)_?(\d+)_?([A-Za-z].*)$/i;
const VAR_FIRST = /^([A-Za-z][A-Za-z0-9]*?(?:_[A-Za-z][A-Za-z0-9]*)*)_?(\d+)$/;

/** Find the wide layout's parts from column names. The ego ID column is never an alter variable. */
export function detectWide(table: DataTable, egoId: string): WideLayout {
  const alterVars = new Map<string, Map<number, string>>();
  const tieColumns: WideLayout['tieColumns'] = [];
  const claimed = new Set<string>([egoId]);
  for (const c of table.columns) {
    if (claimed.has(c.name)) continue;
    const t = TIE.exec(c.name);
    if (t) {
      tieColumns.push({ column: c.name, a: Number(t[1]), b: Number(t[2]) });
      claimed.add(c.name);
      continue;
    }
    const m = ALTER_FIRST.exec(c.name);
    if (m) {
      const v = m[2]!.replace(/^_/, '');
      const map = alterVars.get(v) ?? new Map<number, string>();
      map.set(Number(m[1]), c.name);
      alterVars.set(v, map);
      claimed.add(c.name);
    }
  }
  // "age_1, age_2 …" only counts when at least two numbered columns share the name.
  const varFirst = new Map<string, Map<number, string>>();
  for (const c of table.columns) {
    if (claimed.has(c.name)) continue;
    const m = VAR_FIRST.exec(c.name);
    if (!m) continue;
    const map = varFirst.get(m[1]!) ?? new Map<number, string>();
    map.set(Number(m[2]), c.name);
    varFirst.set(m[1]!, map);
  }
  for (const [v, map] of varFirst) {
    if (map.size < 2) continue;
    const merged = alterVars.get(v) ?? new Map<number, string>();
    for (const [n, col] of map) merged.set(n, col);
    alterVars.set(v, merged);
    for (const col of map.values()) claimed.add(col);
  }
  const alterVariables = [...alterVars.entries()].map(([variable, byAlter]) => ({ variable, byAlter }));
  const maxAlters = Math.max(0, ...alterVariables.flatMap((v) => [...v.byAlter.keys()]), ...tieColumns.flatMap((t) => [t.a, t.b]));
  return { alterVariables, tieColumns, egoColumns: table.columns.map((c) => c.name).filter((n) => n === egoId || !claimed.has(n)), maxAlters };
}

/**
 * Split a wide file into egos, alters and ties. An alter exists when any of
 * its variables is answered. Tie values are kept as `knows` (0 = not tied,
 * empty = not known).
 */
export function wideToThree(table: DataTable, egoId: string, layout: WideLayout): { egos: DataTable; alters: DataTable; ties: DataTable } {
  const eId = requireColumn(table, egoId);
  const egoCols = layout.egoColumns.map((n) => columnIndex(table, n));
  const egos: DataTable = { name: `${table.name} (egos)`, columns: egoCols.map((j) => table.columns[j]!), rows: table.rows.map((r) => egoCols.map((j) => r[j] ?? null)) };
  const varCols = layout.alterVariables.map((v) => {
    const first = [...v.byAlter.values()][0]!;
    const c = table.columns[columnIndex(table, first)]!;
    const kinds = [...v.byAlter.values()].map((n) => table.columns[columnIndex(table, n)]!.kind);
    const label = c.label?.replace(/\b(alter|person|name)\s*#?\s*\d+\b/i, '$1').trim();
    return { ...c, name: v.variable, ...(label ? { label } : {}), kind: kinds.includes('string') ? 'string' : 'numeric' } as Column;
  });
  const alters: DataTable = {
    name: `${table.name} (alters)`,
    columns: [{ ...table.columns[eId]!, name: table.columns[eId]!.name }, { name: 'alter_id', label: 'Alter number', kind: 'numeric' }, ...varCols],
    rows: [],
  };
  const tieCol = table.columns.find((c) => layout.tieColumns.some((t) => t.column === c.name));
  const ties: DataTable = {
    name: `${table.name} (ties)`,
    columns: [{ ...table.columns[eId]! }, { name: 'alter_a', label: 'First alter', kind: 'numeric' }, { name: 'alter_b', label: 'Second alter', kind: 'numeric' }, { name: 'knows', label: tieCol?.label ?? 'Tie between the alters', kind: tieCol?.kind ?? 'numeric', ...(tieCol?.valueLabels ? { valueLabels: tieCol.valueLabels } : {}) }],
    rows: [],
  };
  for (const r of table.rows) {
    const ego = r[eId] ?? null;
    if (isMissing(ego)) continue;
    const present = new Set<number>();
    for (let n = 1; n <= layout.maxAlters; n++) {
      const values = layout.alterVariables.map((v) => {
        const col = v.byAlter.get(n);
        return col ? (r[columnIndex(table, col)] ?? null) : null;
      });
      if (!values.some((v) => !isMissing(v))) continue;
      present.add(n);
      alters.rows.push([ego, n, ...values]);
    }
    for (const t of layout.tieColumns) {
      if (!present.has(t.a) || !present.has(t.b) || t.a === t.b) continue;
      ties.rows.push([ego, t.a, t.b, r[columnIndex(table, t.column)] ?? null]);
    }
  }
  return { egos, alters, ties };
}
