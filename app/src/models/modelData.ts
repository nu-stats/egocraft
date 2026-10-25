// Data for models (P11): alters nested in egos (the long file plus each
// alter's network position and the ego's measures), or one row per ego
// (the ego file plus the measures); and the Stata and R code for the same
// model as a full multilevel model, plus a starting point for ergm.ego.

import type { Cell, Column, DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { alterMeasures } from '../measures/alters.ts';
import type { Results } from '../measures/measures.ts';
import { safeName } from '../measures/measures.ts';
import type { StudyNetworks } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';
import { longForm } from '../reshape/forms.ts';
import type { ModelSpec } from './regress.ts';

function addColumns(base: DataTable, cols: Column[], values: (i: number) => Cell[]): DataTable {
  const used = new Set(base.columns.map((c) => c.name.toLowerCase()));
  const named = cols.map((c) => {
    let name = c.name;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = safeName(`${c.name.slice(0, 28)}_${k}`);
    used.add(name.toLowerCase());
    return { ...c, name };
  });
  return { ...base, columns: [...base.columns, ...named], rows: base.rows.map((r, i) => [...r, ...values(i)]) };
}

/** One row per alter: the alter's answers, the ego's answers (ego_…), the alter's position, and the ego's measures (net_…). */
export function alterModelData(study: Study, results: Results, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const long = longForm(study, nets);
  const am = alterMeasures(study, undefined, nets);
  const idCols = study.mapping.egoWave ? 3 : 2;
  const amCols = am.columns.slice(idCols, am.columns.length - 1);
  const offset = study.mapping.egoWave ? 2 : 1;
  const egoIndex: number[] = [];
  nets.egos.forEach((n, e) => n.alters.forEach(() => egoIndex.push(e)));
  const resCols = results.table.columns.slice(offset).map((c) => ({ ...c, name: safeName(`net_${c.name}`), label: `Ego's network: ${c.label ?? c.name}`.slice(0, 80) }));
  let out = addColumns(long, amCols, (i) => am.rows[i]!.slice(idCols, am.columns.length - 1));
  out = addColumns(out, resCols, (i) => results.table.rows[egoIndex[i]!]!.slice(offset));
  return { ...out, name: 'alters for models' };
}

/** One row per ego (and wave): the ego file's variables and the measures. */
export function egoModelData(study: Study, results: Results, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const offset = study.mapping.egoWave ? 2 : 1;
  const egos: DataTable = { name: 'egos', columns: study.egos.columns, rows: nets.egos.map((n) => study.egos.rows[n.row]!) };
  return { ...addColumns(egos, results.table.columns.slice(offset), (i) => results.table.rows[i]!.slice(offset)), name: 'egos for models' };
}

const term = (p: string, s: ModelSpec, prefix: 'stata' | 'r') => (s.categorical.includes(p) ? (prefix === 'stata' ? `i.${p}` : `factor(${p})`) : p);

/** Stata: the model as EgoCraft fits it, then (alters) the multilevel version with a random intercept for each ego. */
export function stataModelCode(s: ModelSpec, level: 'alters' | 'egos', file: string, egoId: string): string {
  const rhs = s.predictors.map((p) => term(p, s, 'stata')).join(' ');
  const L = [`* EgoCraft: ${level === 'alters' ? 'alters nested in egos' : 'one row per ego'}`, `use "${file}", clear`, ''];
  if (level === 'alters') {
    L.push('* As EgoCraft fits it: standard errors clustered by ego');
    L.push(`${s.kind === 'logistic' ? 'logit' : 'regress'} ${s.outcome} ${rhs}, vce(cluster ${egoId})`);
    L.push('', '* The multilevel model: a random intercept for each ego');
    L.push(`${s.kind === 'logistic' ? 'melogit' : 'mixed'} ${s.outcome} ${rhs} || ${egoId}:`);
  } else {
    const w = s.weight ? ` [pweight = ${s.weight}]` : '';
    L.push(`${s.kind === 'logistic' ? 'logit' : 'regress'} ${s.outcome} ${rhs}${w}, vce(robust)`);
  }
  return L.join('\n') + '\n';
}

/** R: the same, with lme4 for the multilevel model. */
export function rModelCode(s: ModelSpec, level: 'alters' | 'egos', file: string, egoId: string): string {
  const rhs = s.predictors.map((p) => term(p, s, 'r')).join(' + ') || '1';
  const L = [`# EgoCraft: ${level === 'alters' ? 'alters nested in egos' : 'one row per ego'}`, `d <- read.csv("${file}")`, ''];
  if (level === 'alters') {
    L.push('# The multilevel model: a random intercept for each ego (install.packages("lme4")).', '# Maximum likelihood, like mixed and melogit in Stata.', 'library(lme4)');
    L.push(s.kind === 'logistic' ? `m <- glmer(${s.outcome} ~ ${rhs} + (1 | ${egoId}), family = binomial, data = d)` : `m <- lmer(${s.outcome} ~ ${rhs} + (1 | ${egoId}), data = d, REML = FALSE)`);
    L.push('summary(m)');
  } else {
    L.push(s.kind === 'logistic' ? `m <- glm(${s.outcome} ~ ${rhs}, family = binomial, data = d${s.weight ? `, weights = ${s.weight}` : ''})` : `m <- lm(${s.outcome} ~ ${rhs}, data = d${s.weight ? `, weights = ${s.weight}` : ''})`);
    L.push('summary(m)', '# Robust standard errors: library(sandwich); lmtest::coeftest(m, vcov = vcovHC(m, "HC1"))');
  }
  return L.join('\n') + '\n';
}

/**
 * A starting point for exponential random graph models of ego-sampled data
 * (Krivitsky and Morris 2017), with the egor and ergm.ego R packages. The
 * terms and the population size are the researcher's choice; this only
 * reads EgoCraft's files.
 */
export function ergmEgoCode(study: Study): string {
  const m = study.mapping;
  return [
    '# Exponential random graph models for ego-sampled data: a starting point.',
    '# install.packages(c("egor", "ergm.ego"))',
    'library(egor)',
    'library(ergm.ego)',
    'egos <- read.csv("egocraft_egos.csv")',
    'alters <- read.csv("egocraft_alters.csv")',
    'ties <- read.csv("egocraft_ties.csv")',
    `e <- threefiles_to_egor(egos = egos, alters.df = alters, edges = ties, ID.vars = list(ego = "${safeName(m.egoId)}", alter = "${safeName(m.alterId)}", source = "${m.tieA ?? 'alter_a'}", target = "${m.tieB ?? 'alter_b'}"))`,
    '# Choose the terms for your question, and the size of the population the egos were sampled from:',
    '# fit <- ergm.ego(e ~ edges + nodematch("gender"), popsize = 100000)',
    '# summary(fit)',
    '# See the ergm.ego documentation before interpreting the results.',
  ].join('\n') + '\n';
}
