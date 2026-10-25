import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableFromText } from '../core/data.ts';
import { fitModel, pT, pZ } from './regress.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('p-values: normal and t, against known values', () => {
  close(pZ(1.959963985), 0.05, 1e-8);
  close(pZ(3), 0.0026997961, 1e-9);
  close(pZ(5), 5.733031e-7, 1e-12);
  close(pT(2.228138852, 10), 0.05, 1e-8);
  close(pT(1, 1), 0.5, 1e-10);
});

test('least squares by hand: y = 1 + 2x exactly, then with noise', () => {
  const t = tableFromText('d', ['y', 'x'], [['3', '1'], ['5', '2'], ['7', '3'], ['9', '4.5']]);
  const exact = fitModel({ ...t, rows: [[3, 1], [5, 2], [7, 3], [9, 4]] }, { kind: 'linear', outcome: 'y', predictors: ['x'], categorical: [], weight: null, se: 'ordinary', cluster: null });
  close(exact.terms[0]!.b, 1);
  close(exact.terms[1]!.b, 2);
  close(exact.r2, 1);
  const r = fitModel(t, { kind: 'linear', outcome: 'y', predictors: ['x'], categorical: [], weight: null, se: 'ordinary', cluster: null });
  // Worked out: x̄ = 2.625, ȳ = 6, Sxy = 11.5, Sxx = 6.6875 → b = 1.7196262, a = 1.4859813.
  close(r.terms[1]!.b, 11.5 / 6.6875);
  close(r.terms[0]!.b, 6 - (11.5 / 6.6875) * 2.625);
});

test('logistic regression converges and a categorical predictor gets dummies', () => {
  const rows: string[][] = [];
  for (let i = 0; i < 200; i++) {
    const g = ['a', 'b', 'c'][i % 3]!;
    const x = (i % 17) / 4;
    const y = (Math.sin(i * 12.9898) * 43758.5453) % 1 < 1 / (1 + Math.exp(-(-1 + 0.6 * x + (g === 'b' ? 0.8 : 0)))) - 0.5 + 0.5 ? 1 : 0;
    rows.push([String(y), String(x), g, String(Math.floor(i / 5))]);
  }
  const t = tableFromText('d', ['y', 'x', 'g', 'ego'], rows);
  const r = fitModel(t, { kind: 'logistic', outcome: 'y', predictors: ['x', 'g'], categorical: ['g'], weight: null, se: 'cluster', cluster: 'ego' });
  assert.deepEqual(r.terms.map((x) => x.name), ['Constant', 'x', 'g: b', 'g: c']);
  assert.equal(r.clusters, 40);
  assert.ok(r.logLik! < 0 && r.r2 > 0 && r.r2 < 1);
  for (const term of r.terms) assert.ok(term.lo < term.b && term.b < term.hi);
});

test('model data: one row per alter with position and ego measures; code for Stata and R', async () => {
  const { sampleStudy } = await import('../sample/sample.ts');
  const { computeMeasures } = await import('../measures/measures.ts');
  const { alterModelData, egoModelData, stataModelCode, rModelCode } = await import('./modelData.ts');
  const s = sampleStudy(new Date('2026-10-24T12:00:00Z'));
  const res = computeMeasures(s, [{ spec: { kind: 'size' }, sliceId: 'all' }, { spec: { kind: 'density' }, sliceId: 'all' }], []);
  const a = alterModelData(s, res);
  assert.equal(a.rows.length, s.alters.rows.length);
  for (const c of ['degree', 'betweenness', 'net_size', 'net_density', 'ego_age']) assert.ok(a.columns.some((x) => x.name === c), c);
  const e = egoModelData(s, res);
  assert.equal(e.rows.length, s.egos.rows.length);
  const spec = { kind: 'logistic' as const, outcome: 'woman', predictors: ['age', 'relation'], categorical: ['relation'], weight: null, se: 'cluster' as const, cluster: 'ego_id' };
  assert.match(stataModelCode(spec, 'alters', 'd.dta', 'ego_id'), /melogit woman age i\.relation \|\| ego_id:/);
  assert.match(rModelCode(spec, 'alters', 'd.csv', 'ego_id'), /glmer\(woman ~ age \+ factor\(relation\) \+ \(1 \| ego_id\), family = binomial/);
});
