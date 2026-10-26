// Writes the files for checking EgoCraft against the egor R package (run as
// a black box; see docs/validation.md): wave 1 of the made-up sample study
// as egor's three files, and EgoCraft's own results for the same egos.
//
//   node scripts/egor-check.ts <folder>
// then, in R with egor installed:  Rscript <folder>/egor_check.R

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DataTable } from '../src/core/data.ts';
import { columnIndex } from '../src/core/data.ts';
import { csvOf } from '../src/export/export.ts';
import type { MeasureRequest } from '../src/measures/measures.ts';
import { computeMeasures } from '../src/measures/measures.ts';
import { sampleStudy } from '../src/sample/sample.ts';

const out = path.resolve(process.argv[2] ?? 'egor-check');
mkdirSync(out, { recursive: true });
const full = sampleStudy(new Date('2026-10-25T12:00:00Z'));
const wave1 = (t: DataTable, col: string): DataTable => ({ ...t, rows: t.rows.filter((r) => String(r[columnIndex(t, col)]) === '1') });
// Unweighted: egor's measures here take no weights.
const study = {
  ...full,
  egos: wave1(full.egos, 'wave'),
  alters: wave1(full.alters, 'wave'),
  ties: wave1(full.ties!, 'wave'),
  mapping: { ...full.mapping, egoAlterStrength: null, tieWeight: null },
  settings: { ...full.settings, missingPairs: 'noTie' as const },
};
const measures: MeasureRequest[] = [
  { spec: { kind: 'size' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'all' },
  { spec: { kind: 'constraint' }, sliceId: 'all' },
  { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
  { spec: { kind: 'composition', variable: 'gender', stat: 'share', values: ['2'] }, sliceId: 'all' },
  { spec: { kind: 'diversity', variable: 'race', index: 'categories' }, sliceId: 'all' },
  { spec: { kind: 'diversity', variable: 'race', index: 'entropy' }, sliceId: 'all' },
  { spec: { kind: 'similarity', egoVariable: 'gender', alterVariable: 'gender', index: 'ei' }, sliceId: 'all' },
];
const res = computeMeasures(study, measures, []);
writeFileSync(path.join(out, 'egocraft_w1.csv'), csvOf(res.table));
// egor's three files: alter-alter ties are the pairs tied on any tie type, each once.
const t = study.ties!;
const [e, a, b, k] = ['ego_id', 'alter_a', 'alter_b', 'knows'].map((c) => columnIndex(t, c));
const seen = new Set<string>();
const edges: string[] = ['egoID,Source,Target'];
for (const r of t.rows) {
  if (r[k!] !== 1) continue;
  const [x, y] = [Number(r[a!]), Number(r[b!])].sort((p, q) => p - q);
  const id = `${r[e!]}-${x}-${y}`;
  if (seen.has(id)) continue;
  seen.add(id);
  edges.push(`${r[e!]},${x},${y}`);
}
writeFileSync(path.join(out, 'egos.csv'), csvOf(study.egos));
writeFileSync(path.join(out, 'alters.csv'), csvOf(study.alters));
writeFileSync(path.join(out, 'edges.csv'), edges.join('\n') + '\n');
console.log(`Wrote ${study.egos.rows.length} egos, ${study.alters.rows.length} alters, ${edges.length - 1} ties and EgoCraft's results (columns ${res.table.columns.map((c) => c.name).join(', ')}) to ${out}`);
