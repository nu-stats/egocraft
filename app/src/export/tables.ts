// Publication tables (P5.5) and the missing-data report (P5.4): a
// descriptive table of the measures (optionally by a group of egos) in APA
// style for Word, LaTeX and HTML, and a table of how much each measure rests
// on missing information.

import type { Cell, DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, isMissing } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { MeasureKind, MeasureRequest, MeasureSpec, Results } from '../measures/measures.ts';
import * as S from '../measures/structure.ts';
import type { Slice, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, graphFor } from '../network/networks.ts';
import type { Block } from './docx.ts';

/** Measures that can't go above 1 in size, printed without a leading zero (APA). */
function boundedByOne(spec: MeasureSpec): boolean {
  const k = spec.kind;
  if (['density', 'egoBetweennessNorm', 'efficiency', 'largestComponentShare', 'yulesQ', 'layerOverlap', 'tieMultiplexity', 'tieLayerOverlap'].includes(k)) return true;
  if (spec.kind === 'multiplexity') return spec.stat === 'shareMulti';
  if (spec.kind === 'sameArea') return true;
  if (spec.kind === 'composition') return spec.stat === 'share' || spec.stat === 'shareAtLeast';
  if (spec.kind === 'diversity') return spec.index === 'blau' || spec.index === 'iqv';
  if (spec.kind === 'similarity') return spec.index !== 'meanAbsDiff';
  return false;
}

export function apaNumber(v: number | null, bounded = false, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  let s = v.toFixed(digits);
  if (s === `-${(0).toFixed(digits)}`) s = (0).toFixed(digits);
  if (bounded) s = s.replace(/^(-?)0\./, '$1.');
  return s.replace(/^-/, '−');
}

interface Stat {
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}

function stat(values: number[]): Stat {
  const n = values.length;
  if (!n) return { n, mean: null, sd: null, min: null, max: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean, sd, min: Math.min(...values), max: Math.max(...values) };
}

export interface DescriptiveRow {
  label: string;
  column: string;
  bounded: boolean;
  /** Every value is a whole number (a count). */
  whole: boolean;
  all: Stat;
  groups: Stat[];
}

export interface Descriptives {
  groupVariable: string | null;
  groups: { label: string; n: number }[];
  rows: DescriptiveRow[];
  egoRows: number;
  /** "egos" or "ego-waves". */
  unit: string;
}

/** Mean, SD, smallest, largest and n of each measure; with a group variable, mean and SD per group. */
export function descriptives(study: Study, results: Results, measures: MeasureRequest[], groupVariable: string | null = null): Descriptives {
  const t = results.table;
  const ids = study.mapping.egoWave ? 2 : 1;
  let groupOf: ((i: number) => string | null) | null = null;
  let groups: string[] = [];
  if (groupVariable) {
    // Results rows are in the same order as the egos' networks, which follow the ego file.
    const nets = buildNetworks(study);
    const gj = columnIndex(study.egos, groupVariable);
    if (gj >= 0) {
      const col = study.egos.columns[gj];
      groupOf = (i) => categoryOf(col, study.egos.rows[nets.egos[i]!.row]![gj]);
      groups = [...new Set(t.rows.map((_, i) => groupOf!(i)).filter((v): v is string => v !== null))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    }
  }
  const rows = results.codebook.map((e, k) => {
    const j = ids + k;
    const vals = (keep: (i: number) => boolean) => t.rows.map((r, i) => (keep(i) && typeof r[j] === 'number' ? (r[j] as number) : null)).filter((v): v is number => v !== null);
    return {
      label: e.label,
      column: e.column,
      bounded: measures[k] ? boundedByOne(measures[k]!.spec) : false,
      whole: vals(() => true).every((v) => Number.isInteger(v)),
      all: stat(vals(() => true)),
      groups: groups.map((g) => stat(vals((i) => groupOf!(i) === g))),
    };
  });
  return { groupVariable, groups: groups.map((g) => ({ label: g, n: t.rows.filter((_, i) => groupOf!(i) === g).length })), rows, egoRows: t.rows.length, unit: study.mapping.egoWave ? 'ego-waves' : 'egos' };
}

const r2 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);

