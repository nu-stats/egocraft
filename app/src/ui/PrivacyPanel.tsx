// Names and other identifying text: replace with codes, keep the key
// encrypted (or not at all), or remove a column.

import { useState } from 'react';
import type { DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { TableName } from '../import/pseudonyms.ts';
import { decryptKey, dropColumn, encryptKey, identifyingColumns, pseudonymize } from '../import/pseudonyms.ts';
import type { Notify } from './common.tsx';
import { download, fileBytes, Panel, Passphrase, pickFile, TablePreview } from './common.tsx';

const FILE: Record<TableName, string> = { egos: 'ego file', alters: 'alter file', ties: 'tie file' };

export function PrivacyPanel({ study, onStudy, notify }: { study: Study; onStudy: (s: Study) => void; notify: Notify }) {
  const found = identifyingColumns(study);
  const [choice, setChoice] = useState<string>(found[0] ? `${found[0].table}:${found[0].column}` : '');
  const [keep, setKeep] = useState(true);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<DataTable | null>(null);
  const [keyFile, setKeyFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const textCols = (['egos', 'alters'] as TableName[]).flatMap((t) => (t === 'egos' ? study.egos : study.alters).columns.filter((c) => c.kind === 'string').map((c) => ({ table: t, column: c.name })));
  const [table, column] = choice.split(':') as [TableName, string];

  const replace = async () => {
    if (keep && pass !== pass2) return notify('The two passphrases are different.', 'error');
    setBusy(true);
    try {
      const { study: next, key } = pseudonymize(study, table, column);
      if (keep) download(`${study.name} ${column} key.egocraft-key`.replace(/[\\/:*?"<>|]/g, ' '), await encryptKey(key, pass));
      onStudy(next);
      setPass('');
      setPass2('');
      notify(keep ? 'Replaced with codes. The key was saved, encrypted; keep the passphrase somewhere safe.' : 'Replaced with codes. No key was kept.', 'ok');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Names and other identifying text">
      {found.length ? (
        <ul>
          {found.map((f) => (
            <li key={`${f.table}:${f.column}`}>
              <strong>{f.column}</strong> in the {FILE[f.table]}: {f.why}.
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No columns look like names. You can still replace or remove any text column below.</p>
      )}
      <div className="map">
        <label htmlFor="pv-col">Column</label>
        <select id="pv-col" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">(choose)</option>
          {textCols.map((c) => (
            <option key={`${c.table}:${c.column}`} value={`${c.table}:${c.column}`}>
              {c.column} ({FILE[c.table]})
            </option>
          ))}
        </select>
        <label>The names</label>
        <div style={{ display: 'grid', gap: 4 }}>
          <label className="row"><input type="radio" checked={keep} onChange={() => setKeep(true)} /> Keep them in a separate key file, locked with a passphrase</label>
          <label className="row"><input type="radio" checked={!keep} onChange={() => setKeep(false)} /> Don’t keep them anywhere</label>
        </div>
        {keep ? (
          <>
            <label htmlFor="pv-pass">Passphrase (8 characters or more)</label>
            <input id="pv-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <label htmlFor="pv-pass2">The passphrase again</label>
            <input id="pv-pass2" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </>
        ) : null}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Alter names become A01, A02 … within each ego, and keep the same code in every wave. When the alter ID itself is a name, the tie file is changed too. Without the passphrase the key file can’t be read, and EgoCraft keeps no copy of it.
      </p>
      <div className="row">
        <button className="primary" disabled={!choice || busy || (keep && pass.length < 8)} onClick={replace}>Replace with codes</button>
        <button
          disabled={!choice}
          onClick={() => {
            try {
              onStudy(dropColumn(study, table, column));
              notify(`Removed ${column}.`, 'ok');
            } catch (e) {
              notify((e as Error).message, 'error');
            }
          }}
        >
          Remove this column
        </button>
        <button
          onClick={async () => {
            const f = await pickFile('.egocraft-key');
            if (f) setKeyFile({ name: f.name, bytes: await fileBytes(f) });
          }}
        >
          Open a saved key
        </button>
      </div>
      {keyFile ? (
        <div style={{ marginTop: 10 }}>
          <p className="small">The passphrase of <strong>{keyFile.name}</strong>:</p>
          <Passphrase
            id="key"
            twice={false}
            label="Open"
            busy={busy}
            onSubmit={async (p) => {
              try {
                setOpened(await decryptKey(keyFile.bytes, p));
                setKeyFile(null);
              } catch (e) {
                notify((e as Error).message, 'error');
              }
            }}
          />
        </div>
      ) : null}
      {opened ? (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{opened.name}</strong>
            <button className="link" onClick={() => setOpened(null)}>close</button>
          </div>
          <TablePreview table={opened} limit={500} />
        </div>
      ) : null}
    </Panel>
  );
}
