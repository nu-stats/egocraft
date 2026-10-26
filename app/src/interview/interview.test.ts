import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runChecks } from '../import/checks.ts';
import { computeMeasures } from '../measures/measures.ts';
import { buildNetworks } from '../network/networks.ts';
import type { Interview } from './interview.ts';
import { addAlter, blockReason, leaveScreen, pilesOf, removeAlter, setAlterAnswer, setEgoAnswer, setPiles, startInterview, toggleTie } from './interview.ts';
import { newScreen, protocolProblems, protocolVariables, sampleProtocol } from './protocol.ts';
import { interviewsToStudy } from './toStudy.ts';
import { createVault, interviewsFromFile, interviewsToFile, openVault, seal, unseal } from './vault.ts';

const now = new Date('2026-10-24T12:00:00Z');
const p = sampleProtocol(now);

/** Walk an interview through the sample protocol, answering each screen as a respondent would. */
function interview(egoId: string, names: string[], wave: string | null = null): Interview {
  let iv = startInterview(p, { egoId, wave, mode: 'interviewer', interviewer: 'JS' }, now);
  for (let guard = 0; guard < 50 && p.screens[iv.screen]!.kind !== 'end'; guard++) {
    const s = p.screens[iv.screen]!;
    if (s.kind === 'consent') {
      assert.match(blockReason(iv, s)!, /agree/);
      iv = { ...iv, consent: true };
    } else if (s.kind === 'egoForm') {
      iv = setEgoAnswer(iv, 'age', 40);
      iv = setEgoAnswer(iv, 'gender', '1');
    } else if (s.kind === 'nameGenerator') {
      for (const n of s.id === 'discuss' ? names.slice(0, 3) : names.slice(2)) iv = addAlter(iv, p, n, s.id).interview;
    } else if (s.kind === 'alterForm') {
      for (const a of iv.alters) {
        iv = setAlterAnswer(iv, a.id, 'alter_gender', '2');
        iv = setAlterAnswer(iv, a.id, 'alter_age', 30);
      }
    } else if (s.kind === 'alterBins') iv = setAlterAnswer(iv, iv.alters[0]!.id, 'relation', '1');
    else if (s.kind === 'closeness') iv.alters.forEach((a, i) => (iv = setAlterAnswer(iv, a.id, 'closeness', 4 - (i % 4))));
    else if (s.kind === 'tiesDraw') iv = toggleTie(iv, iv.alters[0]!.id, iv.alters[1]!.id, 'knows');
    assert.equal(blockReason(iv, s), null);
    iv = leaveScreen(iv, p, 1, now);
  }
  return iv;
}

test('the sample protocol is ready to use; problems are explained', () => {
  assert.deepEqual(protocolProblems(p), []);
  const v = protocolVariables(p);
  assert.deepEqual(v.generators.map((g) => g.id), ['discuss', 'help']);
  assert.deepEqual(v.tieTypes, ['knows']);
  const bad = { ...p, screens: [newScreen('egoForm', p)] };
  assert.match(protocolProblems(bad).join(' '), /name generator/);
});

test('naming: the same name on two generators is one person; limits; removing', () => {
  let iv = startInterview(p, { egoId: '1', mode: 'self' }, now);
  iv = addAlter(iv, p, '  Ana  ', 'discuss').interview;
  const again = addAlter(iv, p, 'ana', 'discuss');
  assert.equal(again.added, false);
  assert.match(again.reason!, /already/);
  iv = addAlter(iv, p, 'ANA', 'help').interview;
  assert.equal(iv.alters.length, 1);
  assert.deepEqual(iv.alters[0]!.generators, ['discuss', 'help']);
  iv = addAlter(iv, p, 'Ben', 'discuss').interview;
  iv = toggleTie(iv, 'A01', 'A02', 'knows');
  iv = removeAlter(iv, 'A01', 'help');
  assert.equal(iv.alters.length, 2);
  iv = removeAlter(iv, 'A01', 'discuss');
  assert.deepEqual(iv.alters.map((a) => a.name), ['Ben']);
  assert.equal(iv.ties.length, 0, 'ties of a removed person go too');
  const small = { ...p, maxAlters: 1 };
  assert.match(addAlter(iv, small, 'Cy', 'discuss').reason!, /allows 1/);
});

test('piles: everyone in a pile knows each other', () => {
  let iv = startInterview(p, { egoId: '1', mode: 'self' }, now);
  for (const n of ['A', 'B', 'C', 'D']) iv = addAlter(iv, p, n, 'discuss').interview;
  iv = setPiles(iv, [['A01', 'A02', 'A03'], ['A04']], 'knows');
  assert.equal(iv.ties.length, 3);
  assert.deepEqual(pilesOf(iv, 'knows'), [['A01', 'A02', 'A03']]);
});

