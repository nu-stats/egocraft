// The merged forms of the data (P2.1–P2.4): long (one row per alter, ego
// variables attached), wide (one row per ego, alter variables spread out),
// and pairs (one row per pair of alters, with the tie and both alters'
// variables), ready to export or to hand to a statistics program.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { safeName } from '../measures/measures.ts';
import type { StudyNetworks } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';

function uniqueNamer(): (n: string) => string {
  const used = new Set<string>();
  return (n) => {
    let name = safeName(n) || 'v';
    for (let k = 2; used.has(name); k++) name = safeName(`${n.slice(0, 28)}_${k}`);
    used.add(name);
    return name;
  };
}

/** Ego and alter columns other than the IDs and wave. */
function variableColumns(study: Study) {
  const m = study.mapping;
  const egoSkip = new Set([m.egoId, m.egoWave]);
  const alterSkip = new Set([m.alterEgoId, m.alterId, m.alterWave]);
  return {
    ego: study.egos.columns.map((c, j) => ({ c, j })).filter(({ c }) => !egoSkip.has(c.name)),
    alter: study.alters.columns.map((c, j) => ({ c, j })).filter(({ c }) => !alterSkip.has(c.name)),
  };
}

function idColumns(study: Study, name: (n: string) => string): { cols: Column[]; values: (egoRow: Cell[]) => Cell[] } {
  const m = study.mapping;
  const ej = columnIndex(study.egos, m.egoId);
  const wj = m.egoWave ? columnIndex(study.egos, m.egoWave) : -1;
  // The same names as the results file, so the files merge on them.
  const cols: Column[] = [{ ...study.egos.columns[ej]!, name: name(m.egoId || 'ego_id') }];
  if (wj >= 0) cols.push({ ...study.egos.columns[wj]!, name: name(m.egoWave!) });
  return { cols, values: (r) => (wj >= 0 ? [r[ej] ?? null, r[wj] ?? null] : [r[ej] ?? null]) };
}

/** Long form: one row per alter; ego variables prefixed ego_. */
export function longForm(study: Study, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const name = uniqueNamer();
  const ids = idColumns(study, name);
  const { ego, alter } = variableColumns(study);
  const columns: Column[] = [...ids.cols, { name: name('alter_id'), label: 'Alter ID', kind: study.alters.columns[columnIndex(study.alters, study.mapping.alterId)]!.kind }];
  for (const { c } of alter) columns.push({ ...c, name: name(c.name) });
  for (const { c } of ego) columns.push({ ...c, name: name(`ego_${c.name}`), label: c.label ? `Ego: ${c.label}` : `Ego's ${c.name}` });
  const rows: Cell[][] = [];
  for (const net of nets.egos) {
    const er = study.egos.rows[net.row]!;
    for (const al of net.alters) {
      const ar = study.alters.rows[al.row]!;
      rows.push([...ids.values(er), ar[columnIndex(study.alters, study.mapping.alterId)] ?? al.id, ...alter.map(({ j }) => ar[j] ?? null), ...ego.map(({ j }) => er[j] ?? null)]);
    }
  }
  return { name: 'long', columns, rows };
}

/**
 * Wide form: one row per ego; alter variables as alter1_x, alter2_x …,
 * alters in the order of their IDs (numbers in number order).
 */
