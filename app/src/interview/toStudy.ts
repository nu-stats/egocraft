// Finished (or partly finished) interviews into the three tables EgoCraft
// analyzes (P6.7), with variable labels and value labels from the protocol's
// wording, and the mapping filled in. The names respondents typed stay out
// of the study unless asked for.

import type { Cell, Column, DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { emptyMapping, newStudy, withHistory } from '../core/study.ts';
import type { Interview } from './interview.ts';
import type { Option, Protocol } from './protocol.ts';
import { protocolVariables } from './protocol.ts';

const labels = (options?: Option[]) => (options?.length ? Object.fromEntries(options.map((o) => [o.value, o.label])) : undefined);
const num = (v: unknown): Cell => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : String(v));
const isNumericCodes = (options?: Option[]) => !!options?.length && options.every((o) => /^-?\d+(\.\d+)?$/.test(o.value));

export interface ToStudyOptions {
  keepNames?: boolean;
  name?: string;
}

export function interviewsToStudy(p: Protocol, interviews: Interview[], o: ToStudyOptions = {}, now = new Date()): Study {
  const v = protocolVariables(p);
  const anyWave = interviews.some((iv) => iv.wave !== null);
  const egoCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'string' },
    ...(anyWave ? [{ name: 'wave', label: 'Survey wave', kind: 'string' } as Column] : []),
    { name: 'consent', label: 'Agreed to take part (1 = yes, 0 = no)', kind: 'numeric' },
    ...v.ego.map((q): Column => ({ name: q.id, label: q.label.slice(0, 80), kind: q.type === 'number' || q.type === 'yesno' || (q.type === 'choice' && isNumericCodes(q.options)) ? 'numeric' : 'string', ...(labels(q.options) ? { valueLabels: labels(q.options)! } : q.type === 'yesno' ? { valueLabels: { '1': 'Yes', '0': 'No' } } : {}) })),
    { name: 'n_named', label: 'People named', kind: 'numeric' },
    { name: 'interview_mode', label: 'Interviewer or self-completed', kind: 'string' },
    { name: 'interviewer', label: 'Interviewer', kind: 'string' },
    { name: 'started', label: 'Interview started (UTC)', kind: 'string' },
    { name: 'finished', label: 'Interview finished (UTC); empty = not finished', kind: 'string' },
  ];
  const alterQs = v.alter;
  const alterCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'string' },
    ...(anyWave ? [{ name: 'wave', label: 'Survey wave', kind: 'string' } as Column] : []),
    { name: 'alter_id', label: 'Person named (A01 … in the order named)', kind: 'string' },
    ...(o.keepNames ? [{ name: 'alter_name', label: 'Name or initials as typed', kind: 'string' } as Column] : []),
    ...v.generators.map((g): Column => ({ name: `gen_${g.id}`, label: `Named on: ${g.label}`.slice(0, 80), kind: 'numeric', valueLabels: { '1': 'Yes', '0': 'No' } })),
    ...alterQs.map((q): Column => ({ name: q.id, label: q.label.slice(0, 80), kind: q.type === 'number' || q.type === 'yesno' || (q.type === 'choice' && isNumericCodes(q.options)) ? 'numeric' : 'string', ...(labels(q.options) ? { valueLabels: labels(q.options)! } : q.type === 'yesno' ? { valueLabels: { '1': 'Yes', '0': 'No' } } : {}) })),
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
    egoRows.push([...ids, iv.consent === null ? null : iv.consent ? 1 : 0, ...v.ego.map((q) => (q.type === 'text' ? (iv.ego[q.id] ?? null) : num(iv.ego[q.id]))), iv.alters.length, iv.mode, iv.interviewer || null, iv.startedAt, iv.finishedAt]);
    for (const a of iv.alters) {
      alterRows.push([...ids, a.id, ...(o.keepNames ? [a.name] : []), ...v.generators.map((g) => (a.generators.includes(g.id) ? 1 : 0)), ...alterQs.map((q) => (q.type === 'text' ? (a.values[q.id] ?? null) : num(a.values[q.id])))]);
    }
    // Every pair of a completed tie screen gets a row: 1 tied, 0 not; pairs of screens not reached get none (not known).
    for (const s of tieScreens) {
      if (!iv.tieScreensDone.includes(s.id) || (s.kind !== 'tiesDraw' && s.kind !== 'tiesPiles')) continue;
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
  const closeness = alterQs.find((q) => p.screens.some((s) => s.kind === 'closeness' && s.variable === q.id));
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
