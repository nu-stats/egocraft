// Step 4: ID and link checks with fixes, and the import report.

import { useMemo } from 'react';
import type { Study } from '../core/study.ts';
import { mappingProblems } from '../core/study.ts';
import { applyFix, runChecks } from '../import/checks.ts';
import type { Notify } from './common.tsx';
import { download, Panel } from './common.tsx';

export function importReport(study: Study): string {
  const lines = [`EgoCraft import report: ${study.name}`, `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, ''];
  lines.push(`Ego file: ${study.egos.name}, ${study.egos.rows.length} rows`);
  lines.push(`Alter file: ${study.alters.name}, ${study.alters.rows.length} rows`);
  if (study.ties) lines.push(`Tie file: ${study.ties.name}, ${study.ties.rows.length} rows`);
  lines.push('', 'Steps, in order:');
  study.history.forEach((h, i) => lines.push(`${i + 1}. ${h.text}`));
  const issues = runChecks(study);
  lines.push('', issues.length ? 'Problems still in the data:' : 'No problems left in the data.');
  for (const i of issues) lines.push(`- [${i.severity}] ${i.title}. ${i.explain}`);
  return lines.join('\n') + '\n';
}

export function ChecksView({ study, onStudy, notify, goNext }: { study: Study; onStudy: (s: Study) => void; notify: Notify; goNext: () => void }) {
  const issues = useMemo(() => runChecks(study), [study]);
  if (!study.egos.rows.length) return <div className="empty">Import your files first.</div>;
  const problems = mappingProblems(study);
  if (problems.length) return <div className="empty">Choose the columns first: {problems[0]}</div>;
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <div className="page">
      <h1>Check the data</h1>
      <Panel
        title={errors ? `${errors} problem${errors === 1 ? '' : 's'} to fix` : 'The IDs and links are in order'}
        actions={<button onClick={() => download(`${study.name} import report.txt`, importReport(study), 'text/plain;charset=utf-8')}>Save the import report</button>}
      >
        {issues.length === 0 ? <p>Every alter belongs to an ego, every tie to two of that ego’s alters, and no ID is used twice.</p> : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {issues.map((i) => (
            <div key={i.id} className={`issue ${i.severity}`}>
              <div className="row">
                <span className={`chip ${i.severity}`}>{{ error: 'Fix needed', warning: 'Check', info: 'Note' }[i.severity]}</span>
                <strong>{i.title}</strong>
              </div>
              <p style={{ margin: '4px 0' }}>{i.explain}</p>
              {i.examples.length ? <p className="muted small">For example: {i.examples.join('; ')}{i.count > i.examples.length ? ' …' : ''}</p> : null}
              <div className="row">
                {i.fixes.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      try {
                        onStudy(applyFix(study, i.id, f.id));
                        notify('Fixed. The change is in the import report.', 'ok');
                      } catch (e) {
                        notify((e as Error).message, 'error');
                      }
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!errors ? (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={goNext}>Look at the data</button>
          </div>
        ) : null}
      </Panel>
      <Panel title="What has been done so far">
        <ol className="history">
          {study.history.map((h, k) => (
            <li key={k}>{h.text}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
