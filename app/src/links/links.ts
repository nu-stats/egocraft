// Links to the other apps (P10): StatCraft (Stata files and a do-file),
// QualCraft (alters and egos as cases; QualCraft code counts back as alter
// variables) and Husky Eye View (egos, alters and ego–alter lines as
// GeoJSON for My Files; counts by census tract for Merge & Export).

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { safeName } from '../measures/measures.ts';
import type { GeoLevel } from '../core/geo.ts';
import { geoidText, km, LEVEL_DIGITS } from '../core/geo.ts';

export type { GeoLevel };
import type { StudyNetworks } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';

// ---------- QualCraft ----------

/** The case name that ties an alter to QualCraft: "ego:alter", or "ego:wave:alter" with waves. */
export function alterCaseName(ego: string, wave: string | null, alter: string): string {
  return wave === null ? `${ego}:${alter}` : `${ego}:${wave}:${alter}`;
}

/** QualCraft case sheets: one row per alter (or per ego), case name first, then the attributes. */
export function qualcraftCases(study: Study, who: 'alters' | 'egos', extra?: DataTable, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const m = study.mapping;
  if (who === 'egos') {
    const ej = columnIndex(study.egos, m.egoId);
    const wj = m.egoWave ? columnIndex(study.egos, m.egoWave) : -1;
    const keep = study.egos.columns.map((c, j) => ({ c, j })).filter(({ j }) => j !== ej && j !== wj);
    const ex = extra ? extra.columns.slice(m.egoWave ? 2 : 1) : [];
    const rows: Cell[][] = nets.egos.map((n, i) => {
      const r = study.egos.rows[n.row]!;
      const name = n.wave === null ? n.id : `${n.id}:${n.wave}`;
      return [name, ...keep.map(({ j }) => r[j] ?? null), ...ex.map((_, k) => extra!.rows[i]?.[(m.egoWave ? 2 : 1) + k] ?? null)];
    });
    return { name: 'egos for QualCraft', columns: [{ name: 'case', kind: 'string' }, ...keep.map(({ c }) => c), ...ex], rows };
  }
  const skip = new Set([m.alterEgoId, m.alterId, m.alterWave]);
  const keep = study.alters.columns.map((c, j) => ({ c, j })).filter(({ c }) => !skip.has(c.name));
  const rows: Cell[][] = [];
  for (const n of nets.egos)
    for (const a of n.alters) {
      const r = study.alters.rows[a.row]!;
      rows.push([alterCaseName(n.id, n.wave, a.id), n.id, ...(m.egoWave ? [n.wave] : []), a.id, ...keep.map(({ j }) => r[j] ?? null)]);
    }
  return {
    name: 'alters for QualCraft',
    columns: [{ name: 'case', kind: 'string' }, { name: 'ego_id', kind: 'string' }, ...(m.egoWave ? [{ name: 'wave', kind: 'string' } as Column] : []), { name: 'alter_id', kind: 'string' }, ...keep.map(({ c }) => c)],
    rows,
  };
}

/**
 * A QualCraft matrix coding result (codes down the side, cases across the
 * top, as QualCraft saves it) turned into one row per alter with one column
 * per code, ready to add to the alter file. Case names must be "ego:alter"
 * (or "ego:wave:alter"); other cases are listed as not matched.
 */
export function fromQualCraftMatrix(table: DataTable, withWave: boolean): { table: DataTable; unmatched: string[] } {
  if (!/^code/i.test(table.columns[0]?.name ?? '')) throw new Error('This is not a QualCraft matrix with codes down the side (its first column should be "Code"). In QualCraft, run a matrix coding query with codes as rows and cases as columns, and save it as CSV.');
  const codes = table.rows.map((r) => String(r[0] ?? ''));
  const used = new Set<string>();
  const codeCols: Column[] = codes.map((c) => {
    let name = safeName(`qc_${c}`);
    for (let k = 2; used.has(name); k++) name = safeName(`qc_${c.slice(0, 24)}_${k}`);
    used.add(name);
    return { name, label: `QualCraft code: ${c}`.slice(0, 80), kind: 'numeric' };
  });
  const rows: Cell[][] = [];
  const unmatched: string[] = [];
  table.columns.slice(1).forEach((col, k) => {
    const parts = col.name.split(':').map((x) => x.trim());
    if (parts.length !== (withWave ? 3 : 2) || parts.some((x) => !x)) return void unmatched.push(col.name);
    rows.push([...parts, ...table.rows.map((r) => numberOf(r[k + 1]) ?? 0)]);
  });
  const ids: Column[] = [{ name: 'ego_id', kind: 'string' }, ...(withWave ? [{ name: 'wave', kind: 'string' } as Column] : []), { name: 'alter_id', kind: 'string' }];
  return { table: { name: 'QualCraft codes', columns: [...ids, ...codeCols], rows }, unmatched };
}

