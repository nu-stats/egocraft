import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cell, DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { newStudy } from '../core/study.ts';
import { applyFix, runChecks } from './checks.ts';
import { guessMapping } from './guess.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

function study(egos: string, alters: string, ties?: string): Study {
  const s = newStudy('test', new Date('2026-10-24T00:00:00Z'));
  const E = csv('egos.csv', egos);
  const A = csv('alters.csv', alters);
  const T = ties ? csv('ties.csv', ties) : null;
  return { ...s, egos: E, alters: A, ties: T, mapping: guessMapping(E, A, T) };
}

const ids = (s: Study) => runChecks(s).map((i) => i.id);

test('a clean study has no problems', () => {
  const s = study('ego_id,age\n1,30\n2,40', 'ego_id,alter_id\n1,1\n1,2\n2,1', 'ego_id,alter_a,alter_b\n1,1,2');
  assert.deepEqual(ids(s), []);
});

test('duplicate egos, orphan alters, egos without alters', () => {
  const s = study('ego_id\n1\n1\n2\n3', 'ego_id,alter_id\n1,1\n9,1\n2,1');
  assert.deepEqual(ids(s), ['ego-duplicate', 'alter-orphan', 'ego-no-alters']);
  const fixed = applyFix(applyFix(s, 'ego-duplicate', 'keep-first'), 'alter-orphan', 'add-egos');
  assert.deepEqual(ids(fixed), ['ego-no-alters']);
  assert.equal(fixed.egos.rows.length, 4);
  assert.equal(fixed.history.length, 2);
  assert.match(fixed.history[1]!.text, /Added 1 ego/);
});

test('leading zeros lost in the alter file are put back', () => {
  const s = study('ego_id\n007\n012', 'ego_id,alter_id\n7,1\n12,1');
  assert.equal(s.egos.columns[0]!.kind, 'string');
  // Until the zeros are back, egos 007 and 012 look as if they named nobody.
  assert.deepEqual(ids(s), ['alter-lost-zeros', 'ego-no-alters']);
  const fixed = applyFix(s, 'alter-lost-zeros', 'pad');
  assert.deepEqual(ids(fixed), []);
  assert.deepEqual(fixed.alters.rows.map((r) => r[0]), ['007', '012']);
});

test('tie problems: unknown alter, self-tie, the same pair twice with different strengths', () => {
  const s = study(
    'ego_id\n1',
    'ego_id,alter_id\n1,1\n1,2\n1,3',
    'ego_id,alter_a,alter_b,strength\n1,1,2,1\n1,2,1,3\n1,1,1,1\n1,1,4,2',
  );
  const issues = runChecks(s);
  assert.deepEqual(issues.map((i) => i.id), ['tie-unknown-alter', 'tie-self', 'tie-duplicate']);
  assert.match(issues[2]!.explain, /disagree/);
  let f = applyFix(s, 'tie-unknown-alter', 'drop');
  f = applyFix(f, 'tie-self', 'drop');
  f = applyFix(f, 'tie-duplicate', 'keep-strongest');
  assert.deepEqual(ids(f), []);
  assert.deepEqual(f.ties!.rows, [[1, 2, 1, 3]] as Cell[][]);
});

test('a fix for a problem that is gone says so', () => {
  const s = study('ego_id\n1', 'ego_id,alter_id\n1,1');
  assert.throws(() => applyFix(s, 'ego-duplicate', 'keep-first'), /no longer/);
});

test('waves: the same ego in two waves is not a duplicate', () => {
  const s = study('ego_id,wave\n1,1\n1,2', 'ego_id,wave,alter_id\n1,1,1\n1,2,1\n1,3,1');
  assert.equal(s.mapping.egoWave, 'wave');
  assert.equal(s.mapping.alterWave, 'wave');
  assert.deepEqual(ids(s), ['alter-orphan']);
});
