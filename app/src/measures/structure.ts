// Structural measures of one ego network (P3.2–P3.6), on a Graph from
// network/networks.ts. Alter–alter ties are undirected. Formulas follow the
// published sources named in each function; nothing is copied from other
// programs' code.

import type { Graph } from '../network/networks.ts';
import type { MissingPairRule } from '../core/study.ts';

const at = (g: Graph, i: number, k: number) => g.w[i * g.n + k]!;
const tied = (g: Graph, i: number, k: number) => at(g, i, k) > 0;

/** Number of alter–alter ties. */
export function tieCount(g: Graph): number {
  let t = 0;
  for (let i = 0; i < g.n; i++) for (let k = i + 1; k < g.n; k++) if (tied(g, i, k)) t++;
  return t;
}

/** Alter pairs whose tie is not known. */
export function unknownPairs(g: Graph): number {
  let u = 0;
  for (let i = 0; i < g.n; i++) for (let k = i + 1; k < g.n; k++) if (g.unknown[i * g.n + k]) u++;
  return u;
}

function pairCount(g: Graph, rule: MissingPairRule): number {
  const all = (g.n * (g.n - 1)) / 2;
  return rule === 'observed' ? all - unknownPairs(g) : all;
}

/** Ties present divided by pairs possible (ego left out). Null with fewer than two alters. */
export function density(g: Graph, rule: MissingPairRule = 'noTie'): number | null {
  const pairs = pairCount(g, rule);
  return pairs > 0 ? tieCount(g) / pairs : null;
}

/** Mean tie strength over all alter pairs (no tie = 0). */
export function weightedDensity(g: Graph, rule: MissingPairRule = 'noTie'): number | null {
  const pairs = pairCount(g, rule);
  if (pairs <= 0) return null;
  let s = 0;
  for (let i = 0; i < g.n; i++) for (let k = i + 1; k < g.n; k++) s += at(g, i, k);
  return s / pairs;
}

/** Each alter's number of ties to other alters. */
export function degrees(g: Graph): number[] {
  const d = new Array<number>(g.n).fill(0);
  for (let i = 0; i < g.n; i++) for (let k = i + 1; k < g.n; k++) if (tied(g, i, k)) (d[i]!++, d[k]!++);
  return d;
}

/**
 * Ego betweenness (Everett and Borgatti 2005): for each pair of alters who
 * are not tied, the ego lies on one of the 1 + c shortest paths between them,
 * where c is the number of alters tied to both. Sum of 1 / (1 + c).
 */
export function egoBetweenness(g: Graph): number {
  let b = 0;
  for (let i = 0; i < g.n; i++)
    for (let k = i + 1; k < g.n; k++) {
      if (tied(g, i, k)) continue;
      let common = 0;
      for (let q = 0; q < g.n; q++) if (q !== i && q !== k && tied(g, i, q) && tied(g, k, q)) common++;
      b += 1 / (1 + common);
    }
  return b;
}

/** Ego betweenness divided by the number of alter pairs (0–1). */
export function egoBetweennessNormalized(g: Graph): number | null {
  const pairs = (g.n * (g.n - 1)) / 2;
  return pairs > 0 ? egoBetweenness(g) / pairs : null;
}

/**
 * Betweenness of each alter in the network of alters (ego left out),
 * Freeman (1977), counted with Brandes's (2001) method; unordered pairs.
 */
export function alterBetweenness(g: Graph): number[] {
  const n = g.n;
  const cb = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Array<number>(n).fill(0);
    const dist = new Array<number>(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h]!;
      stack.push(v);
      for (let x = 0; x < n; x++) {
        if (x === v || !tied(g, v, x)) continue;
        if (dist[x]! < 0) {
          dist[x] = dist[v]! + 1;
          queue.push(x);
        }
        if (dist[x] === dist[v]! + 1) {
          sigma[x]! += sigma[v]!;
          pred[x]!.push(v);
        }
      }
    }
    const delta = new Array<number>(n).fill(0);
    while (stack.length) {
      const x = stack.pop()!;
      for (const v of pred[x]!) delta[v]! += (sigma[v]! / sigma[x]!) * (1 + delta[x]!);
      if (x !== s) cb[x]! += delta[x]!;
    }
  }
  return cb.map((v) => v / 2);
}

