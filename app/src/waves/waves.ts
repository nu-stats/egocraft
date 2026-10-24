// Waves (P7.1–P7.4): the same alter matched across survey waves of an ego,
// and change between consecutive waves: who stayed, left and joined,
// turnover, the alter sets' Jaccard similarity, ties kept, lost and new
// (tie churn), and the change in each measure.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, idText, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { Results } from '../measures/measures.ts';
import { safeName } from '../measures/measures.ts';
import type { EgoNetwork, StudyNetworks } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';

/** How alters are matched across waves. */
export type MatchRule =
  | { kind: 'id' }
  | { kind: 'column'; column: string }
  /** Same answers on these columns (numbers within the tolerance); best match first, each alter used once. */
  | { kind: 'attributes'; columns: string[]; tolerance: number };

/** A match set by hand: in the later wave, `to` is the same person as `from` (or `to` null: nobody). */
export interface MatchOverride {
  egoId: string;
  waveFrom: string;
  waveTo: string;
  from: string;
  to: string | null;
}

export interface Transition {
  egoId: string;
  from: EgoNetwork;
  to: EgoNetwork;
  /** Alter in the earlier wave → the same person in the later wave. */
  matches: Map<string, string>;
  /** How each match was made, for the review list. */
  why: Map<string, string>;
}

const waveOrder = (a: string, b: string) => {
  const x = numberOf(a);
  const y = numberOf(b);
  return x !== null && y !== null ? x - y : a.localeCompare(b, 'en', { numeric: true });
};

function valueOf(study: Study, row: number, column: string): string | null {
  const j = columnIndex(study.alters, column);
  return j < 0 ? null : (categoryOf(study.alters.columns[j], study.alters.rows[row]![j])?.toLowerCase().trim() ?? null);
}

function match(study: Study, a: EgoNetwork, b: EgoNetwork, rule: MatchRule): { matches: Map<string, string>; why: Map<string, string> } {
  const matches = new Map<string, string>();
  const why = new Map<string, string>();
  if (rule.kind === 'id') {
    const later = new Set(b.alters.map((x) => x.id));
    for (const x of a.alters) if (later.has(x.id)) (matches.set(x.id, x.id), why.set(x.id, 'same alter ID'));
    return { matches, why };
  }
  if (rule.kind === 'column') {
    const byValue = new Map<string, string>();
    for (const y of b.alters) {
      const v = valueOf(study, y.row, rule.column);
      if (v && !byValue.has(v)) byValue.set(v, y.id);
    }
    for (const x of a.alters) {
      const v = valueOf(study, x.row, rule.column);
      const y = v ? byValue.get(v) : undefined;
      if (y && ![...matches.values()].includes(y)) (matches.set(x.id, y), why.set(x.id, `same ${rule.column}`));
    }
    return { matches, why };
  }
  // Attributes: score every pair, take the best first.
  const cols = rule.columns.map((c) => ({ c, j: columnIndex(study.alters, c) })).filter((x) => x.j >= 0);
  const pairs: { x: string; y: string; score: number }[] = [];
  for (const x of a.alters)
    for (const y of b.alters) {
      let ok = 0;
      let all = true;
      for (const { j } of cols) {
        const u = study.alters.rows[x.row]![j];
        const v = study.alters.rows[y.row]![j];
        const nu = numberOf(u);
        const nv = numberOf(v);
        const same = nu !== null && nv !== null ? Math.abs(nu - nv) <= rule.tolerance : idText(u) !== null && idText(u) === idText(v);
        if (same) ok++;
        else all = false;
      }
      if (cols.length && all) pairs.push({ x: x.id, y: y.id, score: ok + (x.id === y.id ? 0.5 : 0) });
    }
  pairs.sort((p, q) => q.score - p.score);
  const used = new Set<string>();
  for (const p of pairs) {
    if (matches.has(p.x) || used.has(p.y)) continue;
    matches.set(p.x, p.y);
    used.add(p.y);
    why.set(p.x, `same ${cols.map((c) => c.c).join(', ')}`);
  }
  return { matches, why };
}

/** Consecutive waves of each ego, with their alters matched. */
export function transitions(study: Study, rule: MatchRule, overrides: MatchOverride[] = [], nets: StudyNetworks = buildNetworks(study)): Transition[] {
  const byEgo = new Map<string, EgoNetwork[]>();
  for (const n of nets.egos) if (n.wave !== null) byEgo.set(n.id, [...(byEgo.get(n.id) ?? []), n]);
  const out: Transition[] = [];
  for (const [egoId, list] of byEgo) {
    list.sort((x, y) => waveOrder(x.wave!, y.wave!));
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const m = match(study, a, b, rule);
      for (const o of overrides) {
        if (o.egoId !== egoId || o.waveFrom !== a.wave || o.waveTo !== b.wave) continue;
        for (const [k, v] of m.matches) if (v === o.to) (m.matches.delete(k), m.why.delete(k));
        if (o.to === null) (m.matches.delete(o.from), m.why.delete(o.from));
        else (m.matches.set(o.from, o.to), m.why.set(o.from, 'set by hand'));
      }
      out.push({ egoId, from: a, to: b, ...m });
    }
  }
  return out.sort((x, y) => x.egoId.localeCompare(y.egoId, 'en', { numeric: true }) || waveOrder(x.from.wave!, y.from.wave!));
}

