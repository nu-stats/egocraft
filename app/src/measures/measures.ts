// The measures a user can choose (P3), each computed on a slice, and the
// results file: one row per ego (and wave) with a codebook (P5.1, P5.2).

import type { Cell, Column, DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, idText, isMissing, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { EgoNetwork, Graph, Slice, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, describeSlice, graphFor } from '../network/networks.ts';
import * as S from './structure.ts';

export type CompositionStat = 'mean' | 'sd' | 'median' | 'min' | 'max' | 'share' | 'shareAtLeast' | 'count';
export type DiversityIndex = 'blau' | 'iqv' | 'entropy' | 'categories';
export type SimilarityIndex = 'ei' | 'sameShare' | 'meanAbsDiff';

export type MeasureSpec =
  | { kind: 'size' }
  | { kind: 'ties' }
  | { kind: 'density' }
  | { kind: 'weightedDensity' }
  | { kind: 'meanDegree' }
  | { kind: 'maxDegree' }
  | { kind: 'egoBetweenness' }
  | { kind: 'egoBetweennessNorm' }
  | { kind: 'meanAlterBetweenness' }
  | { kind: 'maxAlterBetweenness' }
  | { kind: 'effectiveSize' }
  | { kind: 'efficiency' }
  | { kind: 'constraint' }
  | { kind: 'hierarchy' }
  | { kind: 'components' }
  | { kind: 'largestComponentShare' }
  | { kind: 'isolates' }
  | { kind: 'unknownPairs' }
  | { kind: 'composition'; variable: string; stat: CompositionStat; values?: string[] }
  | { kind: 'diversity'; variable: string; index: DiversityIndex }
  | { kind: 'similarity'; egoVariable: string; alterVariable: string; index: SimilarityIndex }
  | { kind: 'yulesQ'; variable: string }
  /** Ego–alter layers: alter columns that say yes/no to a kind of tie (gen_discuss, gives_money …). */
  | { kind: 'multiplexity'; columns: string[]; stat: 'mean' | 'shareMulti' }
  | { kind: 'layerOverlap'; a: string; b: string }
  /** Alter–alter layers: the tie types in the tie file. */
  | { kind: 'tieMultiplexity' }
  | { kind: 'tieLayerOverlap'; a: string; b: string };

export type MeasureKind = MeasureSpec['kind'];

export interface MeasureRequest {
  spec: MeasureSpec;
  sliceId: string;
  /** Column name to use instead of the generated one. */
  column?: string;
}

interface Info {
  short: string;
  name: string;
  group: 'Size and structure' | 'Brokerage' | 'Groups' | 'Composition' | 'Similarity' | 'Data quality' | 'Several kinds of tie';
  explain: string;
  citation?: string;
}

/** What each measure is, in plain words, for the measure picker and the codebook. */
export const MEASURE_INFO: Record<MeasureKind, Info> = {
  size: { short: 'size', name: 'Size', group: 'Size and structure', explain: 'Number of alters.' },
  ties: { short: 'ties', name: 'Alter–alter ties', group: 'Size and structure', explain: 'Number of pairs of alters who are tied.' },
  density: { short: 'density', name: 'Density', group: 'Size and structure', explain: 'Ties between alters divided by the number of pairs of alters (ego left out). 0 = no alters know each other, 1 = all do.' },
  weightedDensity: { short: 'wdensity', name: 'Weighted density', group: 'Size and structure', explain: 'Mean strength of the tie over all pairs of alters (no tie = 0).' },
  meanDegree: { short: 'degmean', name: 'Mean degree', group: 'Size and structure', explain: 'Average number of other alters each alter is tied to.' },
  maxDegree: { short: 'degmax', name: 'Largest degree', group: 'Size and structure', explain: 'Ties of the best-connected alter.' },
  egoBetweenness: { short: 'egobet', name: 'Ego betweenness', group: 'Brokerage', explain: 'How much the ego sits between alters who do not know each other: for each untied pair, 1 / (1 + the number of alters tied to both).', citation: 'Everett and Borgatti (2005)' },
  egoBetweennessNorm: { short: 'egobetn', name: 'Ego betweenness (0–1)', group: 'Brokerage', explain: 'Ego betweenness divided by the number of pairs of alters.', citation: 'Everett and Borgatti (2005)' },
  meanAlterBetweenness: { short: 'altbetmean', name: 'Mean alter betweenness', group: 'Brokerage', explain: 'Average betweenness of the alters in the network without the ego.', citation: 'Freeman (1977)' },
  maxAlterBetweenness: { short: 'altbetmax', name: 'Largest alter betweenness', group: 'Brokerage', explain: 'Betweenness of the alter who most connects the others (ego left out).', citation: 'Freeman (1977)' },
  effectiveSize: { short: 'effsize', name: 'Effective size', group: 'Brokerage', explain: 'Number of alters minus their redundancy (how much they are tied to each other). With equal ties: size − 2 × ties / size.', citation: 'Burt (1992); Borgatti (1997)' },
  efficiency: { short: 'efficiency', name: 'Efficiency', group: 'Brokerage', explain: 'Effective size divided by size.', citation: 'Burt (1992)' },
  constraint: { short: 'constraint', name: 'Constraint', group: 'Brokerage', explain: 'How much the ego’s time and energy go to alters who are tied to each other. High = a closed network with few structural holes.', citation: 'Burt (1992)' },
  hierarchy: { short: 'hierarchy', name: 'Hierarchy', group: 'Brokerage', explain: 'How much constraint comes from one alter (0 = spread evenly).', citation: 'Burt (1992)' },
  components: { short: 'ncomp', name: 'Components', group: 'Groups', explain: 'Number of separate groups of alters once the ego is left out (an alter tied to nobody is a group of one).' },
  largestComponentShare: { short: 'bigcomp', name: 'Largest group share', group: 'Groups', explain: 'Share of alters in the largest group (ego left out).' },
  isolates: { short: 'isolates', name: 'Isolates', group: 'Groups', explain: 'Alters tied to no other alter.' },
  unknownPairs: { short: 'pairs_unknown', name: 'Pairs not known', group: 'Data quality', explain: 'Pairs of alters whose tie was not asked or not answered.' },
  composition: { short: 'comp', name: 'Composition', group: 'Composition', explain: 'A summary of an alter variable across the ego’s alters (mean, share …).' },
  diversity: { short: 'div', name: 'Diversity', group: 'Composition', explain: 'How mixed the alters are on a category: number of categories, Blau’s index (chance two alters differ), IQV (Blau scaled 0–1), or entropy.', citation: 'Blau (1977); Agresti and Agresti (1978)' },
  similarity: { short: 'sim', name: 'Ego–alter similarity', group: 'Similarity', explain: 'How alike the ego and alters are: E-I index (alters in other groups minus same group, over all), share same as ego, or mean absolute difference.', citation: 'Krackhardt and Stern (1988)' },
  multiplexity: { short: 'mplex', name: 'Multiplexity (ego–alter)', group: 'Several kinds of tie', explain: 'How many kinds of tie the ego has with each alter (from yes/no alter columns, such as the name generators): the mean number, or the share of alters tied in more than one way.', citation: 'Verbrugge (1979)' },
  layerOverlap: { short: 'overlap', name: 'Overlap of two kinds of tie (ego–alter)', group: 'Several kinds of tie', explain: 'Alters tied to the ego both ways, divided by alters tied either way (Jaccard): do the people you discuss things with also help you?' },
  tieMultiplexity: { short: 'aamplex', name: 'Multiplexity (alter–alter)', group: 'Several kinds of tie', explain: 'Share of tied pairs of alters who are tied in more than one way (more than one tie type).', citation: 'Verbrugge (1979)' },
  tieLayerOverlap: { short: 'aaoverlap', name: 'Overlap of two tie types (alter–alter)', group: 'Several kinds of tie', explain: 'Pairs of alters tied both ways, divided by pairs tied either way (Jaccard).' },
  yulesQ: { short: 'yq', name: 'Alter–alter homophily (Yule’s Q)', group: 'Similarity', explain: 'Whether alters in the same category are more likely to be tied to each other: +1 = only same-category ties, −1 = only cross-category ties.', citation: 'Yule (1900)' },
};

const STAT_SHORT: Record<CompositionStat, string> = { mean: 'mean', sd: 'sd', median: 'med', min: 'min', max: 'max', share: 'pct', shareAtLeast: 'pctge', count: 'n' };
const STAT_NAME: Record<CompositionStat, string> = { mean: 'Mean', sd: 'SD of', median: 'Median', min: 'Lowest', max: 'Highest', share: 'Share with', shareAtLeast: 'Share with', count: 'Number with' };
const DIV_SHORT: Record<DiversityIndex, string> = { blau: 'blau', iqv: 'iqv', entropy: 'entropy', categories: 'ncat' };
const SIM_SHORT: Record<SimilarityIndex, string> = { ei: 'ei', sameShare: 'same', meanAbsDiff: 'absdiff' };

/** A Stata-safe name: letters, digits and underscores, starting with a letter, 32 characters at most. */
export function safeName(s: string): string {
  let n = s
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/__+/g, '_')
    .toLowerCase();
  if (!/^[a-z]/.test(n)) n = `v_${n}`;
  return n.slice(0, 32).replace(/_+$/, '');
}

