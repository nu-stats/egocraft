// Merging outside data (P2.5): extra ego variables (from the full survey)
// or alter variables joined by ID, with the same kind of checks as the
// import: IDs used twice in the outside file, rows that match nothing.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, idText } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { withHistory } from '../core/study.ts';

export type MergeTarget = 'egos' | 'alters';

/** Pairs of [column in the study's file, column in the outside file]. */
export type KeyPairs = [string, string][];

export interface MergePreview {
  targetRows: number;
  matched: number;
  outsideRows: number;
  outsideUnused: number;
  /** Keys that appear on more than one row of the outside file (a merge would be ambiguous). */
  duplicates: string[];
  /** Outside columns that will be added, with their new names. */
  columns: { from: string; to: string }[];
}

const keyOf = (r: Cell[], cols: number[]) => {
  const parts = cols.map((j) => idText(r[j]));
  return parts.some((p) => p === null) ? null : parts.join('\u0001');
};

/** The study's ID columns for the target, to suggest as keys. */
export function defaultKeys(study: Study, target: MergeTarget): string[] {
  const m = study.mapping;
  if (target === 'egos') return [m.egoId, m.egoWave].filter((x): x is string => !!x);
  return [m.alterEgoId, m.alterWave, m.alterId].filter((x): x is string => !!x);
}

/** For each target key, the outside column whose values match it best (or the same name). */
export function suggestKeys(study: Study, target: MergeTarget, outside: DataTable): KeyPairs {
  const t = target === 'egos' ? study.egos : study.alters;
  return defaultKeys(study, target).map((k) => {
    const same = outside.columns.find((c) => c.name.toLowerCase() === k.toLowerCase());
    if (same) return [k, same.name] as [string, string];
    const values = new Set(t.rows.map((r) => idText(r[columnIndex(t, k)])).filter((v): v is string => v !== null));
    let best = outside.columns[0]?.name ?? '';
    let score = -1;
    for (const c of outside.columns) {
      const j = columnIndex(outside, c.name);
      // Jaccard similarity of the two sets of values: shared / all.
      const vals = new Set(outside.rows.map((r) => idText(r[j])).filter((v): v is string => v !== null));
      const shared = [...vals].filter((v) => values.has(v)).length;
      const s = shared / (vals.size + values.size - shared || 1);
      if (s > score) {
        score = s;
        best = c.name;
      }
    }
    return [k, best] as [string, string];
  });
}

function plan(study: Study, target: MergeTarget, outside: DataTable, keys: KeyPairs) {
  const t = target === 'egos' ? study.egos : study.alters;
  if (!keys.length) throw new Error('Choose at least one column to match on.');
  const tk = keys.map(([a]) => columnIndex(t, a));
  const ok = keys.map(([, b]) => columnIndex(outside, b));
  if (tk.some((j) => j < 0) || ok.some((j) => j < 0)) throw new Error('A column to match on is missing.');
  const index = new Map<string, number>();
  const duplicates = new Set<string>();
  outside.rows.forEach((r, i) => {
    const k = keyOf(r, ok);
    if (k === null) return;
    if (index.has(k)) duplicates.add(k.replace(/\u0001/g, ' / '));
    else index.set(k, i);
  });
  const used = new Set(t.columns.map((c) => c.name.toLowerCase()));
  const keyCols = new Set(ok);
  const columns = outside.columns
    .map((c, j) => ({ c, j }))
    .filter(({ j }) => !keyCols.has(j))
    .map(({ c, j }) => {
      let to = c.name;
      for (let n = 2; used.has(to.toLowerCase()); n++) to = `${c.name}_${n}`;
      used.add(to.toLowerCase());
      return { from: c.name, to, j, column: c };
    });
  const matchedRows = new Set<number>();
  const rowMatch = t.rows.map((r) => {
    const k = keyOf(r, tk);
    const i = k === null ? undefined : index.get(k);
    if (i !== undefined) matchedRows.add(i);
    return i;
  });
  return { t, columns, rowMatch, matchedRows, duplicates: [...duplicates] };
}

export function previewMerge(study: Study, target: MergeTarget, outside: DataTable, keys: KeyPairs): MergePreview {
  const p = plan(study, target, outside, keys);
  return {
    targetRows: p.t.rows.length,
    matched: p.rowMatch.filter((i) => i !== undefined).length,
    outsideRows: outside.rows.length,
    outsideUnused: outside.rows.length - p.matchedRows.size,
    duplicates: p.duplicates,
    columns: p.columns.map(({ from, to }) => ({ from, to })),
  };
}

/** Add the outside file's other columns to the ego or alter file. Rows that match nothing get empty values. */
export function mergeOutside(study: Study, target: MergeTarget, outside: DataTable, keys: KeyPairs): Study {
  const p = plan(study, target, outside, keys);
  if (p.duplicates.length) throw new Error(`The outside file has ${p.duplicates.length} ID${p.duplicates.length === 1 ? '' : 's'} on more than one row (for example ${p.duplicates.slice(0, 3).join(', ')}). Each ID may appear once.`);
  const added: Column[] = p.columns.map(({ to, column }) => ({ ...column, name: to }));
  const table: DataTable = {
    ...p.t,
    columns: [...p.t.columns, ...added],
    rows: p.t.rows.map((r, i) => {
      const m = p.rowMatch[i];
      const src = m === undefined ? null : outside.rows[m]!;
      return [...r, ...p.columns.map(({ j }) => (src ? (src[j] ?? null) : null))];
    }),
  };
  const matched = p.rowMatch.filter((i) => i !== undefined).length;
  const what = target === 'egos' ? 'ego' : 'alter';
  return withHistory(target === 'egos' ? { ...study, egos: table } : { ...study, alters: table }, {
    kind: 'fix',
    text: `Added ${added.length} column${added.length === 1 ? '' : 's'} from ${outside.name} to the ${what} file, matched on ${keys.map(([a, b]) => (a === b ? a : `${a} = ${b}`)).join(' and ')}: ${matched} of ${p.t.rows.length} ${what} rows matched; ${outside.rows.length - p.matchedRows.size} rows of ${outside.name} matched nothing.`,
    detail: { check: 'merge', target, file: outside.name, keys },
  });
}
