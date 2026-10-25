// Step 7: subgroups (slices), the measures you choose, and computing them.

import { useMemo, useState } from 'react';
import { categories } from '../core/data.ts';
import type { MissingPairRule, Study } from '../core/study.ts';
import { mappingProblems } from '../core/study.ts';
import { blockingIssues } from '../import/checks.ts';
import type { CompositionStat, DiversityIndex, MeasureKind, MeasureRequest, MeasureSpec, Results, SimilarityIndex } from '../measures/measures.ts';
import { computeMeasures, defaultColumn, MEASURE_INFO, safeName } from '../measures/measures.ts';
import type { Condition, ConditionOp, Slice } from '../network/networks.ts';
import { ALL, buildNetworks, describeSlice } from '../network/networks.ts';
import { findPlaces } from '../links/links.ts';
import type { GeoLevel } from '../links/links.ts';
import type { Notify } from './common.tsx';
import { ColumnSelect, Panel, TablePreview } from './common.tsx';

const STRUCTURAL: MeasureKind[] = ['size', 'ties', 'density', 'weightedDensity', 'meanDegree', 'maxDegree', 'egoBetweenness', 'egoBetweennessNorm', 'meanAlterBetweenness', 'maxAlterBetweenness', 'effectiveSize', 'efficiency', 'constraint', 'hierarchy', 'components', 'largestComponentShare', 'isolates', 'tieMultiplexity', 'unknownPairs'];

const same = (a: MeasureSpec, b: MeasureSpec) => JSON.stringify(a) === JSON.stringify(b);

