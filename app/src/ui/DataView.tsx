// Step 5: the tables and the merged forms, each ready to save.

import { useMemo, useState } from 'react';
import type { DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { mappingProblems } from '../core/study.ts';
import { csvOf, dtaOf, savOf, xlsxOf } from '../export/export.ts';
import { buildNetworks } from '../network/networks.ts';
import { longForm, pairsForm, wideForm } from '../reshape/forms.ts';
import type { Notify } from './common.tsx';
import { download, Panel, TablePreview } from './common.tsx';
import { MergePanel } from './MergePanel.tsx';

type Tab = 'egos' | 'alters' | 'ties' | 'long' | 'wide' | 'pairs';

const TABS: { id: Tab; label: string; explain: string }[] = [
  { id: 'egos', label: 'Egos', explain: 'The ego file as it is now (after any fixes).' },
  { id: 'alters', label: 'Alters', explain: 'The alter file as it is now.' },
  { id: 'ties', label: 'Ties', explain: 'The tie file as it is now.' },
  { id: 'long', label: 'Long', explain: 'One row per alter, with the ego’s variables attached (ego_…). For alter-level models.' },
  { id: 'wide', label: 'Wide', explain: 'One row per ego, with each alter’s answers spread across columns (alter1_…, alter2_…).' },
  { id: 'pairs', label: 'Pairs', explain: 'One row per pair of alters within each ego: whether they are tied (1, 0, or empty when not known), the strength, and both alters’ variables.' },
];

export function saveTable(t: DataTable, base: string, kind: 'csv' | 'xlsx' | 'dta' | 'sav'): void {
  if (kind === 'csv') download(`${base}.csv`, csvOf(t), 'text/csv;charset=utf-8');
  else if (kind === 'xlsx') download(`${base}.xlsx`, xlsxOf([{ ...t, name: base.slice(0, 31) }]));
  else if (kind === 'dta') download(`${base}.dta`, dtaOf(t));
  else download(`${base}.sav`, savOf(t));
}

export function SaveButtons({ table, base }: { table: DataTable; base: string }) {
  return (
    <>
      {(['csv', 'xlsx', 'dta', 'sav'] as const).map((k) => (
        <button key={k} onClick={() => saveTable(table, base, k)}>
          {{ csv: 'CSV', xlsx: 'Excel', dta: 'Stata', sav: 'SPSS' }[k]}
        </button>
      ))}
    </>
  );
}

export function DataView({ study, onStudy, notify }: { study: Study; onStudy: (s: Study) => void; notify: Notify }) {
  const [tab, setTab] = useState<Tab>('long');
  const ready = study.egos.rows.length > 0 && mappingProblems(study).length === 0;
  const nets = useMemo(() => (ready ? buildNetworks(study) : null), [study, ready]);
  const table = useMemo(() => {
    if (tab === 'egos') return study.egos;
    if (tab === 'alters') return study.alters;
    if (tab === 'ties') return study.ties;
    if (!nets) return null;
    if (tab === 'long') return longForm(study, nets);
    if (tab === 'wide') return wideForm(study, nets);
    return pairsForm(study, nets);
  }, [tab, study, nets]);
  if (!study.egos.rows.length) return <div className="empty">Import your files first.</div>;
  const info = TABS.find((t) => t.id === tab)!;
  return (
    <div className="page">
      <h1>The data</h1>
      <Panel>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)} disabled={!ready && ['long', 'wide', 'pairs'].includes(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted">{info.explain}</p>
        {table ? (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="muted">Save as</span>
              <SaveButtons table={table} base={`${study.name} ${tab}`.replace(/[\\/:*?"<>|]/g, ' ')} />
            </div>
            <TablePreview table={table} showLabels />
          </>
        ) : (
          <p className="muted">{tab === 'ties' ? 'This study has no tie file.' : 'Choose the columns first.'}</p>
        )}
      </Panel>
      {ready ? <MergePanel study={study} onStudy={onStudy} notify={notify} /> : null}
    </div>
  );
}
