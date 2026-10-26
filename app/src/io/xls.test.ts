import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readDataFile } from './read.ts';
import { readXls } from './xls.ts';

// Made up for this test and saved as .xls (Excel 97–2003) by Excel 16.
const file = new Uint8Array(readFileSync(new URL('./fixtures/made-up-alters.xls', import.meta.url)));

test('.xls: the first worksheet, with shared strings across CONTINUE records, numbers, booleans and formula results', () => {
  const t = readXls(file);
  assert.deepEqual(t.columns, ['ego_id', 'alter_id', 'name', 'age', 'weight', 'kin', 'note', 'double_age']);
  assert.equal(t.rows.length, 400);
  assert.deepEqual(t.rows[0], ['E101', '1', 'Person é中 number 0 with a fairly long made-up label', '20', '-3.5', 'TRUE', '', '40']);
  assert.deepEqual(t.rows[1]!.slice(4), ['-3.25', 'FALSE', 'note 1', 'note 1!'], 'a text formula result');
  assert.equal(t.rows[2]![4], '1234567.891');
  // 400 unique labels are far more than one record holds, so the last ones come from CONTINUE records.
  assert.equal(t.rows[399]![2], 'Person é中 number 399 with a fairly long made-up label');
  assert.equal(t.rows[399]![0], 'E200');
  assert.equal(t.rows[399]![7], String(2 * (20 + (399 % 50))));
});

test('.xls through readDataFile: typed like any other file', async () => {
  const t = await readDataFile('alters.xls', file);
  assert.equal(t.columns.find((c) => c.name === 'age')!.kind, 'numeric');
  assert.equal(t.columns.find((c) => c.name === 'name')!.kind, 'string');
});

test('.xls: files that are not Excel 97–2003 get a plain message', () => {
  assert.throws(() => readXls(new Uint8Array(1024)), /not an Excel 97–2003 workbook/);
});
