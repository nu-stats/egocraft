// Add variables from another file (the full survey, a file of alter
// details) to the ego or alter file.

import { useMemo, useState } from 'react';
import type { DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { readDataFile } from '../io/read.ts';
import type { KeyPairs, MergeTarget } from '../reshape/merge.ts';
import { mergeOutside, previewMerge, suggestKeys } from '../reshape/merge.ts';
import type { Notify } from './common.tsx';
import { ACCEPT, ColumnSelect, DropZone, fileBytes, Panel } from './common.tsx';

export function MergePanel({ study, onStudy, notify }: { study: Study; onStudy: (s: Study) => void; notify: Notify }) {
  const [target, setTarget] = useState<MergeTarget>('egos');
  const [outside, setOutside] = useState<DataTable | null>(null);
  const [keys, setKeys] = useState<KeyPairs>([]);
  const preview = useMemo(() => {
    if (!outside || !keys.length) return null;
    try {
      return previewMerge(study, target, outside, keys);
    } catch (e) {
      return (e as Error).message;
    }
  }, [study, target, outside, keys]);
  const load = async (f: File) => {
    try {
      const t = await readDataFile(f.name, await fileBytes(f));
      setOutside(t);
      setKeys(suggestKeys(study, target, t));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  const t = target === 'egos' ? study.egos : study.alters;
  return (
    <Panel title="Add variables from another file">
      <p className="muted">For example, the rest of your survey (one row per respondent) into the ego file, or extra details about alters into the alter file. Rows are matched on their IDs.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        {(['egos', 'alters'] as MergeTarget[]).map((x) => (
          <label key={x} className="row">
            <input
              type="radio"
              checked={target === x}
              onChange={() => {
                setTarget(x);
                if (outside) setKeys(suggestKeys(study, x, outside));
              }}
            />
            Into the {x === 'egos' ? 'ego' : 'alter'} file
          </label>
        ))}
      </div>
      <DropZone label="Outside file" hint="CSV, Excel, Stata, SPSS or R." file={outside?.name ?? null} accept={ACCEPT} onFile={load} />
      {outside ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div className="map">
            {keys.map(([a, b], i) => (
              <div key={a} style={{ display: 'contents' }}>
                <label>Match {a} with</label>
                <ColumnSelect value={b} columns={outside.columns.map((c) => c.name)} onChange={(v) => setKeys(keys.map((k, j) => (j === i ? [a, v ?? ''] : k)) as KeyPairs)} allowNone={false} />
              </div>
            ))}
          </div>
          {typeof preview === 'string' ? <p className="chip error">{preview}</p> : null}
          {preview && typeof preview !== 'string' ? (
            <>
              <p>
                {preview.matched} of {preview.targetRows} rows of the {target === 'egos' ? 'ego' : 'alter'} file match; {preview.outsideUnused} of {preview.outsideRows} rows of {outside.name} match nothing. Columns added:{' '}
                {preview.columns.map((c) => (c.from === c.to ? c.to : `${c.from} (as ${c.to})`)).join(', ') || 'none'}.
              </p>
              {preview.duplicates.length ? <p className="chip error">{preview.duplicates.length} IDs are on more than one row of {outside.name}, for example {preview.duplicates.slice(0, 3).join(', ')}. Each ID may appear once.</p> : null}
              <div className="row">
                <button
                  className="primary"
                  disabled={!!preview.duplicates.length || !preview.matched || !preview.columns.length}
                  onClick={() => {
                    try {
                      onStudy(mergeOutside(study, target, outside, keys));
                      notify(`Added ${preview.columns.length} columns to the ${target === 'egos' ? 'ego' : 'alter'} file.`, 'ok');
                      setOutside(null);
                    } catch (e) {
                      notify((e as Error).message, 'error');
                    }
                  }}
                >
                  Add the columns
                </button>
                <span className="muted small">The {target === 'egos' ? 'ego' : 'alter'} file has {t.columns.length} columns now.</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
