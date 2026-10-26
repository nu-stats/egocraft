// Reading a data file of any supported kind into a DataTable.

import type { Column, DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { readDta, readRData, readSav } from './statRead.js';
import type { StatTable } from './statRead.js';
import { parseCsv, readXlsx } from './table.ts';
import { readXls } from './xls.ts';

export const READABLE = ['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.dta', '.sav', '.zsav', '.rds', '.rdata', '.rda'];

export function extensionOf(name: string): string {
  const m = /\.[^.\\/]+$/.exec(name.toLowerCase());
  return m ? m[0] : '';
}

function fromStat(name: string, t: StatTable): DataTable {
  const columns: Column[] = t.columns.map((c) => ({
    name: c.name,
    ...(c.label ? { label: c.label } : {}),
    kind: c.kind === 'string' ? 'string' : 'numeric',
    ...(c.valueLabels && Object.keys(c.valueLabels).length ? { valueLabels: { ...c.valueLabels } } : {}),
  }));
  return { name, columns, rows: t.rows.map((r) => columns.map((_, j) => r[j] ?? null)) };
}

/** Read a file's bytes. Throws an Error with a plain message for files it can't read. */
export async function readDataFile(name: string, bytes: Uint8Array): Promise<DataTable> {
  const ext = extensionOf(name);
  switch (ext) {
    case '.csv':
    case '.tsv':
    case '.txt': {
      const text = new TextDecoder('utf-8').decode(bytes);
      const t = parseCsv(text);
      return tableFromText(name, t.columns, t.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))));
    }
    case '.xlsx': {
      const t = readXlsx(bytes);
      return tableFromText(name, t.columns, t.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))));
    }
    case '.xls': {
      // Some programs save .xlsx (a ZIP) or a web page under the .xls name.
      const t = bytes[0] === 0x50 && bytes[1] === 0x4b ? readXlsx(bytes) : readXls(bytes);
      return tableFromText(name, t.columns, t.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))));
    }
    case '.dta':
      return fromStat(name, readDta(bytes));
    case '.sav':
    case '.zsav':
      return fromStat(name, await readSav(bytes));
    case '.rds':
    case '.rdata':
    case '.rda':
      return fromStat(name, await readRData(bytes));
    default:
      throw new Error(`EgoCraft can't read "${name}". It reads CSV, Excel (.xlsx, .xls), Stata (.dta), SPSS (.sav) and R (.rds, .RData) files.`);
  }
}
