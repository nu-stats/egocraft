// The data tables EgoCraft works on. A table keeps what the statistics
// programs keep about a variable (label, value labels, numeric or text), so
// nothing is lost between a .dta or .sav file and the results file.

export type Cell = string | number | null;

export type Kind = 'numeric' | 'string';

export interface Column {
  name: string;
  label?: string;
  kind: Kind;
  /** Code → label, as Stata and SPSS value labels. Codes are written as text. */
  valueLabels?: Record<string, string>;
}

export interface DataTable {
  /** Where the table came from (file name), for messages. */
  name: string;
  columns: Column[];
  rows: Cell[][];
}

export function columnIndex(table: DataTable, name: string): number {
  return table.columns.findIndex((c) => c.name === name);
}

export function requireColumn(table: DataTable, name: string): number {
  const i = columnIndex(table, name);
  if (i < 0) throw new Error(`"${table.name}" has no column named "${name}".`);
  return i;
}

export function isMissing(v: Cell | undefined): v is null | undefined {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !Number.isFinite(v));
}

/**
 * An identifier as text, so 12, 12.0 and "12" match. Text is trimmed but
 * otherwise kept (leading zeros stay: "007" is not 7; see the ID checks).
 */
export function idText(v: Cell | undefined): string | null {
  if (isMissing(v)) return null;
  if (typeof v === 'number') return String(v);
  const s = v.trim();
  return /^-?\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;
}

/** A number, or null. Text such as "3" or " 4.5 " counts; "yes" does not. */
export function numberOf(v: Cell | undefined): number | null {
  if (isMissing(v)) return null;
  if (typeof v === 'number') return v;
  const s = v.trim().replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The value as a category label: value labels applied, numbers as text. */
export function categoryOf(column: Column | undefined, v: Cell | undefined): string | null {
  const id = idText(v);
  if (id === null) return null;
  return column?.valueLabels?.[id] ?? id;
}

/** Guess numeric or text from the values: numeric when every value is a number. */
export function guessKind(values: Cell[]): Kind {
  let seen = false;
  for (const v of values) {
    if (isMissing(v)) continue;
    seen = true;
    if (numberOf(v) === null) return 'string';
  }
  return seen ? 'numeric' : 'string';
}

/** Build a table from header names and rows of text, typing each column. */
export function tableFromText(name: string, header: string[], rows: string[][]): DataTable {
  const used = new Set<string>();
  const names = header.map((h, j) => {
    let base = h.trim() || `column${j + 1}`;
    let n = base;
    for (let k = 2; used.has(n.toLowerCase()); k++) n = `${base}_${k}`;
    used.add(n.toLowerCase());
    return n;
  });
  const width = Math.max(names.length, ...rows.map((r) => r.length));
  while (names.length < width) names.push(`column${names.length + 1}`);
  const columns: Column[] = names.map((n, j) => {
    const values = rows.map((r) => r[j] ?? null);
    return { name: n, kind: guessKind(values) };
  });
  const typed = rows.map((r) =>
    columns.map((c, j) => {
      const v = r[j];
      if (isMissing(v)) return null;
      // Identifier-like text with leading zeros stays text even in a numeric column.
      if (c.kind === 'numeric') return numberOf(v);
      return v!.trim();
    }),
  );
  // A numeric column whose text had leading zeros ("007") is kept as text,
  // so identifiers are not changed on the way in.
  columns.forEach((c, j) => {
    if (c.kind !== 'numeric') return;
    if (rows.some((r) => typeof r[j] === 'string' && /^0\d/.test(r[j]!.trim()))) {
      c.kind = 'string';
      typed.forEach((row, i) => {
        const raw = rows[i]![j];
        row[j] = isMissing(raw) ? null : raw!.trim();
      });
    }
  });
  return { name, columns, rows: typed };
}

export function emptyTable(name: string): DataTable {
  return { name, columns: [], rows: [] };
}

/** A copy of the table with only the rows kept by `keep`. */
export function filterRows(table: DataTable, keep: (row: Cell[], i: number) => boolean): DataTable {
  return { ...table, rows: table.rows.filter(keep) };
}

/** Values of one column. */
export function columnValues(table: DataTable, name: string): Cell[] {
  const j = requireColumn(table, name);
  return table.rows.map((r) => r[j] ?? null);
}

/** Distinct non-missing category labels of a column, sorted. */
export function categories(table: DataTable, name: string): string[] {
  const j = requireColumn(table, name);
  const col = table.columns[j];
  const set = new Set<string>();
  for (const r of table.rows) {
    const c = categoryOf(col, r[j]);
    if (c !== null) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
