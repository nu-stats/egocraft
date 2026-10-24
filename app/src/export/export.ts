// Writing results (P5): the one-row-per-ego file in CSV, Excel, Stata and
// SPSS form, the codebook, the recipe that reruns the analysis, a Stata
// do-file that merges the results into survey data and cross-checks them,
// and an R script that recomputes the main measures with igraph.

import { strToU8, zipSync } from 'fflate';
import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, idText } from '../core/data.ts';
import type { Mapping, Settings, Study } from '../core/study.ts';
import type { CodebookEntry, MeasureRequest, Results } from '../measures/measures.ts';
import { safeName } from '../measures/measures.ts';
import type { Slice } from '../network/networks.ts';
import { writeDta, writeSav } from '../io/statFiles.js';
import type { StatDataset } from '../io/statFiles.js';
import { toCsv, toXlsx } from '../io/table.ts';
import { buildNetworks } from '../network/networks.ts';
import { buildDocx } from './docx.ts';
import type { Block } from './docx.ts';
import { methodsPlainText, methodsText } from './methods.ts';
import { descriptives, descriptivesBlock, descriptivesLatex, missingReport } from './tables.ts';
import type { Protocol } from '../interview/protocol.ts';
import { protocolText } from '../interview/protocol.ts';

import { APP_VERSION } from '../version.ts';
export { APP_VERSION };

export function csvOf(t: DataTable): string {
  return toCsv({ columns: t.columns.map((c) => c.name), rows: t.rows });
}

export function xlsxOf(sheets: DataTable[]): Uint8Array {
  return toXlsx(sheets.map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name), rows: t.rows })));
}

function dataset(t: DataTable, title: string): StatDataset {
  return {
    title,
    variables: t.columns.map((c) => ({ name: c.name, ...(c.label ? { label: c.label } : {}), kind: c.kind, ...(c.valueLabels ? { valueLabels: c.valueLabels } : {}) })),
    rows: t.rows.map((r) => t.columns.map((c, j) => (c.kind === 'numeric' ? (typeof r[j] === 'number' ? r[j] : null) : r[j] === null || r[j] === undefined ? null : String(r[j])))),
  };
}

export function dtaOf(t: DataTable, title = 'EgoCraft'): Uint8Array {
  return writeDta(dataset(t, title)).bytes;
}

export function savOf(t: DataTable, title = 'EgoCraft'): Uint8Array {
  return writeSav(dataset(t, title)).bytes;
}

export function codebookTable(codebook: CodebookEntry[]): DataTable {
  const cols: Column[] = ['column', 'label', 'measure', 'slice', 'definition', 'citation'].map((name) => ({ name, kind: 'string' }));
  return { name: 'codebook', columns: cols, rows: codebook.map((e) => [e.column, e.label, e.measure, e.slice, e.definition, e.citation]) };
}

// ---------- recipe ----------

export interface Recipe {
  format: 'egocraft-recipe';
  version: 1;
  app: string;
  study: string;
  madeAt: string;
  mapping: Mapping;
  settings: Settings;
  /** Import notes and the fixes applied, in order. */
  steps: { kind: string; text: string; detail?: Record<string, unknown> }[];
  slices: Slice[];
  measures: MeasureRequest[];
}

export function makeRecipe(study: Study, slices: Slice[], measures: MeasureRequest[], now = new Date()): Recipe {
  return {
    format: 'egocraft-recipe',
    version: 1,
    app: `EgoCraft ${APP_VERSION}`,
    study: study.name,
    madeAt: now.toISOString(),
    mapping: study.mapping,
    settings: study.settings,
    steps: study.history.map(({ kind, text, detail }) => ({ kind, text, ...(detail ? { detail } : {}) })),
    slices,
    measures,
  };
}

// ---------- Stata do-file ----------

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

/** Stata code for "this variable equals one of these categories", or null when it can't be written. */
function stataCondition(col: Column, values: string[]): string | null {
  if (col.kind === 'string') return values.map((v) => `${col.name} == ${q(v)}`).join(' | ');
  const codes: string[] = [];
  for (const v of values) {
    const byLabel = Object.entries(col.valueLabels ?? {}).find(([, label]) => label === v)?.[0];
    const code = byLabel ?? (/^-?\d+(\.\d+)?$/.test(v) ? v : null);
    if (code === null) return null;
    codes.push(code);
  }
  return codes.map((c) => `${col.name} == ${c}`).join(' | ');
}

