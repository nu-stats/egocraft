// EgoCraft's file boxes with compressed files: what each kind of box gets
// from a compressed pick, and that the readers behind it still read it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import { strToU8, zipSync } from 'fflate';
import { OTHER_FORMATS, readOther } from '../interop/formats.ts';
import { readDataFile, READABLE } from '../io/read.ts';
import { toXlsx } from '../io/table.ts';
import { writeDta, writeRData, writeSav } from '../io/statFiles.js';
import { extensionsOf, openPicked } from './open.ts';

const DATA = extensionsOf(READABLE.join(','));
const CSV = 'ego_id,code,age\n1,007,30\n2,012,41\n';
const data = {
  variables: [
    { name: 'ego_id', label: 'Respondent', kind: 'numeric' as const },
    { name: 'gender', label: 'Gender', kind: 'numeric' as const, valueLabels: { '1': 'Woman', '2': 'Man' } },
  ],
  rows: [[1, 1], [2, 2], [3, null]],
};

test('a .csv.gz in a data box arrives as the .csv and reads with leading zeros kept', async () => {
  const [f, ...rest] = await openPicked('egos.csv.gz', gzipSync(CSV), DATA);
  assert.equal(rest.length, 0);
  assert.equal(f!.name, 'egos.csv');
  const t = await readDataFile(f!.name, f!.bytes);
  assert.deepEqual(t.rows, [[1, '007', 30], [2, '012', 41]]);
});

test('a zip of two CSVs gives both, for the box to ask which', async () => {
  const zip = zipSync({ 'study/egos.csv': strToU8(CSV), 'study/alters.csv': strToU8('ego_id,alter_id\n1,1\n'), '__MACOSX/study/._egos.csv': strToU8('x') });
  const inside = await openPicked('study.zip', zip, DATA);
  assert.deepEqual(inside.map((f) => f.name).sort(), ['alters.csv', 'egos.csv']);
});

test('Stata and SPSS files compressed with Zstandard or gzip read as they were', async () => {
  for (const [name, bytes] of [
    ['t.dta.zst', zstdCompressSync(writeDta(data).bytes)],
    ['t.sav.zst', zstdCompressSync(writeSav(data).bytes)],
    ['t.dta.gz', gzipSync(writeDta(data).bytes)],
  ] as const) {
    const [f] = await openPicked(name, new Uint8Array(bytes), DATA);
    assert.equal(f!.name, name.replace(/\.(zst|gz)$/, ''));
    const t = await readDataFile(f!.name, f!.bytes);
    assert.equal(t.columns[1]!.valueLabels?.['1'], 'Woman');
    assert.deepEqual(t.rows.map((r) => r[1]), [1, 2, null]);
  }
});

test('an .rds (gzip inside) and an .xlsx (a zip) still reach their readers', async () => {
  const rds = new Uint8Array(gzipSync(writeRData(data, { rds: true }).bytes));
  const [r] = await openPicked('t.rds', rds, DATA);
  assert.equal(r!.name, 't.rds');
  assert.deepEqual((await readDataFile(r!.name, r!.bytes)).rows.map((x) => x[1]), [1, 2, null]);
  const xlsx = toXlsx([{ name: 'Sheet1', columns: ['ego_id', 'age'], rows: [[1, 30]] }]);
  assert.deepEqual(await openPicked('egos.xlsx', xlsx, DATA), [{ name: 'egos.xlsx', bytes: xlsx }]);
});

test('Network Canvas: a .tar.gz of its CSVs reads like the ZIP it expects', async () => {
  const fmt = OTHER_FORMATS.find((f) => f.id === 'networkCanvas')!;
  const files = {
    'case02_c3d4_ego.csv': 'networkCanvasEgoUUID,networkCanvasCaseID,age\ne-0002,case02,41\n',
    'case02_c3d4_attributeList_Person.csv': 'nodeID,networkCanvasEgoUUID,networkCanvasUUID,name\n1,e-0002,n-0101,Dana\n2,e-0002,n-0102,Emery\n',
    'case02_c3d4_edgeList_Knows.csv': 'edgeID,from,to,networkCanvasEgoUUID\n1,1,2,e-0002\n',
  };
  const zipped = await openPicked('case02.zip', zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))), extensionsOf(fmt.accept));
  const t = readOther(fmt, zipped, { missingCodes: [] });
  assert.equal(t.egos.rows.length, 1);
  assert.equal(t.alters.rows.length, 2);
  assert.equal(t.ties!.rows.length, 1);
  // The same files as a .tar.gz, which the format's own ZIP reading could not open.
  const tgz = gzipSync(tar(Object.entries(files)));
  const fromTar = await openPicked('case02.tar.gz', new Uint8Array(tgz), extensionsOf(fmt.accept));
  assert.deepEqual(readOther(fmt, fromTar, { missingCodes: [] }), t);
});

// A tar archive built by hand: a 512-byte header (name, octal size, type, "ustar") and the data padded to 512.
function tar(files: [string, string][]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, body] of files) {
    const d = strToU8(body);
    const h = new Uint8Array(512);
    h.set(strToU8(name), 0);
    h.set(strToU8(d.length.toString(8).padStart(11, '0')), 124);
    h[156] = 0x30;
    h.set(strToU8('ustar\0'), 257);
    parts.push(h, d, new Uint8Array((512 - (d.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