export function defaultColumn(r: MeasureRequest): string {
  const s = r.spec;
  const tail = r.sliceId === 'all' ? '' : `_${r.sliceId}`;
  switch (s.kind) {
    case 'composition':
      return safeName(`${STAT_SHORT[s.stat]}_${s.variable}${s.values?.length ? '_' + s.values.join('_') : ''}${tail}`);
    case 'diversity':
      return safeName(`${DIV_SHORT[s.index]}_${s.variable}${tail}`);
    case 'similarity':
      return safeName(`${SIM_SHORT[s.index]}_${s.alterVariable}${tail}`);
    case 'yulesQ':
      return safeName(`yq_${s.variable}${tail}`);
    case 'multiplexity':
      return safeName(`${s.stat === 'mean' ? 'mplex' : 'pctmplex'}${tail}`);
    case 'layerOverlap':
      return safeName(`overlap_${s.a}_${s.b}${tail}`);
    case 'tieLayerOverlap':
      return safeName(`aaoverlap_${s.a}_${s.b}${tail}`);
    default:
      return safeName(`${MEASURE_INFO[s.kind].short}${tail}`);
  }
}

/** A label of 80 characters at most (Stata's limit). */
export function measureLabel(r: MeasureRequest, slice: Slice): string {
  const s = r.spec;
  let base: string;
  switch (s.kind) {
    case 'composition':
      base = `${STAT_NAME[s.stat]} ${s.variable}${s.values?.length ? ` ${s.stat === 'shareAtLeast' ? '≥' : '='} ${s.values.join('/')}` : ''}`;
      break;
    case 'diversity':
      base = `${{ blau: 'Blau index', iqv: 'IQV', entropy: 'Entropy', categories: 'Categories' }[s.index]} of ${s.variable}`;
      break;
    case 'similarity':
      base = `${{ ei: 'E-I index', sameShare: 'Share same as ego', meanAbsDiff: 'Mean abs. difference' }[s.index]} on ${s.alterVariable}`;
      break;
    case 'yulesQ':
      base = `Yule's Q on ${s.variable}`;
      break;
    case 'multiplexity':
      base = s.stat === 'mean' ? `Mean kinds of tie per alter (${s.columns.join(', ')})` : `Share of alters tied more than one way (${s.columns.join(', ')})`;
      break;
    case 'layerOverlap':
      base = `Overlap of ${s.a} and ${s.b}`;
      break;
    case 'tieLayerOverlap':
      base = `Overlap of ${s.a} and ${s.b} ties among alters`;
      break;
    default:
      base = MEASURE_INFO[s.kind].name;
  }
  const label = slice.id === 'all' ? base : `${base} (${slice.label})`;
  return label.length > 80 ? label.slice(0, 79) + '…' : label;
}