// ---------- Husky Eye View ----------

export interface PlaceColumns {
  egoLat: string | null;
  egoLon: string | null;
  alterLat: string | null;
  alterLon: string | null;
  egoGeoid: string | null;
  alterGeoid: string | null;
}

const LAT = /^(lat|latitude|y_?lat)$/i;
const LON = /^(lon|lng|long|longitude|x_?lon)$/i;
const GEOID = /^(geoid|geo_?id|fips|tract|tract_?geoid|census_?tract|geoid20|geoid10)$/i;

/** Columns that hold places, found by their names. */
export function findPlaces(study: Study): PlaceColumns {
  const find = (t: DataTable, re: RegExp) => t.columns.find((c) => re.test(c.name))?.name ?? null;
  return {
    egoLat: find(study.egos, LAT),
    egoLon: find(study.egos, LON),
    alterLat: find(study.alters, LAT),
    alterLon: find(study.alters, LON),
    egoGeoid: find(study.egos, GEOID),
    alterGeoid: find(study.alters, GEOID),
  };
}

/**
 * GeoJSON for Husky Eye View's My Files: egos and alters as points, and a
 * line from each ego to each alter, with their IDs and distance (km).
 * Only places with latitude and longitude are drawn.
 */
export function toGeoJson(study: Study, p: PlaceColumns, nets: StudyNetworks = buildNetworks(study)): { geojson: string; points: number; lines: number } {
  const E = study.egos;
  const A = study.alters;
  const pt = (t: DataTable, row: number, lat: string | null, lon: string | null) => {
    if (!lat || !lon) return null;
    const y = numberOf(t.rows[row]![columnIndex(t, lat)]);
    const x = numberOf(t.rows[row]![columnIndex(t, lon)]);
    return y !== null && x !== null && Math.abs(y) <= 90 && Math.abs(x) <= 180 ? [x, y] as [number, number] : null;
  };
  const features: unknown[] = [];
  let points = 0;
  let lines = 0;
  for (const n of nets.egos) {
    const e = pt(E, n.row, p.egoLat, p.egoLon);
    const base = { ego_id: n.id, ...(n.wave !== null ? { wave: n.wave } : {}) };
    if (e) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: e }, properties: { ...base, kind: 'ego', alters: n.alters.length } });
      points++;
    }
    for (const a of n.alters) {
      const q = pt(A, a.row, p.alterLat, p.alterLon);
      if (!q) continue;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: q }, properties: { ...base, kind: 'alter', alter_id: a.id } });
      points++;
      if (e) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [e, q] }, properties: { ...base, kind: 'tie', alter_id: a.id, km: Math.round(km(e[1], e[0], q[1], q[0]) * 10) / 10 } });
        lines++;
      }
    }
  }
  return { geojson: JSON.stringify({ type: 'FeatureCollection', features }), points, lines };
}

/** One row per census area with how many egos live there and how many alters, for HEV's Merge & Export. */
export function countsByArea(study: Study, p: PlaceColumns, level: GeoLevel, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const d = LEVEL_DIGITS[level];
  const counts = new Map<string, [number, number]>();
  const add = (g: string | null, k: 0 | 1) => {
    if (!g || g.length < d) return;
    const key = g.slice(0, d);
    const c = counts.get(key) ?? [0, 0];
    c[k]++;
    counts.set(key, c);
  };
  const ej = p.egoGeoid ? columnIndex(study.egos, p.egoGeoid) : -1;
  const aj = p.alterGeoid ? columnIndex(study.alters, p.alterGeoid) : -1;
  for (const n of nets.egos) {
    if (ej >= 0) add(geoidText(study.egos.rows[n.row]![ej]), 0);
    if (aj >= 0) for (const a of n.alters) add(geoidText(study.alters.rows[a.row]![aj]), 1);
  }
  return {
    name: `counts by ${level}`,
    columns: [
      { name: 'GEOID', label: `Census ${level} GEOID`, kind: 'string' },
      { name: 'level', kind: 'string' },
      { name: 'egos', label: 'Egos who live here', kind: 'numeric' },
      { name: 'alters', label: 'Alters who live here', kind: 'numeric' },
    ],
    rows: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, [e, a]]) => [g, level, e, a]),
  };
}
