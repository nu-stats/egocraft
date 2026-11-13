// Small pieces shared by the screens.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Cell, DataTable } from '../core/data.ts';
import { isMissing } from '../core/data.ts';
import { extensionsOf, openPicked, withCompressed, type Unpacked } from '../unpack/open.ts';
import { kindOf } from '../unpack/unpack.js';

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

// ---------- Compressed files ----------
// Every file box also takes .zip, .gz, .bz2, .xz, .zst and .tar files (and
// .tar.gz and the like): they are opened here, so the screens get the file
// inside. Zip-based formats a box reads (.xlsx) reach their reader unopened.

/**
 * The files to use from files picked or dropped in a box that reads `accept`.
 * A compressed file gives what is inside it: every fitting file for a box that
 * takes several, or, for a box that takes one, the only fitting file or the one
 * the person chooses (empty when they cancel). Rejects with a plain message for
 * a damaged, password-protected, 7-Zip or RAR file.
 */
export async function openCompressed(picked: File[], accept: string, multiple: boolean): Promise<File[]> {
  const extensions = extensionsOf(accept);
  const out: File[] = [];
  for (const file of picked) {
    const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    if (kindOf(head) === 'plain') {
      out.push(file);
      continue;
    }
    let inside: Unpacked[];
    try {
      inside = await openPicked(file.name, await fileBytes(file), extensions);
    } catch (e) {
      // A file named as something this box reads (an encrypted EgoCraft file
      // whose first bytes happen to look like an archive) goes to its reader.
      if (extensions.some((x) => file.name.toLowerCase().endsWith(x))) {
        out.push(file);
        continue;
      }
      const message = (e as Error).message;
      throw new Error(message.includes(file.name) ? message : `“${file.name}” could not be opened. ${message}`);
    }
    if (inside.length === 1 && inside[0]!.name === file.name && inside[0]!.bytes.length === file.size) out.push(file);
    else if (multiple) out.push(...inside.map(asFile));
    else {
      const one = inside.length === 1 ? inside[0] : await chooseInside(file.name, inside);
      if (!one) return [];
      out.push(asFile(one));
    }
  }
  return out;
}

const asFile = (f: Unpacked) => new File([new Uint8Array(f.bytes)], f.name);

const sizeText = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Asks which of an archive's files to use; null when the person cancels. */
function chooseInside(archive: string, files: Unpacked[]): Promise<Unpacked | null> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2');
    title.textContent = `“${archive}” holds ${files.length} files. Which one?`;
    dialog.setAttribute('aria-label', title.textContent);
    const list = document.createElement('ul');
    list.className = 'archive-files';
    const done = (f: Unpacked | null) => {
      window.removeEventListener('keydown', onKey);
      scrim.remove();
      resolve(f);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(null);
    for (const f of files) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = `${f.name} (${sizeText(f.bytes.length)})`;
      b.addEventListener('click', () => done(f));
      li.append(b);
      list.append(li);
    }
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => done(null));
    actions.append(cancel);
    dialog.append(title, list, actions);
    scrim.append(dialog);
    scrim.addEventListener('mousedown', (e) => e.target === scrim && done(null));
    window.addEventListener('keydown', onKey);
    document.body.append(scrim);
    list.querySelector('button')?.focus();
  });
}

function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = withCompressed(accept);
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/** Several files at once (an export made of several files). Compressed files give the files inside. */
export async function pickFiles(accept: string): Promise<File[]> {
  return openCompressed(await chooseFiles(accept, true), accept, true);
}

/** Ask for one file. Resolves null if the user cancels. A compressed file gives the file inside. */
export async function pickFile(accept: string): Promise<File | null> {
  return (await openCompressed(await chooseFiles(accept, false), accept, false))[0] ?? null;
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
export function DropZone({ label, hint, file, onFile, onError, accept }: { label: string; hint: string; file: string | null; onFile: (f: File) => void; onError: (message: string) => void; accept: string }) {
  const [over, setOver] = useState(false);
  const take = async (pick: () => Promise<File | null>) => {
    try {
      const f = await pick();
      if (f) onFile(f);
    } catch (e) {
      onError((e as Error).message);
    }
  };
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
        if (f) void take(async () => (await openCompressed([f], accept, false))[0] ?? null);
      }}
    >
      <strong>{label}</strong>
      <span className="muted small">{hint}</span>
      <div className="row">
        <button
          onClick={() => void take(() => pickFile(accept))}
        >
          {file ? 'Choose another file' : 'Choose a file'}
        </button>
        {file ? <span className="small">{file}</span> : <span className="small over-hint">or drop it here</span>}
      </div>
    </div>
  );
}

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.dta,.sav,.zsav,.rds,.rdata,.rda';

/** A passphrase typed in the page (hidden as it is typed), never in a browser prompt that shows it. */
export function Passphrase({ twice, label, onSubmit, busy, id = 'pp' }: { twice: boolean; label: string; onSubmit: (p: string) => void; busy: boolean; id?: string }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const ok = a.length >= 8 && (!twice || a === b);
  return (
    <form
      className="map"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(a);
      }}
    >
      <label htmlFor={`${id}1`}>Passphrase (8 characters or more)</label>
      <input id={`${id}1`} type="password" autoComplete={twice ? 'new-password' : 'current-password'} value={a} onChange={(e) => setA(e.target.value)} />
      {twice ? (
        <>
          <label htmlFor={`${id}2`}>The passphrase again</label>
          <input id={`${id}2`} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
        </>
      ) : null}
      <span />
      <div>
        <button type="submit" className="primary" disabled={!ok || busy}>{busy ? 'Working…' : label}</button>
        {twice && b && a !== b ? <span className="small" style={{ color: 'var(--error)', marginLeft: 8 }}>The two are different.</span> : null}
      </div>
    </form>
  );
}
