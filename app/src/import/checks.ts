// ID and link checks (P1.4). Each problem comes with a plain explanation and
// one or more fixes. A fix returns a new study (nothing is changed in place)
// and records itself in the study's history, so the import report and the
// recipe can say exactly what was done.

import type { Cell, DataTable } from '../core/data.ts';
import { columnIndex, idText, isMissing, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { mappingProblems, withHistory } from '../core/study.ts';

export type Severity = 'error' | 'warning' | 'info';

export interface FixOption {
  id: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: Severity;
  title: string;
  explain: string;
  count: number;
  /** A few examples, already written out ("ego 12, alter 3"). */
  examples: string[];
  fixes: FixOption[];
}

interface Finding {
  issue: Issue;
  apply: Record<string, (s: Study) => Study>;
}

const SEP = '\u0001';
export const egoKey = (id: string, wave: string | null) => `${id}${SEP}${wave ?? ''}`;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function egoLabel(id: string, wave: string | null): string {
  return wave === null ? `ego ${id}` : `ego ${id} (wave ${wave})`;
}

function dropRows(table: DataTable, drop: Set<number>): DataTable {
  return { ...table, rows: table.rows.filter((_, i) => !drop.has(i)) };
}

function col(table: DataTable | null, name: string | null): number {
  return table && name ? columnIndex(table, name) : -1;
}

function val(row: Cell[], j: number): string | null {
  return j < 0 ? null : idText(row[j]);
}

/** Whether a tie row says the pair is tied (true), not tied (false) or not known (null). */
export function tieState(row: Cell[], valueCol: number): boolean | null {
  if (valueCol < 0) return true;
  const v = row[valueCol];
  if (isMissing(v)) return null;
  const n = numberOf(v);
  if (n !== null) return n !== 0;
  const s = String(v).trim().toLowerCase();
  if (['no', 'n', 'false', 'f', 'not tied', 'none'].includes(s)) return false;
  if (["don't know", 'dont know', 'dk', 'unknown', 'refused', 'na', 'n/a'].includes(s)) return null;
  return true;
}

function findings(study: Study): Finding[] {
  if (mappingProblems(study).length) return [];
  const m = study.mapping;
  const out: Finding[] = [];
  const E = study.egos;
  const A = study.alters;
  const T = study.ties && study.ties.rows.length ? study.ties : null;
  const eId = col(E, m.egoId);
  const eWave = col(E, m.egoWave);
  const aEgo = col(A, m.alterEgoId);
  const aId = col(A, m.alterId);
  const aWave = col(A, m.alterWave);

  // ---- egos ----
  const blankEgo = new Set<number>();
  const seenEgo = new Map<string, number>();
  const dupEgo = new Set<number>();
  E.rows.forEach((r, i) => {
    const id = val(r, eId);
    if (id === null) return void blankEgo.add(i);
    const k = egoKey(id, val(r, eWave));
    if (seenEgo.has(k)) dupEgo.add(i);
    else seenEgo.set(k, i);
  });
  if (blankEgo.size)
    out.push({
      issue: {
        id: 'ego-missing-id',
        severity: 'error',
        title: `${plural(blankEgo.size, 'ego row')} without an ego ID`,
        explain: 'Rows of the ego file with an empty ego ID cannot be linked to any alters.',
        count: blankEgo.size,
        examples: [...blankEgo].slice(0, 5).map((i) => `row ${i + 2} of the ego file`),
        fixes: [{ id: 'drop', label: 'Remove these rows' }],
      },
      apply: { drop: (s) => withHistory({ ...s, egos: dropRows(s.egos, blankEgo) }, { kind: 'fix', text: `Removed ${plural(blankEgo.size, 'ego row')} without an ego ID.`, detail: { check: 'ego-missing-id', fix: 'drop' } }) },
    });
  if (dupEgo.size) {
    const ex = [...dupEgo].slice(0, 5).map((i) => egoLabel(val(E.rows[i]!, eId)!, val(E.rows[i]!, eWave)));
    out.push({
      issue: {
        id: 'ego-duplicate',
        severity: 'error',
        title: `${plural(dupEgo.size, 'ego ID')} used more than once`,
        explain: eWave >= 0 ? 'The same ego ID appears twice in the same wave, so EgoCraft cannot tell which row the alters belong to.' : 'The same ego ID appears on more than one row. If the file has several survey waves, choose its wave column on the mapping screen; otherwise keep the first row of each.',
        count: dupEgo.size,
        examples: ex,
        fixes: [{ id: 'keep-first', label: 'Keep the first row of each ego, remove the rest' }],
      },
      apply: { 'keep-first': (s) => withHistory({ ...s, egos: dropRows(s.egos, dupEgo) }, { kind: 'fix', text: `Removed ${plural(dupEgo.size, 'repeated ego row')}, keeping the first row of each ego.`, detail: { check: 'ego-duplicate', fix: 'keep-first' } }) },
    });
  }
  const egoKeys = new Set(seenEgo.keys());

  // ---- alters ----
  const blankAlter = new Set<number>();
  const orphan = new Set<number>();
  const orphanEgos = new Map<string, [string, string | null]>();
  const dupAlter = new Set<number>();
  const alterKeys = new Set<string>();
  const altersPerEgo = new Map<string, number>();
  A.rows.forEach((r, i) => {
    const ego = val(r, aEgo);
    const id = val(r, aId);
    if (ego === null || id === null) return void blankAlter.add(i);
    const wave = val(r, aWave);
    const k = egoKey(ego, wave);
    if (!egoKeys.has(k)) {
      orphan.add(i);
      orphanEgos.set(k, [ego, wave]);
      return;
    }
    const ak = k + SEP + id;
    if (alterKeys.has(ak)) return void dupAlter.add(i);
    alterKeys.add(ak);
    altersPerEgo.set(k, (altersPerEgo.get(k) ?? 0) + 1);
  });
  if (blankAlter.size)
    out.push({
      issue: {
        id: 'alter-missing-id',
        severity: 'error',
        title: `${plural(blankAlter.size, 'alter row')} without an ego ID or alter ID`,
        explain: 'Alters need both the ego ID (who named them) and their own ID. Rows missing either cannot be placed in a network.',
        count: blankAlter.size,
        examples: [...blankAlter].slice(0, 5).map((i) => `row ${i + 2} of the alter file`),
        fixes: [{ id: 'drop', label: 'Remove these rows' }],
      },
      apply: { drop: (s) => withHistory({ ...s, alters: dropRows(s.alters, blankAlter) }, { kind: 'fix', text: `Removed ${plural(blankAlter.size, 'alter row')} without an ego ID or alter ID.`, detail: { check: 'alter-missing-id', fix: 'drop' } }) },
    });

  // Lost leading zeros: "007" in the ego file but 7 in the alter file.
  const egoIdsText = [...seenEgo.keys()].map((k) => k.split(SEP)[0]!);
  const width = egoIdsText.reduce((w, s) => (/^\d+$/.test(s) ? Math.max(w, s.length) : w), 0);
  const padded = new Set<number>();
  if (orphan.size && egoIdsText.some((s) => /^0\d/.test(s))) {
    for (const i of orphan) {
      const r = A.rows[i]!;
      const ego = val(r, aEgo)!;
      if (/^\d+$/.test(ego) && egoKeys.has(egoKey(ego.padStart(width, '0'), val(r, aWave)))) padded.add(i);
    }
  }
  if (padded.size) {
    const egoCol = A.columns[aEgo]!;
    out.push({
      issue: {
        id: 'alter-lost-zeros',
        severity: 'error',
        title: `${plural(padded.size, 'alter')} whose ego ID lost its leading zeros`,
        explain: `The ego file writes IDs with leading zeros (such as "${egoIdsText.find((s) => /^0\d/.test(s))}"), but the alter file has them as plain numbers. This often happens when a file passes through Excel.`,
        count: padded.size,
        examples: [...padded].slice(0, 5).map((i) => `alter file row ${i + 2}: ${val(A.rows[i]!, aEgo)} → ${val(A.rows[i]!, aEgo)!.padStart(width, '0')}`),
        fixes: [{ id: 'pad', label: `Put the zeros back (pad ego IDs in the alter file to ${width} digits)` }],
      },
      apply: {
        pad: (s) => {
          const j = columnIndex(s.alters, egoCol.name);
          const alters: DataTable = {
            ...s.alters,
            columns: s.alters.columns.map((c, k) => (k === j ? { ...c, kind: 'string' } : c)),
            rows: s.alters.rows.map((r) => {
              const v = idText(r[j]);
              if (v === null || !/^\d+$/.test(v)) return r;
              const copy = r.slice();
              copy[j] = v.padStart(width, '0');
              return copy;
            }),
          };
          return withHistory({ ...s, alters }, { kind: 'fix', text: `Padded ego IDs in the alter file with leading zeros to ${width} digits.`, detail: { check: 'alter-lost-zeros', fix: 'pad', width } });
        },
      },
    });
  }
  const trueOrphans = new Set([...orphan].filter((i) => !padded.has(i)));
  if (trueOrphans.size) {
    const missingEgos = new Map<string, [string, string | null]>();
    for (const i of trueOrphans) {
      const r = A.rows[i]!;
      const ego = val(r, aEgo)!;
      const wave = val(r, aWave);
      missingEgos.set(egoKey(ego, wave), [ego, wave]);
    }
    out.push({
      issue: {
        id: 'alter-orphan',
        severity: 'error',
        title: `${plural(trueOrphans.size, 'alter')} named by egos who are not in the ego file`,
        explain: `These alters point to ${plural(missingEgos.size, 'ego ID')} that the ego file does not have${aWave >= 0 ? ' (in that wave)' : ''}. Either the ego file is missing people, or the IDs were typed differently.`,
        count: trueOrphans.size,
        examples: [...missingEgos.values()].slice(0, 5).map(([id, w]) => egoLabel(id, w)),
        fixes: [
          { id: 'drop', label: 'Remove these alters' },
          { id: 'add-egos', label: 'Add the missing egos to the ego file (with empty ego variables)' },
        ],
      },
      apply: {
        drop: (s) => withHistory({ ...s, alters: dropRows(s.alters, trueOrphans) }, { kind: 'fix', text: `Removed ${plural(trueOrphans.size, 'alter')} whose ego is not in the ego file.`, detail: { check: 'alter-orphan', fix: 'drop' } }),
        'add-egos': (s) => {
          const ei = columnIndex(s.egos, m.egoId);
          const ew = m.egoWave ? columnIndex(s.egos, m.egoWave) : -1;
          const add = [...missingEgos.values()].map(([id, w]) => {
            const row: Cell[] = s.egos.columns.map(() => null);
            row[ei] = s.egos.columns[ei]!.kind === 'numeric' && numberOf(id) !== null ? numberOf(id) : id;
            if (ew >= 0) row[ew] = s.egos.columns[ew]!.kind === 'numeric' && numberOf(w) !== null ? numberOf(w) : w;
            return row;
          });
          return withHistory({ ...s, egos: { ...s.egos, rows: [...s.egos.rows, ...add] } }, { kind: 'fix', text: `Added ${plural(add.length, 'ego')} to the ego file that only appeared in the alter file.`, detail: { check: 'alter-orphan', fix: 'add-egos' } });
        },
      },
    });
  }
  if (dupAlter.size)
    out.push({
      issue: {
        id: 'alter-duplicate',
        severity: 'error',
        title: `${plural(dupAlter.size, 'alter ID')} used twice by the same ego`,
        explain: 'Each alter needs an ID that is unique within its ego (alter 1, alter 2 …). Repeated IDs make ties between alters ambiguous.',
        count: dupAlter.size,
        examples: [...dupAlter].slice(0, 5).map((i) => `${egoLabel(val(A.rows[i]!, aEgo)!, val(A.rows[i]!, aWave))}, alter ${val(A.rows[i]!, aId)}`),
        fixes: [{ id: 'keep-first', label: 'Keep the first row of each alter, remove the repeats' }],
      },
      apply: { 'keep-first': (s) => withHistory({ ...s, alters: dropRows(s.alters, dupAlter) }, { kind: 'fix', text: `Removed ${plural(dupAlter.size, 'repeated alter row')}, keeping the first of each.`, detail: { check: 'alter-duplicate', fix: 'keep-first' } }) },
    });
  const lonely = [...egoKeys].filter((k) => !altersPerEgo.has(k));
  if (lonely.length)
    out.push({
      issue: {
        id: 'ego-no-alters',
        severity: 'info',
        title: `${plural(lonely.length, 'ego')} with no alters`,
        explain: 'These egos named nobody, or skipped the network questions. They get a size of 0, and measures that need alters are left empty. If they skipped the questions, mark that with an ego variable so the two can be told apart.',
        count: lonely.length,
        examples: lonely.slice(0, 5).map((k) => {
          const [id, w] = k.split(SEP);
          return egoLabel(id!, w ? w : null);
        }),
        fixes: [],
      },
      apply: {},
    });

  // ---- ties ----
  if (T) {
    const tEgo = col(T, m.tieEgoId);
    const tA = col(T, m.tieA);
    const tB = col(T, m.tieB);
    const tType = col(T, m.tieType);
    const tWave = col(T, m.tieWave);
    const tWeight = col(T, m.tieWeight);
    const blank = new Set<number>();
    const noEgo = new Set<number>();
    const noAlter = new Set<number>();
    const self = new Set<number>();
    const noType = new Set<number>();
    const firstOf = new Map<string, number>();
    const dups = new Map<string, number[]>();
    T.rows.forEach((r, i) => {
      const ego = val(r, tEgo);
      const a = val(r, tA);
      const b = val(r, tB);
      if (ego === null || a === null || b === null) return void blank.add(i);
      const k = egoKey(ego, val(r, tWave));
      if (!egoKeys.has(k)) return void noEgo.add(i);
      if (!alterKeys.has(k + SEP + a) || !alterKeys.has(k + SEP + b)) return void noAlter.add(i);
      if (a === b) return void self.add(i);
      if (tType >= 0 && isMissing(r[tType]) && tieState(r, col(T, m.tieValue)) === true) noType.add(i);
      const [x, y] = a < b ? [a, b] : [b, a];
      const pk = [k, x, y, tType >= 0 ? (val(r, tType) ?? '') : ''].join(SEP);
      if (firstOf.has(pk)) {
        const list = dups.get(pk) ?? [firstOf.get(pk)!];
        list.push(i);
        dups.set(pk, list);
      } else firstOf.set(pk, i);
    });
    const simple = (id: string, rows: Set<number>, severity: Severity, title: string, explain: string, describe: (i: number) => string, fixLabel = 'Remove these rows') => {
      if (!rows.size) return;
      out.push({
        issue: { id, severity, title, explain, count: rows.size, examples: [...rows].slice(0, 5).map(describe), fixes: [{ id: 'drop', label: fixLabel }] },
        apply: { drop: (s) => withHistory({ ...s, ties: s.ties ? dropRows(s.ties, rows) : s.ties }, { kind: 'fix', text: `${title}: removed.`, detail: { check: id, fix: 'drop', rows: rows.size } }) },
      });
    };
    const tieText = (i: number) => {
      const r = T.rows[i]!;
      return `${egoLabel(val(r, tEgo) ?? '?', val(r, tWave))}: alter ${val(r, tA) ?? '?'} – alter ${val(r, tB) ?? '?'}`;
    };
    simple('tie-missing-id', blank, 'error', `${plural(blank.size, 'tie row')} missing an ego or alter ID`, 'A tie needs the ego ID and both alter IDs.', (i) => `row ${i + 2} of the tie file`);
    simple('tie-orphan-ego', noEgo, 'error', `${plural(noEgo.size, 'tie')} for egos not in the ego file`, 'These ties belong to ego IDs the ego file does not have.', tieText);
    simple('tie-unknown-alter', noAlter, 'error', `${plural(noAlter.size, 'tie')} pointing to alters the ego did not name`, 'One or both alter IDs are not among that ego’s alters (often a typo, or an alter from another ego or wave).', tieText);
    simple('tie-self', self, 'warning', `${plural(self.size, 'tie')} from an alter to itself`, 'A tie needs two different alters.', tieText);
    simple('tie-no-type', noType, 'warning', `${plural(noType.size, 'tie')} without a tie type`, 'These rows have an empty tie type, so filters by tie type will leave them out.', tieText);
    if (dups.size) {
      const extra = [...dups.values()].reduce((n, l) => n + l.length - 1, 0);
      let disagree = 0;
      for (const list of dups.values()) {
        const ws = new Set(list.map((i) => (tWeight >= 0 ? String(numberOf(T.rows[i]![tWeight]) ?? '') : '1')));
        if (ws.size > 1) disagree++;
      }
      const keep = (how: 'first' | 'strongest' | 'weakest') => {
        const drop = new Set<number>();
        for (const list of dups.values()) {
          let keepAt = list[0]!;
          if (how !== 'first' && tWeight >= 0) {
            for (const i of list) {
              const w = numberOf(T.rows[i]![tWeight]) ?? -Infinity;
              const best = numberOf(T.rows[keepAt]![tWeight]) ?? -Infinity;
              if (how === 'strongest' ? w > best : w < best) keepAt = i;
            }
          }
          for (const i of list) if (i !== keepAt) drop.add(i);
        }
        return drop;
      };
      const fixes: FixOption[] = [{ id: 'keep-first', label: 'Keep the first row of each pair' }];
      if (tWeight >= 0) fixes.push({ id: 'keep-strongest', label: 'Keep the strongest of each pair' }, { id: 'keep-weakest', label: 'Keep the weakest of each pair' });
      const apply = (how: 'first' | 'strongest' | 'weakest') => (s: Study) => withHistory({ ...s, ties: s.ties ? dropRows(s.ties, keep(how)) : s.ties }, { kind: 'fix', text: `Removed ${plural(extra, 'repeated tie row')}, keeping the ${how} of each pair.`, detail: { check: 'tie-duplicate', fix: `keep-${how}` } });
      out.push({
        issue: {
          id: 'tie-duplicate',
          severity: 'warning',
          title: `${plural(dups.size, 'alter pair')} entered more than once`,
          explain: `The same pair of alters appears on more than one row${tType >= 0 ? ' for the same tie type' : ''} (A–B and B–A count as the same pair).${disagree ? ` For ${plural(disagree, 'pair')} the rows disagree about the strength.` : ''}`,
          count: dups.size,
          examples: [...dups.values()].slice(0, 5).map((l) => tieText(l[0]!)),
          fixes,
        },
        apply: { 'keep-first': apply('first'), 'keep-strongest': apply('strongest'), 'keep-weakest': apply('weakest') },
      });
    }
  }
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.issue.severity] - order[b.issue.severity]);
}

/** The problems in the study, errors first. Empty until the mapping is complete. */
export function runChecks(study: Study): Issue[] {
  return findings(study).map((f) => f.issue);
}

/** Apply one fix. Throws if the problem is no longer there (the data changed). */
export function applyFix(study: Study, issueId: string, fixId: string): Study {
  const f = findings(study).find((x) => x.issue.id === issueId);
  const fix = f?.apply[fixId];
  if (!fix) throw new Error('That problem is no longer in the data. Check again.');
  return fix(study);
}

/** Whether measures can be trusted: no error-level problems left. */
export function blockingIssues(study: Study): Issue[] {
  return runChecks(study).filter((i) => i.severity === 'error');
}
