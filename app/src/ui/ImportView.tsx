// Step 2: bring in the files, in any of the three layouts.

import { useMemo, useState } from 'react';
import type { DataTable } from '../core/data.ts';
import { emptyTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { withHistory } from '../core/study.ts';
import { guessMapping } from '../import/guess.ts';
import { detectWide, findTieColumns, tiesFromAlterColumns, wideToThree } from '../import/layouts.ts';
import { readDataFile } from '../io/read.ts';
import type { Notify } from './common.tsx';
import { ACCEPT, ColumnSelect, DropZone, fileBytes, Panel, TablePreview } from './common.tsx';

type Layout = 'three' | 'two' | 'wide';

const LAYOUTS: { id: Layout; title: string; text: string }[] = [
  { id: 'three', title: 'Three files', text: 'An ego file (one row per person interviewed), an alter file (one row per person named, with the ego’s ID) and, if you have it, a tie file (one row per pair of alters who know each other).' },
  { id: 'two', title: 'Two files', text: 'An ego file and an alter file whose columns say which other alters each alter knows (knows_1, knows_2 …).' },
  { id: 'wide', title: 'One wide file', text: 'One row per person interviewed, with the alters’ answers spread across columns (alter1_age, alter2_age … or age_1, age_2 …) and ties in columns such as tie_1_2. This is how Qualtrics and REDCap usually export.' },
];

export function ImportView({ study, onStudy, notify, goNext }: { study: Study; onStudy: (s: Study) => void; notify: Notify; goNext: () => void }) {
  const [layout, setLayout] = useState<Layout>('three');
  const [files, setFiles] = useState<Record<string, DataTable | null>>({ egos: null, alters: null, ties: null, wide: null });
  const [busy, setBusy] = useState(false);
  const [egoIdWide, setEgoIdWide] = useState<string | null>(null);
  const [tieGroup, setTieGroup] = useState<string | null>(null);

  const load = async (slot: string, f: File) => {
    setBusy(true);
    try {
      const t = await readDataFile(f.name, await fileBytes(f));
      setFiles((x) => ({ ...x, [slot]: t }));
      if (slot === 'wide') setEgoIdWide(guessMapping(t, emptyTable('x'), null).egoId || t.columns[0]?.name || null);
      if (slot === 'alters') setTieGroup(findTieColumns(t)[0]?.prefix ?? null);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const wideLayout = useMemo(() => (files.wide && egoIdWide ? detectWide(files.wide, egoIdWide) : null), [files.wide, egoIdWide]);
  const groups = useMemo(() => (files.alters ? findTieColumns(files.alters) : []), [files.alters]);

  const ready = layout === 'wide' ? !!(files.wide && egoIdWide && wideLayout?.alterVariables.length) : !!(files.egos && files.alters);

  const use = () => {
    let egos: DataTable;
    let alters: DataTable;
    let ties: DataTable | null;
    const notes: string[] = [];
    if (layout === 'wide') {
      const t = wideToThree(files.wide!, egoIdWide!, wideLayout!);
      egos = t.egos;
      alters = t.alters;
      ties = t.ties.rows.length ? t.ties : null;
      notes.push(`Imported ${files.wide!.name} as one wide file: ${egos.rows.length} egos, ${alters.rows.length} alters (up to ${wideLayout!.maxAlters} per ego), ${t.ties.rows.length} alter pairs from ${wideLayout!.tieColumns.length} tie columns.`);
    } else {
      egos = files.egos!;
      alters = files.alters!;
      ties = files.ties ?? null;
      notes.push(`Imported the ego file ${egos.name} (${egos.rows.length} rows, ${egos.columns.length} columns).`);
      notes.push(`Imported the alter file ${alters.name} (${alters.rows.length} rows, ${alters.columns.length} columns).`);
      if (layout === 'two') {
        const g = groups.find((x) => x.prefix === tieGroup);
        if (g) {
          const m = guessMapping(egos, alters, null);
          const out = tiesFromAlterColumns(alters, { egoId: m.alterEgoId, alterId: m.alterId, wave: m.alterWave, group: g });
          alters = out.alters;
          ties = out.ties;
          notes.push(`Moved the ${g.columns.length} ${g.prefix}… columns of the alter file into a tie file (${ties.rows.length} alter pairs).`);
        }
      } else if (ties) notes.push(`Imported the tie file ${ties.name} (${ties.rows.length} rows, ${ties.columns.length} columns).`);
    }
    let s: Study = { ...study, egos, alters, ties, mapping: guessMapping(egos, alters, ties), history: [] };
    for (const text of notes) s = withHistory(s, { kind: 'import', text });
    s = withHistory(s, { kind: 'mapping', text: 'EgoCraft guessed which column is which; check them on the Columns step.' });
    onStudy(s);
    notify('Files imported. Check the columns next.', 'ok');
    goNext();
  };

  return (
    <div className="page">
      <h1>Import your data</h1>
      {study.egos.rows.length ? (
        <p className="muted">This study already has data ({study.egos.rows.length} egos). Importing new files replaces it; the fixes you made are not carried over.</p>
      ) : null}
      <Panel title="How is your data laid out?">
        <div className="grid3">
          {LAYOUTS.map((l) => (
            <label key={l.id} className="panel" style={{ cursor: 'pointer', borderColor: layout === l.id ? 'var(--accent)' : undefined }}>
              <div className="row">
                <input type="radio" name="layout" checked={layout === l.id} onChange={() => setLayout(l.id)} />
                <strong>{l.title}</strong>
              </div>
              <p className="muted small" style={{ marginTop: 6 }}>{l.text}</p>
            </label>
          ))}
        </div>
        <p className="muted small">EgoCraft reads CSV, Excel (.xlsx), Stata (.dta), SPSS (.sav) and R (.rds, .RData). Files are read in this browser and never sent anywhere.</p>
      </Panel>

      {layout === 'wide' ? (
        <Panel title="The wide file">
          <DropZone label="Survey file" hint="One row per person interviewed." file={files.wide?.name ?? null} accept={ACCEPT} onFile={(f) => load('wide', f)} />
          {files.wide ? (
            <>
              <div className="map" style={{ marginTop: 12 }}>
                <label htmlFor="wide-ego">Ego ID column</label>
                <ColumnSelect id="wide-ego" value={egoIdWide} columns={files.wide.columns.map((c) => c.name)} onChange={setEgoIdWide} allowNone={false} />
              </div>
              {wideLayout ? (
                <p style={{ marginTop: 10 }}>
                  Found {wideLayout.alterVariables.length} alter variables ({wideLayout.alterVariables.map((v) => v.variable).join(', ') || 'none'}) for up to {wideLayout.maxAlters} alters, {wideLayout.tieColumns.length} tie columns, and {wideLayout.egoColumns.length} ego columns.
                </p>
              ) : null}
              <TablePreview table={files.wide} limit={5} />
            </>
          ) : null}
        </Panel>
      ) : (
        <div className="grid3">
          <DropZone label="Ego file" hint="One row per person interviewed (and per wave)." file={files.egos?.name ?? null} accept={ACCEPT} onFile={(f) => load('egos', f)} />
          <DropZone label="Alter file" hint="One row per person named, with the ego’s ID." file={files.alters?.name ?? null} accept={ACCEPT} onFile={(f) => load('alters', f)} />
          {layout === 'three' ? (
            <DropZone label="Tie file (optional)" hint="One row per pair of alters, with the ego’s ID and both alter IDs." file={files.ties?.name ?? null} accept={ACCEPT} onFile={(f) => load('ties', f)} />
          ) : (
            <div className="drop">
              <strong>Tie columns in the alter file</strong>
              {groups.length ? (
                <>
                  <span className="muted small">Columns that name another alter, one per alter number:</span>
                  <select value={tieGroup ?? ''} onChange={(e) => setTieGroup(e.target.value || null)}>
                    <option value="">(no tie columns)</option>
                    {groups.map((g) => (
                      <option key={g.prefix} value={g.prefix}>
                        {g.prefix}1 … {g.prefix}{g.columns.length} ({g.columns.length} columns)
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="muted small">{files.alters ? 'No numbered columns were found in the alter file.' : 'Choose the alter file first.'}</span>
              )}
            </div>
          )}
        </div>
      )}
      {layout !== 'wide'
        ? (['egos', 'alters', 'ties'] as const).map((k) =>
            files[k] ? (
              <Panel key={k} title={`${{ egos: 'Ego', alters: 'Alter', ties: 'Tie' }[k]} file: ${files[k]!.name}`}>
                <TablePreview table={files[k]!} limit={5} />
              </Panel>
            ) : null,
          )
        : null}
      <div className="row">
        <button className="primary" disabled={!ready || busy} onClick={use}>
          Use these files
        </button>
        {busy ? <span className="muted">Reading…</span> : null}
      </div>
    </div>
  );
}
