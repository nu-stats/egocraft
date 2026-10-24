// Placing alters for a sociogram (P4.1): force-directed, circle, rings (by
// closeness, as in a closeness-circles interview) and sectors (one wedge per
// group). Positions are in a square from -1 to 1 with the ego at 0,0.
// Layouts are seeded from the ego's ID, so the same network always looks the
// same, and they can be shared across waves (P4.5).

export interface LayoutInput {
  ids: string[];
  /** Pairs of alter indices that are tied. */
  edges: [number, number][];
  /** For rings: a number per alter (higher = closer to the ego). */
  ring?: (number | null)[];
  /** For sectors: a group per alter. */
  group?: (string | null)[];
  seed: string;
}

export type LayoutKind = 'force' | 'circle' | 'rings' | 'sectors';

export type Positions = Map<string, { x: number; y: number }>;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const order = (ids: string[]) => ids.map((id, i) => ({ id, i })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

function circle(input: LayoutInput, radius = 0.85): Positions {
  const out: Positions = new Map();
  const sorted = order(input.ids);
  const n = sorted.length;
  sorted.forEach(({ id }, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, n);
    out.set(id, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
  });
  return out;
}

/**
 * Fruchterman and Reingold (1991) with the ego held at the center: alters
 * repel each other, ties pull alters together, and a weak pull keeps
 * everyone inside the frame.
 */
function force(input: LayoutInput): Positions {
  const n = input.ids.length;
  if (n <= 1) return circle(input, 0.5);
  const r = rng(hash(input.seed));
  const start = circle(input, 0.7);
  // Node n is the ego, held at the center and tied to every alter.
  const x = [...input.ids.map((id) => start.get(id)!.x + (r() - 0.5) * 0.2), 0];
  const y = [...input.ids.map((id) => start.get(id)!.y + (r() - 0.5) * 0.2), 0];
  const edges: [number, number, number][] = [...input.edges.map(([a, b]) => [a, b, 1] as [number, number, number]), ...input.ids.map((_, i) => [i, n, 1.2] as [number, number, number])];
  const k = 1.6 / Math.sqrt(n + 1);
  let temp = 0.15;
  for (let it = 0; it < 400; it++) {
    const dx = new Array<number>(n + 1).fill(0);
    const dy = new Array<number>(n + 1).fill(0);
    for (let i = 0; i <= n; i++)
      for (let j = i + 1; j <= n; j++) {
        let ex = x[i]! - x[j]!;
        let ey = y[i]! - y[j]!;
        const d = Math.max(0.02, Math.hypot(ex, ey));
        const f = (k * k) / d;
        ex /= d;
        ey /= d;
        dx[i]! += ex * f;
        dy[i]! += ey * f;
        dx[j]! -= ex * f;
        dy[j]! -= ey * f;
      }
    for (const [i, j, s] of edges) {
      let ex = x[i]! - x[j]!;
      let ey = y[i]! - y[j]!;
      const d = Math.max(0.02, Math.hypot(ex, ey));
      const f = (s * d * d) / k;
      ex /= d;
      ey /= d;
      dx[i]! -= ex * f;
      dy[i]! -= ey * f;
      dx[j]! += ex * f;
      dy[j]! += ey * f;
    }
    for (let i = 0; i < n; i++) {
      const len = Math.max(1e-9, Math.hypot(dx[i]!, dy[i]!));
      x[i]! += (dx[i]! / len) * Math.min(len, temp);
      y[i]! += (dy[i]! / len) * Math.min(len, temp);
    }
    temp = Math.max(0.005, temp * 0.99);
  }
  // Center the alters around the ego, so the ego sits in the middle of the picture.
  const mx = input.ids.reduce((a, _, i) => a + x[i]!, 0) / n;
  const my = input.ids.reduce((a, _, i) => a + y[i]!, 0) / n;
  for (let i = 0; i < n; i++) {
    x[i]! -= mx;
    y[i]! -= my;
  }
  const scale = 0.9 / Math.max(0.2, ...input.ids.map((_, i) => Math.max(Math.abs(x[i]!), Math.abs(y[i]!))));
  return new Map(input.ids.map((id, i) => [id, { x: x[i]! * scale, y: y[i]! * scale }]));
}

/** Rings: the closest alters on the inner ring. Values are ranked into up to four rings. */
function rings(input: LayoutInput): Positions {
  const values = [...new Set((input.ring ?? []).filter((v): v is number => v !== null))].sort((a, b) => b - a);
  const ringOf = (v: number | null | undefined) => (v === null || v === undefined ? values.length : values.indexOf(v));
  const levels = values.length + ((input.ring ?? []).some((v) => v === null) ? 1 : 0);
  const out: Positions = new Map();
  const byRing = new Map<number, string[]>();
  input.ids.forEach((id, i) => {
    const k = ringOf(input.ring?.[i]);
    byRing.set(k, [...(byRing.get(k) ?? []), id]);
  });
  for (const [k, ids] of byRing) {
    const radius = 0.3 + (0.6 * (k + 1)) / Math.max(1, levels);
    const offset = (hash(input.seed + k) % 360) * (Math.PI / 180);
    ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach((id, j) => {
      const a = offset + (2 * Math.PI * j) / ids.length;
      out.set(id, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
    });
  }
  return out;
}

/** Sectors: one wedge per group, alters spread inside it. */
function sectors(input: LayoutInput): Positions {
  const groups = [...new Set(input.ids.map((_, i) => input.group?.[i] ?? '(missing)'))].sort();
  const out: Positions = new Map();
  groups.forEach((g, gi) => {
    const ids = input.ids.filter((_, i) => (input.group?.[i] ?? '(missing)') === g).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const span = (2 * Math.PI) / groups.length;
    const a0 = -Math.PI / 2 + gi * span;
    ids.forEach((id, j) => {
      const a = a0 + span * ((j % 3) + 0.5) / 3 * 0.9 + span * 0.05;
      const radius = 0.4 + 0.5 * ((Math.floor(j / 3) + 0.5) / Math.max(1, Math.ceil(ids.length / 3)));
      out.set(id, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
    });
  });
  return out;
}

export function layout(kind: LayoutKind, input: LayoutInput): Positions {
  if (kind === 'circle') return circle(input);
  if (kind === 'rings') return rings(input);
  if (kind === 'sectors') return sectors(input);
  return force(input);
}
