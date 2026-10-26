import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnIndex } from '../core/data.ts';
import { conditionHolds, conditionsText, earlierVariables, shows } from './conditions.ts';
import { addAlter, blockReason, leaveScreen, screenShown, setAlterAnswer, setEgoAnswer, startInterview } from './interview.ts';
import type { Condition, Protocol } from './protocol.ts';
import { emptyProtocol, protocolProblems } from './protocol.ts';
import { interviewsToStudy } from './toStudy.ts';

const now = new Date('2026-10-25T12:00:00Z');

/** Married respondents are asked about their partner; people named as kin get a follow-up; a tie screen only with 3+ people. */
function protocol(): Protocol {
  const p = emptyProtocol('Skip logic test', now);
  return {
    ...p,
    screens: [
      { kind: 'egoForm', id: 'ego1', title: 'About you', prompt: '', questions: [
        { id: 'married', label: 'Are you married?', type: 'yesno', required: true },
        { id: 'partner_age', label: "Your partner's age", type: 'number', required: true, showIf: [{ source: 'ego', variable: 'married', op: 'is', values: ['1'] }] },
      ] },
      { kind: 'nameGenerator', id: 'discuss', title: 'Important matters', prompt: 'Who?', max: null, offerRoster: false },
      { kind: 'alterForm', id: 'alters1', title: 'About each person', prompt: '', questions: [
        { id: 'relation', label: 'Relation', type: 'choice', options: [{ value: '1', label: 'Kin' }, { value: '2', label: 'Friend' }, { value: '3', label: 'Other' }] },
        { id: 'kin_type', label: 'Which relative?', type: 'text', required: true, showIf: [{ source: 'alter', variable: 'relation', op: 'oneOf', values: ['1'] }] },
      ] },
      { kind: 'tiesDraw', id: 'ties1', title: 'Who knows whom', prompt: '', tieType: 'knows', showIf: [{ source: 'named', variable: '', op: 'gte', values: ['3'] }] },
      { kind: 'end', id: 'end1', title: 'End', prompt: 'Thanks' },
    ],
  };
}

test('conditions: is, is not, one of, numeric compare, answered; numbers and text codes compare alike', () => {
  const p = protocol();
  let iv = startInterview(p, { egoId: 'R1', mode: 'self' }, now);
  const c = (op: Condition['op'], values: string[] = [], variable = 'age'): Condition => ({ source: 'ego', variable, op, values });
  assert.equal(conditionHolds(c('answered'), iv), false);
  assert.equal(conditionHolds(c('notAnswered'), iv), true);
  assert.equal(conditionHolds(c('isNot', ['30']), iv), false, 'not answered is not "is not"');
  iv = setEgoAnswer(iv, 'age', 42);
  assert.equal(conditionHolds(c('is', ['42']), iv), true);
  assert.equal(conditionHolds(c('is', ['42.0']), iv), true);
  assert.equal(conditionHolds(c('gt', ['40']), iv), true);
  assert.equal(conditionHolds(c('lte', ['41']), iv), false);
  assert.equal(conditionHolds(c('gt', ['forty']), iv), false);
  iv = setEgoAnswer(iv, 'town', ' Boston ');
  assert.equal(conditionHolds(c('oneOf', ['Chicago', 'boston'], 'town'), iv), true);
  assert.equal(shows([c('gt', ['40']), c('is', ['Chicago'], 'town')], iv), false, 'every condition must hold');
  assert.equal(shows(undefined, iv), true);
});

