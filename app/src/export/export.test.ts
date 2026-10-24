import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { readDataFile } from '../io/read.ts';
import type { MeasureRequest } from '../measures/measures.ts';
import { computeMeasures } from '../measures/measures.ts';
import { buildNetworks } from '../network/networks.ts';
import { longForm, pairsForm, wideForm } from '../reshape/forms.ts';
import { sampleStudy } from '../sample/sample.ts';
import { bundleZip, rScript, stataDoFile } from './export.ts';

const now = new Date('2026-10-24T12:00:00Z');
const measures: MeasureRequest[] = [
  { spec: { kind: 'size' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'all' },
  { spec: { kind: 'constraint' }, sliceId: 'all' },
  { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
  { spec: { kind: 'composition', variable: 'gender', stat: 'share', values: ['Woman'] }, sliceId: 'all' },
];

test('the forms: long has one row per alter, wide one per ego, pairs one per alter pair', () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const long = longForm(s, nets);
  assert.equal(long.rows.length, s.alters.rows.length);
  assert.ok(long.columns.some((c) => c.name === 'ego_age'));
  const wide = wideForm(s, nets);
  assert.equal(wide.rows.length, s.egos.rows.length);
  assert.ok(wide.columns.some((c) => c.name === 'alter15_relation'));
  const pairs = pairsForm(s, nets);
  const expected = nets.egos.reduce((n, e) => n + (e.alters.length * (e.alters.length - 1)) / 2, 0);
  assert.equal(pairs.rows.length, expected);
  const tied = pairs.columns.findIndex((c) => c.name === 'tied');
  // Some pairs are tied, some not, and some not known (alters past the tenth).
  const values = new Set(pairs.rows.map((r) => r[tied]));
  assert.deepEqual([...values].sort(), [0, 1, null]);
});

test('the bundle has every file, and the measures file reads back with its labels', async () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const results = computeMeasures(s, measures, [], nets);
  const zip = bundleZip({ study: s, results, measures, slices: [], long: longForm(s, nets), pairs: pairsForm(s, nets) }, now);
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'egocraft_alter_measures.csv', 'egocraft_change.csv', 'egocraft_check.R', 'egocraft_check.do', 'egocraft_codebook.csv', 'egocraft_long.csv', 'egocraft_long.dta', 'egocraft_measures.csv', 'egocraft_measures.dta', 'egocraft_measures.sav', 'egocraft_measures.xlsx', 'egocraft_measures_by_wave.csv', 'egocraft_methods.txt', 'egocraft_missing.csv', 'egocraft_pairs.csv', 'egocraft_recipe.json', 'egocraft_table.tex', 'egocraft_tables.docx']);
  const back = await readDataFile('m.dta', files['egocraft_measures.dta']!);
  assert.equal(back.rows.length, results.table.rows.length);
  assert.equal(back.columns.find((c) => c.name === 'density')?.label, 'Density');
  const recipe = JSON.parse(strFromU8(files['egocraft_recipe.json']!));
  assert.equal(recipe.format, 'egocraft-recipe');
  assert.equal(recipe.measures.length, measures.length);
});

test('the do-file merges on the IDs and checks size, mean age and share of women', () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const results = computeMeasures(s, measures, [], nets);
  const doFile = stataDoFile({ study: s, results, measures, long: longForm(s, nets) }, now);
  assert.match(doFile, /merge 1:1 ego_id wave using "egocraft_measures.dta"/);
  assert.match(doFile, /assert chk_size == size/);
  assert.match(doFile, /\(mean\) c3_mean_age = age/);
  assert.match(doFile, /generate double c4_pct_gender_woman = \(gender == 1\) if !missing\(gender\)/);
  const r = rScript(s, results, measures, now);
  assert.match(r, /constraint\(g\)\["EGO"\] - row\$constraint/);
  assert.match(r, /a\$closeness/);
});
