import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { newStudy } from '../core/study.ts';
import { guessMapping } from '../import/guess.ts';
import { mergeOutside, previewMerge, suggestKeys } from './merge.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

const E = csv('e.csv', 'ego_id,wave,age\n1,1,30\n1,2,32\n2,1,40');
const A = csv('a.csv', 'ego_id,wave,alter_id\n1,1,1\n2,1,1');
const s = { ...newStudy('m'), egos: E, alters: A, ties: null, mapping: guessMapping(E, A, null) };

test('survey variables join the ego file by ID and wave', () => {
  const survey = csv('survey.csv', 'respid,wave,income,age\n1,1,50000,30\n2,1,62000,40\n3,1,10000,22');
  const keys = suggestKeys(s, 'egos', survey);
  assert.deepEqual(keys, [['ego_id', 'respid'], ['wave', 'wave']]);
  const p = previewMerge(s, 'egos', survey, keys);
  assert.deepEqual([p.matched, p.targetRows, p.outsideUnused], [2, 3, 1]);
  assert.deepEqual(p.columns, [{ from: 'income', to: 'income' }, { from: 'age', to: 'age_2' }]);
  const m = mergeOutside(s, 'egos', survey, keys);
  assert.deepEqual(m.egos.rows, [[1, 1, 30, 50000, 30], [1, 2, 32, null, null], [2, 1, 40, 62000, 40]]);
  assert.match(m.history.at(-1)!.text, /2 of 3 ego rows matched; 1 rows of survey.csv matched nothing/);
});

test('an ID on two rows of the outside file stops the merge', () => {
  const bad = csv('bad.csv', 'ego_id,wave,x\n1,1,a\n1,1,b');
  assert.equal(previewMerge(s, 'egos', bad, [['ego_id', 'ego_id'], ['wave', 'wave']]).duplicates.length, 1);
  assert.throws(() => mergeOutside(s, 'egos', bad, [['ego_id', 'ego_id'], ['wave', 'wave']]), /more than one row/);
});
