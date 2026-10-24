// Per-ego networks (P2.3): each ego's alters and the ties among them, built
// from the three tables and the mapping, and cut to a slice (tie types, a
// subgroup of alters, a strength cutoff) for measures and pictures.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, idText, isMissing, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { egoKey, tieState } from '../import/checks.ts';

export interface AlterRef {
  id: string;
  /** Row in the alters table. */
  row: number;
}

export interface TieRef {
  a: string;
  b: string;
  type: string | null;
  weight: number;
  /** true = tied, false = asked and not tied, null = not known. */
  state: boolean | null;
  row: number;
}

export interface EgoNetwork {
  key: string;
  id: string;
  wave: string | null;
  /** Row in the egos table. */
  row: number;
  alters: AlterRef[];
  ties: TieRef[];
}

export interface StudyNetworks {
  egos: EgoNetwork[];
  byKey: Map<string, EgoNetwork>;
  /** Tie types present in the tie file, sorted. */
  tieTypes: string[];
  waves: string[];
}

/** Build every ego's network. Rows that fail the ID checks are skipped. */
export function buildNetworks(study: Study): StudyNetworks {
  const m = study.mapping;
  const E = study.egos;
  const A = study.alters;
  const T = study.ties;
  const ci = (t: DataTable | null, c: string | null) => (t && c ? columnIndex(t, c) : -1);
  const eId = ci(E, m.egoId);
  const eWave = ci(E, m.egoWave);
  const egos: EgoNetwork[] = [];
  const byKey = new Map<string, EgoNetwork>();
  const waves = new Set<string>();
  E.rows.forEach((r, row) => {
    const id = eId >= 0 ? idText(r[eId]) : null;
    if (id === null) return;
    const wave = eWave >= 0 ? idText(r[eWave]) : null;
    const key = egoKey(id, wave);
    if (byKey.has(key)) return;
    if (wave !== null) waves.add(wave);
    const net: EgoNetwork = { key, id, wave, row, alters: [], ties: [] };
    egos.push(net);
    byKey.set(key, net);
  });
  const aEgo = ci(A, m.alterEgoId);
  const aId = ci(A, m.alterId);
  const aWave = ci(A, m.alterWave);
  const seen = new Set<string>();
  A.rows.forEach((r, row) => {
    const ego = aEgo >= 0 ? idText(r[aEgo]) : null;
    const id = aId >= 0 ? idText(r[aId]) : null;
    if (ego === null || id === null) return;
    const net = byKey.get(egoKey(ego, aWave >= 0 ? idText(r[aWave]) : null));
    if (!net) return;
    const k = `${net.key}\u0001${id}`;
    if (seen.has(k)) return;
    seen.add(k);
    net.alters.push({ id, row });
  });
  const types = new Set<string>();
  if (T) {
    const tEgo = ci(T, m.tieEgoId);
    const tA = ci(T, m.tieA);
    const tB = ci(T, m.tieB);
    const tType = ci(T, m.tieType);
    const tWave = ci(T, m.tieWave);
    const tWeight = ci(T, m.tieWeight);
    const tValue = ci(T, m.tieValue);
    const typeCol = tType >= 0 ? T.columns[tType] : undefined;
    T.rows.forEach((r, row) => {
      const ego = tEgo >= 0 ? idText(r[tEgo]) : null;
      const a = tA >= 0 ? idText(r[tA]) : null;
      const b = tB >= 0 ? idText(r[tB]) : null;
      if (ego === null || a === null || b === null || a === b) return;
      const net = byKey.get(egoKey(ego, tWave >= 0 ? idText(r[tWave]) : null));
      if (!net || !seen.has(`${net.key}\u0001${a}`) || !seen.has(`${net.key}\u0001${b}`)) return;
      const type = tType >= 0 ? categoryOf(typeCol, r[tType]) : null;
      if (type !== null) types.add(type);
      const w = tWeight >= 0 ? numberOf(r[tWeight]) : 1;
      let state = tieState(r, tValue);
      // A strength of 0 means no tie; a missing strength (with no tie-value column) means not known.
      if (tWeight >= 0 && tValue < 0) state = w === null ? null : w !== 0;
      net.ties.push({ a, b, type, weight: w ?? 1, state, row });
    });
  }
  return {
    egos,
    byKey,
    tieTypes: [...types].sort((x, y) => x.localeCompare(y, 'en', { numeric: true })),
    waves: [...waves].sort((x, y) => x.localeCompare(y, 'en', { numeric: true })),
  };
}

// ---------- slices ----------

export type ConditionOp = 'is' | 'isNot' | 'atLeast' | 'atMost' | 'notMissing';

/** A condition on an alter variable, such as "relation is kin" or "age at least 65". */
export interface Condition {
  column: string;
  op: ConditionOp;
  /** For is / isNot: any of these (category labels or codes). For atLeast / atMost: one number. */
  values: string[];
}

export interface Slice {
  /** Short name used in column names (letters, digits, underscore): "kin", "all". */
  id: string;
  label: string;
  /** Alter–alter tie types to count; null = all types. */
  tieTypes: string[] | null;
  /** With several tie types: a pair counts if tied in any of them (default) or only if tied in all of them. */
  tieTypeMode?: 'any' | 'all';
  /** Alters kept: all conditions must hold. */
  alterConditions: Condition[];
  /** Ties weaker than this are left out; null = keep all. */
  minWeight: number | null;
}

