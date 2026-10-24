import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnIndex } from '../core/data.ts';
import { runChecks } from '../import/checks.ts';
import type { Slice } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';
import { sampleStudy } from '../sample/sample.ts';
import type { MeasureRequest } from './measures.ts';
import { computeMeasures, defaultColumn, safeName } from './measures.ts';

const kin: Slice = { id: 'kin', label: 'Kin only', tieTypes: ['kin'], alterConditions: [{ column: 'relation', op: 'is', values: ['Kin'] }], minWeight: null };

test('the sample study passes its own checks (apart from egos who named nobody)', () => {
  const s = sampleStudy(new Date('2026-10-24T00:00:00Z'));
  const issues = runChecks(s);
  assert.deepEqual(issues.filter((i) => i.severity !== 'info'), []);
});

test('one row per ego and wave; size matches the alter file', () => {
  const s = sampleStudy(new Date('2026-10-24T00:00:00Z'));
  const req: MeasureRequest[] = [
    { spec: { kind: 'size' }, sliceId: 'all' },
    { spec: { kind: 'size' }, sliceId: 'kin' },
    { spec: { kind: 'density' }, sliceId: 'all' },
    { spec: { kind: 'constraint' }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'gender', stat: 'share', values: ['Woman'] }, sliceId: 'all' },
    { spec: { kind: 'diversity', variable: 'race', index: 'iqv' }, sliceId: 'all' },
    { spec: { kind: 'similarity', egoVariable: 'race', alterVariable: 'race', index: 'ei' }, sliceId: 'all' },
    { spec: { kind: 'unknownPairs' }, sliceId: 'all' },
  ];
  const res = computeMeasures(s, req, [kin]);
  assert.equal(res.table.rows.length, s.egos.rows.length);
  assert.deepEqual(res.table.columns.map((c) => c.name), ['ego_id', 'wave', 'size', 'size_kin', 'density', 'constraint', 'mean_age', 'pct_gender_woman', 'iqv_race', 'ei_race', 'pairs_unknown']);
  // Size = number of alter rows for that ego and wave.
  const count = new Map<string, number>();
  for (const r of s.alters.rows) count.set(`${r[0]}/${r[1]}`, (count.get(`${r[0]}/${r[1]}`) ?? 0) + 1);
  for (const r of res.table.rows) assert.equal(r[2], count.get(`${r[0]}/${r[1]}`) ?? 0);
  // Kin-only size never exceeds total size; density stays within 0–1.
  for (const r of res.table.rows) {
    assert.ok((r[3] as number) <= (r[2] as number));
    if (r[4] !== null) assert.ok((r[4] as number) >= 0 && (r[4] as number) <= 1);
    if (r[8] !== null) assert.ok((r[8] as number) >= 0 && (r[8] as number) <= 1.0000001);
    if (r[9] !== null) assert.ok((r[9] as number) >= -1 && (r[9] as number) <= 1);
  }
  assert.equal(res.codebook.length, req.length);
  assert.ok(res.notes.some((n) => /counted as not tied/.test(n)));
});

test('leaving unknown pairs out raises density for egos with unasked pairs', () => {
  const s = sampleStudy(new Date('2026-10-24T00:00:00Z'));
  const nets = buildNetworks(s);
  const big = nets.egos.find((n) => n.alters.length > 10)!;
  assert.ok(big, 'the sample has an ego with more than 10 alters');
  const req: MeasureRequest[] = [{ spec: { kind: 'density' }, sliceId: 'all' }];
  const a = computeMeasures(s, req, [], nets);
  const b = computeMeasures({ ...s, settings: { missingPairs: 'observed' } }, req, [], nets);
  const i = nets.egos.indexOf(big);
  assert.ok((b.table.rows[i]![2] as number) > (a.table.rows[i]![2] as number));
});

test('column names are Stata-safe and unique', () => {
  assert.equal(safeName('Mean of Âge (years)'), 'mean_of_age_years');
  assert.equal(safeName('2nd wave'), 'v_2nd_wave');
  assert.ok(safeName('x'.repeat(40)).length <= 32);
  assert.equal(defaultColumn({ spec: { kind: 'effectiveSize' }, sliceId: 'kin' }), 'effsize_kin');
  const s = sampleStudy(new Date('2026-10-24T00:00:00Z'));
  const res = computeMeasures(s, [{ spec: { kind: 'size' }, sliceId: 'all' }, { spec: { kind: 'size' }, sliceId: 'all' }], []);
  assert.deepEqual(res.table.columns.map((c) => c.name).slice(2), ['size', 'size_2']);
  assert.ok(columnIndex(res.table, 'size_2') > 0);
});