/** Groups of alters connected to each other (ego left out), as lists of alter indices. */
export function components(g: Graph): number[][] {
  const seen = new Array<boolean>(g.n).fill(false);
  const out: number[][] = [];
  for (let s = 0; s < g.n; s++) {
    if (seen[s]) continue;
    const part = [s];
    seen[s] = true;
    for (let h = 0; h < part.length; h++) {
      const v = part[h]!;
      for (let x = 0; x < g.n; x++)
        if (!seen[x] && tied(g, v, x)) {
          seen[x] = true;
          part.push(x);
        }
    }
    out.push(part);
  }
  return out;
}

/** Alters tied to no other alter. */
export function isolates(g: Graph): number {
  return degrees(g).filter((d) => d === 0).length;
}

// ---------- structural holes (Burt 1992) ----------

/**
 * Proportional tie strengths in the ego network with the ego included:
 * p[x][y] = z(x,y) / sum of x's ties, where index n is the ego. Ego–alter
 * strengths come from the ego-alter strength column (1 if none).
 */
function proportions(g: Graph): { p: (x: number, y: number) => number; z: (x: number, y: number) => number } {
  const n = g.n;
  const z = (x: number, y: number): number => {
    if (x === y) return 0;
    if (x === n) return g.egoStrength[y]!;
    if (y === n) return g.egoStrength[x]!;
    return at(g, x, y);
  };
  const totals = new Array<number>(n + 1).fill(0);
  for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) totals[x]! += z(x, y);
  return { z, p: (x, y) => (totals[x]! > 0 ? z(x, y) / totals[x]! : 0) };
}

/**
 * Burt's effective size: the sum over alters j of 1 − Σ_q p(ego,q) m(j,q),
 * with m(j,q) = z(j,q) / j's strongest tie. With equal ties this is
 * n − 2t/n (Borgatti 1997).
 */
export function effectiveSize(g: Graph): number | null {
  const n = g.n;
  if (n === 0) return null;
  const { z, p } = proportions(g);
  let es = 0;
  for (let j = 0; j < n; j++) {
    let maxJ = 0;
    for (let k = 0; k <= n; k++) if (k !== j) maxJ = Math.max(maxJ, z(j, k));
    let redundancy = 0;
    for (let q = 0; q < n; q++) {
      if (q === j || maxJ === 0) continue;
      redundancy += p(n, q) * (z(j, q) / maxJ);
    }
    es += 1 - redundancy;
  }
  return es;
}

/** Effective size divided by the number of alters. */
export function efficiency(g: Graph): number | null {
  const es = effectiveSize(g);
  return es === null || g.n === 0 ? null : es / g.n;
}

/** Each alter's contribution to the ego's constraint: (p(ego,j) + Σ_q p(ego,q) p(q,j))². */
export function constraintParts(g: Graph): number[] {
  const n = g.n;
  const { p } = proportions(g);
  const parts: number[] = [];
  for (let j = 0; j < n; j++) {
    let indirect = 0;
    for (let q = 0; q < n; q++) if (q !== j) indirect += p(n, q) * p(q, j);
    parts.push((p(n, j) + indirect) ** 2);
  }
  return parts;
}

/** Burt's aggregate constraint of the ego. Null with no alters. */
export function constraint(g: Graph): number | null {
  if (g.n === 0) return null;
  return constraintParts(g).reduce((a, b) => a + b, 0);
}

/**
 * Burt's hierarchy: how unevenly constraint is spread across alters (0 =
 * evenly). Σ r ln r / (N ln N), with r = c_j / (C / N). Null with fewer than
 * two alters.
 */
export function hierarchy(g: Graph): number | null {
  const N = g.n;
  if (N < 2) return null;
  const parts = constraintParts(g);
  const C = parts.reduce((a, b) => a + b, 0);
  if (C === 0) return null;
  let h = 0;
  for (const c of parts) {
    const r = c / (C / N);
    if (r > 0) h += r * Math.log(r);
  }
  return h / (N * Math.log(N));
}

/**
 * Yule's Q for alter–alter homophily on a category: from the 2×2 table of
 * alter pairs (tied or not × same or different category),
 * Q = (ad − bc) / (ad + bc). Pairs with a missing category or an unknown
 * tie are left out. Null when the table has an empty margin.
 */
export function yulesQ(g: Graph, categoryOfAlter: (i: number) => string | null): number | null {
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  for (let i = 0; i < g.n; i++)
    for (let k = i + 1; k < g.n; k++) {
      if (g.unknown[i * g.n + k]) continue;
      const x = categoryOfAlter(i);
      const y = categoryOfAlter(k);
      if (x === null || y === null) continue;
      const same = x === y;
      if (tied(g, i, k)) same ? a++ : b++;
      else same ? c++ : d++;
    }
  const den = a * d + b * c;
  return den === 0 ? null : (a * d - b * c) / den;
}
