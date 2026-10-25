// Use with the other apps (P10): StatCraft, QualCraft and Husky Eye View.

import { useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import type { Study } from '../core/study.ts';
import { csvOf, dtaOf, stataDoFile } from '../export/export.ts';
import { readDataFile } from '../io/read.ts';
import { countsByArea, findPlaces, fromQualCraftMatrix, qualcraftCases, toGeoJson } from '../links/links.ts';
import type { GeoLevel } from '../links/links.ts';
import type { MeasureRequest, Results } from '../measures/measures.ts';
import type { StudyNetworks } from '../network/networks.ts';
import { mergeOutside } from '../reshape/merge.ts';
import type { DataTable } from '../core/data.ts';
import type { Notify } from './common.tsx';
import { download, fileBytes, Panel, pickFile } from './common.tsx';

export function LinksPanel({ study, nets, results, measures, long, onStudy, notify }: { study: Study; nets: StudyNetworks; results: Results; measures: MeasureRequest[]; long: DataTable; onStudy: (s: Study) => void; notify: Notify }) {
  const [level, setLevel] = useState<GeoLevel>('tract');
  const places = findPlaces(study);
  const base = study.name.replace(/[\\/:*?"<>|]/g, ' ');
  const hasPoints = !!(places.alterLat && places.alterLon) || !!(places.egoLat && places.egoLon);
  const hasGeoid = !!(places.alterGeoid || places.egoGeoid);
  const withWave = !!study.mapping.egoWave;

  const forStatCraft = () => {
    const files: Record<string, Uint8Array> = {
      'egocraft_measures.dta': dtaOf(results.table, `EgoCraft measures: ${study.name}`),
      'egocraft_long.dta': dtaOf(long, `EgoCraft alters: ${study.name}`),
      'egocraft_check.do': strToU8(stataDoFile({ study, results, measures, long })),
      'README.txt': strToU8(
        [
          'EgoCraft results for StatCraft (or Stata).',
          '',
          'Unzip, then in StatCraft (or Stata), change to this folder and type:',
          '  use egocraft_measures, clear      one row per ego, with labels',
          '  do egocraft_check                 merge into survey.dta, if it is here, and check the numbers',
          '',
          'The do-file merges on the ego ID (and wave) when a file named survey.dta is in the folder.',
        ].join('\n') + '\n',
      ),
    };
    download(`${base} for StatCraft.zip`, zipSync(files, { level: 6 }), 'application/zip');
  };

  const bringCodes = async () => {
    const f = await pickFile('.csv,.xlsx');
    if (!f) return;
    try {
      const t = await readDataFile(f.name, await fileBytes(f));
      const r = fromQualCraftMatrix(t, withWave);
      if (!r.table.rows.length) throw new Error(`None of the cases in ${f.name} are named like EgoCraft alters (${withWave ? 'ego:wave:alter' : 'ego:alter'}).`);
      const m = study.mapping;
      const keys: [string, string][] = [[m.alterEgoId, 'ego_id'], ...(withWave && m.alterWave ? [[m.alterWave, 'wave'] as [string, string]] : []), [m.alterId, 'alter_id']];
      onStudy(mergeOutside(study, 'alters', r.table, keys));
      notify(`Added ${r.table.columns.length - keys.length} QualCraft codes to ${r.table.rows.length} alters.${r.unmatched.length ? ` ${r.unmatched.length} cases weren’t alters (for example ${r.unmatched.slice(0, 2).join(', ')}).` : ''}`, 'ok');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <Panel title="Use with your other apps">
      <div className="grid3">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h3>StatCraft or Stata</h3>
          <p className="muted small">The measures and the alter file as .dta, with labels, and the do-file that merges them into your survey data and checks the numbers. Tested in StatCraft and in Stata 19.</p>
          <div><button onClick={forStatCraft}>Files for StatCraft (ZIP)</button></div>
        </div>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h3>QualCraft</h3>
          <p className="muted small">
            Alters (or egos) as QualCraft cases, named {withWave ? 'ego:wave:alter' : 'ego:alter'}, with their answers as attributes. Name the interview passages’ cases the same way; then a QualCraft matrix of codes by case comes back here as one column per code for each alter.
          </p>
          <div className="row">
            <button onClick={() => download(`${base} alters for QualCraft.csv`, csvOf(qualcraftCases(study, 'alters', undefined, nets)), 'text/csv;charset=utf-8')}>Alters as cases</button>
            <button onClick={() => download(`${base} egos for QualCraft.csv`, csvOf(qualcraftCases(study, 'egos', results.table, nets)), 'text/csv;charset=utf-8')}>Egos as cases</button>
          </div>
          <div><button onClick={bringCodes}>Bring in QualCraft code counts</button></div>
        </div>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <h3>Husky Eye View</h3>
          {hasPoints ? (
            <>
              <p className="muted small">Egos, alters and a line from each ego to each alter, for My Files (from {places.alterLat ?? places.egoLat} / {places.alterLon ?? places.egoLon}).</p>
              <div>
                <button
                  onClick={() => {
                    const g = toGeoJson(study, places, nets);
                    download(`${base} network map.geojson`, g.geojson, 'application/geo+json');
                    notify(`Saved ${g.points} places and ${g.lines} lines.`, 'ok');
                  }}
                >
                  Map file (GeoJSON)
                </button>
              </div>
            </>
          ) : null}
          {hasGeoid ? (
            <>
              <p className="muted small">How many egos and alters live in each census area (from {places.egoGeoid ?? places.alterGeoid}), for Merge &amp; Export.</p>
              <div className="row">
                <select value={level} onChange={(e) => setLevel(e.target.value as GeoLevel)} aria-label="Census level">
                  <option value="tract">by tract</option>
                  <option value="county">by county</option>
                  <option value="state">by state</option>
                </select>
                <button onClick={() => download(`${base} counts by ${level}.csv`, csvOf(countsByArea(study, places, level, nets)), 'text/csv;charset=utf-8')}>Counts (CSV)</button>
              </div>
            </>
          ) : null}
          {!hasPoints && !hasGeoid ? <p className="muted small">Add latitude and longitude (lat, lon) or a census GEOID column (geoid, tract, fips) to the ego or alter file to map the networks.</p> : null}
        </div>
      </div>
    </Panel>
  );
}
