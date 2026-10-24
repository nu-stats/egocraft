// Step 8: one row per ego, with the codebook and the code that produced it.

import { useMemo } from 'react';
import type { Cell, DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { bundleZip, codebookTable, csvOf, makeRecipe, rScript, stataDoFile } from '../export/export.ts';
import type { MeasureRequest, Results } from '../measures/measures.ts';
import type { Slice } from '../network/networks.ts';
import { buildNetworks } from '../network/networks.ts';
import { longForm, pairsForm } from '../reshape/forms.ts';
import { download, Panel, TablePreview } from './common.tsx';
import { SaveButtons } from './DataView.tsx';

/** Mean, SD, smallest, largest and N of each measure: the usual descriptive table. */
export function describeTable(results: Results): DataTable {
  const rows: Cell[][] = [];
  const first = results.table.columns.findIndex((c) => results.codebook.some((e) => e.column === c.name));
  results.table.columns.forEach((c, j) => {
    if (j < first) return;
    const v = results.table.rows.map((r) => r[j]).filter((x): x is number => typeof x === 'number');
    const n = v.length;
    const mean = n ? v.reduce((a, b) => a + b, 0) / n : null;
    const sd = n > 1 && mean !== null ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
    const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);
    rows.push([c.label ?? c.name, c.name, n, r3(mean), r3(sd), n ? r3(Math.min(...v)) : null, n ? r3(Math.max(...v)) : null]);
  });
  return {
    name: 'descriptives',
    columns: [
      { name: 'measure', kind: 'string' },
      { name: 'variable', kind: 'string' },
      { name: 'n', label: 'Egos with a value', kind: 'numeric' },
      { name: 'mean', kind: 'numeric' },
      { name: 'sd', label: 'Standard deviation', kind: 'numeric' },
      { name: 'min', kind: 'numeric' },
      { name: 'max', kind: 'numeric' },
    ],
    rows,
  };
}

export function ResultsView({ study, results, measures, slices }: { study: Study; results: Results | null; measures: MeasureRequest[]; slices: Slice[] }) {
  const forms = useMemo(() => {
    if (!results) return null;
    const nets = buildNetworks(study);
    return { long: longForm(study, nets), pairs: pairsForm(study, nets) };
  }, [study, results]);
  const desc = useMemo(() => (results ? describeTable(results) : null), [results]);
  if (!results || !forms || !desc) return <div className="empty">Compute the measures first (Measures step).</div>;
  const base = study.name.replace(/[\\/:*?"<>|]/g, ' ');
  const codebook = codebookTable(results.codebook);
  return (
    <div className="page">
      <h1>Results</h1>
      <Panel title="Everything in one file">
        <p>
          A ZIP file with the measures (CSV, Excel, Stata and SPSS), the codebook, the long and pairs files, a Stata do-file that merges the measures into your survey data and recomputes size and composition as a check, an R script that recomputes size, density and constraint with igraph, and the recipe of every step.
        </p>
        <button className="primary" onClick={() => download(`${base} EgoCraft results.zip`, bundleZip({ study, results, measures, slices, long: forms.long, pairs: forms.pairs }), 'application/zip')}>
          Save the results (ZIP)
        </button>
      </Panel>
      <Panel title="One row per ego" actions={<SaveButtons table={results.table} base={`${base} measures`} />}>
        {results.notes.map((n) => <p key={n} className="muted">{n}</p>)}
        <TablePreview table={results.table} limit={30} showLabels />
      </Panel>
      <Panel title="Descriptive table" actions={<SaveButtons table={desc} base={`${base} descriptives`} />}>
        <TablePreview table={desc} limit={200} />
      </Panel>
      <Panel title="Codebook" actions={<button onClick={() => download(`${base} codebook.csv`, csvOf(codebook), 'text/csv;charset=utf-8')}>Save CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr><th>Column</th><th>Label</th><th>Alters and ties used</th><th>Definition</th><th>Source</th></tr>
            </thead>
            <tbody>
              {results.codebook.map((e) => (
                <tr key={e.column}>
                  <td><code>{e.column}</code></td>
                  <td>{e.label}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{e.slice}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 320 }}>{e.definition}</td>
                  <td>{e.citation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="The code that produced it">
        <div className="row">
          <button onClick={() => download('egocraft_check.do', stataDoFile({ study, results, measures, long: forms.long }), 'text/plain;charset=utf-8')}>Stata do-file</button>
          <button onClick={() => download('egocraft_check.R', rScript(study, results, measures), 'text/plain;charset=utf-8')}>R script</button>
          <button onClick={() => download('egocraft_recipe.json', JSON.stringify(makeRecipe(study, slices, measures), null, 2) + '\n', 'application/json')}>Recipe</button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>The do-file and R script read the files in the ZIP, so keep them in the same folder.</p>
      </Panel>
    </div>
  );
}
