// Finished (or partly finished) interviews into the three tables EgoCraft
// analyzes (P6.7), with variable labels and value labels from the protocol's
// wording, and the mapping filled in. The names respondents typed stay out
// of the study unless asked for.

import type { Cell, Column, DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { emptyMapping, newStudy, withHistory } from '../core/study.ts';
import { shows } from './conditions.ts';
import type { Alter, Interview } from './interview.ts';
import type { Option, Protocol, Question, QuestionType, Screen } from './protocol.ts';
import { protocolVariables } from './protocol.ts';

/** A variable the protocol writes, with the screen (and question) whose conditions decide whether it was asked. */
interface Item {
  id: string;
  label: string;
  type: QuestionType;
  options?: Option[];
  screen: Screen;
  q?: Question;
}

const ASKED_LABELS = { '1': 'Asked', '0': 'Not asked (skipped by the questionnaire)' };
const conditional = (it: Item) => !!(it.screen.showIf?.length || it.q?.showIf?.length);
const asked = (it: Item, iv: Interview, a?: Alter) => shows(it.screen.showIf, iv) && shows(it.q?.showIf, iv, a);
const askedColumn = (it: Item): Column => ({ name: `${it.id}_asked`, label: `Asked: ${it.label}`.slice(0, 80), kind: 'numeric', valueLabels: ASKED_LABELS });

function items(p: Protocol): { ego: Item[]; alter: Item[] } {
  const ego: Item[] = [];
  const alter: Item[] = [];
  for (const s of p.screens) {
    if (s.kind === 'egoForm') for (const q of s.questions) ego.push({ id: q.id, label: q.label, type: q.type, ...(q.options ? { options: q.options } : {}), screen: s, q });
    else if (s.kind === 'alterForm') for (const q of s.questions) alter.push({ id: q.id, label: q.label, type: q.type, ...(q.options ? { options: q.options } : {}), screen: s, q });
    else if (s.kind === 'alterBins' || s.kind === 'alterScale') alter.push({ id: s.variable, label: s.label, type: 'choice', options: s.options, screen: s });
    else if (s.kind === 'closeness') alter.push({ id: s.variable, label: s.label, type: 'number', screen: s });
  }
  return { ego, alter };
}

const labels = (options?: Option[]) => (options?.length ? Object.fromEntries(options.map((o) => [o.value, o.label])) : undefined);
const num = (v: unknown): Cell => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : String(v));
const isNumericCodes = (options?: Option[]) => !!options?.length && options.every((o) => /^-?\d+(\.\d+)?$/.test(o.value));

const valueColumn = (q: Item): Column => ({
  name: q.id,
  label: q.label.slice(0, 80),
  kind: q.type === 'number' || q.type === 'yesno' || (q.type === 'choice' && isNumericCodes(q.options)) ? 'numeric' : 'string',
  ...(labels(q.options) ? { valueLabels: labels(q.options)! } : q.type === 'yesno' ? { valueLabels: { '1': 'Yes', '0': 'No' } } : {}),
});

export interface ToStudyOptions {
  keepNames?: boolean;
  name?: string;
}

/**
 * Questions the questionnaire skipped (skip logic) are kept apart from
 * questions left unanswered: each variable that is asked only sometimes gets
 * a column <name>_asked (1 asked, 0 skipped), and its value is empty when
 * skipped, even if an answer was given before an earlier answer changed.
 */