export function wideForm(study: Study, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const name = uniqueNamer();
  const ids = idColumns(study, name);
  const { ego, alter } = variableColumns(study);
  const max = Math.max(0, ...nets.egos.map((n) => n.alters.length));
  const columns: Column[] = [...ids.cols];
  for (const { c } of ego) columns.push({ ...c, name: name(c.name) });
  columns.push({ name: name('n_alters'), label: 'Number of alters', kind: 'numeric' });
  for (let k = 1; k <= max; k++) {
    columns.push({ name: name(`alter${k}_id`), label: `Alter ${k}: ID`, kind: 'string' });
    for (const { c } of alter) columns.push({ ...c, name: name(`alter${k}_${c.name}`), label: `Alter ${k}: ${c.label ?? c.name}` });
  }
  const order = (a: string, b: string) => {
    const x = numberOf(a);
    const y = numberOf(b);
    return x !== null && y !== null ? x - y : a.localeCompare(b, 'en', { numeric: true });
  };
  const rows: Cell[][] = nets.egos.map((net) => {
    const er = study.egos.rows[net.row]!;
    const row: Cell[] = [...ids.values(er), ...ego.map(({ j }) => er[j] ?? null), net.alters.length];
    const sorted = [...net.alters].sort((a, b) => order(a.id, b.id));
    for (let k = 0; k < max; k++) {
      const al = sorted[k];
      if (!al) {
        row.push(null, ...alter.map(() => null));
        continue;
      }
      const ar = study.alters.rows[al.row]!;
      row.push(al.id, ...alter.map(({ j }) => ar[j] ?? null));
    }
    return row;
  });
  return { name: 'wide', columns, rows };
}

/**
 * Pairs form: one row per pair of alters within each ego, with whether they
 * are tied (any type, and one column per type), the strength, and both
 * alters' variables (_a and _b).
 */
export function pairsForm(study: Study, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const name = uniqueNamer();
  const ids = idColumns(study, name);
  const { alter } = variableColumns(study);
  const columns: Column[] = [
    ...ids.cols,
    { name: name('alter_a'), label: 'First alter', kind: 'string' },
    { name: name('alter_b'), label: 'Second alter', kind: 'string' },
    { name: name('tied'), label: 'Tied (any type); empty = not known', kind: 'numeric' },
    { name: name('strength'), label: 'Strongest tie between them', kind: 'numeric' },
  ];
  const typeCols = nets.tieTypes.map((t) => ({ t, name: name(`tie_${t}`) }));
  for (const { t, name: n } of typeCols) columns.push({ name: n, label: `Tied as ${t}`, kind: 'numeric' });
  for (const side of ['a', 'b'] as const) for (const { c } of alter) columns.push({ ...c, name: name(`${c.name}_${side}`), label: `${side === 'a' ? 'First' : 'Second'} alter: ${c.label ?? c.name}` });
  const rows: Cell[][] = [];
  for (const net of nets.egos) {
    const er = study.egos.rows[net.row]!;
    const key = (a: string, b: string) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`);
    const info = new Map<string, { tied: boolean | null; unknown: boolean; strength: number; types: Set<string> }>();
    for (const t of net.ties) {
      const k = key(t.a, t.b);
      const cur = info.get(k) ?? { tied: null, unknown: false, strength: 0, types: new Set<string>() };
      if (t.state === true) {
        cur.tied = true;
        cur.strength = Math.max(cur.strength, t.weight);
        if (t.type) cur.types.add(t.type);
      } else if (t.state === false && cur.tied === null) cur.tied = false;
      else if (t.state === null) cur.unknown = true;
      info.set(k, cur);
    }
    const noRows = !net.ties.length && !study.ties;
    for (let i = 0; i < net.alters.length; i++)
      for (let k = i + 1; k < net.alters.length; k++) {
        const a = net.alters[i]!;
        const b = net.alters[k]!;
        const p = info.get(key(a.id, b.id));
        // A pair with no row in a tie file of ties only is "not tied"; with no tie file at all, "not known".
        const tied = p ? (p.tied ?? (p.unknown ? null : false)) : noRows ? null : false;
        const ar = study.alters.rows[a.row]!;
        const br = study.alters.rows[b.row]!;
        rows.push([
          ...ids.values(er),
          a.id,
          b.id,
          tied === null ? null : tied ? 1 : 0,
          tied ? p!.strength : tied === null ? null : 0,
          ...typeCols.map(({ t }) => (tied === null ? null : p?.types.has(t) ? 1 : 0)),
          ...alter.map(({ j }) => ar[j] ?? null),
          ...alter.map(({ j }) => br[j] ?? null),
        ]);
      }
  }
  return { name: 'pairs', columns, rows };
}
