import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { newStudy } from '../core/study.ts';
import { guessMapping } from '../import/guess.ts';
import { computeMeasures } from '../measures/measures.ts';
import { sampleStudy } from '../sample/sample.ts';
import { changeTable, measuresWide, transitions } from './waves.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

// Ego 1: wave 1 names Ana, Ben, Cy (Ana–Ben, Ben–Cy tied); wave 2 names Ana, Cy, Dee with new IDs
// (Ana–Cy tied, Ana–Dee tied). Matched by name: Ana and Cy kept, Ben dropped, Dee added.
const E = csv('e.csv', 'ego_id,wave\n1,1\n1,2');
const A = csv('a.csv', 'ego_id,wave,alter_id,name,gender\n1,1,1,Ana,1\n1,1,2,Ben,2\n1,1,3,Cy,2\n1,2,1,cy,2\n1,2,2,ANA,1\n1,2,3,Dee,1');
const T = csv('t.csv', 'ego_id,wave,alter_a,alter_b\n1,1,1,2\n1,1,2,3\n1,2,1,2\n1,2,2,3');
const s = { ...newStudy('w'), egos: E, alters: A, ties: T, mapping: guessMapping(E, A, T) };

test('matching by a name column, and by hand', () => {
  const [t] = transitions(s, { kind: 'column', column: 'name' });
  assert.deepEqual([...t!.matches], [['1', '2'], ['3', '1']]);
  const byId = transitions(s, { kind: 'id' })[0]!;
  assert.equal(byId.matches.size, 3, 'the same IDs are not the same people here');
  const fixed = transitions(s, { kind: 'column', column: 'name' }, [{ egoId: '1', waveFrom: '1', waveTo: '2', from: '3', to: null }])[0]!;
  assert.deepEqual([...fixed.matches], [['1', '2']]);
});

test('turnover, Jaccard and tie churn', () => {
  const tab = changeTable(s, transitions(s, { kind: 'column', column: 'name' }));
  const row = Object.fromEntries(tab.columns.map((c, j) => [c.name, tab.rows[0]![j]]));
  assert.deepEqual([row.kept, row.dropped, row.added], [2, 1, 1]);
  assert.equal(row.turnover, 0.3333333333);
  assert.equal(row.jaccard, 0.5);
  // Ana–Cy: not tied in wave 1, tied in wave 2 → one new tie, none kept or lost.
  assert.deepEqual([row.ties_kept, row.ties_lost, row.ties_new, row.tie_churn], [0, 0, 1, 1]);
});

test('attribute matching and measure changes on the sample', () => {
  const ss = sampleStudy(new Date('2026-10-24T12:00:00Z'));
  const results = computeMeasures(ss, [{ spec: { kind: 'size' }, sliceId: 'all' }, { spec: { kind: 'density' }, sliceId: 'all' }], []);
  const trans = transitions(ss, { kind: 'id' });
  assert.equal(trans.length, 180, '180 egos took part in both waves');
  const tab = changeTable(ss, trans, results);
  const j = tab.columns.findIndex((c) => c.name === 'd_size');
  for (const r of tab.rows) assert.equal(r[j], (r[4] as number) - (r[3] as number));
  const wide = measuresWide(ss, results);
  assert.deepEqual(wide.columns.map((c) => c.name), ['ego_id', 'size_w1', 'density_w1', 'size_w2', 'density_w2']);
  assert.equal(wide.rows.length, 200);
  const attr = transitions(ss, { kind: 'attributes', columns: ['relation', 'gender'], tolerance: 0 });
  assert.ok(attr.every((t) => t.matches.size <= Math.min(t.from.alters.length, t.to.alters.length)));
});