function SliceEditor({ study, tieTypes, slices, onSlices }: { study: Study; tieTypes: string[]; slices: Slice[]; onSlices: (s: Slice[]) => void }) {
  const [label, setLabel] = useState('');
  const [types, setTypes] = useState<string[] | null>(null);
  const [conds, setConds] = useState<Condition[]>([]);
  const [minWeight, setMinWeight] = useState('');
  const [mode, setMode] = useState<'any' | 'all'>('any');
  const alterCols = study.alters.columns.filter((c) => ![study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave].includes(c.name));
  const add = () => {
    let id = safeName(label).slice(0, 12) || 'sub';
    for (let k = 2; [ALL, ...slices].some((s) => s.id === id); k++) id = `${safeName(label).slice(0, 10)}${k}`;
    onSlices([...slices, { id, label: label.trim(), tieTypes: types, ...(types && types.length > 1 ? { tieTypeMode: mode } : {}), alterConditions: conds.filter((c) => c.column), minWeight: minWeight.trim() === '' ? null : Number(minWeight) }]);
    setLabel('');
    setTypes(null);
    setMode('any');
    setConds([]);
    setMinWeight('');
  };
  return (
    <Panel title="Subgroups">
      <p className="muted">A subgroup picks the alters and ties a measure looks at: one tie type, alters who are kin, alters 65 and older, strong ties only. Every measure can be computed for the whole network and for any subgroup.</p>
      <ul>
        <li><strong>{ALL.label}</strong> <span className="muted">(column names without a suffix)</span></li>
        {slices.map((s) => (
          <li key={s.id}>
            <strong>{s.label}</strong> <code>_{s.id}</code> <span className="muted">— {describeSlice(s)}</span>{' '}
            <button className="link" onClick={() => onSlices(slices.filter((x) => x.id !== s.id))}>remove</button>
          </li>
        ))}
      </ul>
      <h3 style={{ marginTop: 12 }}>Add a subgroup</h3>
      <div className="map">
        <label htmlFor="sl-name">Name</label>
        <input id="sl-name" type="text" value={label} placeholder="Kin only" onChange={(e) => setLabel(e.target.value)} />
        <label>Alter–alter tie types</label>
        <div className="row">
          <label className="row"><input type="checkbox" checked={types === null} onChange={(e) => setTypes(e.target.checked ? null : [])} /> all</label>
          {tieTypes.map((t) => (
            <label key={t} className="row">
              <input type="checkbox" disabled={types === null} checked={types?.includes(t) ?? true} onChange={(e) => setTypes((x) => (e.target.checked ? [...(x ?? []), t] : (x ?? []).filter((y) => y !== t)))} /> {t}
            </label>
          ))}
        </div>
        {types && types.length > 1 ? (
          <>
            <label>A pair counts if tied</label>
            <div className="row">
              <label className="row"><input type="radio" checked={mode === 'any'} onChange={() => setMode('any')} /> in any of these types</label>
              <label className="row"><input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> in all of them</label>
            </div>
          </>
        ) : null}
        <label>Alters kept</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {conds.map((c, i) => {
            const cats = c.column ? categories(study.alters, c.column).slice(0, 40) : [];
            const upd = (p: Partial<Condition>) => setConds((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));
            return (
              <div key={i} className="row">
                <ColumnSelect value={c.column || null} columns={alterCols.map((x) => x.name)} onChange={(v) => upd({ column: v ?? '', values: [] })} none="(variable)" />
                <select value={c.op} onChange={(e) => upd({ op: e.target.value as ConditionOp })}>
                  <option value="is">is</option>
                  <option value="isNot">is not</option>
                  <option value="atLeast">at least</option>
                  <option value="atMost">at most</option>
                  <option value="notMissing">is answered</option>
                </select>
                {c.op === 'is' || c.op === 'isNot' ? (
                  <select multiple value={c.values} onChange={(e) => upd({ values: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minWidth: 140 }}>
                    {cats.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : c.op !== 'notMissing' ? (
                  <input type="number" value={c.values[0] ?? ''} onChange={(e) => upd({ values: [e.target.value] })} style={{ width: 90 }} />
                ) : null}
                <button className="link" onClick={() => setConds((xs) => xs.filter((_, k) => k !== i))}>remove</button>
              </div>
            );
          })}
          <div>
            <button onClick={() => setConds((xs) => [...xs, { column: '', op: 'is', values: [] }])}>Add a condition</button>
          </div>
        </div>
        <label htmlFor="sl-min">Weakest tie kept</label>
        <input id="sl-min" type="number" value={minWeight} placeholder="all" onChange={(e) => setMinWeight(e.target.value)} style={{ width: 90 }} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={!label.trim()} onClick={add}>Add subgroup</button>
      </div>
    </Panel>
  );
}

/** Measures of several kinds of tie (P8): multiplexity and overlap, ego–alter (yes/no alter columns) or alter–alter (tie types). */
function LayerMeasure({ study, tieTypes, slices, onAdd }: { study: Study; tieTypes: string[]; slices: Slice[]; onAdd: (r: MeasureRequest) => void }) {
  const [kind, setKind] = useState<'multiplexity' | 'layerOverlap' | 'tieLayerOverlap'>('multiplexity');
  const [cols, setCols] = useState<string[]>([]);
  const [stat, setStat] = useState<'mean' | 'shareMulti'>('mean');
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [sliceId, setSliceId] = useState('all');
  const alterCols = study.alters.columns.filter((c) => c.kind === 'numeric' && ![study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave].includes(c.name)).map((c) => c.name);
  const choices = kind === 'tieLayerOverlap' ? tieTypes : alterCols;
  const spec: MeasureSpec | null = kind === 'multiplexity' ? (cols.length >= 2 ? { kind, columns: cols, stat } : null) : a && b && a !== b ? { kind, a, b } : null;
  return (
    <div className="map">
      <label>Measure</label>
      <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setA(null); setB(null); }}>
        <option value="multiplexity">Multiplexity: kinds of tie between ego and each alter</option>
        <option value="layerOverlap">Overlap of two kinds of ego–alter tie</option>
        <option value="tieLayerOverlap" disabled={tieTypes.length < 2}>Overlap of two alter–alter tie types</option>
      </select>
      {kind === 'multiplexity' ? (
        <>
          <label>Yes/no alter columns, one per kind of tie</label>
          <select multiple value={cols} onChange={(e) => setCols([...e.target.selectedOptions].map((o) => o.value))}>
            {alterCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label>Summary</label>
          <select value={stat} onChange={(e) => setStat(e.target.value as typeof stat)}>
            <option value="mean">Mean kinds of tie per alter</option>
            <option value="shareMulti">Share of alters tied more than one way</option>
          </select>
        </>
      ) : (
        <>
          <label>{kind === 'layerOverlap' ? 'First yes/no alter column' : 'First tie type'}</label>
          <ColumnSelect value={a} columns={choices} onChange={setA} none="(choose)" />
          <label>{kind === 'layerOverlap' ? 'Second yes/no alter column' : 'Second tie type'}</label>
          <ColumnSelect value={b} columns={choices} onChange={setB} none="(choose)" />
        </>
      )}
      <label>Subgroup</label>
      <select value={sliceId} onChange={(e) => setSliceId(e.target.value)}>
        {[ALL, ...slices].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <span />
      <div><button className="primary" disabled={!spec} onClick={() => spec && onAdd({ spec, sliceId })}>Add this measure</button></div>
      <span />
      <span className="muted small">The name generators of an EgoCraft interview (gen_…) are yes/no columns of this kind.</span>
    </div>
  );
}

/** Place measures (P10.3): distance from latitude/longitude, same area and areas reached from GEOIDs. */
function PlaceMeasure({ study, slices, onAdd }: { study: Study; slices: Slice[]; onAdd: (r: MeasureRequest) => void }) {
  const p = findPlaces(study);
  const [kind, setKind] = useState<'geoDistance' | 'sameArea' | 'areasReached'>(p.egoLat && p.alterLat ? 'geoDistance' : 'sameArea');
  const [stat, setStat] = useState<'mean' | 'median' | 'max'>('mean');
  const [level, setLevel] = useState<GeoLevel>('tract');
  const [sliceId, setSliceId] = useState('all');
  const egoCols = study.egos.columns.map((c) => c.name);
  const alterCols = study.alters.columns.map((c) => c.name);
  const [cols, setCols] = useState({ egoLat: p.egoLat, egoLon: p.egoLon, alterLat: p.alterLat, alterLon: p.alterLon, egoGeoid: p.egoGeoid, alterGeoid: p.alterGeoid });
  const set = (k: keyof typeof cols) => (v: string | null) => setCols((c) => ({ ...c, [k]: v }));
  let spec: MeasureSpec | null = null;
  if (kind === 'geoDistance' && cols.egoLat && cols.egoLon && cols.alterLat && cols.alterLon) spec = { kind, egoLat: cols.egoLat, egoLon: cols.egoLon, alterLat: cols.alterLat, alterLon: cols.alterLon, stat };
  if (kind === 'sameArea' && cols.egoGeoid && cols.alterGeoid) spec = { kind, egoGeoid: cols.egoGeoid, alterGeoid: cols.alterGeoid, level };
  if (kind === 'areasReached' && cols.alterGeoid) spec = { kind, alterGeoid: cols.alterGeoid, level };
  return (
    <div className="map">
      <label>Measure</label>
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        <option value="geoDistance">Distance from ego to alters (km, from latitude and longitude)</option>
        <option value="sameArea">Share of alters in the ego’s own census area (from GEOIDs)</option>
        <option value="areasReached">Areas the alters live in (from GEOIDs)</option>
      </select>
      {kind === 'geoDistance' ? (
        <>
          <label>Ego latitude, longitude</label>
          <div className="row"><ColumnSelect value={cols.egoLat} columns={egoCols} onChange={set('egoLat')} none="(choose)" /><ColumnSelect value={cols.egoLon} columns={egoCols} onChange={set('egoLon')} none="(choose)" /></div>
          <label>Alter latitude, longitude</label>
          <div className="row"><ColumnSelect value={cols.alterLat} columns={alterCols} onChange={set('alterLat')} none="(choose)" /><ColumnSelect value={cols.alterLon} columns={alterCols} onChange={set('alterLon')} none="(choose)" /></div>
          <label>Summary</label>
          <select value={stat} onChange={(e) => setStat(e.target.value as typeof stat)}>
            <option value="mean">Mean</option>
            <option value="median">Median</option>
            <option value="max">Largest</option>
          </select>
        </>
      ) : (
        <>
          {kind === 'sameArea' ? (
            <>
              <label>Ego GEOID</label>
              <ColumnSelect value={cols.egoGeoid} columns={egoCols} onChange={set('egoGeoid')} none="(choose)" />
            </>
          ) : null}
          <label>Alter GEOID</label>
          <ColumnSelect value={cols.alterGeoid} columns={alterCols} onChange={set('alterGeoid')} none="(choose)" />
          <label>Census level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value as GeoLevel)}>
            <option value="tract">Tract</option>
            <option value="county">County</option>
            <option value="state">State</option>
          </select>
        </>
      )}
      <label>Subgroup</label>
      <select value={sliceId} onChange={(e) => setSliceId(e.target.value)}>
        {[ALL, ...slices].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <span />
      <div><button className="primary" disabled={!spec} onClick={() => spec && onAdd({ spec, sliceId })}>Add this measure</button></div>
    </div>
  );
}

function VariableMeasure({ study, slices, onAdd }: { study: Study; slices: Slice[]; onAdd: (r: MeasureRequest) => void }) {
  const [kind, setKind] = useState<'composition' | 'diversity' | 'similarity' | 'yulesQ'>('composition');
  const [variable, setVariable] = useState<string | null>(null);
  const [egoVariable, setEgoVariable] = useState<string | null>(null);
  const [stat, setStat] = useState<CompositionStat>('mean');
  const [index, setIndex] = useState<DiversityIndex | SimilarityIndex>('blau');
  const [values, setValues] = useState<string[]>([]);
  const [limit, setLimit] = useState('');
  const [sliceId, setSliceId] = useState('all');
  const alterCols = study.alters.columns.filter((c) => ![study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave].includes(c.name)).map((c) => c.name);
  const egoCols = study.egos.columns.filter((c) => ![study.mapping.egoId, study.mapping.egoWave].includes(c.name)).map((c) => c.name);
  const cats = variable ? categories(study.alters, variable).slice(0, 60) : [];
  let spec: MeasureSpec | null = null;
  if (variable) {
    if (kind === 'composition') spec = { kind, variable, stat, ...(stat === 'share' || stat === 'count' ? { values } : stat === 'shareAtLeast' ? { values: [limit] } : {}) };
    else if (kind === 'diversity') spec = { kind, variable, index: (['blau', 'iqv', 'entropy', 'categories'].includes(index) ? index : 'blau') as DiversityIndex };
    else if (kind === 'similarity' && egoVariable) spec = { kind, egoVariable, alterVariable: variable, index: (['ei', 'sameShare', 'meanAbsDiff'].includes(index) ? index : 'ei') as SimilarityIndex };
    else if (kind === 'yulesQ') spec = { kind, variable };
  }
  const valid = !!spec && !((stat === 'share' || stat === 'count') && kind === 'composition' && !values.length) && !(kind === 'composition' && stat === 'shareAtLeast' && limit === '');
  return (
    <div className="map">
      <label>Kind of measure</label>
      <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setIndex(e.target.value === 'similarity' ? 'ei' : 'blau'); }}>
        <option value="composition">Composition (mean, share …)</option>
        <option value="diversity">Diversity (Blau, IQV …)</option>
        <option value="similarity">Ego–alter similarity (E-I index …)</option>
        <option value="yulesQ">Alter–alter homophily (Yule’s Q)</option>
      </select>
      <label>Alter variable</label>
      <ColumnSelect value={variable} columns={alterCols} onChange={(v) => { setVariable(v); setValues([]); if (kind === 'similarity' && v && egoCols.includes(v)) setEgoVariable(v); }} none="(choose)" />
      {kind === 'similarity' ? (
        <>
          <label>Ego variable to compare with</label>
          <ColumnSelect value={egoVariable} columns={egoCols} onChange={setEgoVariable} none="(choose)" />
        </>
      ) : null}
      {kind === 'composition' ? (
        <>
          <label>Summary</label>
          <select value={stat} onChange={(e) => setStat(e.target.value as CompositionStat)}>
            <option value="mean">Mean</option>
            <option value="sd">Standard deviation</option>
            <option value="median">Median</option>
            <option value="min">Smallest</option>
            <option value="max">Largest</option>
            <option value="share">Share in a category</option>
            <option value="count">Number in a category</option>
            <option value="shareAtLeast">Share at least a value (e.g. strong ties)</option>
          </select>
          {stat === 'share' || stat === 'count' ? (
            <>
              <label>Category</label>
              <select multiple value={values} onChange={(e) => setValues([...e.target.selectedOptions].map((o) => o.value))}>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          ) : null}
          {stat === 'shareAtLeast' ? (
            <>
              <label>At least</label>
              <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 90 }} />
            </>
          ) : null}
        </>
      ) : null}
      {kind === 'diversity' || kind === 'similarity' ? (
        <>
          <label>Index</label>
          <select value={index} onChange={(e) => setIndex(e.target.value as DiversityIndex)}>
            {kind === 'diversity' ? (
              <>
                <option value="blau">Blau’s index</option>
                <option value="iqv">IQV (Blau scaled 0–1)</option>
                <option value="entropy">Entropy</option>
                <option value="categories">Number of categories</option>
              </>
            ) : (
              <>
                <option value="ei">E-I index</option>
                <option value="sameShare">Share same as ego</option>
                <option value="meanAbsDiff">Mean absolute difference (numbers)</option>
              </>
            )}
          </select>
        </>
      ) : null}
      <label>Subgroup</label>
      <select value={sliceId} onChange={(e) => setSliceId(e.target.value)}>
        {[ALL, ...slices].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <span />
      <div>
        <button className="primary" disabled={!valid} onClick={() => spec && onAdd({ spec, sliceId })}>Add this measure</button>
      </div>
    </div>
  );
}