export const ALL: Slice = { id: 'all', label: 'All alters and ties', tieTypes: null, alterConditions: [], minWeight: null };

export function conditionHolds(column: Column | undefined, value: Cell | undefined, c: Condition): boolean {
  if (c.op === 'notMissing') return !isMissing(value);
  if (isMissing(value)) return false;
  if (c.op === 'atLeast' || c.op === 'atMost') {
    const n = numberOf(value);
    const limit = numberOf(c.values[0] ?? null);
    if (n === null || limit === null) return false;
    return c.op === 'atLeast' ? n >= limit : n <= limit;
  }
  const code = idText(value);
  const label = categoryOf(column, value);
  const hit = c.values.some((v) => v === code || v === label);
  return c.op === 'is' ? hit : !hit;
}

export function describeSlice(s: Slice): string {
  const parts: string[] = [];
  parts.push(s.tieTypes === null ? 'all tie types' : s.tieTypeMode === 'all' && s.tieTypes.length > 1 ? `pairs tied as all of: ${s.tieTypes.join(', ')}` : `tie types: ${s.tieTypes.join(', ') || 'none'}`);
  for (const c of s.alterConditions) {
    if (c.op === 'notMissing') parts.push(`alters with ${c.column} answered`);
    else if (c.op === 'atLeast') parts.push(`alters with ${c.column} ≥ ${c.values[0]}`);
    else if (c.op === 'atMost') parts.push(`alters with ${c.column} ≤ ${c.values[0]}`);
    else parts.push(`alters whose ${c.column} ${c.op === 'is' ? 'is' : 'is not'} ${c.values.join(' or ')}`);
  }
  if (s.minWeight !== null) parts.push(`ties of strength ${s.minWeight} or more`);
  return parts.join('; ');
}

// ---------- graphs ----------

/** One ego's network in a slice, as matrices over the kept alters. */
export interface Graph {
  n: number;
  alterIds: string[];
  /** Rows of the kept alters in the alters table. */
  alterRows: number[];
  /** Symmetric tie strength, n×n, 0 = no tie. */
  w: Float64Array;
  /** Symmetric: 1 where the pair's tie is not known. */
  unknown: Uint8Array;
  /** Ego–alter tie strength for each kept alter (1 if no strength column). */
  egoStrength: number[];
}

export function graphFor(study: Study, net: EgoNetwork, slice: Slice): Graph {
  const A = study.alters;
  const conds = slice.alterConditions.map((c) => ({ c, j: columnIndex(A, c.column) }));
  const kept = net.alters.filter((al) =>
    conds.every(({ c, j }) => (j < 0 ? false : conditionHolds(A.columns[j], A.rows[al.row]![j], c))),
  );
  const n = kept.length;
  const index = new Map(kept.map((al, i) => [al.id, i]));
  const w = new Float64Array(n * n);
  const unknown = new Uint8Array(n * n);
  const types = slice.tieTypes ? new Set(slice.tieTypes) : null;
  const allTypes = !!types && types.size > 1 && slice.tieTypeMode === 'all';
  const typesOf = new Map<number, Set<string>>();
  for (const t of net.ties) {
    const i = index.get(t.a);
    const k = index.get(t.b);
    if (i === undefined || k === undefined) continue;
    if (types && (t.type === null || !types.has(t.type))) continue;
    if (t.state === null) {
      // Not known, unless another row (another type) already says tied.
      if (w[i * n + k] === 0) {
        unknown[i * n + k] = 1;
        unknown[k * n + i] = 1;
      }
      continue;
    }
    if (!t.state) continue;
    if (slice.minWeight !== null && t.weight < slice.minWeight) continue;
    // Several rows for one pair (several tie types): keep the strongest.
    const v = Math.max(w[i * n + k]!, t.weight > 0 ? t.weight : 1);
    w[i * n + k] = v;
    w[k * n + i] = v;
    unknown[i * n + k] = 0;
    unknown[k * n + i] = 0;
    if (allTypes && t.type !== null) {
      const key = i < k ? i * n + k : k * n + i;
      const set = typesOf.get(key) ?? new Set<string>();
      set.add(t.type);
      typesOf.set(key, set);
    }
  }
  // "Tied in all of these types" (P8.3): a pair counts only if it is tied in every chosen type.
  if (allTypes)
    for (let i = 0; i < n; i++)
      for (let k = i + 1; k < n; k++) {
        if (!w[i * n + k]) continue;
        if ((typesOf.get(i * n + k)?.size ?? 0) < types!.size) {
          w[i * n + k] = 0;
          w[k * n + i] = 0;
        }
      }
  const sj = study.mapping.egoAlterStrength ? columnIndex(A, study.mapping.egoAlterStrength) : -1;
  const egoStrength = kept.map((al) => {
    if (sj < 0) return 1;
    const v = numberOf(A.rows[al.row]![sj]);
    return v !== null && v > 0 ? v : 1;
  });
  return { n, alterIds: kept.map((a) => a.id), alterRows: kept.map((a) => a.row), w, unknown, egoStrength };
}
