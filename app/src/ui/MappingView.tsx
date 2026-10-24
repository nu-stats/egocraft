// Step 3: which column plays which part.

import type { DataTable } from '../core/data.ts';
import type { Mapping, Study } from '../core/study.ts';
import { mappingProblems, withHistory } from '../core/study.ts';
import { applyMapping, readSavedColumns, savedColumns } from '../export/recipe.ts';
import { ColumnSelect, download, fileBytes, Panel, pickFile } from './common.tsx';

type Role = { key: keyof Mapping; label: string; help: string; required?: boolean };

const EGO: Role[] = [
  { key: 'egoId', label: 'Ego ID', help: 'Identifies the person interviewed.', required: true },
  { key: 'egoWave', label: 'Wave', help: 'Only if the file has several survey waves.' },
];
const ALTER: Role[] = [
  { key: 'alterEgoId', label: 'Ego ID', help: 'Who named this alter.', required: true },
  { key: 'alterId', label: 'Alter ID', help: 'Unique within each ego (1, 2, 3 …).', required: true },
  { key: 'alterWave', label: 'Wave', help: 'Needed when the ego file has waves.' },
  { key: 'egoAlterStrength', label: 'Ego–alter tie strength', help: 'Closeness or similar (higher = stronger). Used by effective size and constraint; leave empty to count every alter the same.' },
];
const TIE: Role[] = [
  { key: 'tieEgoId', label: 'Ego ID', help: 'The ego both alters belong to.', required: true },
  { key: 'tieA', label: 'First alter ID', help: '', required: true },
  { key: 'tieB', label: 'Second alter ID', help: '', required: true },
  { key: 'tieWave', label: 'Wave', help: 'Needed when the ego file has waves.' },
  { key: 'tieType', label: 'Tie type', help: 'Kind of tie (kin, friend, work …). Leave empty if there is one kind.' },
  { key: 'tieValue', label: 'Tied or not', help: '0 or “no” = not tied, empty = not asked or not known, anything else = tied. Leave empty if every row is a tie.' },
  { key: 'tieWeight', label: 'Tie strength', help: 'How strong the alter–alter tie is. Leave empty to count every tie as 1.' },
];

function Roles({ roles, table, mapping, set }: { roles: Role[]; table: DataTable; mapping: Mapping; set: (k: keyof Mapping, v: string | null) => void }) {
  const cols = table.columns.map((c) => c.name);
  return (
    <div className="map">
      {roles.map((r) => (
        <div key={r.key} style={{ display: 'contents' }}>
          <label htmlFor={`m-${r.key}`}>
            {r.label}
            {r.required ? ' *' : ''}
            {r.help ? <div className="small">{r.help}</div> : null}
          </label>
          <ColumnSelect id={`m-${r.key}`} value={(mapping[r.key] as string | null) || null} columns={cols} onChange={(v) => set(r.key, v)} />
        </div>
      ))}
    </div>
  );
}

export function MappingView({ study, onStudy, goNext }: { study: Study; onStudy: (s: Study) => void; goNext: () => void }) {
  if (!study.egos.rows.length) return <div className="empty">Import your files first.</div>;
  const set = (k: keyof Mapping, v: string | null) => {
    const value = ['egoId', 'alterEgoId', 'alterId'].includes(k) ? (v ?? '') : v;
    // One entry per part in the report: a later choice replaces an earlier one.
    const history = study.history.filter((h) => !(h.kind === 'mapping' && h.detail?.role === k));
    onStudy(withHistory({ ...study, history, mapping: { ...study.mapping, [k]: value } }, { kind: 'mapping', text: `Column for “${k}” set to ${v ? `“${v}”` : 'none'}.`, detail: { role: k, column: v } }));
  };
  const problems = mappingProblems(study);
  return (
    <div className="page">
      <h1>Which column is which?</h1>
      <p className="muted">EgoCraft guessed from the column names and contents. Check each one; required parts are marked *.</p>
      <div className="row">
        <button onClick={() => download(`${study.name} columns.egocraft-columns`.replace(/[\/:*?"<>|]/g, ' '), JSON.stringify(savedColumns(study), null, 2), 'application/json')}>Save these choices</button>
        <button
          onClick={async () => {
            const f = await pickFile('.egocraft-columns,.json');
            if (!f) return;
            try {
              const r = applyMapping(study, readSavedColumns(new TextDecoder().decode(await fileBytes(f))).mapping);
              onStudy(r.study);
              window.alert(`Used ${r.used.length} saved choice${r.used.length === 1 ? '' : 's'}.${r.missing.length ? ` Not in these files: ${r.missing.join(', ')}.` : ''}`);
            } catch (e) {
              window.alert((e as Error).message);
            }
          }}
        >
          Use saved choices
        </button>
        <span className="muted small">For the next wave or a similar study: the same choices, where the columns have the same names. A recipe file works too.</span>
      </div>
      <div className="grid2">
        <Panel title={`Ego file: ${study.egos.name}`}>
          <Roles roles={EGO} table={study.egos} mapping={study.mapping} set={set} />
        </Panel>
        <Panel title={`Alter file: ${study.alters.name}`}>
          <Roles roles={ALTER} table={study.alters} mapping={study.mapping} set={set} />
        </Panel>
        {study.ties ? (
          <Panel title={`Tie file: ${study.ties.name}`}>
            <Roles roles={TIE} table={study.ties} mapping={study.mapping} set={set} />
          </Panel>
        ) : (
          <Panel title="No tie file">
            <p className="muted">Without alter–alter ties, EgoCraft can compute size and composition measures, but not density, brokerage or groups.</p>
          </Panel>
        )}
      </div>
      {problems.length ? (
        <Panel title="Still needed">
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </Panel>
      ) : (
        <div className="row">
          <span className="chip ok">All parts chosen</span>
          <button className="primary" onClick={goNext}>Check the data</button>
        </div>
      )}
    </div>
  );
}
