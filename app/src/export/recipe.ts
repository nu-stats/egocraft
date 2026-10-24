// Reusing earlier choices: saved column choices (P1.3) and rerunning a
// recipe (P5.3) on new or updated data. Only what fits the new files is
// applied; everything else is listed, so nothing happens silently.

import { columnIndex } from '../core/data.ts';
import type { Mapping, Study } from '../core/study.ts';
import { withHistory } from '../core/study.ts';
import { applyFix, runChecks } from '../import/checks.ts';
import { dropColumn } from '../import/pseudonyms.ts';
import type { TableName } from '../import/pseudonyms.ts';
import type { Project } from '../project.ts';
import type { Recipe } from './export.ts';

export interface SavedColumns {
  format: 'egocraft-columns';
  version: 1;
  savedAt: string;
  mapping: Mapping;
}

export function savedColumns(study: Study, now = new Date()): SavedColumns {
  return { format: 'egocraft-columns', version: 1, savedAt: now.toISOString(), mapping: study.mapping };
}

const TABLE_OF: Record<keyof Mapping, 'egos' | 'alters' | 'ties'> = {
  egoId: 'egos',
  egoWave: 'egos',
  alterEgoId: 'alters',
  alterId: 'alters',
  alterWave: 'alters',
  egoAlterStrength: 'alters',
  tieEgoId: 'ties',
  tieA: 'ties',
  tieB: 'ties',
  tieType: 'ties',
  tieWeight: 'ties',
  tieValue: 'ties',
  tieWave: 'ties',
};

/** Use saved column choices where the study's files have those columns. */
export function applyMapping(study: Study, saved: Partial<Mapping>): { study: Study; used: string[]; missing: string[] } {
  const next = { ...study.mapping };
  const used: string[] = [];
  const missing: string[] = [];
  for (const [role, column] of Object.entries(saved) as [keyof Mapping, string | null][]) {
    if (!column || !(role in TABLE_OF)) continue;
    const t = TABLE_OF[role] === 'egos' ? study.egos : TABLE_OF[role] === 'alters' ? study.alters : study.ties;
    if (t && columnIndex(t, column) >= 0) {
      (next as Record<string, string | null>)[role] = column;
      used.push(`${role} = ${column}`);
    } else missing.push(`${role} = ${column}`);
  }
  const s = withHistory({ ...study, mapping: next }, { kind: 'mapping', text: `Used saved column choices (${used.length} applied${missing.length ? `, ${missing.length} not in these files` : ''}).` });
  return { study: s, used, missing };
}

export function readSavedColumns(text: string): SavedColumns {
  const v = JSON.parse(text) as Omit<Partial<SavedColumns>, 'format'> & { format?: string; mapping?: Mapping };
  if (v?.format === 'egocraft-recipe' && v.mapping) return { format: 'egocraft-columns', version: 1, savedAt: '', mapping: v.mapping };
  if (v?.format !== 'egocraft-columns' || !v.mapping) throw new Error('This is not a file of EgoCraft column choices (or a recipe).');
  return v as SavedColumns;
}

export function readRecipe(text: string): Recipe {
  let v: Partial<Recipe>;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('This is not an EgoCraft recipe (it is not valid JSON).');
  }
  if (v?.format !== 'egocraft-recipe' || !v.mapping || !Array.isArray(v.measures)) throw new Error('This is not an EgoCraft recipe.');
  return v as Recipe;
}

/**
 * Rerun a recipe on the project's (new) data: its column choices, the
 * fixes it made (where the same problems are found again), its settings,
 * subgroups and measures. Returns what was done and what needs a hand.
 */
export function applyRecipe(project: Project, recipe: Recipe): { project: Project; done: string[]; todo: string[] } {
  const done: string[] = [];
  const todo: string[] = [];
  const m = applyMapping(project.study, recipe.mapping);
  let study = m.study;
  if (m.used.length) done.push(`Column choices: ${m.used.length} applied.`);
  if (m.missing.length) todo.push(`Columns not in these files, choose them again on the Columns step: ${m.missing.join(', ')}.`);
  for (const step of recipe.steps) {
    const d = step.detail as Record<string, unknown> | undefined;
    if (step.kind !== 'fix' || !d) continue;
    const check = String(d.check ?? '');
    if (check === 'drop-column') {
      try {
        study = dropColumn(study, d.table as TableName, String(d.column));
        done.push(`Removed the ${d.column} column again.`);
      } catch (e) {
        todo.push((e as Error).message);
      }
    } else if (check === 'pseudonyms') todo.push(`Replace ${d.column} with codes again on the Checks step (it needs a passphrase for the key).`);
    else if (check === 'merge') todo.push(`Add the columns from ${d.file} again on the Data step.`);
    else if (d.fix) {
      if (runChecks(study).some((i) => i.id === check)) {
        study = applyFix(study, check, String(d.fix));
        done.push(`Fixed again: ${step.text}`);
      } else done.push(`Not needed this time: ${step.text}`);
    }
  }
  study = { ...study, settings: { ...study.settings, ...recipe.settings } };
  done.push(`Subgroups (${recipe.slices.length}) and measures (${recipe.measures.length}) from the recipe.`);
  const left = runChecks(study).filter((i) => i.severity === 'error');
  if (left.length) todo.push(`${left.length} problem${left.length === 1 ? '' : 's'} on the Checks step the recipe didn't cover.`);
  return { project: { ...project, study, slices: recipe.slices, measures: recipe.measures }, done, todo };
}