export interface DoFileInput {
  study: Study;
  results: Results;
  measures: MeasureRequest[];
  long: DataTable;
}

/**
 * A do-file that (1) merges the measures into the user's survey file and
 * (2) recomputes size and the composition measures from the long file in
 * plain Stata, and stops if anything differs.
 */
export function stataDoFile({ study, results, measures, long }: DoFileInput, now = new Date()): string {
  const ids = results.table.columns.slice(0, study.mapping.egoWave ? 2 : 1).map((c) => c.name);
  const by = ids.join(' ');
  const lines: string[] = [];
  lines.push(`* EgoCraft ${APP_VERSION}: measures for ${study.name}`);
  lines.push(`* Made ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Files: egocraft_measures.dta (one row per ego${study.mapping.egoWave ? ' and wave' : ''}),`);
  lines.push('* egocraft_long.dta (one row per alter). Put them in the working directory.');
  lines.push('*');
  lines.push('* What was done to the data before the measures:');
  for (const h of study.history) lines.push(`*   - ${h.text}`);
  lines.push(`*   - Alter pairs with no answer were ${study.settings.missingPairs === 'noTie' ? 'counted as not tied' : 'left out of density'}.`);
  lines.push('');
  lines.push('version 14');
  lines.push('');
  lines.push('* ---- 1. Merge the measures into your survey data ----');
  lines.push('* Change "survey.dta" to your own file. It needs the same ID variable(s):');
  lines.push(`* ${by}.`);
  lines.push('capture confirm file "survey.dta"');
  lines.push('if !_rc {');
  lines.push('    use "survey.dta", clear');
  lines.push(`    merge 1:1 ${by} using "egocraft_measures.dta"`);
  lines.push('    * _merge: 1 = in the survey only, 2 = in EgoCraft only, 3 = in both');
  lines.push('    tabulate _merge');
  lines.push('    drop _merge');
  lines.push('    save "survey_with_networks.dta", replace');
  lines.push('}');
  lines.push('');
  lines.push('* ---- 2. Check: recompute size and composition in plain Stata ----');
  lines.push('use "egocraft_long.dta", clear');
  lines.push('generate byte one = 1');
  const parts: string[] = ['(sum) chk_size = one'];
  const asserts: string[] = [];
  const preparation: string[] = [];
  const zeroFill: string[] = [];
  const sizeReq = results.codebook.findIndex((_, i) => measures[i]?.spec.kind === 'size' && measures[i]?.sliceId === 'all');
  if (sizeReq >= 0) asserts.push(`assert chk_size == ${results.codebook[sizeReq]!.column}`);
  measures.forEach((r, i) => {
    if (r.sliceId !== 'all' || r.spec.kind !== 'composition') return;
    const s = r.spec;
    const col = long.columns[columnIndex(long, safeName(s.variable))];
    if (!col) return;
    const out = results.codebook[i]!.column;
    const chk = safeName(`c${i}_${out}`).slice(0, 32);
    if (s.stat === 'mean' || s.stat === 'sd' || s.stat === 'median' || s.stat === 'min' || s.stat === 'max') {
      if (col.kind !== 'numeric') return;
      const fn = { mean: 'mean', sd: 'sd', median: 'median', min: 'min', max: 'max' }[s.stat];
      parts.push(`(${fn}) ${chk} = ${col.name}`);
    } else if (s.stat === 'share' || s.stat === 'count') {
      const cond = stataCondition(col, s.values ?? []);
      if (!cond) return;
      preparation.push(`generate double ${chk} = (${cond}) if !missing(${col.name})`);
      parts.push(`(${s.stat === 'share' ? 'mean' : 'sum'}) ${chk}`);
    } else return;
    const tol = 1e-6;
    if (s.stat === 'count') {
      zeroFill.push(chk);
      asserts.push(`assert ${chk} == ${out} if !missing(${out})`);
    }
    else asserts.push(`assert abs(${chk} - ${out}) < ${tol} if !missing(${chk}, ${out})`);
  });
  lines.push(...preparation);
  lines.push(`collapse ${parts.join(' ')}, by(${by})`);
  lines.push(`merge 1:1 ${by} using "egocraft_measures.dta", keep(match using) nogenerate`);
  lines.push('* Egos who named nobody are not in the long file: their size is 0.');
  lines.push('replace chk_size = 0 if missing(chk_size)');
  for (const v of zeroFill) lines.push(`replace ${v} = 0 if missing(${v})`);
  lines.push(...asserts);
  lines.push('display as result "EgoCraft check passed: Stata gives the same numbers."');
  return lines.join('\n') + '\n';
}

