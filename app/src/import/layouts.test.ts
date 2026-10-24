import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { newStudy } from '../core/study.ts';
import { buildNetworks } from '../network/networks.ts';
import { runChecks } from './checks.ts';
import { guessMapping } from './guess.ts';
import { detectWide, findTieColumns, tiesFromAlterColumns, wideToThree } from './layouts.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

test('two files: knows_1 … columns become a tie file', () => {
  const alters = csv('alters.csv', 'ego_id,alter_id,age,knows_1,knows_2,knows_3\n1,1,30,,1,0\n1,2,40,1,,\n1,3,50,0,,\n2,1,20,,0,\n2,2,25,0,,');
  const groups = findTieColumns(alters);
  assert.equal(groups[0]!.prefix, 'knows_');
  const out = tiesFromAlterColumns(alters, { egoId: 'ego_id', alterId: 'alter_id', wave: null, group: groups[0]! });
  assert.deepEqual(out.alters.columns.map((c) => c.name), ['ego_id', 'alter_id', 'age']);
  // Ego 1: pairs 1–2 (tied), 1–3 (not), 2–3 (not known); ego 2: 1–2 (not); alter 3 was not named, so knows_3 is ignored.
  assert.deepEqual(out.ties.rows, [[1, '1', '2', 1], [1, '1', '3', 0], [1, '2', '3', null], [2, '1', '2', 0]]);
});

test('one wide file: alters and ties split out, unanswered alters left out', () => {
  const wide = csv('survey.csv', 'resp_id,age,alter1_age,alter1_sex,alter2_age,alter2_sex,alter3_age,alter3_sex,tie_1_2,tie_1_3,tie_2_3\n1,30,31,F,45,M,,,1,,\n2,50,60,M,,,,,,,');
  const layout = detectWide(wide, 'resp_id');
  assert.deepEqual(layout.egoColumns, ['resp_id', 'age']);
  assert.deepEqual(layout.alterVariables.map((v) => v.variable), ['age', 'sex']);
  assert.equal(layout.maxAlters, 3);
  const t = wideToThree(wide, 'resp_id', layout);
  assert.deepEqual(t.alters.rows, [[1, 1, 31, 'F'], [1, 2, 45, 'M'], [2, 1, 60, 'M']]);
  assert.deepEqual(t.ties.rows, [[1, 1, 2, 1]]);
  // The result goes straight into a study and through the checks.
  const s = { ...newStudy('w'), egos: t.egos, alters: t.alters, ties: t.ties, mapping: guessMapping(t.egos, t.alters, t.ties) };
  assert.equal(s.mapping.alterId, 'alter_id');
  assert.equal(s.mapping.tieValue, 'knows');
  assert.deepEqual(runChecks(s), []);
  assert.equal(buildNetworks(s).egos[0]!.ties[0]!.state, true);
});

test('wide file with variable-first names (age_1, age_2)', () => {
  const wide = csv('w.csv', 'id,age_1,age_2,close_1,close_2,income\n1,30,40,3,4,50000');
  const layout = detectWide(wide, 'id');
  assert.deepEqual(layout.alterVariables.map((v) => v.variable).sort(), ['age', 'close']);
  assert.deepEqual(layout.egoColumns, ['id', 'income']);
});
