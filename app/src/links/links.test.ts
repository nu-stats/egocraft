import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DataTable } from '../core/data.ts';
import { tableFromText } from '../core/data.ts';
import { km } from '../core/geo.ts';
import { newStudy } from '../core/study.ts';
import { guessMapping } from '../import/guess.ts';
import { computeMeasures } from '../measures/measures.ts';
import { mergeOutside } from '../reshape/merge.ts';
import { sampleStudy } from '../sample/sample.ts';
import { countsByArea, findPlaces, fromQualCraftMatrix, qualcraftCases, toGeoJson } from './links.ts';

const csv = (name: string, text: string): DataTable => {
  const [head, ...rows] = text.trim().split('\n').map((l) => l.split(','));
  return tableFromText(name, head!, rows);
};

const sample = sampleStudy(new Date('2026-10-24T12:00:00Z'));

test('QualCraft: alters as cases named ego:wave:alter, and code counts back as alter variables', () => {
  const cases = qualcraftCases(sample, 'alters');
  assert.equal(cases.columns[0]!.name, 'case');
  assert.equal(cases.rows.length, sample.alters.rows.length);
  assert.match(String(cases.rows[0]![0]), /^\d+:\d+:\d+$/);
  // A matrix as QualCraft saves it: codes down the side, cases across the top.
  const first = String(cases.rows[0]![0]);
  const second = String(cases.rows[1]![0]);
  const matrix = csv('matrix.csv', `Code,${first},${second},Interview 7\nSupport,2,0,1\nConflict,0,3,0`);
  const r = fromQualCraftMatrix(matrix, true);
  assert.deepEqual(r.unmatched, ['Interview 7']);
  assert.deepEqual(r.table.columns.map((c) => c.name), ['ego_id', 'wave', 'alter_id', 'qc_support', 'qc_conflict']);
  const merged = mergeOutside(sample, 'alters', r.table, [['ego_id', 'ego_id'], ['wave', 'wave'], ['alter_id', 'alter_id']]);
  const j = merged.alters.columns.findIndex((c) => c.name === 'qc_support');
  assert.equal(merged.alters.rows[0]![j], 2);
  assert.equal(merged.alters.rows[1]![j], 0);
  assert.equal(merged.alters.rows[2]![j], null);
  assert.throws(() => fromQualCraftMatrix(csv('x.csv', 'case,a\n1,2'), false), /first column should be "Code"/);
});

test('Husky Eye View: tract and county counts, and place measures from GEOIDs', () => {
  const p = findPlaces(sample);
  assert.equal(p.egoGeoid, 'tract');
  assert.equal(p.alterGeoid, 'tract');
  const tracts = countsByArea(sample, p, 'tract');
  const counties = countsByArea(sample, p, 'county');
  assert.ok(tracts.rows.every((r) => String(r[0]).length === 11));
  assert.deepEqual(counties.rows.map((r) => r[0]), ['25025']);
  assert.equal(counties.rows[0]![2], sample.egos.rows.length);
  const res = computeMeasures(sample, [{ spec: { kind: 'sameArea', egoGeoid: 'tract', alterGeoid: 'tract', level: 'tract' }, sliceId: 'all' }, { spec: { kind: 'areasReached', alterGeoid: 'tract', level: 'county' }, sliceId: 'all' }], []);
  for (const r of res.table.rows) {
    if (r[2] !== null) assert.ok((r[2] as number) >= 0 && (r[2] as number) <= 1);
    if (r[3] !== null) assert.equal(r[3], 1, 'everyone in the sample lives in one county');
  }
});

test('GeoJSON of egos, alters and lines, and distances in km', () => {
  const E = csv('e.csv', 'ego_id,lat,lon\n1,42.3398,-71.0892');
  const A = csv('a.csv', 'ego_id,alter_id,lat,lon\n1,1,42.3601,-71.0589\n1,2,40.7128,-74.0060\n1,3,,');
  const s = { ...newStudy('g'), egos: E, alters: A, ties: null, mapping: guessMapping(E, A, null) };
  const p = findPlaces(s);
  const g = toGeoJson(s, p);
  assert.deepEqual([g.points, g.lines], [3, 2]);
  const fc = JSON.parse(g.geojson);
  assert.equal(fc.type, 'FeatureCollection');
  // Northeastern to downtown Boston, about 3.4 km; to New York, about 300 km.
  assert.ok(Math.abs(km(42.3398, -71.0892, 42.3601, -71.0589) - 3.4) < 0.3);
  const r = computeMeasures(s, [{ spec: { kind: 'geoDistance', egoLat: 'lat', egoLon: 'lon', alterLat: 'lat', alterLon: 'lon', stat: 'max' }, sliceId: 'all' }], []);
  assert.ok(Math.abs((r.table.rows[0]![1] as number) - 300) < 15);
});