/** The descriptives as a data table (for CSV, Excel, Stata and SPSS). */
export function descriptivesTable(d: Descriptives): DataTable {
  const cols = [
    { name: 'measure', kind: 'string' as const },
    { name: 'variable', kind: 'string' as const },
    { name: 'n', label: 'Egos with a value', kind: 'numeric' as const },
    { name: 'mean', kind: 'numeric' as const },
    { name: 'sd', label: 'Standard deviation', kind: 'numeric' as const },
    { name: 'min', kind: 'numeric' as const },
    { name: 'max', kind: 'numeric' as const },
  ];
  const groupCols = d.groups.flatMap((g, i) => [
    { name: `mean_g${i + 1}`, label: `Mean, ${d.groupVariable} = ${g.label}`, kind: 'numeric' as const },
    { name: `sd_g${i + 1}`, label: `SD, ${d.groupVariable} = ${g.label}`, kind: 'numeric' as const },
  ]);
  return {
    name: 'descriptives',
    columns: [...cols, ...groupCols],
    rows: d.rows.map((r): Cell[] => [r.label, r.column, r.all.n, r2(r.all.mean), r2(r.all.sd), r2(r.all.min), r2(r.all.max), ...r.groups.flatMap((g) => [r2(g.mean), r2(g.sd)])]),
  };
}

function apaRows(d: Descriptives): { header: string[]; rows: string[][]; note: string } {
  if (d.groups.length) {
    return {
      header: ['Measure', ...d.groups.map((g) => `${g.label} (n = ${g.n})`)],
      rows: d.rows.map((r) => [r.label, ...r.groups.map((g) => (g.mean === null ? '—' : `${apaNumber(g.mean, r.bounded)} (${apaNumber(g.sd, r.bounded)})`))]),
      note: `Note. Values are means with standard deviations in parentheses, by ${d.groupVariable}. — = no egos with a value.`,
    };
  }
  return {
    header: ['Measure', 'n', 'M', 'SD', 'Min', 'Max'],
    // Counts (size, isolates …) show whole numbers for the lowest and highest values.
    rows: d.rows.map((r) => [r.label, String(r.all.n), apaNumber(r.all.mean, r.bounded), apaNumber(r.all.sd, r.bounded), apaNumber(r.all.min, r.bounded, r.whole ? 0 : 2), apaNumber(r.all.max, r.bounded, r.whole ? 0 : 2)]),
    note: `Note. N = ${d.egoRows} ${d.unit}; n is the number with a value for the measure (density, for example, needs at least two alters).`,
  };
}

export function descriptivesBlock(d: Descriptives, number = 1, title = 'Descriptive Statistics for the Personal Network Measures'): Block {
  const a = apaRows(d);
  return { kind: 'table', number, title, header: a.header, rows: a.rows, note: a.note };
}

const tex = (s: string) => s.replace(/\\/g, '\\textbackslash{}').replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}').replace(/−/g, '$-$').replace(/—/g, '---').replace(/≥/g, '$\\geq$').replace(/–/g, '--');

/** A LaTeX table using booktabs rules (\toprule, \midrule, \bottomrule). */
export function descriptivesLatex(d: Descriptives, title = 'Descriptive statistics for the personal network measures'): string {
  const a = apaRows(d);
  const align = 'l' + 'r'.repeat(a.header.length - 1);
  const L = [
    '% Needs \\usepackage{booktabs}',
    '\\begin{table}[htbp]',
    '\\centering',
    `\\caption{${tex(title)}}`,
    `\\begin{tabular}{${align}}`,
    '\\toprule',
    a.header.map((h) => tex(h)).join(' & ') + ' \\\\',
    '\\midrule',
    ...a.rows.map((r) => r.map((c) => tex(c)).join(' & ') + ' \\\\'),
    '\\bottomrule',
    '\\end{tabular}',
    `\\par\\smallskip\\raggedright\\footnotesize\\textit{Note.} ${tex(a.note.replace(/^Note\.\s*/, ''))}`,
    '\\end{table}',
  ];
  return L.join('\n') + '\n';
}

