import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { newStudy } from '../core/study.ts';
import { buildNetworks } from '../network/networks.ts';
import { runChecks } from './checks.ts';
import { guessMapping } from './guess.ts';
import { decryptKey, dropColumn, encryptKey, identifyingColumns, pseudonymize } from './pseudonyms.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

function study(): Study {
  const E = csv('e.csv', 'ego_id,wave,resp_name\n1,1,Ana Ruiz\n1,2,Ana Ruiz\n2,1,Lee Chan');
  const A = csv('a.csv', 'ego_id,wave,alter_id,age,notes\n1,1,Mom,60,calls daily\n1,1,Sam,30,\n1,2,Sam,31,\n1,2,Jo,25,\n2,1,Mom,70,');
  const T = csv('t.csv', 'ego_id,wave,alter_a,alter_b\n1,1,Mom,Sam\n1,2,Sam,Jo');
  return { ...newStudy('p'), egos: E, alters: A, ties: T, mapping: guessMapping(E, A, T) };
}

test('names are found: word alter IDs and name-like columns', () => {
  const found = identifyingColumns(study()).map((f) => `${f.table}.${f.column}`);
  assert.deepEqual(found, ['egos.resp_name', 'alters.alter_id']);
});

test('alter names become codes within each ego, the same in every wave, and the ties follow', () => {
  const s = study();
  const { study: p, key } = pseudonymize(s, 'alters', 'alter_id');
  assert.deepEqual(p.alters.rows.map((r) => r[2]), ['A01', 'A02', 'A02', 'A03', 'A01']);
  assert.deepEqual(p.ties!.rows.map((r) => [r[2], r[3]]), [['A01', 'A02'], ['A02', 'A03']]);
  assert.deepEqual(key.rows, [['1', 'A01', 'Mom'], ['1', 'A02', 'Sam'], ['1', 'A03', 'Jo'], ['2', 'A01', 'Mom']]);
  // Nothing breaks: same checks, same networks.
  assert.deepEqual(runChecks(p), runChecks(s));
  assert.equal(buildNetworks(p).egos[0]!.ties.length, 1);
  assert.match(p.history.at(-1)!.text, /in the tie file too/);
});

test('ego names get R codes; free text can be removed; IDs cannot', () => {
  const s = study();
  const { study: p } = pseudonymize(s, 'egos', 'resp_name');
  assert.deepEqual(p.egos.rows.map((r) => r[2]), ['R001', 'R001', 'R002']);
  const d = dropColumn(p, 'alters', 'notes');
  assert.ok(!d.alters.columns.some((c) => c.name === 'notes'));
  assert.throws(() => dropColumn(p, 'alters', 'alter_id'), /ID EgoCraft needs/);
});

test('the key file opens only with the passphrase', async () => {
  const { key } = pseudonymize(study(), 'alters', 'alter_id');
  const bytes = await encryptKey(key, 'correct horse battery');
  assert.ok(!new TextDecoder().decode(bytes).includes('Mom'));
  assert.deepEqual(await decryptKey(bytes, 'correct horse battery'), key);
  await assert.rejects(decryptKey(bytes, 'wrong passphrase'), /Wrong passphrase/);
  await assert.rejects(encryptKey(key, 'short'), /at least 8/);
});
