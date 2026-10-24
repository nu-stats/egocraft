import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import type { MeasureRequest } from '../measures/measures.ts';
import { computeMeasures } from '../measures/measures.ts';
import type { Slice } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';
import { sampleStudy } from '../sample/sample.ts';
import { buildDocx } from './docx.ts';
import { methodsPlainText, methodsText } from './methods.ts';
import { apaNumber, descriptives, descriptivesBlock, descriptivesLatex, descriptivesTable, missingReport } from './tables.ts';

const now = new Date('2026-10-24T12:00:00Z');
const kin: Slice = { id: 'kin', label: 'Kin only', tieTypes: ['kin'], alterConditions: [{ column: 'relation', op: 'is', values: ['Kin'] }], minWeight: null };
const measures: MeasureRequest[] = [
  { spec: { kind: 'size' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'all' },
  { spec: { kind: 'constraint' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'kin' },
  { spec: { kind: 'composition', variable: 'age', stat: 'mean' }, sliceId: 'all' },
  { spec: { kind: 'diversity', variable: 'race', index: 'iqv' }, sliceId: 'all' },
];

test('APA numbers: two decimals, no leading zero for measures that cannot exceed 1, a real minus sign', () => {
  assert.equal(apaNumber(0.4567, true), '.46');
  assert.equal(apaNumber(1.125), '1.13');
  assert.equal(apaNumber(-0.25, true), '−.25');
  assert.equal(apaNumber(-0.001), '0.00');
  assert.equal(apaNumber(null), '—');
});

test('descriptives, overall and by group, and their Word, LaTeX and data forms', () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const r = computeMeasures(s, measures, [kin], nets);
  const d = descriptives(s, r, measures);
  assert.equal(d.rows.length, measures.length);
  assert.equal(d.rows[0]!.all.n, s.egos.rows.length);
  // Density needs two alters, so fewer egos have it.
  assert.ok(d.rows[1]!.all.n < d.rows[0]!.all.n);
  const block = descriptivesBlock(d);
  assert.equal(block.kind, 'table');
  assert.ok(block.kind === 'table' && block.rows[1]![2]!.startsWith('.'));
  const byGender = descriptives(s, r, measures, 'gender');
  assert.deepEqual(byGender.groups.map((g) => g.label), ['Man', 'Nonbinary', 'Woman']);
  assert.equal(byGender.groups.reduce((a, g) => a + g.n, 0), s.egos.rows.length);
  assert.equal(descriptivesTable(byGender).columns.length, 7 + 6);
  const tex = descriptivesLatex(d);
  assert.match(tex, /\\toprule/);
  assert.match(tex, /Density \(Kin only\)/);
  const docx = unzipSync(buildDocx([block]));
  const xml = strFromU8(docx['word/document.xml']!);
  assert.match(xml, /Table 1/);
  assert.match(xml, /Descriptive Statistics/);
  assert.ok(docx['[Content_Types].xml']);
});

test('missing report: reasons add up to the egos without a value', () => {
  const s = sampleStudy(now);
  const nets = buildNetworks(s);
  const r = computeMeasures(s, measures, [kin], nets);
  const m = missingReport(s, r, measures, [kin], nets);
  for (const row of m.rows) assert.equal((row[2] as number) + (row[3] as number) + (row[4] as number) + (row[5] as number), nets.egos.length);
  const density = m.rows[1]!;
  assert.ok((density[6] as number) > 0, 'some pairs were not asked in the sample');
  assert.ok((m.rows[4]![8] as number) > 0, 'some alter ages are missing in the sample');
});

test('methods draft: sample, pairs not asked, measures with sources, references', () => {
  const s = sampleStudy(now);
  const m = methodsText(s, measures, [kin]);
  const text = methodsPlainText(m);
  assert.match(text, /200 respondents \(egos\) interviewed in up to 2 survey waves \(380 ego-waves\)/);
  assert.match(text, /were not asked or not answered; these pairs were counted as not tied/);
  assert.match(text, /constraint \(Burt, 1992\)/);
  assert.match(text, /For the subgroup "Kin only"/);
  assert.ok(m.references.some((x) => x.startsWith('Burt, R. S. (1992)')));
  assert.ok(m.references.some((x) => x.startsWith('Agresti, A.')));
});
