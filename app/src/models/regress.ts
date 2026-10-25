// Regression models (P11): linear (least squares, optionally weighted) and
// logistic (maximum likelihood, Newton–Raphson), with ordinary, robust
// (HC1) or cluster-robust standard errors. Clustering by ego is how alters
// nested in egos are handled here; the Stata and R code written alongside
// fits the full multilevel model. Formulas from the standard texts (e.g.
// Cameron and Miller 2015 for cluster-robust variance, with the same
// small-sample factors Stata uses), not from any program's code.

import type { Cell, DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, idText, numberOf } from '../core/data.ts';

export type ModelKind = 'linear' | 'logistic';
export type SeKind = 'ordinary' | 'robust' | 'cluster';

export interface ModelSpec {
  kind: ModelKind;
  outcome: string;
  predictors: string[];
  /** Predictors treated as categories (dummies, first category left out). */
  categorical: string[];
  weight: string | null;
  se: SeKind;
  cluster: string | null;
}

export interface Term {
  name: string;
  b: number;
  se: number;
  stat: number;
  p: number;
  lo: number;
  hi: number;
}

export interface ModelResult {
  spec: ModelSpec;
  terms: Term[];
  n: number;
  clusters: number | null;
  /** R² (linear) or McFadden's pseudo-R² (logistic). */
  r2: number;
  logLik: number | null;
  dropped: number;
  notes: string[];
}

// ---------- small linear algebra ----------

/** Inverse of a symmetric positive-definite matrix (Gauss–Jordan with pivoting). Throws when singular. */
export function invert(a: number[][]): number[][] {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-12) throw new Error('The predictors are collinear (one is an exact combination of others). Remove one and fit again.');
    [m[c], m[p]] = [m[p]!, m[c]!];
    const d = m[c]![c]!;
    for (let k = 0; k < 2 * n; k++) m[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      if (f) for (let k = 0; k < 2 * n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row) => row.slice(n));
}

const mul = (a: number[][], b: number[][]) => a.map((row) => b[0]!.map((_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));

// ---------- distributions ----------

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const v of c) s += v / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}

/** Regularized incomplete beta I_x(a, b), by its continued fraction. */
function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) return 1 - incBeta(1 - x, b, a);
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = Math.abs(d) < 1e-300 ? 1e-300 : d;
  d = 1 / d;
  f = d;
  for (let m = 1; m <= 300; m++) {
    for (const even of [true, false]) {
      const num = even ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)) : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      d = 1 + num * d;
      d = Math.abs(d) < 1e-300 ? 1e-300 : d;
      c = 1 + num / c;
      c = Math.abs(c) < 1e-300 ? 1e-300 : c;
      d = 1 / d;
      f *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-15) break;
  }
  return (front * f) / a;
}

/** Two-sided p-value of t with df degrees of freedom. */
export function pT(t: number, df: number): number {
  return incBeta(df / (df + t * t), df / 2, 0.5);
}

/** The complementary error function: its power series below 3, its continued fraction above. */
function erfc(x: number): number {
  const a = Math.abs(x);
  let r: number;
  if (a < 3) {
    let term = a;
    let sum = a;
    for (let n = 1; n < 200; n++) {
      term *= (-a * a) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    r = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // erfc(a) = e^(−a²)/√π · 1/(a + (1/2)/(a + 1/(a + (3/2)/(a + …)))), evaluated from the tail.
    let f = a;
    for (let k = 80; k >= 1; k--) f = a + k / 2 / f;
    r = Math.exp(-a * a) / Math.sqrt(Math.PI) / f;
  }
  return x < 0 ? 2 - r : r;
}

/** Two-sided p-value of a standard normal z. */
export function pZ(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2);
}

