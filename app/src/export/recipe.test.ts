import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { emptyMapping, newStudy } from '../core/study.ts';
import { applyFix } from '../import/checks.ts';
import { guessMapping } from '../import/guess.ts';
import { alterMeasures } from '../measures/alters.ts';
import { buildNetworks } from '../network/networks.ts';
import { newProject } from '../project.ts';
import { sampleStudy } from '../sample/sample.ts';
import { makeRecipe } from './export.ts';
import { applyMapping, applyRecipe, readRecipe, savedColumns } from './recipe.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

function study(egos: string, alters: string): Study {
  const E = csv('e.csv', egos);
  const A = csv('a.csv', alters);
  return { ...newStudy('r'), egos: E, alters: A, ties: null, mapping: guessMapping(E, A, null) };
}

test('saved column choices are used where the new files have those columns', () => {
  const s = { ...study('resp,x\n1,2', 'resp,who\n1,a'), mapping: emptyMapping() };
  const r = applyMapping(s, { egoId: 'resp', alterEgoId: 'resp', alterId: 'who', tieA: 'from' });
  assert.equal(r.study.mapping.alterId, 'who');
  assert.deepEqual(r.missing, ['tieA = from']);
  assert.equal(savedColumns(r.study).mapping.egoId, 'resp');
});

test('a recipe reruns its fixes on new data, and says what needs a hand', () => {
  const first = study('ego_id\n1\n1\n2', 'ego_id,alter_id\n1,1\n9,1');
  const fixed = applyFix(applyFix(first, 'ego-duplicate', 'keep-first'), 'alter-orphan', 'drop');
  const recipe = readRecipe(JSON.stringify(makeRecipe(fixed, [], [{ spec: { kind: 'size' }, sliceId: 'all' }])));
  // New data with the same kinds of problems, and one fewer.
  const next = study('ego_id\n5\n5\n6', 'ego_id,alter_id\n5,1\n6,1');
  const r = applyRecipe(newProject(next), recipe);
  assert.equal(r.project.study.egos.rows.length, 2);
  assert.ok(r.done.some((d) => d.startsWith('Fixed again')));
  assert.ok(r.done.some((d) => d.startsWith('Not needed this time')));
  assert.deepEqual(r.project.measures, recipe.measures);
  assert.deepEqual(r.todo, []);
});

test('alter-level results: one row per alter, degrees add up to twice the ties', () => {
  const s = sampleStudy(new Date('2026-10-24T12:00:00Z'));
  const nets = buildNetworks(s);
  const t = alterMeasures(s, undefined, nets);
  assert.equal(t.rows.length, s.alters.rows.length);
  const net = nets.egos.find((n) => n.alters.length > 5)!;
  const rows = t.rows.filter((r) => r[0] === Number(net.id) && String(r[1]) === net.wave);
  const ties = net.ties.filter((x) => x.state === true).map((x) => [x.a, x.b].sort().join('-'));
  assert.equal(rows.reduce((a, r) => a + (r[3] as number), 0), 2 * new Set(ties).size);
});