// ---------- R script ----------

/**
 * An R script that recomputes size, density and constraint for the
 * all-alters measures with igraph, from the CSV files, and compares.
 */
export function rScript(study: Study, results: Results, measures: MeasureRequest[], now = new Date()): string {
  const ids = results.table.columns.slice(0, study.mapping.egoWave ? 2 : 1).map((c) => c.name);
  const find = (kind: string) => {
    const i = measures.findIndex((r) => r.sliceId === 'all' && r.spec.kind === kind);
    return i >= 0 ? results.codebook[i]!.column : null;
  };
  const size = find('size');
  const density = find('density');
  const constraint = find('constraint');
  const strength = study.mapping.egoAlterStrength ? safeName(study.mapping.egoAlterStrength) : null;
  const keyExpr = (d: string) => (ids.length === 2 ? `paste(${d}$${ids[0]}, ${d}$${ids[1]})` : `as.character(${d}$${ids[0]})`);
  const L: string[] = [];
  L.push(`# EgoCraft ${APP_VERSION}: an independent check of the measures for ${study.name}`);
  L.push(`# Made ${now.toISOString().slice(0, 10)}. Needs the igraph package: install.packages("igraph")`);
  L.push('# Files: egocraft_measures.csv, egocraft_long.csv, egocraft_pairs.csv in the working directory.');
  L.push('library(igraph)');
  L.push('m <- read.csv("egocraft_measures.csv", stringsAsFactors = FALSE)');
  L.push('long <- read.csv("egocraft_long.csv", stringsAsFactors = FALSE)');
  L.push('pairs <- read.csv("egocraft_pairs.csv", stringsAsFactors = FALSE)');
  L.push(`m$key <- ${keyExpr('m')}`);
  L.push(`long$key <- ${keyExpr('long')}`);
  L.push(`pairs$key <- ${keyExpr('pairs')}`);
  L.push(`observed <- ${study.settings.missingPairs === 'observed' ? 'TRUE' : 'FALSE'}  # leave unanswered pairs out of density`);
  L.push('worst <- c(size = 0, density = 0, constraint = 0)');
  L.push('for (k in m$key) {');
  L.push('  a <- long[long$key == k, , drop = FALSE]');
  L.push('  p <- pairs[pairs$key == k, , drop = FALSE]');
  L.push('  n <- nrow(a)');
  L.push('  row <- m[m$key == k, ]');
  if (size) L.push(`  worst["size"] <- max(worst["size"], abs(n - row$${size}))`);
  if (density) {
    L.push('  pairs_n <- n * (n - 1) / 2 - if (observed) sum(is.na(p$tied)) else 0');
    L.push(`  if (pairs_n > 0) worst["density"] <- max(worst["density"], abs(sum(p$tied == 1, na.rm = TRUE) / pairs_n - row$${density}), na.rm = TRUE)`);
  }
  if (constraint) {
    L.push('  if (n > 0) {');
    L.push('    tied <- p[!is.na(p$tied) & p$tied == 1, , drop = FALSE]');
    L.push(`    ego_w <- ${strength ? `ifelse(is.na(a$${strength}) | a$${strength} <= 0, 1, a$${strength})` : 'rep(1, n)'}`);
    L.push('    edges <- data.frame(from = c(rep("EGO", n), as.character(tied$alter_a)),');
    L.push('                        to = c(as.character(a$alter_id), as.character(tied$alter_b)),');
    L.push('                        weight = c(ego_w, ifelse(is.na(tied$strength) | tied$strength <= 0, 1, tied$strength)))');
    L.push('    g <- graph_from_data_frame(edges, directed = FALSE, vertices = c("EGO", as.character(a$alter_id)))');
    L.push(`    worst["constraint"] <- max(worst["constraint"], abs(constraint(g)["EGO"] - row$${constraint}), na.rm = TRUE)`);
    L.push('  }');
  }
  L.push('}');
  L.push('print(worst)');
  L.push('if (all(worst < 1e-6)) cat("EgoCraft check passed: igraph gives the same numbers.\\n") else warning("Some values differ; see worst above.")');
  return L.join('\n') + '\n';
}

// ---------- the bundle ----------