/** The 97.5% point of t (or z when df is Infinity), by bisection on pT. */
function crit(df: number): number {
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = Number.isFinite(df) ? pT(mid, df) : pZ(mid);
    if (p > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- design ----------

interface Design {
  y: number[];
  x: number[][];
  w: number[];
  g: string[];
  names: string[];
  dropped: number;
}

function design(t: DataTable, s: ModelSpec): Design {
  const yj = columnIndex(t, s.outcome);
  if (yj < 0) throw new Error(`There is no column named ${s.outcome}.`);
  const parts = s.predictors.map((p) => {
    const j = columnIndex(t, p);
    if (j < 0) throw new Error(`There is no column named ${p}.`);
    const col = t.columns[j];
    if (!s.categorical.includes(p)) return { p, j, levels: null as string[] | null };
    // Levels in code order (1, 2, 3 … or A, B, C), so the first and reference category is the lowest code, as in Stata.
    const levels = [...new Set(t.rows.map((r) => idText(r[j])).filter((v): v is string => v !== null))].sort((a, b) => {
      const x = numberOf(a);
      const y = numberOf(b);
      return x !== null && y !== null ? x - y : a.localeCompare(b, 'en', { numeric: true });
    });
    return { p, j, levels };
  });
  const shown = (p: string, code: string) => {
    const j = columnIndex(t, p);
    return categoryOf(t.columns[j], code) ?? code;
  };
  const names = ['Constant', ...parts.flatMap(({ p, levels }) => (levels ? levels.slice(1).map((l) => `${p}: ${shown(p, l)}`) : [p]))];
  const wj = s.weight ? columnIndex(t, s.weight) : -1;
  const gj = s.se === 'cluster' && s.cluster ? columnIndex(t, s.cluster) : -1;
  const out: Design = { y: [], x: [], w: [], g: [], names, dropped: 0 };
  for (const r of t.rows) {
    const y = numberOf(r[yj]);
    const row: number[] = [1];
    let ok = y !== null;
    for (const { j, levels } of parts) {
      if (!ok) break;
      if (levels) {
        const v = idText(r[j]);
        if (v === null) ok = false;
        else for (const l of levels.slice(1)) row.push(v === l ? 1 : 0);
      } else {
        const v = numberOf(r[j]);
        if (v === null) ok = false;
        else row.push(v);
      }
    }
    const w = wj >= 0 ? numberOf(r[wj]) : 1;
    const g = gj >= 0 ? idText(r[gj]) : '';
    if (!ok || w === null || w <= 0 || g === null) {
      out.dropped++;
      continue;
    }
    out.y.push(y!);
    out.x.push(row);
    out.w.push(w);
    out.g.push(g);
  }
  return out;
}

function sandwich(bread: number[][], scores: number[][], groups: string[] | null): { meat: number[][]; G: number } {
  const k = bread.length;
  const sums = new Map<string, number[]>();
  scores.forEach((s, i) => {
    const key = groups ? groups[i]! : String(i);
    const acc = sums.get(key) ?? new Array<number>(k).fill(0);
    for (let a = 0; a < k; a++) acc[a]! += s[a]!;
    sums.set(key, acc);
  });
  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const u of sums.values()) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a]![b]! += u[a]! * u[b]!;
  return { meat, G: sums.size };
}