test('alter screens are skipped when nobody is named', () => {
  const iv = interview('9', []);
  assert.equal(iv.alters.length, 0);
  assert.equal(p.screens[iv.screen]!.kind, 'end');
  assert.ok(iv.finishedAt);
  assert.deepEqual(iv.tieScreensDone, []);
});

test('interviews become a study EgoCraft can check and measure', () => {
  const ivs = [interview('1', ['Ana', 'Ben', 'Cy', 'Dee'], '1'), interview('2', ['Eve', 'Fay'], '1'), interview('3', [], '1')];
  const s = interviewsToStudy(p, ivs, {}, now);
  assert.deepEqual(s.egos.columns.map((c) => c.name).slice(0, 5), ['ego_id', 'wave', 'consent', 'age', 'gender']);
  assert.equal(s.egos.columns.find((c) => c.name === 'gender')?.valueLabels?.['1'], 'Woman');
  assert.ok(!s.alters.columns.some((c) => c.name === 'alter_name'), 'names stay out unless asked for');
  assert.deepEqual(s.alters.rows.map((r) => [r[0], r[2], r[3], r[4]]), [['1', 'A01', 1, 0], ['1', 'A02', 1, 0], ['1', 'A03', 1, 1], ['1', 'A04', 0, 1], ['2', 'A01', 1, 0], ['2', 'A02', 1, 0]]);
  // Ego 1: 6 pairs asked, one tied; ego 2: one pair, tied; ego 3 named nobody.
  assert.equal(s.ties!.rows.length, 7);
  assert.deepEqual(runChecks(s).filter((i) => i.severity !== 'info'), []);
  const r = computeMeasures(s, [{ spec: { kind: 'size' }, sliceId: 'all' }, { spec: { kind: 'density' }, sliceId: 'all' }, { spec: { kind: 'constraint' }, sliceId: 'all' }], [], buildNetworks(s));
  assert.deepEqual(r.table.rows.map((row) => [row[0], row[2], row[3]]), [['1', 4, 0.1666666667], ['2', 2, 1], ['3', 0, null]]);
  assert.equal(s.mapping.egoAlterStrength, 'closeness');
  const withNames = interviewsToStudy(p, ivs, { keepNames: true }, now);
  assert.equal(withNames.alters.rows[0]![3], 'Ana');
  assert.throws(() => interviewsToStudy(p, [ivs[0]!, { ...ivs[0]!, id: 'other' }], {}, now), /Two different interviews/);
});

test('the device vault and the transfer file open only with the passphrase', async () => {
  const { meta, key } = await createVault('field laptop 7', now);
  const sealed = await seal(key, { hello: 'Ana' });
  assert.ok(!sealed.data.includes('Ana'));
  const again = await openVault(meta, 'field laptop 7');
  assert.deepEqual(await unseal(again, sealed), { hello: 'Ana' });
  await assert.rejects(openVault(meta, 'wrong passphrase'), /Wrong passphrase/);
  const iv = interview('1', ['Ana', 'Ben']);
  const file = await interviewsToFile({ protocol: p, interviews: [iv], device: 'test', savedAt: now.toISOString() }, 'carry this home');
  assert.ok(!new TextDecoder().decode(file).includes('Ana'));
  const back = await interviewsFromFile(file, 'carry this home');
  assert.deepEqual(back.interviews[0], iv);
  await assert.rejects(interviewsFromFile(file, 'nope nope nope'), /Wrong passphrase/);
});

test('the questionnaire as text lists every variable with its wording and codes', async () => {
  const { protocolText } = await import('./protocol.ts');
  const t = protocolText(p);
  assert.match(t, /alter_gender: Is this person a woman, a man, or another gender\? \[choice\] Answers: 1 = Woman; 2 = Man; 3 = Another gender\./);
  assert.match(t, /Variable gen_discuss = 1/);
  assert.match(t, /Tie type "knows"/);
});

test('each who-knows-whom screen keeps its own tie type, so piles never replace drawn ties', () => {
  const piles = newScreen('tiesPiles', p);
  assert.equal(piles.kind === 'tiesPiles' && piles.tieType, 'knows2');
  const both = { ...p, screens: [...p.screens.slice(0, -1), piles, p.screens[p.screens.length - 1]!] };
  assert.deepEqual(protocolProblems(both), []);
  const clash = { ...both, screens: both.screens.map((s) => (s.kind === 'tiesPiles' ? { ...s, tieType: 'Knows' } : s)) };
  assert.ok(protocolProblems(clash).some((x) => /both store the tie type "Knows"/.test(x)));
});