export function MeasuresView({ study, onStudy, slices, onSlices, measures, onMeasures, results, onResults, notify, goNext }: {
  study: Study;
  onStudy: (s: Study) => void;
  slices: Slice[];
  onSlices: (s: Slice[]) => void;
  measures: MeasureRequest[];
  onMeasures: (m: MeasureRequest[]) => void;
  results: Results | null;
  onResults: (r: Results | null) => void;
  notify: Notify;
  goNext: () => void;
}) {
  const ready = study.egos.rows.length > 0 && mappingProblems(study).length === 0;
  const nets = useMemo(() => (ready ? buildNetworks(study) : null), [study, ready]);
  const blocking = useMemo(() => (ready ? blockingIssues(study) : []), [study, ready]);
  if (!study.egos.rows.length) return <div className="empty">Import your files first.</div>;
  if (!nets) return <div className="empty">Choose the columns first.</div>;
  const all = [ALL, ...slices];
  const has = (kind: MeasureKind, sliceId: string) => measures.some((m) => m.sliceId === sliceId && same(m.spec, { kind } as MeasureSpec));
  const toggle = (kind: MeasureKind, sliceId: string) => {
    const spec = { kind } as MeasureSpec;
    onMeasures(has(kind, sliceId) ? measures.filter((m) => !(m.sliceId === sliceId && same(m.spec, spec))) : [...measures, { spec, sliceId }]);
    onResults(null);
  };
  const variableMeasures = measures.filter((m) => ['composition', 'diversity', 'similarity', 'yulesQ', 'multiplexity', 'layerOverlap', 'tieLayerOverlap', 'geoDistance', 'sameArea', 'areasReached'].includes(m.spec.kind));
  const noTies = !study.ties;
  const compute = () => {
    try {
      const r = computeMeasures(study, measures, slices, nets);
      onResults(r);
      notify(`Computed ${measures.length} measures for ${r.table.rows.length} egos.`, 'ok');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <div className="page">
      <h1>Measures</h1>
      <SliceEditor study={study} tieTypes={nets.tieTypes} slices={slices} onSlices={(s) => { onSlices(s); onResults(null); }} />
      <Panel title="Network measures">
        {noTies ? <p className="muted">This study has no tie file, so only size and pairs-not-known can be computed here; the composition measures below still work.</p> : null}
        <div className="tablewrap" style={{ maxHeight: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Measure</th>
                {all.map((s) => <th key={s.id}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {STRUCTURAL.map((k) => (
                <tr key={k}>
                  <td title={MEASURE_INFO[k].explain} style={{ whiteSpace: 'normal', minWidth: 260 }}>
                    <strong>{MEASURE_INFO[k].name}</strong>
                    <div className="muted small">{MEASURE_INFO[k].explain}{MEASURE_INFO[k].citation ? ` (${MEASURE_INFO[k].citation})` : ''}</div>
                  </td>
                  {all.map((s) => (
                    <td key={s.id} style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`${MEASURE_INFO[k].name}, ${s.label}`} checked={has(k, s.id)} disabled={noTies && !['size', 'unknownPairs'].includes(k)} onChange={() => toggle(k, s.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Measures from your variables">
        {variableMeasures.length ? (
          <ul>
            {variableMeasures.map((m) => (
              <li key={JSON.stringify(m)}>
                <code>{defaultColumn(m)}</code> <span className="muted">{all.find((s) => s.id === m.sliceId)?.label}</span>{' '}
                <button className="link" onClick={() => { onMeasures(measures.filter((x) => x !== m)); onResults(null); }}>remove</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet. For example: mean age of alters, share who are kin, diversity of race, or the E-I index of ego and alters on gender.</p>
        )}
        <VariableMeasure study={study} slices={slices} onAdd={(r) => { onMeasures([...measures, r]); onResults(null); }} />
        <h3 style={{ marginTop: 16 }}>Several kinds of tie</h3>
        <LayerMeasure study={study} tieTypes={nets.tieTypes} slices={slices} onAdd={(r) => { onMeasures([...measures, r]); onResults(null); }} />
        <h3 style={{ marginTop: 16 }}>Places</h3>
        <PlaceMeasure study={study} slices={slices} onAdd={(r) => { onMeasures([...measures, r]); onResults(null); }} />
      </Panel>
      <Panel title="Alter pairs with no answer">
        <p className="muted">Some surveys ask about only some pairs of alters (for example the first ten alters), or people skip the question.</p>
        <div style={{ display: 'grid', gap: 4 }}>
          {(['noTie', 'observed'] as MissingPairRule[]).map((r) => (
            <label key={r} className="row">
              <input type="radio" name="pairs" checked={study.settings.missingPairs === r} onChange={() => { onStudy({ ...study, settings: { ...study.settings, missingPairs: r } }); onResults(null); }} />
              {r === 'noTie' ? 'Count them as not tied (the usual practice; lowers density)' : 'Leave them out: density uses answered pairs only'}
            </label>
          ))}
          <label className="row">
            <input
              type="checkbox"
              checked={study.settings.maxUnknownShare !== null && study.settings.maxUnknownShare !== undefined}
              onChange={(e) => { onStudy({ ...study, settings: { ...study.settings, maxUnknownShare: e.target.checked ? 0.2 : null } }); onResults(null); }}
            />
            <span>
              Leave measures built on pairs empty for an ego when more than{' '}
              <input
                type="number"
                min={0}
                max={100}
                disabled={study.settings.maxUnknownShare === null || study.settings.maxUnknownShare === undefined}
                value={Math.round((study.settings.maxUnknownShare ?? 0.2) * 100)}
                onChange={(e) => { onStudy({ ...study, settings: { ...study.settings, maxUnknownShare: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 } }); onResults(null); }}
                style={{ width: 70 }}
                aria-label="Percent of pairs not known"
              />{' '}
              % of its pairs are not known
            </span>
          </label>
        </div>
        <p className="muted small">The Results step shows how much each choice changes the key results (the sensitivity table).</p>
      </Panel>
      <div className="row">
        <button className="primary" disabled={!measures.length} onClick={compute}>Compute {measures.length} measures</button>
        {blocking.length ? <span className="chip warning">{blocking.length} problem{blocking.length === 1 ? '' : 's'} not fixed on the Checks step: rows involved are left out</span> : null}
      </div>
      {results ? (
        <Panel title="Results" actions={<button className="primary" onClick={goNext}>Save the results</button>}>
          {results.notes.map((n) => <p key={n} className="muted">{n}</p>)}
          <TablePreview table={results.table} limit={50} showLabels />
        </Panel>
      ) : null}
    </div>
  );
}