export interface Bundle {
  study: Study;
  results: Results;
  measures: MeasureRequest[];
  slices: Slice[];
  long: DataTable;
  pairs: DataTable;
  /** The questionnaire, when the study was collected in EgoCraft. */
  protocol?: Protocol;
}

/** The Word file: the descriptive table, then the methods draft and its references. */
export function publicationBlocks(_b: Bundle, d: ReturnType<typeof descriptives>, m: ReturnType<typeof methodsText>): Block[] {
  return [
    descriptivesBlock(d),
    { kind: 'heading', text: 'Method (draft)' },
    ...m.paragraphs.map((text) => ({ kind: 'para' as const, text })),
    { kind: 'heading', text: 'References' },
    ...m.references.map((text) => ({ kind: 'para' as const, text })),
  ];
}

/** Everything in one ZIP file. */
export function bundleZip(b: Bundle, now = new Date()): Uint8Array {
  const recipe = makeRecipe(b.study, b.slices, b.measures, now);
  const codebook = codebookTable(b.results.codebook);
  const nets = buildNetworks(b.study);
  const d = descriptives(b.study, b.results, b.measures);
  const methods = methodsText(b.study, b.measures, b.slices, nets);
  const readme = [
    `EgoCraft ${APP_VERSION}: results for ${b.study.name}`,
    `Made ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    '',
    'egocraft_measures.csv / .dta / .sav  one row per ego, the measures you chose',
    'egocraft_measures.xlsx               the same, with the codebook on a second sheet',
    'egocraft_codebook.csv                what each column means, the subgroup it uses and its source',
    'egocraft_long.csv / .dta             one row per alter, ego variables attached',
    'egocraft_pairs.csv                   one row per pair of alters, with the tie between them',
    'egocraft_check.do                    Stata: merge into your survey file, and recompute size and composition',
    'egocraft_check.R                     R: recompute size, density and constraint with igraph',
    'egocraft_recipe.json                 every step, to rerun the same analysis in EgoCraft',
    'egocraft_tables.docx                 Word: the descriptive table (APA style) and a draft methods section',
    'egocraft_table.tex                   LaTeX: the descriptive table (booktabs)',
    'egocraft_methods.txt                 the draft methods section as plain text, with references',
    'egocraft_missing.csv                 for each measure, how many egos have a value and how much is missing',
    ...(b.protocol ? ['egocraft_questionnaire.txt           the interview questionnaire: wording, variable names and answer codes'] : []),
    '',
    ...b.results.notes,
  ].join('\n');
  const files: Record<string, Uint8Array> = {
    'README.txt': strToU8(readme + '\n'),
    'egocraft_measures.csv': strToU8(csvOf(b.results.table)),
    'egocraft_measures.dta': dtaOf(b.results.table, `EgoCraft measures: ${b.study.name}`),
    'egocraft_measures.sav': savOf(b.results.table, `EgoCraft measures: ${b.study.name}`),
    'egocraft_measures.xlsx': xlsxOf([{ ...b.results.table, name: 'measures' }, codebook]),
    'egocraft_codebook.csv': strToU8(csvOf(codebook)),
    'egocraft_long.csv': strToU8(csvOf(b.long)),
    'egocraft_long.dta': dtaOf(b.long, `EgoCraft alters: ${b.study.name}`),
    'egocraft_pairs.csv': strToU8(csvOf(b.pairs)),
    'egocraft_check.do': strToU8(stataDoFile(b, now)),
    'egocraft_check.R': strToU8(rScript(b.study, b.results, b.measures, now)),
    'egocraft_recipe.json': strToU8(JSON.stringify(recipe, null, 2) + '\n'),
    'egocraft_tables.docx': buildDocx(publicationBlocks(b, d, methods), `EgoCraft: ${b.study.name}`),
    'egocraft_table.tex': strToU8(descriptivesLatex(d)),
    'egocraft_methods.txt': strToU8(methodsPlainText(methods)),
    'egocraft_missing.csv': strToU8(csvOf(missingReport(b.study, b.results, b.measures, b.slices, nets))),
    ...(b.protocol ? { 'egocraft_questionnaire.txt': strToU8(protocolText(b.protocol)), 'egocraft_questionnaire.egocraft-protocol': strToU8(JSON.stringify(b.protocol, null, 2) + '\n') } : {}),
  };
  return zipSync(files, { level: 6 });
}

export function cellText(v: Cell): string {
  return idText(v) ?? '';
}
