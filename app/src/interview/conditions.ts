// Skip logic: a screen or a question is shown only when earlier answers meet
// its conditions (every condition must hold). Conditions look at the
// respondent's answers, at the same person's answers (questions about each
// person), or at how many people were named.

import type { Alter, Answer, Interview } from './interview.ts';
import type { Condition, ConditionOp, Option, Protocol, Question, Screen } from './protocol.ts';

export const OP_TEXT: Record<ConditionOp, string> = {
  is: 'is',
  isNot: 'is not',
  oneOf: 'is one of',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  answered: 'was answered',
  notAnswered: 'was not answered',
};

const answered = (v: Answer | undefined): v is string | number => v !== null && v !== undefined && String(v).trim() !== '';
const asNumber = (v: Answer | string | undefined): number | null => {
  if (!answered(v ?? null)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
function same(a: Answer, b: string): boolean {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x !== null && y !== null) return x === y;
  return String(a).trim().toLowerCase() === b.trim().toLowerCase();
}

function sourceValue(c: Condition, iv: Interview, alter?: Alter): Answer {
  if (c.source === 'named') return iv.alters.filter((a) => !c.variable || a.generators.includes(c.variable)).length;
  if (c.source === 'alter') return alter?.values[c.variable] ?? null;
  return iv.ego[c.variable] ?? null;
}

export function conditionHolds(c: Condition, iv: Interview, alter?: Alter): boolean {
  const v = sourceValue(c, iv, alter);
  const first = c.values[0] ?? '';
  switch (c.op) {
    case 'answered':
      return answered(v);
    case 'notAnswered':
      return !answered(v);
    case 'is':
      return answered(v) && same(v, first);
    case 'isNot':
      return answered(v) && !same(v, first);
    case 'oneOf':
      return answered(v) && c.values.some((x) => same(v, x));
    default: {
      const x = asNumber(v);
      const y = asNumber(first);
      if (x === null || y === null) return false;
      return c.op === 'gt' ? x > y : c.op === 'gte' ? x >= y : c.op === 'lt' ? x < y : x <= y;
    }
  }
}

/** True when there are no conditions or every one holds. */
export function shows(conditions: Condition[] | undefined, iv: Interview, alter?: Alter): boolean {
  return !conditions?.length || conditions.every((c) => conditionHolds(c, iv, alter));
}

/** Questions of a form the respondent sees (for one person, on a form about each person). */
export function visibleQuestions(s: Screen & { questions: Question[] }, iv: Interview, alter?: Alter): Question[] {
  return s.questions.filter((q) => shows(q.showIf, iv, alter));
}

export interface EarlierVariable {
  source: 'ego' | 'alter' | 'named';
  /** Variable name, or a name generator's ID ('' = everyone named). */
  id: string;
  label: string;
  options?: Option[];
}

/**
 * What a condition at this point may look at: answers given before it (on
 * earlier screens, or earlier on the same form) and name generators before
 * it. Answers about a person can be used only by questions about each
 * person.
 */
export function earlierVariables(p: Protocol, screenIndex: number, questionIndex: number | null): EarlierVariable[] {
  const out: EarlierVariable[] = [];
  const here = p.screens[screenIndex];
  const perAlter = questionIndex !== null && here?.kind === 'alterForm';
  let generators = 0;
  for (let i = 0; i <= screenIndex && i < p.screens.length; i++) {
    const s = p.screens[i]!;
    const last = i === screenIndex;
    if (s.kind === 'egoForm') {
      const qs = last ? (questionIndex === null ? [] : s.questions.slice(0, questionIndex)) : s.questions;
      for (const q of qs) out.push({ source: 'ego', id: q.id, label: q.label, ...(q.options ? { options: q.options } : q.type === 'yesno' ? { options: YES_NO } : {}) });
    } else if (s.kind === 'nameGenerator' && !last) {
      generators++;
      out.push({ source: 'named', id: s.id, label: `People named on "${s.title}"` });
    } else if (perAlter && s.kind === 'alterForm') {
      const qs = last ? s.questions.slice(0, questionIndex!) : s.questions;
      for (const q of qs) out.push({ source: 'alter', id: q.id, label: q.label, ...(q.options ? { options: q.options } : q.type === 'yesno' ? { options: YES_NO } : {}) });
    } else if (perAlter && !last && (s.kind === 'alterBins' || s.kind === 'alterScale')) {
      out.push({ source: 'alter', id: s.variable, label: s.label, options: s.options });
    } else if (perAlter && !last && s.kind === 'closeness') {
      out.push({ source: 'alter', id: s.variable, label: s.label });
    }
  }
  if (generators) out.splice(out.findIndex((x) => x.source === 'named'), 0, { source: 'named', id: '', label: 'People named in all' });
  return out;
}

const YES_NO: Option[] = [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }];

/** Problems with the conditions at this point, in plain words. */
export function conditionProblems(p: Protocol, screenIndex: number, questionIndex: number | null, conditions: Condition[] | undefined, where: string): string[] {
  if (!conditions?.length) return [];
  const out: string[] = [];
  const avail = earlierVariables(p, screenIndex, questionIndex);
  for (const c of conditions) {
    if (!avail.some((v) => v.source === c.source && v.id === c.variable)) {
      out.push(c.source === 'named' ? `${where}: its condition counts a name generator that doesn't come before it.` : `${where}: its condition uses "${c.variable || '(none)'}", which isn't asked before it${c.source === 'alter' ? ' about each person' : ''}.`);
      continue;
    }
    if (c.op === 'answered' || c.op === 'notAnswered') continue;
    if (c.op === 'oneOf' && !c.values.some((v) => v.trim())) out.push(`${where}: choose at least one answer for "is one of".`);
    if (c.op !== 'oneOf' && !(c.values[0] ?? '').trim()) out.push(`${where}: its condition needs a value.`);
    if (['gt', 'gte', 'lt', 'lte'].includes(c.op) && asNumber(c.values[0]) === null) out.push(`${where}: "${OP_TEXT[c.op]}" needs a number.`);
  }
  return out;
}

/** "gender is Woman and People named in all is more than 2". */
export function conditionsText(p: Protocol, screenIndex: number, questionIndex: number | null, conditions: Condition[] | undefined): string {
  if (!conditions?.length) return '';
  const avail = earlierVariables(p, screenIndex, questionIndex);
  return conditions
    .map((c) => {
      const v = avail.find((x) => x.source === c.source && x.id === c.variable);
      const name = c.source === 'named' ? (v?.label ?? 'People named') : `${c.source === 'alter' ? "this person's " : ''}${c.variable}`;
      const show = (x: string) => v?.options?.find((o) => same(o.value, x))?.label ?? x;
      const vals = c.op === 'answered' || c.op === 'notAnswered' ? '' : ` ${c.op === 'oneOf' ? c.values.filter((x) => x.trim()).map(show).join(', ') : show(c.values[0] ?? '')}`;
      return `${name} ${OP_TEXT[c.op]}${vals}`;
    })
    .join(' and ');
}