export function fitModel(t: DataTable, s: ModelSpec): ModelResult {
  const d = design(t, s);
  const n = d.y.length;
  const k = d.names.length;
  if (n <= k) throw new Error(`Only ${n} complete rows for ${k} coefficients: too few to fit.`);
  const notes: string[] = [];
  let b: number[];
  let bread: number[][];
  let scores: number[][];
  let r2: number;
  let logLik: number | null = null;
  let df: number;
  if (s.kind === 'linear') {
    const xtwx = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, c) => d.x.reduce((acc, row, i) => acc + d.w[i]! * row[a]! * row[c]!, 0)));
    const xtwy = Array.from({ length: k }, (_, a) => d.x.reduce((acc, row, i) => acc + d.w[i]! * row[a]! * d.y[i]!, 0));
    const inv = invert(xtwx);
    b = inv.map((row) => row.reduce((acc, v, c) => acc + v * xtwy[c]!, 0));
    const fit = d.x.map((row) => row.reduce((acc, v, c) => acc + v * b[c]!, 0));
    const e = d.y.map((y, i) => y - fit[i]!);
    const sw = d.w.reduce((a, v) => a + v, 0);
    const ybar = d.y.reduce((a, y, i) => a + d.w[i]! * y, 0) / sw;
    const ssr = e.reduce((a, v, i) => a + d.w[i]! * v * v, 0);
    const sst = d.y.reduce((a, y, i) => a + d.w[i]! * (y - ybar) ** 2, 0);
    r2 = sst ? 1 - ssr / sst : 0;
    bread = inv;
    scores = d.x.map((row, i) => row.map((v) => d.w[i]! * v * e[i]!));
    df = n - k;
    if (s.se === 'ordinary') {
      const s2 = ssr / (n - k);
      bread = inv.map((row) => row.map((v) => v * s2));
    }
  } else {
    if (d.y.some((y) => y !== 0 && y !== 1)) throw new Error(`${s.outcome} must be 0 or 1 for a logistic model.`);
    b = new Array<number>(k).fill(0);
    let ll = -Infinity;
    let inv: number[][] = [];
    for (let it = 0; it < 50; it++) {
      const p = d.x.map((row) => 1 / (1 + Math.exp(-row.reduce((acc, v, c) => acc + v * b[c]!, 0))));
      const grad = Array.from({ length: k }, (_, a) => d.x.reduce((acc, row, i) => acc + d.w[i]! * row[a]! * (d.y[i]! - p[i]!), 0));
      const hess = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, c) => d.x.reduce((acc, row, i) => acc + d.w[i]! * row[a]! * row[c]! * p[i]! * (1 - p[i]!), 0)));
      inv = invert(hess);
      const step = inv.map((row) => row.reduce((acc, v, c) => acc + v * grad[c]!, 0));
      b = b.map((v, a) => v + step[a]!);
      const p2 = d.x.map((row) => 1 / (1 + Math.exp(-row.reduce((acc, v, c) => acc + v * b[c]!, 0))));
      const newLl = d.y.reduce((acc, y, i) => acc + d.w[i]! * (y ? Math.log(p2[i]!) : Math.log(1 - p2[i]!)), 0);
      if (Math.abs(newLl - ll) < 1e-12) {
        ll = newLl;
        break;
      }
      ll = newLl;
    }
    const p = d.x.map((row) => 1 / (1 + Math.exp(-row.reduce((acc, v, c) => acc + v * b[c]!, 0))));
    const hess = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, c) => d.x.reduce((acc, row, i) => acc + d.w[i]! * row[a]! * row[c]! * p[i]! * (1 - p[i]!), 0)));
    inv = invert(hess);
    const sw = d.w.reduce((a, v) => a + v, 0);
    const pbar = d.y.reduce((a, y, i) => a + d.w[i]! * y, 0) / sw;
    const ll0 = sw * (pbar * Math.log(pbar) + (1 - pbar) * Math.log(1 - pbar));
    r2 = 1 - ll / ll0;
    logLik = ll;
    bread = inv;
    scores = d.x.map((row, i) => row.map((v) => d.w[i]! * v * (d.y[i]! - p[i]!)));
    df = Infinity;
    if (p.some((v) => v < 1e-8 || v > 1 - 1e-8)) notes.push('Some rows are predicted perfectly (0 or 1): a predictor may separate the outcome completely, which makes those coefficients unreliable.');
  }
  let V = bread;
  let clusters: number | null = null;
  if (s.se !== 'ordinary') {
    const { meat, G } = sandwich(bread, scores, s.se === 'cluster' ? d.g : null);
    // Small-sample factors as Stata applies them: linear models n−1 over n−k times G over G−1;
    // logistic models G over G−1 only.
    const factor = s.kind === 'linear' ? (s.se === 'cluster' ? ((n - 1) / (n - k)) * (G / (G - 1)) : n / (n - k)) : G / (G - 1);
    V = mul(mul(bread, meat), bread).map((row) => row.map((v) => v * factor));
    if (s.se === 'cluster') {
      clusters = G;
      df = s.kind === 'linear' ? G - 1 : Infinity;
      if (G < 30) notes.push(`Only ${G} clusters: cluster-robust standard errors can be too small with fewer than about 30.`);
    }
  }
  const c = crit(df);
  const terms: Term[] = d.names.map((name, a) => {
    const se = Math.sqrt(V[a]![a]!);
    const stat = b[a]! / se;
    return { name, b: b[a]!, se, stat, p: Number.isFinite(df) ? pT(stat, df) : pZ(stat), lo: b[a]! - c * se, hi: b[a]! + c * se };
  });
  if (d.dropped) notes.push(`${d.dropped} row${d.dropped === 1 ? ' was' : 's were'} left out for missing values${s.weight ? ' or weights' : ''}.`);
  return { spec: s, terms, n, clusters, r2, logLik, dropped: d.dropped, notes };
}

/** The coefficient table as data (for CSV, Excel, Stata, SPSS). */
export function modelTable(r: ModelResult): DataTable {
  const z = r.spec.kind === 'logistic' ? 'z' : 't';
  const rows: Cell[][] = r.terms.map((t) => [t.name, t.b, t.se, t.stat, t.p, t.lo, t.hi].map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));
  return {
    name: 'model',
    columns: [
      { name: 'term', kind: 'string' },
      { name: 'coef', label: r.spec.kind === 'logistic' ? 'Coefficient (log odds)' : 'Coefficient', kind: 'numeric' },
      { name: 'se', label: 'Standard error', kind: 'numeric' },
      { name: z, kind: 'numeric' },
      { name: 'p', kind: 'numeric' },
      { name: 'ci_low', label: '95% confidence interval, low', kind: 'numeric' },
      { name: 'ci_high', label: '95% confidence interval, high', kind: 'numeric' },
    ],
    rows,
  };
}
