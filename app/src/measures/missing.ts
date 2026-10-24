// Missing data (P9.1, P9.4): the kinds of missing information kept apart,
// and a sensitivity table of key results under each way of handling pairs
// of alters whose tie is not known.

import type { Cell, DataTable } from '../core/data.ts';
import { columnIndex, isMissing } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { Graph, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, graphFor } from '../network/networks.ts';
import * as S from './structure.ts';

const DONT_KNOW = ["don't know", 'dont know', 'dk', 'unknown', 'refused', 'na', 'n/a'];

/** How many of each kind of missing information the study has. */
export function missingSummary(study: Study, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const rows: Cell[][] = [];
  const egos = nets.egos.length;
  const nobody = nets.egos.filter((n) => n.alters.length === 0).length;
  rows.push(['Egos who named nobody', nobody, egos ? nobody / egos : null, 'Size 0. If some skipped the questions instead, mark them with an ego variable and leave them out with a subgroup or in your models.']);
  let pairs = 0;
  let notAsked = 0;
  let dontKnow = 0;
  const vj = study.ties && study.mapping.tieValue ? columnIndex(study.ties, study.mapping.tieValue) : -1;
  for (const net of nets.egos) {
    const g = graphFor(study, net, ALL);
    pairs += (g.n * (g.n - 1)) / 2;
    const unknownPairs = new Set<string>();
    for (const t of net.ties) {
      if (t.state !== null) continue;
      const k = t.a < t.b ? `${t.a}\u0001${t.b}` : `${t.b}\u0001${t.a}`;
      if (unknownPairs.has(k)) continue;
      unknownPairs.add(k);
      const raw = vj >= 0 ? study.ties!.rows[t.row]![vj] : null;
      if (!isMissing(raw) && DONT_KNOW.includes(String(raw).trim().toLowerCase())) dontKnow++;
      else notAsked++;
    }
  }
  rows.push(['Alter pairs not asked (empty answer)', notAsked, pairs ? notAsked / pairs : null, 'Often by design: only the first alters were asked about.']);
  rows.push(['Alter pairs answered “don’t know” or refused', dontKnow, pairs ? dontKnow / pairs : null, 'Asked, but the respondent could not or would not say.']);
  const skip = new Set([study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave]);
  const alters = nets.egos.reduce((a, n) => a + n.alters.length, 0);
  study.alters.columns.forEach((c, j) => {
    if (skip.has(c.name)) return;
    let miss = 0;
    for (const n of nets.egos) for (const a of n.alters) if (isMissing(study.alters.rows[a.row]![j])) miss++;
    if (miss) rows.push([`Alters with ${c.name} unanswered`, miss, alters ? miss / alters : null, c.label ?? '']);
  });
  const r3 = (v: Cell) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);
  return {
    name: 'missing information',
    columns: [
      { name: 'kind', kind: 'string' },
      { name: 'count', kind: 'numeric' },
      { name: 'share', label: 'Share of egos, pairs or alters', kind: 'numeric' },
      { name: 'note', kind: 'string' },
    ],
    rows: rows.map((r) => r.map(r3)),
  };
}

/** The same graph with every unknown pair counted as tied (the upper bound). */
function unknownAsTied(g: Graph): Graph {
  const w = Float64Array.from(g.w);
  for (let i = 0; i < g.n * g.n; i++) if (g.unknown[i]) w[i] = 1;
  return { ...g, w, unknown: new Uint8Array(g.n * g.n) };
}

const KEY: { name: string; f: (g: Graph, rule: 'noTie' | 'observed') => number | null }[] = [
  { name: 'Density', f: (g, rule) => S.density(g, rule) },
  { name: 'Mean degree', f: (g) => (g.n ? S.degrees(g).reduce((a, b) => a + b, 0) / g.n : null) },
  { name: 'Ego betweenness (0–1)', f: (g) => S.egoBetweennessNormalized(g) },
  { name: 'Effective size', f: (g) => S.effectiveSize(g) },
  { name: 'Constraint', f: (g) => S.constraint(g) },
  { name: 'Components', f: (g) => (g.n ? S.components(g).length : null) },
];

/**
 * Key results (means over egos with two or more alters) under each rule:
 * unknown pairs counted as not tied, as tied, left out (density only), and
 * only the egos with at most 20% of pairs unknown.
 */
export function sensitivityTable(study: Study, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const graphs = nets.egos.map((n) => graphFor(study, n, ALL)).filter((g) => g.n >= 2);
  const share = (g: Graph) => S.unknownPairs(g) / ((g.n * (g.n - 1)) / 2);
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;
  };
  const few = graphs.filter((g) => share(g) <= 0.2);
  const rows: Cell[][] = KEY.map((k) => [
    k.name,
    mean(graphs.map((g) => k.f(g, 'noTie'))),
    mean(graphs.map((g) => k.f(unknownAsTied(g), 'noTie'))),
    k.name === 'Density' ? mean(graphs.map((g) => k.f(g, 'observed'))) : null,
    mean(few.map((g) => k.f(g, 'noTie'))),
  ]);
  rows.push(['Egos (with 2+ alters)', graphs.length, graphs.length, graphs.length, few.length]);
  return {
    name: 'sensitivity',
    columns: [
      { name: 'measure', kind: 'string' },
      { name: 'unknown_as_not_tied', label: 'Unknown pairs counted as not tied', kind: 'numeric' },
      { name: 'unknown_as_tied', label: 'Unknown pairs counted as tied (upper bound)', kind: 'numeric' },
      { name: 'answered_pairs_only', label: 'Unknown pairs left out (density only)', kind: 'numeric' },
      { name: 'egos_20pct_or_less_unknown', label: 'Only egos with at most 20% of pairs unknown', kind: 'numeric' },
    ],
    rows,
  };
}
