// Older Excel files (.xls, Excel 97–2003): the first worksheet as a table of
// text, the same as readXlsx gives for .xlsx. Written from Microsoft's
// published format descriptions: the Compound File Binary format ([MS-CFB])
// that holds the "Workbook" stream, and the BIFF8 records in it ([MS-XLS]).
// Like the .xlsx reader, dates come through as Excel's day numbers.

import type { Table } from './table.ts';

const FREE = 0xffffffff;
const END = 0xfffffffe;

/** The bytes of a named stream in a Compound File ([MS-CFB]). */
function cfbStream(b: Uint8Array, names: string[]): Uint8Array | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (b.length < 512 || sig.some((x, i) => b[i] !== x)) return null;
  const sectorSize = 1 << dv.getUint16(0x1e, true);
  const miniSize = 1 << dv.getUint16(0x20, true);
  const firstDir = dv.getUint32(0x30, true);
  const cutoff = dv.getUint32(0x38, true);
  const firstMiniFat = dv.getUint32(0x3c, true);
  let difatSector = dv.getUint32(0x44, true);
  const sectorAt = (n: number) => (n + 1) * sectorSize;
  const u32 = (off: number) => (off + 4 <= b.length ? dv.getUint32(off, true) : FREE);
  // The FAT sectors, from the header's DIFAT and any DIFAT sectors after it.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREE) fatSectors.push(s);
  }
  for (let guard = 0; difatSector !== END && difatSector !== FREE && guard < 10000; guard++) {
    const off = sectorAt(difatSector);
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const s = u32(off + i * 4);
      if (s !== FREE) fatSectors.push(s);
    }
    difatSector = u32(off + sectorSize - 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(sectorAt(s) + i * 4));
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let s = start; s !== END && s !== FREE && s < table.length && out.length <= table.length; s = table[s]!) out.push(s);
    return out;
  };
  const read = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let at = 0;
    for (const s of chain(start, fat)) {
      if (at >= size) break;
      const part = b.subarray(sectorAt(s), Math.min(sectorAt(s) + sectorSize, b.length)).subarray(0, size - at);
      out.set(part, at);
      at += part.length;
    }
    return out;
  };
  // Directory entries: 128 bytes each.
  const dirSectors = chain(firstDir, fat);
  const dir = new Uint8Array(dirSectors.length * sectorSize);
  dirSectors.forEach((s, i) => dir.set(b.subarray(sectorAt(s), sectorAt(s) + sectorSize), i * sectorSize));
  const ddv = new DataView(dir.buffer);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const len = ddv.getUint16(off + 64, true);
    let name = '';
    for (let i = 0; i + 2 < len; i += 2) name += String.fromCharCode(ddv.getUint16(off + i, true));
    entries.push({ name, type: dir[off + 66]!, start: ddv.getUint32(off + 116, true), size: ddv.getUint32(off + 120, true) });
  }
  const want = entries.find((e) => e.type === 2 && names.includes(e.name));
  if (!want) return null;
  if (want.size >= cutoff) return read(want.start, want.size);
  // Small streams live in the mini stream, held by the root entry.
  const root = entries.find((e) => e.type === 5);
  if (!root) return null;
  const mini = read(root.start, root.size);
  const miniFatSectors = chain(firstMiniFat, fat);
  const miniFat: number[] = [];
  for (const s of miniFatSectors) for (let i = 0; i < sectorSize / 4; i++) miniFat.push(u32(sectorAt(s) + i * 4));
  const out = new Uint8Array(want.size);
  let at = 0;
  for (const s of chain(want.start, miniFat)) {
    if (at >= want.size) break;
    const part = mini.subarray(s * miniSize, s * miniSize + miniSize).subarray(0, want.size - at);
    out.set(part, at);
    at += part.length;
  }
  return out;
}

interface Record {
  type: number;
  data: Uint8Array;
}

function records(w: Uint8Array, from = 0): Record[] {
  const out: Record[] = [];
  for (let at = from; at + 4 <= w.length; ) {
    const type = w[at]! | (w[at + 1]! << 8);
    const len = w[at + 2]! | (w[at + 3]! << 8);
    out.push({ type, data: w.subarray(at + 4, at + 4 + len) });
    at += 4 + len;
    if (type === 0x000a && from > 0) break; // EOF of a worksheet
  }
  return out;
}

