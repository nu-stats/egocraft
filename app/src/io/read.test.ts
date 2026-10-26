import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDataFile } from './read.ts';
import { writeDta, writeSav } from './statFiles.js';

const bytes = (s: string) => new TextEncoder().encode(s);

test('CSV: numbers typed, leading zeros kept as text, blanks missing', async () => {
  const t = await readDataFile('egos.csv', bytes('ego_id,code,age,name\n1,007,30,Ana\n2,012,,"Lee, J"\n'));
  assert.deepEqual(t.columns.map((c) => [c.name, c.kind]), [['ego_id', 'numeric'], ['code', 'string'], ['age', 'numeric'], ['name', 'string']]);
  assert.deepEqual(t.rows, [[1, '007', 30, 'Ana'], [2, '012', null, 'Lee, J']]);
});

test('Stata and SPSS files keep labels and value labels', async () => {
  const data = {
    variables: [
      { name: 'ego_id', label: 'Respondent', kind: 'numeric' as const },
      { name: 'gender', label: 'Gender', kind: 'numeric' as const, valueLabels: { '1': 'Woman', '2': 'Man' } },
    ],
    rows: [[1, 1], [2, 2], [3, null]],
  };
  for (const [name, w] of [['t.dta', writeDta(data)], ['t.sav', writeSav(data)]] as const) {
    const t = await readDataFile(name, w.bytes);
    assert.equal(t.columns[1]!.label, 'Gender');
    assert.equal(t.columns[1]!.valueLabels?.['1'], 'Woman');
    assert.deepEqual(t.rows.map((r) => r[1]), [1, 2, null]);
  }
});

test('unreadable files get a plain message', async () => {
  await assert.rejects(readDataFile('x.xls', new Uint8Array(4)), /not an Excel 97–2003 workbook/);
  await assert.rejects(readDataFile('x.xls', new TextEncoder().encode('<html><table><tr><td>1</td></tr></table></html>')), /really a web page/);
  await assert.rejects(readDataFile('x.pdf', new Uint8Array(4)), /can't read/);
});
