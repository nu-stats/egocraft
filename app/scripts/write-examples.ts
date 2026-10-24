// Writes the made-up sample study to examples/ as three CSV files, and with
// --bundle <folder>, a full results bundle unpacked there (used to check
// the do-file in Stata and the R script in R).
//
//   node scripts/write-examples.ts [--bundle <folder>]

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { bundleZip, csvOf } from '../src/export/export.ts';
import type { MeasureRequest } from '../src/measures/measures.ts';
import { computeMeasures } from '../src/measures/measures.ts';
import type { Slice } from '../src/network/networks.ts';
import { buildNetworks } from '../src/network/networks.ts';
import { longForm, pairsForm } from '../src/reshape/forms.ts';
import { sampleStudy, sampleTables } from '../src/sample/sample.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, '..', '..', 'examples');
mkdirSync(examples, { recursive: true });
const t = sampleTables();
writeFileSync(path.join(examples, 'sample-egos.csv'), csvOf(t.egos));
writeFileSync(path.join(examples, 'sample-alters.csv'), csvOf(t.alters));
writeFileSync(path.join(examples, 'sample-ties.csv'), csvOf(t.ties));
console.log(`Wrote the sample study to ${examples}`);

const i = process.argv.indexOf('--bundle');
if (i > 0 && process.argv[i + 1]) {
  const out = path.resolve(process.argv[i + 1]!);
  mkdirSync(out, { recursive: true });
  const study = sampleStudy(new Date('2026-10-24T12:00:00Z'));
  const kin: Slice = { id: 'kin', label: 'Kin only', tieTypes: ['kin'], alterConditions: [{ column: 'relation', op: 'is', values: ['Kin'] }], minWeight: null };
  const measures: MeasureRequest[] = [
    { spec: { kind: 'size' }, sliceId: 'all' },
    { spec: { kind: 'density' }, sliceId: 'all' },
    { spec: { kind: 'constraint' }, sliceId: 'all' },
    { spec: { kind: 'effectiveSize' }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'age', stat: 'sd' }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'gender', stat: 'share', values: ['Woman'] }, sliceId: 'all' },
    { spec: { kind: 'composition', variable: 'relation', stat: 'count', values: ['Kin'] }, sliceId: 'all' },
    { spec: { kind: 'size' }, sliceId: 'kin' },
    { spec: { kind: 'density' }, sliceId: 'kin' },
  ];
  const nets = buildNetworks(study);
  const results = computeMeasures(study, measures, [kin], nets);
  const files = unzipSync(bundleZip({ study, results, measures, slices: [kin], long: longForm(study, nets), pairs: pairsForm(study, nets) }));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(out, name), bytes);
  console.log(`Wrote a results bundle to ${out}`);
}