export interface CodebookEntry {
  column: string;
  label: string;
  measure: string;
  slice: string;
  definition: string;
  citation: string;
}

export interface Results {
  table: DataTable;
  codebook: CodebookEntry[];
  notes: string[];
}

// ---------- per-ego values ----------

function stats(values: number[], stat: 'mean' | 'sd' | 'median' | 'min' | 'max'): number | null {
  if (!values.length) return null;
  if (stat === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
  if (stat === 'min') return Math.min(...values);
  if (stat === 'max') return Math.max(...values);
  if (stat === 'median') {
    const v = [...values].sort((a, b) => a - b);
    const h = v.length >> 1;
    return v.length % 2 ? v[h]! : (v[h - 1]! + v[h]!) / 2;
  }
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

function matches(column: Column | undefined, v: Cell | undefined, wanted: string[]): boolean {
  const code = idText(v);
  const label = categoryOf(column, v);
  return wanted.some((w) => w === code || w === label);
}

interface Context {
  study: Study;
  /** Distinct categories of each alters-table column, for IQV. */
  categoriesOf: (column: string) => number;
}

function value(ctx: Context, net: EgoNetwork, g: Graph, spec: MeasureSpec): number | null {
  const study = ctx.study;
  const A = study.alters;
  const rule = study.settings.missingPairs;
  switch (spec.kind) {
    case 'size':
      return g.n;
    case 'ties':
      return S.tieCount(g);
    case 'density':
      return S.density(g, rule);
    case 'weightedDensity':
      return S.weightedDensity(g, rule);
    case 'meanDegree':
      return g.n ? S.degrees(g).reduce((a, b) => a + b, 0) / g.n : null;
    case 'maxDegree':
      return g.n ? Math.max(...S.degrees(g)) : null;
    case 'egoBetweenness':
      return g.n ? S.egoBetweenness(g) : null;
    case 'egoBetweennessNorm':
      return S.egoBetweennessNormalized(g);
    case 'meanAlterBetweenness': {
      const b = S.alterBetweenness(g);
      return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null;
    }
    case 'maxAlterBetweenness': {
      const b = S.alterBetweenness(g);
      return b.length ? Math.max(...b) : null;
    }
    case 'effectiveSize':
      return S.effectiveSize(g);
    case 'efficiency':
      return S.efficiency(g);
    case 'constraint':
      return S.constraint(g);
    case 'hierarchy':
      return S.hierarchy(g);
    case 'components':
      return g.n ? S.components(g).length : null;
    case 'largestComponentShare':
      return g.n ? Math.max(...S.components(g).map((c) => c.length)) / g.n : null;
    case 'isolates':
      return g.n ? S.isolates(g) : null;
    case 'unknownPairs':
      return S.unknownPairs(g);
    case 'composition': {
      const j = columnIndex(A, spec.variable);
      if (j < 0) return null;
      const col = A.columns[j];
      const cells = g.alterRows.map((r) => A.rows[r]![j]).filter((v) => !isMissing(v));
      if (spec.stat === 'share' || spec.stat === 'count') {
        const want = spec.values ?? [];
        const hits = cells.filter((v) => matches(col, v, want)).length;
        if (spec.stat === 'count') return hits;
        return cells.length ? hits / cells.length : null;
      }
      const nums = cells.map((v) => numberOf(v)).filter((v): v is number => v !== null);
      if (spec.stat === 'shareAtLeast') {
        const limit = numberOf(spec.values?.[0] ?? null);
        if (limit === null) return null;
        return nums.length ? nums.filter((v) => v >= limit).length / nums.length : null;
      }
      return stats(nums, spec.stat);
    }
    case 'diversity': {
      const j = columnIndex(A, spec.variable);
      if (j < 0) return null;
      const col = A.columns[j];
      const counts = new Map<string, number>();
      for (const r of g.alterRows) {
        const c = categoryOf(col, A.rows[r]![j]);
        if (c !== null) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      if (!total) return null;
      if (spec.index === 'categories') return counts.size;
      const ps = [...counts.values()].map((c) => c / total);
      if (spec.index === 'entropy') return -ps.reduce((a, p) => a + p * Math.log(p), 0);
      const blau = 1 - ps.reduce((a, p) => a + p * p, 0);
      if (spec.index === 'blau') return blau;
      const K = ctx.categoriesOf(spec.variable);
      return K > 1 ? blau / (1 - 1 / K) : null;
    }
    case 'similarity': {
      const E = study.egos;
      const ej = columnIndex(E, spec.egoVariable);
      const aj = columnIndex(A, spec.alterVariable);
      if (ej < 0 || aj < 0) return null;
      const egoValue = E.rows[net.row]![ej];
      if (isMissing(egoValue)) return null;
      if (spec.index === 'meanAbsDiff') {
        const e = numberOf(egoValue);
        if (e === null) return null;
        const d = g.alterRows.map((r) => numberOf(A.rows[r]![aj])).filter((v): v is number => v !== null).map((v) => Math.abs(v - e));
        return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
      }
      const eCode = idText(egoValue);
      const eLabel = categoryOf(E.columns[ej], egoValue);
      let same = 0;
      let diff = 0;
      for (const r of g.alterRows) {
        const v = A.rows[r]![aj];
        if (isMissing(v)) continue;
        const code = idText(v);
        const label = categoryOf(A.columns[aj], v);
        if (code === eCode || label === eLabel) same++;
        else diff++;
      }
      if (!same && !diff) return null;
      return spec.index === 'ei' ? (diff - same) / (diff + same) : same / (same + diff);
    }
    case 'yulesQ': {
      const j = columnIndex(A, spec.variable);
      if (j < 0) return null;
      const col = A.columns[j];
      return S.yulesQ(g, (i) => categoryOf(col, A.rows[g.alterRows[i]!]![j]));
    }
    case 'multiplexity': {
      const js = spec.columns.map((c) => columnIndex(A, c)).filter((j) => j >= 0);
      if (!js.length || !g.n) return null;
      const counts = g.alterRows.map((r) => js.filter((j) => isYes(A.rows[r]![j])).length);
      return spec.stat === 'mean' ? counts.reduce((a, b) => a + b, 0) / counts.length : counts.filter((c) => c > 1).length / counts.length;
    }
    case 'layerOverlap': {
      const ja = columnIndex(A, spec.a);
      const jb = columnIndex(A, spec.b);
      if (ja < 0 || jb < 0) return null;
      let both = 0;
      let either = 0;
      for (const r of g.alterRows) {
        const x = isYes(A.rows[r]![ja]);
        const y = isYes(A.rows[r]![jb]);
        if (x && y) both++;
        if (x || y) either++;
      }
      return either ? both / either : null;
    }
    case 'tieMultiplexity':
    case 'tieLayerOverlap': {
      const kept = new Set(g.alterIds);
      const byPair = new Map<string, Set<string>>();
      for (const t of net.ties) {
        if (t.state !== true || t.type === null || !kept.has(t.a) || !kept.has(t.b)) continue;
        const k = t.a < t.b ? `${t.a}${t.b}` : `${t.b}${t.a}`;
        byPair.set(k, (byPair.get(k) ?? new Set<string>()).add(t.type));
      }
      if (spec.kind === 'tieMultiplexity') return byPair.size ? [...byPair.values()].filter((x) => x.size > 1).length / byPair.size : null;
      let both = 0;
      let either = 0;
      for (const types of byPair.values()) {
        const x = types.has(spec.a);
        const y = types.has(spec.b);
        if (x && y) both++;
        if (x || y) either++;
      }
      return either ? both / either : null;
    }
  }
}

const PAIR_MEASURES: MeasureKind[] = ['ties', 'density', 'weightedDensity', 'meanDegree', 'maxDegree', 'egoBetweenness', 'egoBetweennessNorm', 'meanAlterBetweenness', 'maxAlterBetweenness', 'effectiveSize', 'efficiency', 'constraint', 'hierarchy', 'components', 'largestComponentShare', 'isolates', 'yulesQ', 'tieMultiplexity', 'tieLayerOverlap'];

/** Whether the missing-data cutoff (P9.2) leaves this measure empty for this ego. */
function tooMuchUnknown(study: Study, g: Graph, spec: MeasureSpec): boolean {
  const cut = study.settings.maxUnknownShare;
  if (cut === null || cut === undefined || !PAIR_MEASURES.includes(spec.kind) || g.n < 2) return false;
  return S.unknownPairs(g) / ((g.n * (g.n - 1)) / 2) > cut;
}

/** A yes in a yes/no column: a number other than 0, or yes / true / y. */
function isYes(v: Cell | undefined): boolean {
  if (isMissing(v)) return false;
  const n = numberOf(v);
  if (n !== null) return n !== 0;
  return ['yes', 'y', 'true', 't'].includes(String(v).trim().toLowerCase());
}

function definition(r: MeasureRequest): string {
  const s = r.spec;
  const info = MEASURE_INFO[s.kind];
  if (s.kind === 'composition') {
    const what = { mean: 'mean', sd: 'standard deviation (n − 1)', median: 'median', min: 'smallest value', max: 'largest value', share: `share of alters whose ${s.variable} is ${(s.values ?? []).join(' or ')}`, shareAtLeast: `share of alters whose ${s.variable} is at least ${s.values?.[0]}`, count: `number of alters whose ${s.variable} is ${(s.values ?? []).join(' or ')}` }[s.stat];
    return `The ${what}${['share', 'shareAtLeast', 'count'].includes(s.stat) ? '' : ` of ${s.variable}`} across the ego's alters (alters with ${s.variable} missing left out).`;
  }
  if (s.kind === 'diversity') return `${info.explain} Variable: ${s.variable}. Alters with it missing are left out.`;
  if (s.kind === 'similarity') return `${info.explain} Ego variable ${s.egoVariable}, alter variable ${s.alterVariable}.`;
  if (s.kind === 'yulesQ') return `${info.explain} Variable: ${s.variable}.`;
  if (s.kind === 'multiplexity') return `${info.explain} Columns: ${s.columns.join(', ')}.`;
  if (s.kind === 'layerOverlap' || s.kind === 'tieLayerOverlap') return `${info.explain} Kinds: ${s.a} and ${s.b}.`;
  return info.explain;
}

/** Compute the chosen measures for every ego. One row per ego (and wave). */
export function computeMeasures(study: Study, requests: MeasureRequest[], slices: Slice[], networks: StudyNetworks = buildNetworks(study)): Results {
  const sliceById = new Map([[ALL.id, ALL], ...slices.map((s) => [s.id, s] as const)]);
  const notes: string[] = [];
  const catCache = new Map<string, number>();
  const ctx: Context = {
    study,
    categoriesOf: (column) => {
      if (!catCache.has(column)) {
        const j = columnIndex(study.alters, column);
        const col = study.alters.columns[j];
        const set = new Set<string>();
        if (j >= 0) for (const r of study.alters.rows) {
          const c = categoryOf(col, r[j]);
          if (c !== null) set.add(c);
        }
        const labelled = col?.valueLabels ? Object.keys(col.valueLabels).length : 0;
        catCache.set(column, Math.max(set.size, labelled));
      }
      return catCache.get(column)!;
    },
  };
  const m = study.mapping;
  const egoIdCol = study.egos.columns[columnIndex(study.egos, m.egoId)];
  const waveCol = m.egoWave ? study.egos.columns[columnIndex(study.egos, m.egoWave)] : undefined;
  const idName = safeName(m.egoId) || 'ego_id';
  const columns: Column[] = [{ name: idName, label: egoIdCol?.label ?? 'Ego ID', kind: egoIdCol?.kind ?? 'string' }];
  if (waveCol) columns.push({ name: safeName(waveCol.name), label: waveCol.label ?? 'Wave', kind: waveCol.kind, ...(waveCol.valueLabels ? { valueLabels: waveCol.valueLabels } : {}) });
  const used = new Set(columns.map((c) => c.name));
  const codebook: CodebookEntry[] = [];
  const plan = requests.map((r) => {
    const slice = sliceById.get(r.sliceId);
    if (!slice) throw new Error(`The measure "${defaultColumn(r)}" uses a subgroup that no longer exists.`);
    let name = safeName(r.column || defaultColumn(r));
    for (let k = 2; used.has(name); k++) name = safeName(`${(r.column || defaultColumn(r)).slice(0, 28)}_${k}`);
    used.add(name);
    const label = measureLabel(r, slice);
    columns.push({ name, label, kind: 'numeric' });
    codebook.push({ column: name, label, measure: MEASURE_INFO[r.spec.kind].name, slice: describeSlice(slice), definition: definition(r), citation: MEASURE_INFO[r.spec.kind].citation ?? '' });
    return { r, slice };
  });
  const sliceIds = [...new Set(plan.map((p) => p.slice.id))];
  const rows: Cell[][] = networks.egos.map((net) => {
    const graphs = new Map(sliceIds.map((id) => [id, graphFor(study, net, sliceById.get(id)!)]));
    const egoRow = study.egos.rows[net.row]!;
    const row: Cell[] = [egoRow[columnIndex(study.egos, m.egoId)] ?? net.id];
    if (waveCol) row.push(egoRow[columnIndex(study.egos, m.egoWave!)] ?? net.wave);
    for (const p of plan) {
      const g = graphs.get(p.slice.id)!;
      const v = tooMuchUnknown(study, g, p.r.spec) ? null : value(ctx, net, g, p.r.spec);
      row.push(v === null || !Number.isFinite(v) ? null : Math.round(v * 1e10) / 1e10);
    }
    return row;
  });
  if (study.settings.missingPairs === 'noTie' && networks.egos.some((n) => n.ties.some((t) => t.state === null)))
    notes.push('Some alter pairs have no answer for whether they are tied. They were counted as not tied; to compute density on answered pairs only, choose "Leave them out" under "Alter pairs with no answer" on the Measures step.');
  return { table: { name: 'measures', columns, rows }, codebook, notes };
}