/** Reads strings that may run across CONTINUE records: at each new record, the characters go on with a fresh option byte. */
class Pieces {
  private i = 0;
  private at = 0;
  private readonly parts: Uint8Array[];
  constructor(parts: Uint8Array[]) {
    this.parts = parts;
  }
  private get cur() {
    return this.parts[this.i];
  }
  private next() {
    this.i++;
    this.at = 0;
  }
  done() {
    return !this.cur || (this.at >= this.cur.length && this.i >= this.parts.length - 1);
  }
  byte(): number {
    while (this.cur && this.at >= this.cur.length) this.next();
    if (!this.cur) throw new Error('This .xls file ends too early.');
    return this.cur[this.at++]!;
  }
  u16() {
    return this.byte() | (this.byte() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    for (let k = 0; k < n; k++) this.byte();
  }
  /** cch characters, 1 or 2 bytes each; a new record restarts with an option byte saying which. */
  chars(cch: number, high: boolean): string {
    let s = '';
    let wide = high;
    for (let k = 0; k < cch; k++) {
      if (this.cur && this.at >= this.cur.length && this.i < this.parts.length - 1) {
        this.next();
        wide = (this.byte() & 1) === 1;
      }
      s += String.fromCharCode(wide ? this.u16() : this.byte());
    }
    return s;
  }
  /** XLUnicodeRichExtendedString: the text, with its rich-text runs and phonetic data skipped. */
  richString(): string {
    const cch = this.u16();
    const flags = this.byte();
    const runs = flags & 0x08 ? this.u16() : 0;
    const ext = flags & 0x04 ? this.u32() : 0;
    const s = this.chars(cch, (flags & 1) === 1);
    this.skip(runs * 4 + ext);
    return s;
  }
}

/** XLUnicodeString inside one record (LABEL, STRING). */
function plainString(d: Uint8Array, off: number): string {
  const cch = d[off]! | (d[off + 1]! << 8);
  const high = (d[off + 2]! & 1) === 1;
  let s = '';
  for (let k = 0; k < cch; k++) s += String.fromCharCode(high ? d[off + 3 + 2 * k]! | (d[off + 4 + 2 * k]! << 8) : d[off + 3 + k]!);
  return s;
}

function rk(v: number): number {
  let n: number;
  if (v & 2) n = v >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, 0, true);
    buf.setUint32(4, (v & 0xfffffffc) >>> 0, true);
    n = buf.getFloat64(0, true);
  }
  return v & 1 ? n / 100 : n;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15))));

export function readXls(bytes: Uint8Array): Table {
  const wb = cfbStream(bytes, ['Workbook', 'Book']);
  if (!wb) throw new Error('This .xls file could not be opened: it is not an Excel 97–2003 workbook. Save it as .xlsx or CSV and try again.');
  const head = records(wb);
  const bof = head[0];
  if (!bof || bof.type !== 0x0809 || (bof.data[0]! | (bof.data[1]! << 8)) !== 0x0600) throw new Error('This .xls file is from Excel 95 or older. Open it in Excel, save it as .xlsx or CSV, and try again.');
  const sheets: { offset: number; type: number }[] = [];
  const sstParts: Uint8Array[] = [];
  for (let i = 0; i < head.length; i++) {
    const r = head[i]!;
    if (r.type === 0x002f) throw new Error('This .xls file is protected with a password. Remove the password in Excel, save it, and try again.');
    if (r.type === 0x0085) {
      const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      sheets.push({ offset: dv.getUint32(0, true), type: r.data[5]! });
    }
    if (r.type === 0x00fc) {
      sstParts.push(r.data.subarray(8));
      for (let k = i + 1; head[k]?.type === 0x003c; k++) sstParts.push(head[k]!.data);
    }
    if (r.type === 0x000a) break;
  }
  const strings: string[] = [];
  if (sstParts.length) {
    const p = new Pieces(sstParts);
    const total = new DataView(head.find((r) => r.type === 0x00fc)!.data.buffer, head.find((r) => r.type === 0x00fc)!.data.byteOffset).getUint32(4, true);
    for (let k = 0; k < total && !p.done(); k++) strings.push(p.richString());
  }
  const sheet = sheets.find((s) => s.type === 0) ?? sheets[0];
  if (!sheet) throw new Error('This .xls file has no worksheet.');
  const grid: string[][] = [];
  const put = (row: number, col: number, v: string) => {
    if (row > 1_000_000 || col > 16384) return;
    (grid[row] ??= [])[col] = v;
  };
  const recs = records(wb, sheet.offset);
  for (let i = 0; i < recs.length; i++) {
    const { type, data: d } = recs[i]!;
    if (d.length < 6 && type !== 0x000a) continue;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const row = d.length >= 2 ? dv.getUint16(0, true) : 0;
    const col = d.length >= 4 ? dv.getUint16(2, true) : 0;
    switch (type) {
      case 0x00fd: // LABELSST
        put(row, col, strings[dv.getUint32(6, true)] ?? '');
        break;
      case 0x0203: // NUMBER
        put(row, col, num(dv.getFloat64(6, true)));
        break;
      case 0x027e: // RK
        put(row, col, num(rk(dv.getUint32(6, true))));
        break;
      case 0x00bd: {
        // MULRK: several RK cells in one row
        const last = dv.getUint16(d.length - 2, true);
        for (let c = col, at = 4; c <= last && at + 6 <= d.length - 2; c++, at += 6) put(row, c, num(rk(dv.getUint32(at + 2, true))));
        break;
      }
      case 0x0204: // LABEL
        put(row, col, plainString(d, 6));
        break;
      case 0x0205: // BOOLERR
        put(row, col, d[7] === 0 ? (d[6] ? 'TRUE' : 'FALSE') : '');
        break;
      case 0x0006: {
        // FORMULA: the value Excel last calculated
        if (dv.getUint16(12, true) !== 0xffff) put(row, col, num(dv.getFloat64(6, true)));
        else if (d[6] === 0 && recs[i + 1]?.type === 0x0207) put(row, col, plainString(recs[i + 1]!.data, 0));
        else if (d[6] === 1) put(row, col, d[8] ? 'TRUE' : 'FALSE');
        break;
      }
      case 0x000a:
        i = recs.length;
        break;
    }
  }
  const rows = Array.from(grid, (r) => Array.from(r ?? [], (x) => x ?? '')).filter((r) => r.some((c) => c.trim() !== ''));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const [header = [], ...body] = rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
  return { columns: header.map((h) => h.trim()), rows: body };
}