export function descriptivesHtml(d: Descriptives, title = 'Descriptive Statistics for the Personal Network Measures'): string {
  const a = apaRows(d);
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<table class="apa"><caption><strong>Table 1</strong><br><em>${e(title)}</em></caption><thead><tr>${a.header.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${a.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><p><em>Note.</em> ${e(a.note.replace(/^Note\.\s*/, ''))}</p>`;
}

// ---------- missing information (P5.4) ----------

const NEEDS_PAIRS: MeasureKind[] = ['density', 'weightedDensity', 'egoBetweennessNorm', 'hierarchy', 'yulesQ'];
const STRUCTURAL: MeasureKind[] = ['ties', 'density', 'weightedDensity', 'meanDegree', 'maxDegree', 'egoBetweenness', 'egoBetweennessNorm', 'meanAlterBetweenness', 'maxAlterBetweenness', 'effectiveSize', 'efficiency', 'constraint', 'hierarchy', 'components', 'largestComponentShare', 'isolates', 'yulesQ'];

/**
 * For each measure: how many egos have a value, why the others don't, and
 * how much of the information behind the values is missing (pairs of
 * alters not known, alters with the variable unanswered).
 */
export function missingReport(study: Study, results: Results, measures: MeasureRequest[], slices: Slice[], nets: StudyNetworks = buildNetworks(study)): DataTable {
  const byId = new Map([[ALL.id, ALL], ...slices.map((s) => [s.id, s] as const)]);
  const ids = study.mapping.egoWave ? 2 : 1;
  const rows: Cell[][] = measures.map((r, k) => {
    const slice = byId.get(r.sliceId) ?? ALL;
    const j = ids + k;
    let have = 0;
    let none = 0;
    let one = 0;
    let other = 0;
    const pairShares: number[] = [];
    let anyUnknown = 0;
    const answerShares: number[] = [];
    const variable = 'variable' in r.spec ? r.spec.variable : 'alterVariable' in r.spec ? r.spec.alterVariable : null;
    const vj = variable ? columnIndex(study.alters, variable) : -1;
    nets.egos.forEach((net, i) => {
      const v = results.table.rows[i]?.[j];
      const g = graphFor(study, net, slice);
      if (typeof v === 'number') have++;
      else if (g.n === 0) none++;
      else if (g.n < 2 && NEEDS_PAIRS.includes(r.spec.kind)) one++;
      else other++;
      if (STRUCTURAL.includes(r.spec.kind) && g.n >= 2) {
        const u = S.unknownPairs(g);
        pairShares.push(u / ((g.n * (g.n - 1)) / 2));
        if (u) anyUnknown++;
      }
      if (vj >= 0 && g.n > 0) answerShares.push(g.alterRows.filter((row) => isMissing(study.alters.rows[row]![vj])).length / g.n);
    });
    const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
    return [results.codebook[k]!.label, results.codebook[k]!.column, have, none, one, other, mean(pairShares), STRUCTURAL.includes(r.spec.kind) ? anyUnknown : null, mean(answerShares)];
  });
  return {
    name: 'missing',
    columns: [
      { name: 'measure', kind: 'string' },
      { name: 'variable', kind: 'string' },
      { name: 'egos_with_value', label: 'Egos with a value', kind: 'numeric' },
      { name: 'no_alters', label: 'No value: named nobody (in this subgroup)', kind: 'numeric' },
      { name: 'one_alter', label: 'No value: only one alter, and the measure needs pairs', kind: 'numeric' },
      { name: 'other_missing', label: 'No value: answers missing or measure undefined', kind: 'numeric' },
      { name: 'mean_share_pairs_unknown', label: 'Mean share of alter pairs not known (egos with 2+ alters)', kind: 'numeric' },
      { name: 'egos_with_pairs_unknown', label: 'Egos with any alter pair not known', kind: 'numeric' },
      { name: 'mean_share_answers_missing', label: 'Mean share of alters with the variable unanswered', kind: 'numeric' },
    ],
    rows,
  };
}
