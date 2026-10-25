// Models (P11): regressions on alters nested in egos, or on egos, with the
// Stata and R code for the full multilevel model.

import { useMemo, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import type { DataTable } from '../core/data.ts';
import { categoryOf, columnIndex, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { buildDocx } from '../export/docx.ts';
import { csvOf, dtaOf } from '../export/export.ts';
import type { Results } from '../measures/measures.ts';
import { safeName } from '../measures/measures.ts';
import { alterModelData, egoModelData, ergmEgoCode, rModelCode, stataModelCode } from '../models/modelData.ts';
import type { ModelKind, ModelResult, ModelSpec, SeKind } from '../models/regress.ts';
import { fitModel, modelTable } from '../models/regress.ts';
import type { StudyNetworks } from '../network/networks.ts';
import type { Notify } from './common.tsx';
import { ColumnSelect, download, Panel, TablePreview } from './common.tsx';

type Level = 'alters' | 'egos';

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(/^-/, '−') : '—');
// APA: p-values have no leading zero.
const pText = (p: number) => (p < 0.001 ? '<.001' : p.toFixed(3).replace(/^0/, ''));

export function ModelsPanel({ study, nets, results, notify }: { study: Study; nets: StudyNetworks; results: Results; notify: Notify }) {
  const [level, setLevel] = useState<Level>('alters');
  const [kind, setKind] = useState<ModelKind>('linear');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [predictors, setPredictors] = useState<string[]>([]);
  const [categorical, setCategorical] = useState<string[]>([]);
  const [weight, setWeight] = useState<string | null>(null);
  const [se, setSe] = useState<SeKind>('robust');
  const [fit, setFit] = useState<ModelResult | null>(null);
  // For a logistic model of an outcome not coded 0/1: the code that counts as 1.
  const [event, setEvent] = useState<number | null>(null);

  const rows = useMemo(() => (level === 'alters' ? alterModelData(study, results, nets) : egoModelData(study, results, nets)), [level, study, results, nets]);
  const codes = useMemo(() => {
    if (!outcome) return [];
    const j = columnIndex(rows, outcome);
    return [...new Set(rows.rows.map((r) => numberOf(r[j])).filter((v): v is number => v !== null))].sort((a, b) => a - b);
  }, [rows, outcome]);
  const needsEvent = kind === 'logistic' && codes.some((v) => v !== 0 && v !== 1);
  const outcomeCol = outcome ? rows.columns.find((c) => c.name === outcome) : undefined;
  const codeName = (v: number) => categoryOf(outcomeCol, v) ?? String(v);
  const eventName = outcome && event !== null ? safeName(`${outcome}_${String(event).replace(/\W/g, '_')}`) : null;
  const data = useMemo((): DataTable => {
    if (!needsEvent || !outcome || event === null || !eventName) return rows;
    const j = columnIndex(rows, outcome);
    const label = `${outcomeCol?.label ?? outcome} is ${codeName(event)}`.slice(0, 80);
    return { ...rows, columns: [...rows.columns, { name: eventName, label, kind: 'numeric' }], rows: rows.rows.map((r) => { const v = numberOf(r[j]); return [...r, v === null ? null : v === event ? 1 : 0]; }) };
  }, [rows, needsEvent, outcome, event, eventName]);
  const idCols = study.mapping.egoWave ? 2 : 1;
  const egoId = data.columns[0]!.name;
  const usable = data.columns.slice(level === 'alters' ? idCols + 1 : 0).filter((c) => c.name !== study.mapping.egoId && c.name !== study.mapping.egoWave).map((c) => c.name);
  const numeric = data.columns.filter((c) => c.kind === 'numeric' && usable.includes(c.name)).map((c) => c.name);

  const spec = (): ModelSpec | null =>
    outcome && predictors.length && (!needsEvent || eventName)
      ? { kind, outcome: needsEvent ? eventName! : outcome, predictors, categorical: categorical.filter((c) => predictors.includes(c)), weight: level === 'egos' ? weight : null, se: level === 'alters' ? 'cluster' : se, cluster: level === 'alters' ? egoId : null }
      : null;

  const reset = (l: Level) => {
    setLevel(l);
    setOutcome(null);
    setPredictors([]);
    setCategorical([]);
    setWeight(null);
    setEvent(null);
    setFit(null);
  };

  const run = () => {
    const s = spec();
    if (!s) return;
    try {
      setFit(fitModel(data, s));
    } catch (e) {
      setFit(null);
      notify((e as Error).message, 'error');
    }
  };

  const base = `${study.name.replace(/[\\/:*?"<>|]/g, ' ')} model`;
  const table = fit ? modelTable(fit) : null;
  const wordFile = (r: ModelResult) =>
    buildDocx(
      [
        {
          kind: 'table',
          number: 2,
          title: `${r.spec.kind === 'logistic' ? 'Logistic' : 'Linear'} Regression of ${r.spec.outcome}${level === 'alters' ? ' (Alters Nested in Egos)' : ''}`,
          header: ['Predictor', 'b', 'SE', 'p', '95% CI'],
          rows: r.terms.map((t) => [t.name, fmt(t.b), fmt(t.se), pText(t.p), `[${fmt(t.lo, 2)}, ${fmt(t.hi, 2)}]`]),
          note: `N = ${r.n}${r.clusters ? ` alters in ${r.clusters} egos; standard errors clustered by ego` : r.spec.se === 'robust' ? '; robust standard errors' : ''}. ${r.spec.kind === 'logistic' ? `Coefficients are log odds; McFadden’s pseudo-R² = ${fmt(r.r2)}.` : `R² = ${fmt(r.r2)}.`}`,
        },
      ],
      `EgoCraft model: ${study.name}`,
    );
  const codeZip = (s: ModelSpec) => {
    const files: Record<string, Uint8Array> = {
      'egocraft_model_data.dta': dtaOf(data, `EgoCraft ${level} for models: ${study.name}`),
      'egocraft_model_data.csv': strToU8(csvOf(data)),
      'egocraft_model.do': strToU8(stataModelCode(s, level, 'egocraft_model_data.dta', egoId)),
      'egocraft_model.R': strToU8(rModelCode(s, level, 'egocraft_model_data.csv', egoId)),
    };
    download(`${base} code.zip`, zipSync(files, { level: 6 }), 'application/zip');
  };

  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  const s = spec();

  return (
    <Panel title="Models">
      <p className="muted">
        Regression with the measures. For alters nested in egos, standard errors are clustered by ego; the Stata and R code also fits the full multilevel model (a random intercept for each ego). Checked against Stata 19.
      </p>
      <div className="map compact" style={{ marginBottom: 10 }}>
        <label htmlFor="mlevel">Rows</label>
        <select id="mlevel" value={level} onChange={(e) => reset(e.target.value as Level)}>
          <option value="alters">One per alter (alters nested in egos)</option>
          <option value="egos">One per ego</option>
        </select>
        <label htmlFor="mkind">Model</label>
        <select id="mkind" value={kind} onChange={(e) => { setKind(e.target.value as ModelKind); setFit(null); }}>
          <option value="linear">Linear (least squares)</option>
          <option value="logistic">Logistic (outcome is 0/1)</option>
        </select>
        <label htmlFor="mout">Outcome</label>
        <ColumnSelect id="mout" value={outcome} columns={numeric} onChange={(v) => { setOutcome(v); setEvent(null); setPredictors((p) => p.filter((x) => x !== v)); setFit(null); }} none="(choose)" />
        {needsEvent ? (
          <>
            <label htmlFor="mev">Counts as 1</label>
            {codes.length <= 12 ? (
              <select id="mev" value={event ?? ''} onChange={(e) => { setEvent(e.target.value === '' ? null : Number(e.target.value)); setFit(null); }}>
                <option value="">(choose: the others count as 0)</option>
                {codes.map((v) => <option key={v} value={v}>{codeName(v)}{codeName(v) === String(v) ? '' : ` (${v})`}</option>)}
              </select>
            ) : (
              <span className="muted small">{outcome} has {codes.length} values: a logistic model needs an outcome with two (0 and 1).</span>
            )}
          </>
        ) : null}
        {level === 'egos' ? (
          <>
            <label htmlFor="mw">Weight</label>
            <ColumnSelect id="mw" value={weight} columns={numeric} onChange={(v) => { setWeight(v); setFit(null); }} none="(none)" />
            <label htmlFor="mse">Standard errors</label>
            <select id="mse" value={se} onChange={(e) => { setSe(e.target.value as SeKind); setFit(null); }}>
              <option value="robust">Robust (HC1)</option>
              <option value="ordinary">Ordinary</option>
            </select>
          </>
        ) : null}
      </div>
      <h3>Predictors</h3>
      <p className="muted small">Tick “categories” for a variable whose codes are groups (relation, gender, …): each group then gets its own term, compared with the lowest code.</p>
      <div className="tablewrap" style={{ maxHeight: 260 }}>
        <table className="data">
          <tbody>
            {usable.filter((c) => c !== outcome).map((c) => {
              const col = data.columns.find((x) => x.name === c)!;
              const on = predictors.includes(c);
              return (
                <tr key={c}>
                  <td>
                    <label className="row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={on} onChange={(e) => { setPredictors(toggle(predictors, c, e.target.checked)); setFit(null); }} />
                      <code>{c}</code>
                    </label>
                  </td>
                  <td style={{ whiteSpace: 'normal' }}>{col.label ?? ''}</td>
                  <td>
                    <label className="row small" style={{ gap: 6 }}>
                      <input type="checkbox" disabled={!on} checked={categorical.includes(c)} onChange={(e) => { setCategorical(toggle(categorical, c, e.target.checked)); setFit(null); }} />
                      categories
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" disabled={!s} onClick={run}>Fit the model</button>
        {s ? <button onClick={() => codeZip(s)}>Data and code for Stata and R (ZIP)</button> : null}
        <button onClick={() => download('egocraft_ergm_ego.R', ergmEgoCode(study), 'text/plain;charset=utf-8')}>ergm.ego starting point (R)</button>
      </div>
      {fit && table ? (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p style={{ margin: 0 }}>
              N = {fit.n}
              {fit.clusters ? ` alters in ${fit.clusters} egos` : ''} · {fit.spec.kind === 'logistic' ? `pseudo-R² ${fmt(fit.r2)}` : `R² ${fmt(fit.r2)}`}
              {fit.logLik !== null ? ` · log likelihood ${fit.logLik.toFixed(2)}` : ''}
            </p>
            <div className="row">
              <button onClick={() => download(`${base}.csv`, csvOf(table), 'text/csv;charset=utf-8')}>CSV</button>
              <button onClick={() => download(`${base}.docx`, wordFile(fit), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}>Word</button>
            </div>
          </div>
          {fit.notes.map((n) => <p key={n} className="muted small">{n}</p>)}
          <TablePreview table={table} limit={100} showLabels />
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 10 }}>
        Exponential random graph models for ego-sampled data (Krivitsky and Morris 2017) need the R packages egor and ergm.ego; the starting point reads the files in the results ZIP.
      </p>
    </Panel>
  );
}
