import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleStudy } from '../sample/sample.ts';
import type { MeasureRequest } from './measures.ts';
import { computeMeasures } from './measures.ts';
import { missingSummary, sensitivityTable } from './missing.ts';

const s = sampleStudy(new Date('2026-10-24T12:00:00Z'));

test('missing information, kept apart by kind', () => {
  const t = missingSummary(s);
  const row = (k: string) => t.rows.find((r) => String(r[0]).startsWith(k))!;
  assert.equal(row('Egos who named nobody')[1], 17);
  assert.equal(row('Alter pairs not asked')[1], 821);
  assert.equal(row('Alter pairs answered')[1], 0);
  assert.ok((row('Alters with age unanswered')[1] as number) > 0);
});

test('sensitivity: counting unknown pairs as tied can only raise density', () => {
  const d = sensitivityTable(s).rows[0]!;
  assert.equal(d[0], 'Density');
  assert.ok((d[2] as number) > (d[1] as number));
  assert.ok((d[3] as number) >= (d[1] as number));
});

test('the cutoff leaves pair-based measures empty when too many pairs are unknown', () => {
  const req: MeasureRequest[] = [{ spec: { kind: 'density' }, sliceId: 'all' }, { spec: { kind: 'size' }, sliceId: 'all' }];
  const all = computeMeasures(s, req, []);
  const cut = computeMeasures({ ...s, settings: { ...s.settings, maxUnknownShare: 0.2 } }, req, []);
  const emptied = all.table.rows.filter((r, i) => r[2] !== null && cut.table.rows[i]![2] === null).length;
  assert.ok(emptied > 0);
  assert.deepEqual(cut.table.rows.map((r) => r[3]), all.table.rows.map((r) => r[3]), 'size is not pair-based');
});