export function interviewsToStudy(p: Protocol, interviews: Interview[], o: ToStudyOptions = {}, now = new Date()): Study {
  const v = protocolVariables(p);
  const it = items(p);
  const genScreens = p.screens.filter((s) => s.kind === 'nameGenerator' && !!s.showIf?.length);
  const tieShown = p.screens.filter((s) => (s.kind === 'tiesDraw' || s.kind === 'tiesPiles') && !!s.showIf?.length);
  const anyWave = interviews.some((iv) => iv.wave !== null);
  const egoCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'string' },
    ...(anyWave ? [{ name: 'wave', label: 'Survey wave', kind: 'string' } as Column] : []),
    { name: 'consent', label: 'Agreed to take part (1 = yes, 0 = no)', kind: 'numeric' },
    ...it.ego.flatMap((q): Column[] => [valueColumn(q), ...(conditional(q) ? [askedColumn(q)] : [])]),
    ...genScreens.map((s): Column => ({ name: `gen_${s.id}_asked`, label: `Asked: ${s.prompt}`.slice(0, 80), kind: 'numeric', valueLabels: ASKED_LABELS })),
    ...tieShown.map((s): Column => ({ name: `ties_${s.id}_asked`, label: `Asked who knows whom: ${s.title}`.slice(0, 80), kind: 'numeric', valueLabels: ASKED_LABELS })),
    { name: 'n_named', label: 'People named', kind: 'numeric' },
    { name: 'interview_mode', label: 'Interviewer or self-completed', kind: 'string' },
    { name: 'interviewer', label: 'Interviewer', kind: 'string' },
    { name: 'started', label: 'Interview started (UTC)', kind: 'string' },
    { name: 'finished', label: 'Interview finished (UTC); empty = not finished', kind: 'string' },
  ];
  const alterCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'string' },
    ...(anyWave ? [{ name: 'wave', label: 'Survey wave', kind: 'string' } as Column] : []),
    { name: 'alter_id', label: 'Person named (A01 … in the order named)', kind: 'string' },
    ...(o.keepNames ? [{ name: 'alter_name', label: 'Name or initials as typed', kind: 'string' } as Column] : []),
    ...v.generators.map((g): Column => ({ name: `gen_${g.id}`, label: `Named on: ${g.label}`.slice(0, 80), kind: 'numeric', valueLabels: { '1': 'Yes', '0': 'No' } })),
    ...it.alter.flatMap((q): Column[] => [valueColumn(q), ...(conditional(q) ? [askedColumn(q)] : [])]),
  ];
  const tieCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'string' },
    ...(anyWave ? [{ name: 'wave', label: 'Survey wave', kind: 'string' } as Column] : []),
    { name: 'alter_a', label: 'First person', kind: 'string' },
    { name: 'alter_b', label: 'Second person', kind: 'string' },
    { name: 'tie_type', label: 'Kind of tie asked about', kind: 'string' },
    { name: 'knows', label: 'Tied (1), asked and not tied (0)', kind: 'numeric' },
  ];
  const egoRows: Cell[][] = [];
  const alterRows: Cell[][] = [];
  const tieRows: Cell[][] = [];
  const seen = new Set<string>();
  // The latest copy of each interview wins if the same one came from two files.
  const latest = new Map<string, Interview>();
  for (const iv of interviews) {
    const prev = latest.get(iv.id);
    if (!prev || prev.updatedAt < iv.updatedAt) latest.set(iv.id, iv);
  }
  const tieScreens = p.screens.filter((s) => s.kind === 'tiesDraw' || s.kind === 'tiesPiles');
  for (const iv of [...latest.values()].sort((a, b) => a.egoId.localeCompare(b.egoId, 'en', { numeric: true }) || (a.wave ?? '').localeCompare(b.wave ?? '', 'en', { numeric: true }))) {
    const key = `${iv.egoId}\u0001${iv.wave ?? ''}`;
    if (seen.has(key)) throw new Error(`Two different interviews are for respondent ${iv.egoId}${iv.wave ? ` in wave ${iv.wave}` : ''}. Remove one before building the study.`);
    seen.add(key);
    const ids: Cell[] = [iv.egoId, ...(anyWave ? [iv.wave] : [])];
    const value = (q: Item, x: unknown): Cell => (q.type === 'text' ? ((x as Cell) ?? null) : num(x));
    const cells = (q: Item, x: unknown, a?: Alter): Cell[] => {
      if (!conditional(q)) return [value(q, x)];
      const yes = asked(q, iv, a);
      return [yes ? value(q, x) : null, yes ? 1 : 0];
    };
    egoRows.push([
      ...ids,
      iv.consent === null ? null : iv.consent ? 1 : 0,
      ...it.ego.flatMap((q) => cells(q, iv.ego[q.id])),
      ...genScreens.map((s) => (shows(s.showIf, iv) ? 1 : 0)),
      ...tieShown.map((s) => (shows(s.showIf, iv) ? 1 : 0)),
      iv.alters.length,
      iv.mode,
      iv.interviewer || null,
      iv.startedAt,
      iv.finishedAt,
    ]);
    for (const a of iv.alters) {
      alterRows.push([...ids, a.id, ...(o.keepNames ? [a.name] : []), ...v.generators.map((g) => (a.generators.includes(g.id) ? 1 : 0)), ...it.alter.flatMap((q) => cells(q, a.values[q.id], a))]);
    }
    // Every pair of a completed tie screen gets a row: 1 tied, 0 not; pairs of screens not reached get none (not known).
    for (const s of tieScreens) {
      if (!iv.tieScreensDone.includes(s.id) || !shows(s.showIf, iv) || (s.kind !== 'tiesDraw' && s.kind !== 'tiesPiles')) continue;
      const type = s.tieType;
      for (let i = 0; i < iv.alters.length; i++)
        for (let k = i + 1; k < iv.alters.length; k++) {
          const x = iv.alters[i]!.id;
          const y = iv.alters[k]!.id;
          const [a, b] = x < y ? [x, y] : [y, x];
          tieRows.push([...ids, a, b, type, iv.ties.some((t) => t.a === a && t.b === b && t.type === type) ? 1 : 0]);
        }
    }
  }
  const tables: { egos: DataTable; alters: DataTable; ties: DataTable | null } = {
    egos: { name: 'interviews (egos)', columns: egoCols, rows: egoRows },
    alters: { name: 'interviews (alters)', columns: alterCols, rows: alterRows },
    ties: tieRows.length ? { name: 'interviews (ties)', columns: tieCols, rows: tieRows } : null,
  };
  const closeness = v.alter.find((q) => p.screens.some((s) => s.kind === 'closeness' && s.variable === q.id));
  const s = newStudy(o.name ?? p.name, now);
  const mapping = {
    ...emptyMapping(),
    egoId: 'ego_id',
    egoWave: anyWave ? 'wave' : null,
    alterEgoId: 'ego_id',
    alterId: 'alter_id',
    alterWave: anyWave ? 'wave' : null,
    egoAlterStrength: closeness?.id ?? null,
    ...(tables.ties ? { tieEgoId: 'ego_id', tieA: 'alter_a', tieB: 'alter_b', tieType: 'tie_type', tieValue: 'knows', tieWave: anyWave ? 'wave' : null } : {}),
  };
  const finished = [...latest.values()].filter((iv) => iv.finishedAt).length;
  return withHistory(
    { ...s, ...tables, mapping },
    { kind: 'import', text: `Built from ${latest.size} interview${latest.size === 1 ? '' : 's'} (${finished} finished) with the protocol "${p.name}"${o.keepNames ? ', keeping the names as typed' : '; the names people typed were left out'}.`, detail: { protocol: p.id, interviews: latest.size } },
    now,
  );
}
