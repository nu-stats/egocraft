// From QualCraft (nu-stats/qualcraft, MIT OR Apache-2.0), unchanged apart from names.
// A plain table: column names and rows of cells. Query results and case
// sheets pass through this on their way to and from CSV and Excel.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { escapeAttr, escapeText, kid, kids, parseXml } from '../core/xml.ts';

export type Cell = string | number | boolean | null;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

export interface Sheet extends Table {
  name: string;
}

// ---------- CSV ----------

function csvCell(v: Cell): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a byte-order mark so Excel reads the UTF-8 correctly. */
export function toCsv(table: Table): string {
  const lines = [table.columns.map(csvCell).join(',')];
  for (const row of table.rows) lines.push(row.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** RFC 4180 CSV (comma, semicolon or tab, whichever the header uses most). */
export function parseCsv(text: string): Table {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.slice(0, Math.max(0, source.search(/\r?\n|$/)));
  const delimiter = [',', '\t', ';'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  return { columns: header.map((h) => h.trim()), rows: body };
}

// ---------- XLSX ----------

function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetXml(sheet: Table): string {
  const rows: string[] = [];
  const all = [sheet.columns as Cell[], ...sheet.rows];
  all.forEach((row, r) => {
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      if (v === null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="b"${style}><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeText(String(v).slice(0, 32767))}</t></is></c>`;
    });
    rows.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  const freeze = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function toXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${escapeAttr(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}

/** The first worksheet of an .xlsx file, every cell as text. */
export function readXlsx(bytes: Uint8Array): Table {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This Excel file could not be opened (EgoCraft reads .xlsx, not the older .xls).');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]!) : null);
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('This Excel file has no workbook.');
  const wbDoc = parseXml(wb, 'Excel workbook');
  const firstSheet = wbDoc.getElementsByTagNameNS('*', 'sheet')[0];
  const rid = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const rels = text('xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    for (const rel of Array.from(parseXml(rels, 'Excel file').getElementsByTagNameNS('*', 'Relationship'))) {
      if (rel.getAttribute('Id') === rid) {
        const target = rel.getAttribute('Target') ?? '';
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      }
    }
  }
  const shared: string[] = [];
  const sst = text('xl/sharedStrings.xml');
  if (sst) {
    for (const si of Array.from(parseXml(sst, 'Excel file').getElementsByTagNameNS('*', 'si'))) {
      // Rich text keeps its words in <r><t>; phonetic hints (<rPh>) are left out.
      const ts = Array.from(si.getElementsByTagNameNS('*', 't')).filter((t) => (t.parentNode as Element | null)?.localName !== 'rPh');
      shared.push(ts.map((t) => t.textContent ?? '').join(''));
    }
  }
  const sheet = text(sheetPath);
  if (!sheet) throw new Error('This Excel file has no worksheet.');
  const doc = parseXml(sheet, 'Excel worksheet');
  const grid: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagNameNS('*', 'row'))) {
    const r = Number(row.getAttribute('r') ?? grid.length + 1) - 1;
    if (!Number.isFinite(r) || r < 0 || r > 1_000_000) continue;
    const cells: string[] = [];
    let next = 0;
    for (const c of kids(row, 'c')) {
      const ref = c.getAttribute('r');
      const col = ref ? colIndex(ref) : next;
      next = col + 1;
      if (col > 16384) continue;
      const t = c.getAttribute('t');
      const v = kid(c, 'v')?.textContent ?? '';
      let value = '';
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = Array.from(c.getElementsByTagNameNS('*', 't')).map((x) => x.textContent ?? '').join('');
      else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v;
      cells[col] = value;
    }
    grid[r] = Array.from(cells, (x) => x ?? '');
  }
  const rows = Array.from(grid, (x) => x ?? []).filter((r) => r.some((c) => c.trim() !== ''));
  const [header = [], ...body] = rows;
  return { columns: header.map((h) => h.trim()), rows: body };
}