test('skip logic in the interview: hidden required questions do not block, skipped screens are passed over', () => {
  const p = protocol();
  assert.deepEqual(protocolProblems(p), []);
  let iv = startInterview(p, { egoId: 'R1', mode: 'self' }, now);
  iv = setEgoAnswer(iv, 'married', 0);
  assert.equal(blockReason(iv, p.screens[0]!), null, 'partner age is hidden, so not required');
  iv = setEgoAnswer(iv, 'married', 1);
  assert.match(blockReason(iv, p.screens[0]!)!, /partner's age/);
  iv = setEgoAnswer(iv, 'partner_age', 39);
  iv = leaveScreen(iv, p, 1, now);
  for (const n of ['Ana', 'Ben']) iv = addAlter(iv, p, n, 'discuss').interview;
  iv = leaveScreen(iv, p, 1, now);
  assert.equal(p.screens[iv.screen]!.id, 'alters1');
  const [ana, ben] = iv.alters;
  iv = setAlterAnswer(iv, ana!.id, 'relation', '1');
  iv = setAlterAnswer(iv, ben!.id, 'relation', '2');
  assert.match(blockReason(iv, p.screens[2]!)!, /about Ana: Which relative/);
  iv = setAlterAnswer(iv, ana!.id, 'kin_type', 'sister');
  assert.equal(blockReason(iv, p.screens[2]!), null);
  // Two people named: the tie screen (3 or more) is skipped, straight to the end.
  assert.equal(screenShown(iv, p.screens[3]!), false);
  iv = leaveScreen(iv, p, 1, now);
  assert.equal(p.screens[iv.screen]!.kind, 'end');
  assert.ok(iv.finishedAt);
});

test('study from interviews: skipped questions are "not asked" (column _asked = 0), unanswered ones are asked but empty', () => {
  const p = protocol();
  let a = startInterview(p, { egoId: 'R1', mode: 'self' }, now);
  a = setEgoAnswer(setEgoAnswer(a, 'married', 1), 'partner_age', 39);
  for (const n of ['Ana', 'Ben', 'Cy']) a = addAlter(a, p, n, 'discuss').interview;
  a = setAlterAnswer(setAlterAnswer(a, 'A01', 'relation', '1'), 'A01', 'kin_type', 'sister');
  a = setAlterAnswer(a, 'A02', 'relation', '1'); // kin, follow-up left unanswered
  a = setAlterAnswer(a, 'A03', 'relation', '2');
  let b = startInterview(p, { egoId: 'R2', mode: 'self' }, now);
  // Answered partner_age, then changed married to no: the stale answer must not reach the data.
  b = setEgoAnswer(setEgoAnswer(setEgoAnswer(b, 'married', 1), 'partner_age', 50), 'married', 0);
  b = addAlter(b, p, 'Dee', 'discuss').interview;
  const s = interviewsToStudy(p, [a, b], {}, now);
  const e = (row: number, col: string) => s.egos.rows[row]![columnIndex(s.egos, col)];
  assert.deepEqual([e(0, 'partner_age'), e(0, 'partner_age_asked')], [39, 1]);
  assert.deepEqual([e(1, 'partner_age'), e(1, 'partner_age_asked')], [null, 0]);
  assert.deepEqual([e(0, 'ties_ties1_asked'), e(1, 'ties_ties1_asked')], [1, 0]);
  const al = (row: number, col: string) => s.alters.rows[row]![columnIndex(s.alters, col)];
  assert.deepEqual([al(0, 'kin_type'), al(0, 'kin_type_asked')], ['sister', 1]);
  assert.deepEqual([al(1, 'kin_type'), al(1, 'kin_type_asked')], [null, 1], 'asked, no answer');
  assert.deepEqual([al(2, 'kin_type'), al(2, 'kin_type_asked')], [null, 0], 'not asked');
  assert.equal(columnIndex(s.alters, 'relation_asked'), -1, 'questions always asked get no _asked column');
  assert.equal(s.egos.columns[columnIndex(s.egos, 'partner_age_asked')]!.valueLabels!['0'], 'Not asked (skipped by the questionnaire)');
});

test('the designer offers only answers given earlier, and flags conditions that look ahead', () => {
  const p = protocol();
  assert.deepEqual(earlierVariables(p, 0, 1).map((v) => `${v.source}:${v.id}`), ['ego:married']);
  assert.deepEqual(earlierVariables(p, 2, 1).map((v) => `${v.source}:${v.id}`), ['ego:married', 'ego:partner_age', 'named:', 'named:discuss', 'alter:relation']);
  assert.ok(!earlierVariables(p, 3, null).some((v) => v.source === 'alter'), 'screens cannot use one person\'s answers');
  assert.equal(conditionsText(p, 2, 1, p.screens[2]!.kind === 'alterForm' ? p.screens[2]!.questions[1]!.showIf : []), "this person's relation is one of Kin");
  const bad: Protocol = { ...p, screens: p.screens.map((s, i) => (i === 0 && s.kind === 'egoForm' ? { ...s, questions: [{ ...s.questions[0]!, showIf: [{ source: 'ego', variable: 'partner_age', op: 'gt', values: ['x'] }] }, s.questions[1]!] } : s)) };
  const problems = protocolProblems(bad);
  assert.ok(problems.some((x) => /"married": its condition uses "partner_age", which isn't asked before it/.test(x)), problems.join('\n'));
});
