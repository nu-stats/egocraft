// Step 8: one row per ego, with the codebook, publication tables, a methods
// draft, the missing-data report and the code that produced it.

import { useMemo, useState } from 'react';
import type { Study } from '../core/study.ts';
import { buildDocx } from '../export/docx.ts';
import { bundleZip, codebookTable, csvOf, makeRecipe, rScript, stataDoFile } from '../export/export.ts';
import { methodsPlainText, methodsText } from '../export/methods.ts';
import { descriptives, descriptivesBlock, descriptivesHtml, descriptivesLatex, descriptivesTable, missingReport } from '../export/tables.ts';
import type { MeasureRequest, Results } from '../measures/measures.ts';
import type { Slice } from '../network/networks.ts';
import type { Protocol } from '../interview/protocol.ts';
import { buildNetworks } from '../network/networks.ts';
import { longForm, pairsForm } from '../reshape/forms.ts';
import type { Notify } from './common.tsx';
import { ColumnSelect, download, Panel, TablePreview } from './common.tsx';
import { SaveButtons } from './DataView.tsx';

export function ResultsView({ study, results, measures, slices, notify, protocol }: { study: Study; results: Results | null; measures: MeasureRequest[]; slices: Slice[]; notify: Notify; protocol?: Protocol }) {
  const [group, setGroup] = useState<string | null>(null);
  const nets = useMemo(() => (results ? buildNetworks(study) : null), [study, results]);
  const forms = useMemo(() => (results && nets ? { long: longForm(study, nets), pairs: pairsForm(study, nets) } : null), [study, results, nets]);
  const desc = useMemo(() => (results ? descriptives(study, results, measures, group) : null), [study, results, measures, group]);
  const methods = useMemo(() => (results && nets ? methodsText(study, measures, slices, nets) : null), [study, results, measures, slices, nets]);
  const missing = useMemo(() => (results && nets ? missingReport(study, results, measures, slices, nets) : null), [study, results, measures, slices, nets]);
  if (!results || !forms || !desc || !methods || !missing) return <div className="empty">Compute the measures first (Measures step).</div>;
  const base = study.name.replace(/[\\/:*?"<>|]/g, ' ');
  const codebook = codebookTable(results.codebook);
  const groupCols = study.egos.columns.filter((c) => c.name !== study.mapping.egoId && c.name !== study.mapping.egoWave && (c.kind === 'string' || c.valueLabels)).map((c) => c.name);
  const methodsTextPlain = methodsPlainText(methods);
  const wordFile = () =>
    buildDocx(
      [
        descriptivesBlock(desc),
        { kind: 'heading', text: 'Method (draft)' },
        ...methods.paragraphs.map((text) => ({ kind: 'para' as const, text })),
        { kind: 'heading', text: 'References' },
        ...methods.references.map((text) => ({ kind: 'para' as const, text })),
      ],
      `EgoCraft: ${study.name}`,
    );
  return (
    <div className="page">
      <h1>Results</h1>
      <Panel title="Everything in one file">
        <p>
          A ZIP file with the measures (CSV, Excel, Stata and SPSS), the codebook, the long and pairs files, a Word file with the descriptive table and a draft methods section, the same table for LaTeX, the missing-data report, a Stata do-file that merges the measures into your survey data and recomputes them as a check, an R script that recomputes them with igraph, and the recipe of every step.
        </p>
        <button className="primary" onClick={() => download(`${base} EgoCraft results.zip`, bundleZip({ study, results, measures, slices, long: forms.long, pairs: forms.pairs, ...(protocol ? { protocol } : {}) }), 'application/zip')}>
          Save the results (ZIP)
        </button>
      </Panel>
      <Panel title="One row per ego" actions={<SaveButtons table={results.table} base={`${base} measures`} />}>
        {results.notes.map((n) => <p key={n} className="muted">{n}</p>)}
        <TablePreview table={results.table} limit={30} showLabels />
      </Panel>
      <Panel
        title="Table for your paper"
        actions={
          <>
            <button onClick={() => download(`${base} table.docx`, wordFile(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}>Word</button>
            <button onClick={() => download(`${base} table.tex`, descriptivesLatex(desc), 'text/plain;charset=utf-8')}>LaTeX</button>
            <button onClick={() => download(`${base} table.html`, `<!doctype html><meta charset="utf-8"><style>table.apa{border-collapse:collapse;font-family:Times New Roman,serif}table.apa caption{text-align:left;margin-bottom:6px}table.apa th{border-top:1px solid;border-bottom:1px solid;padding:3px 10px}table.apa td{padding:3px 10px;text-align:right}table.apa td:first-child{text-align:left}table.apa tbody tr:last-child td{border-bottom:1px solid}</style>${descriptivesHtml(desc)}`, 'text/html;charset=utf-8')}>HTML</button>
            <SaveButtons table={descriptivesTable(desc)} base={`${base} descriptives`} />
          </>
        }
      >
        <div className="row" style={{ marginBottom: 10 }}>
          <label htmlFor="grp">Split by an ego variable</label>
          <ColumnSelect id="grp" value={group} columns={groupCols} onChange={setGroup} none="(no split)" />
        </div>
        <div className="tablewrap" style={{ maxHeight: 'none', background: '#fff', color: '#000', padding: 12 }} dangerouslySetInnerHTML={{ __html: `<style>.apa{border-collapse:collapse;font-family:'Times New Roman',serif;font-size:14px}.apa caption{text-align:left;margin-bottom:6px}.apa th{border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 10px;font-weight:400}.apa td{padding:3px 10px;text-align:right}.apa td:first-child{text-align:left}.apa tbody tr:last-child td{border-bottom:1px solid #000}</style>${descriptivesHtml(desc)}` }} />
        <p className="muted small" style={{ marginTop: 8 }}>APA style: two decimals, no leading zero for values that can’t go above 1 (density, shares, IQV). The Word file also has the draft methods section below.</p>
      </Panel>
      <Panel
        title="Methods (draft)"
        actions={
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(methodsTextPlain).then(
                  () => notify('Copied the methods draft.', 'ok'),
                  () => notify('Copying was not allowed here; save the text instead.', 'error'),
                );
              }}
            >
              Copy
            </button>
            <button onClick={() => download(`${base} methods.txt`, methodsTextPlain, 'text/plain;charset=utf-8')}>Save as text</button>
          </>
        }
      >
        {methods.paragraphs.map((p) => <p key={p}>{p}</p>)}
        <h3>References</h3>
        {methods.references.map((r) => <p key={r} className="small">{r}</p>)}
        <p className="muted small">A starting point: check every number and sentence against your own study before you use it.</p>
      </Panel>
      <Panel title="Missing information" actions={<button onClick={() => download(`${base} missing.csv`, csvOf(missing), 'text/csv;charset=utf-8')}>Save CSV</button>}>
        <p className="muted">For each measure: how many egos have a value, why the others don’t, and how much of what the values rest on is missing.</p>
        <TablePreview table={missing} limit={200} showLabels />
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