function tiedSet(net: EgoNetwork): Set<string> {
  const s = new Set<string>();
  for (const t of net.ties) if (t.state === true) s.add(t.a < t.b ? `${t.a}\u0001${t.b}` : `${t.b}\u0001${t.a}`);
  return s;
}

/**
 * One row per ego and pair of consecutive waves. With results, also the
 * change (later minus earlier) in each measure.
 */
export function changeTable(study: Study, trans: Transition[], results?: Results): DataTable {
  const r4 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 1e10) / 1e10);
  const measureCols = results ? results.table.columns.slice(study.mapping.egoWave ? 2 : 1) : [];
  const resultRow = new Map<string, Cell[]>();
  if (results) for (const row of results.table.rows) resultRow.set(`${idText(row[0])}\u0001${idText(row[1])}`, row);
  const columns: Column[] = [
    { name: 'ego_id', label: 'Ego ID', kind: 'string' },
    { name: 'wave_from', label: 'Earlier wave', kind: 'string' },
    { name: 'wave_to', label: 'Later wave', kind: 'string' },
    { name: 'size_from', label: 'Alters in the earlier wave', kind: 'numeric' },
    { name: 'size_to', label: 'Alters in the later wave', kind: 'numeric' },
    { name: 'kept', label: 'Alters named in both waves', kind: 'numeric' },
    { name: 'dropped', label: 'Alters not named again', kind: 'numeric' },
    { name: 'added', label: 'Alters named for the first time', kind: 'numeric' },
    { name: 'retention', label: 'Share of earlier alters named again', kind: 'numeric' },
    { name: 'turnover', label: 'Share of earlier alters not named again', kind: 'numeric' },
    { name: 'jaccard', label: 'Alters in both waves / alters in either wave', kind: 'numeric' },
    { name: 'ties_kept', label: 'Ties among kept alters, in both waves', kind: 'numeric' },
    { name: 'ties_lost', label: 'Ties among kept alters, earlier wave only', kind: 'numeric' },
    { name: 'ties_new', label: 'Ties among kept alters, later wave only', kind: 'numeric' },
    { name: 'tie_churn', label: 'Ties lost or new / ties in either wave (kept alters)', kind: 'numeric' },
    ...measureCols.map((c): Column => ({ name: safeName(`d_${c.name}`), label: `Change in: ${c.label ?? c.name}`.slice(0, 80), kind: 'numeric' })),
  ];
  const rows: Cell[][] = trans.map((t) => {
    const n1 = t.from.alters.length;
    const n2 = t.to.alters.length;
    const kept = t.matches.size;
    const tiesA = tiedSet(t.from);
    const tiesB = tiedSet(t.to);
    const keptIds = [...t.matches.keys()];
    let both = 0;
    let lost = 0;
    let fresh = 0;
    for (let i = 0; i < keptIds.length; i++)
      for (let k = i + 1; k < keptIds.length; k++) {
        const a = keptIds[i]!;
        const b = keptIds[k]!;
        const ka = a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
        const ya = t.matches.get(a)!;
        const yb = t.matches.get(b)!;
        const kb = ya < yb ? `${ya}\u0001${yb}` : `${yb}\u0001${ya}`;
        const x = tiesA.has(ka);
        const y = tiesB.has(kb);
        if (x && y) both++;
        else if (x) lost++;
        else if (y) fresh++;
      }
    const r1 = resultRow.get(`${t.egoId}\u0001${t.from.wave}`);
    const r2 = resultRow.get(`${t.egoId}\u0001${t.to.wave}`);
    const offset = study.mapping.egoWave ? 2 : 1;
    return [
      t.egoId,
      t.from.wave,
      t.to.wave,
      n1,
      n2,
      kept,
      n1 - kept,
      n2 - kept,
      n1 ? r4(kept / n1) : null,
      n1 ? r4(1 - kept / n1) : null,
      n1 + n2 - kept ? r4(kept / (n1 + n2 - kept)) : null,
      both,
      lost,
      fresh,
      both + lost + fresh ? r4((lost + fresh) / (both + lost + fresh)) : null,
      ...measureCols.map((_, k) => {
        const a = r1?.[offset + k];
        const b = r2?.[offset + k];
        return typeof a === 'number' && typeof b === 'number' ? r4(b - a) : null;
      }),
    ];
  });
  return { name: 'change between waves', columns, rows };
}

/** Measures with one row per ego and the waves side by side (density_w1, density_w2 …). */
export function measuresWide(study: Study, results: Results): DataTable {
  if (!study.mapping.egoWave) return results.table;
  const waves = [...new Set(results.table.rows.map((r) => idText(r[1])).filter((w): w is string => w !== null))].sort(waveOrder);
  const measureCols = results.table.columns.slice(2);
  const byEgo = new Map<string, Map<string, Cell[]>>();
  for (const r of results.table.rows) {
    const e = idText(r[0])!;
    const m = byEgo.get(e) ?? new Map<string, Cell[]>();
    m.set(idText(r[1])!, r);
    byEgo.set(e, m);
  }
  const columns: Column[] = [{ ...results.table.columns[0]! }, ...waves.flatMap((w) => measureCols.map((c): Column => ({ ...c, name: safeName(`${c.name.slice(0, 26)}_w${w}`), label: `${c.label ?? c.name} (wave ${w})`.slice(0, 80) })))];
  const rows: Cell[][] = [...byEgo.entries()].map(([e, m]) => [e, ...waves.flatMap((w) => measureCols.map((_, k) => m.get(w)?.[2 + k] ?? null))]);
  return { name: 'measures by wave', columns, rows };
}
