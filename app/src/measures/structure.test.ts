import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Graph } from '../network/networks.ts';
import * as S from './structure.ts';

function graph(n: number, edges: [number, number, number?][], unknown: [number, number][] = [], egoStrength?: number[]): Graph {
  const w = new Float64Array(n * n);
  const u = new Uint8Array(n * n);
  for (const [a, b, v = 1] of edges) {
    w[a * n + b] = v;
    w[b * n + a] = v;
  }
  for (const [a, b] of unknown) {
    u[a * n + b] = 1;
    u[b * n + a] = 1;
  }
  return { n, alterIds: Array.from({ length: n }, (_, i) => String(i + 1)), alterRows: Array.from({ length: n }, (_, i) => i), w, unknown: u, egoStrength: egoStrength ?? new Array(n).fill(1) };
}

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.ok(a !== null, 'value is null');
  assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
};

test('a star (alters know nobody): no redundancy, constraint 1/n', () => {
  const g = graph(4, []);
  assert.equal(S.tieCount(g), 0);
  close(S.density(g), 0);
  close(S.effectiveSize(g), 4);
  close(S.efficiency(g), 1);
  close(S.constraint(g), 0.25);
  close(S.hierarchy(g), 0);
  close(S.egoBetweenness(g), 6);
  close(S.egoBetweennessNormalized(g), 1);
  assert.equal(S.components(g).length, 4);
  assert.equal(S.isolates(g), 4);
});

test('everyone knows everyone (4 alters)', () => {
  const g = graph(4, [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
  close(S.density(g), 1);
  close(S.effectiveSize(g), 4 - (2 * 6) / 4);
  // Each alter: (1/4 + 3 × 1/4 × 1/4)² = (7/16)²; four alters.
  close(S.constraint(g), (4 * 49) / 256);
  close(S.egoBetweenness(g), 0);
  assert.deepEqual(S.degrees(g), [3, 3, 3, 3]);
  assert.equal(S.components(g).length, 1);
  assert.equal(S.isolates(g), 0);
});

test('a path of three alters, worked by hand', () => {
  const g = graph(3, [[0, 1], [1, 2]]);
  close(S.density(g), 2 / 3);
  close(S.effectiveSize(g), 3 - 4 / 3);
  // Only the end alters are untied, and alter 2 is tied to both: 1 / (1 + 1).
  close(S.egoBetweenness(g), 0.5);
  assert.deepEqual(S.alterBetweenness(g), [0, 1, 0]);
  // Ends: (1/3 + 1/3 × 1/3)² = 16/81; middle: (1/3 + 2 × 1/3 × 1/2)² = 36/81.
  close(S.constraint(g), 68 / 81);
  const r1 = (16 / 81) / (68 / 81 / 3);
  const r2 = (36 / 81) / (68 / 81 / 3);
  close(S.hierarchy(g), (2 * r1 * Math.log(r1) + r2 * Math.log(r2)) / (3 * Math.log(3)));
});

test('weighted ties: effective size uses marginal strength, weighted density is the mean strength', () => {
  const g = graph(3, [[0, 1, 2]]);
  close(S.weightedDensity(g), 2 / 3);
  // Equal ego ties: alters 1 and 2 are each other's strongest tie, so m = 1; alter 3 has no redundancy.
  close(S.effectiveSize(g), 3 - 2 / 3);
});

test('unknown pairs: counted as no tie, or left out of density', () => {
  const g = graph(4, [[0, 1]], [[2, 3], [1, 3]]);
  assert.equal(S.unknownPairs(g), 2);
  close(S.density(g, 'noTie'), 1 / 6);
  close(S.density(g, 'observed'), 1 / 4);
});

test("Yule's Q: only same-category ties gives +1", () => {
  const g = graph(4, [[0, 1], [2, 3]]);
  const cat = ['A', 'A', 'B', 'B'];
  close(S.yulesQ(g, (i) => cat[i]!), 1);
  const g2 = graph(4, [[0, 2], [1, 3], [0, 3], [1, 2]]);
  close(S.yulesQ(g2, (i) => cat[i]!), -1);
});

test('empty and one-alter networks give null where a measure is undefined', () => {
  const g0 = graph(0, []);
  assert.equal(S.density(g0), null);
  assert.equal(S.constraint(g0), null);
  assert.equal(S.effectiveSize(g0), null);
  const g1 = graph(1, []);
  assert.equal(S.density(g1), null);
  close(S.constraint(g1), 1);
  assert.equal(S.hierarchy(g1), null);
});
