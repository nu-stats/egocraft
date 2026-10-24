// Small pieces shared by the screens.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Cell, DataTable } from '../core/data.ts';
import { isMissing } from '../core/data.ts';

export type Notify = (message: string, kind?: 'ok' | 'error') => void;

/** Save a file to the user's Downloads (or wherever the browser asks). */
export function download(name: string, data: string | Uint8Array, type = 'application/octet-stream'): void {
  const blob = new Blob([typeof data === 'string' ? data : (data as Uint8Array<ArrayBuffer>)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Ask for one file. Resolves null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function cellText(v: Cell | undefined): string {
  if (isMissing(v)) return '.';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  return String(v);
}

export function TablePreview({ table, limit = 100, showLabels = false }: { table: DataTable; limit?: number; showLabels?: boolean }) {
  const rows = table.rows.slice(0, limit);
  return (
    <div>
      <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c.name} title={c.label ?? ''}>
                  {c.name}
                  {showLabels && c.label ? <div className="muted small" style={{ fontWeight: 400 }}>{c.label}</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {table.columns.map((c, j) => {
                  const v = r[j];
                  const label = c.valueLabels && !isMissing(v) ? c.valueLabels[String(v)] : undefined;
                  return (
                    <td key={j} className={isMissing(v) ? 'miss' : typeof v === 'number' ? 'num' : ''} title={label}>
                      {label ?? cellText(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {table.rows.length > limit ? `Showing the first ${limit.toLocaleString('en-US')} of ${table.rows.length.toLocaleString('en-US')} rows. ` : `${table.rows.length.toLocaleString('en-US')} rows. `}
        {table.columns.length} columns. Missing values show as “.”.
      </p>
    </div>
  );
}

export function ColumnSelect({ id, value, columns, onChange, none = '(none)', allowNone = true }: { id?: string; value: string | null; columns: string[]; onChange: (v: string | null) => void; none?: string; allowNone?: boolean }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone || !value ? <option value="">{none}</option> : null}
      {columns.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      {title || actions ? (
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A drop zone that also opens a file picker when clicked. */
export function DropZone({ label, hint, file, onFile, accept }: { label: string; hint: string; file: string | null; onFile: (f: File) => void; accept: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <strong>{label}</strong>
      <span className="muted small">{hint}</span>
      <div className="row">
        <button
          onClick={async () => {
            const f = await pickFile(accept);
            if (f) onFile(f);
          }}
        >
          {file ? 'Choose another file' : 'Choose a file'}
        </button>
        <span className="small">{file ?? 'or drop it here'}</span>
      </div>
    </div>
  );
}

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.dta,.sav,.zsav,.rds,.rdata,.rda';
