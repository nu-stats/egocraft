// The Interviews step (Phase 6): design a protocol, run interviews on this
// device (kept encrypted), carry them by file, and make a study from them.

import { useEffect, useRef, useState } from 'react';
import type { BackupState } from '../interview/backup.ts';
import { backupText } from '../interview/backup.ts';
import type { Interview } from '../interview/interview.ts';
import { startInterview } from '../interview/interview.ts';
import type { Protocol } from '../interview/protocol.ts';
import { emptyProtocol, protocolFromJson, protocolProblems, sampleProtocol } from '../interview/protocol.ts';
import { interviewsToStudy } from '../interview/toStudy.ts';
import { createVault, interviewsFromFile, interviewsToFile, openVault } from '../interview/vault.ts';
import type { Project } from '../project.ts';
import { newProject } from '../project.ts';
import type { Notify } from './common.tsx';
import { download, fileBytes, Panel, Passphrase, pickFile } from './common.tsx';
import { InterviewRunner } from './InterviewRunner.tsx';
import { deleteInterview, deleteProtocol, getBackup, getVaultMeta, listInterviews, listProtocols, saveInterview, saveProtocol, setBackedUp, setVaultMeta } from './interviewStore.ts';
import { ProtocolEditor } from './ProtocolEditor.tsx';

type Tab = 'protocols' | 'device' | 'bring';

const status = (iv: Interview) => (iv.finishedAt ? 'finished' : iv.consent === false ? 'no consent' : 'in progress');

export function InterviewsView({ notify, onProject, goChecks }: { notify: Notify; onProject: (p: Project) => void; goChecks: () => void }) {
  const [tab, setTab] = useState<Tab>('device');
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [trying, setTrying] = useState<Interview | null>(null);
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [running, setRunning] = useState<Interview | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ protocolId: '', egoId: '', wave: '', mode: 'interviewer' as Interview['mode'], interviewer: '' });
  const [keepNames, setKeepNames] = useState(false);
  const [brought, setBrought] = useState<{ protocol: Protocol; interviews: Interview[] } | null>(null);
  const [backup, setBackup] = useState<BackupState | null>(null);
  /** The questionnaire of an interview just finished, while asking to back it up. */
  const [askBackup, setAskBackup] = useState<Protocol | null>(null);
  /** An encrypted interview file being made: first its passphrase, then a tap to save it. */
  const [exporting, setExporting] = useState<{ protocol: Protocol; file?: { name: string; bytes: Uint8Array; ids: string[] } } | null>(null);
  /** An interview file chosen on Bring interviews in, waiting for its passphrase. */
  const [incoming, setIncoming] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const protoTimer = useRef<number | undefined>(undefined);

  const refreshProtocols = () => listProtocols().then(setProtocols, () => setProtocols([]));
  const refreshBackup = () => getBackup().then(setBackup, () => setBackup(null));
  useEffect(() => {
    refreshProtocols();
    refreshBackup();
    getVaultMeta().then((m) => setHasVault(!!m), () => setHasVault(false));
  }, []);
  useEffect(() => {
    if (!form.protocolId && protocols[0]) setForm((f) => ({ ...f, protocolId: protocols[0]!.id }));
  }, [protocols]);

  const unlock = async (pass: string) => {
    setBusy(true);
    try {
      let k: CryptoKey;
      if (hasVault) {
        const meta = await getVaultMeta();
        k = await openVault(meta!, pass);
      } else {
        const v = await createVault(pass);
        await setVaultMeta(v.meta);
        k = v.key;
        setHasVault(true);
      }
      setKey(k);
      setInterviews(await listInterviews(k));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Each change is saved at once (encrypted); the list follows. */
  const change = (iv: Interview) => {
    setRunning(iv);
    setSaved(false);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!key) return;
      try {
        await saveInterview(key, iv);
        setSaved(true);
        refreshBackup();
        setInterviews((list) => [iv, ...list.filter((x) => x.id !== iv.id)]);
      } catch (e) {
        notify(`Could not save on this device: ${(e as Error).message}`, 'error');
      }
    }, 150);
  };

  const editProtocol = (p: Protocol) => {
    setEditing(p);
    window.clearTimeout(protoTimer.current);
    protoTimer.current = window.setTimeout(() => saveProtocol(p).then(refreshProtocols), 400);
  };

  const protocolOf = (id: string) => protocols.find((p) => p.id === id) ?? null;

  const start = () => {
    const p = protocolOf(form.protocolId);
    if (!p || !key) return;
    if (interviews.some((iv) => iv.egoId === form.egoId.trim() && (iv.wave ?? '') === form.wave.trim() && iv.protocolId === p.id)) {
      notify('This respondent already has an interview for that wave on this device. Continue it from the list instead.', 'error');
      return;
    }
    // Names from this respondent's latest earlier interview, offered by name generators.
    const earlier = interviews.filter((iv) => iv.egoId === form.egoId.trim() && (iv.wave ?? '') !== form.wave.trim()).sort((a, b) => (b.wave ?? '').localeCompare(a.wave ?? '', 'en', { numeric: true }))[0];
    const iv = startInterview(p, { egoId: form.egoId, wave: form.wave || null, mode: form.mode, interviewer: form.interviewer, roster: earlier ? earlier.alters.map((a) => a.name) : [] });
    change(iv);
  };

  const exportFile = (p: Protocol) => {
    setExporting({ protocol: p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const makeFile = async (pass: string) => {
    if (!exporting) return;
    const p = exporting.protocol;
    const list = interviews.filter((iv) => iv.protocolId === p.id);
    setBusy(true);
    try {
      const bytes = await interviewsToFile({ protocol: p, interviews: list, device: navigator.userAgent.slice(0, 80), savedAt: new Date().toISOString() }, pass);
      const name = `${p.name} interviews ${new Date().toISOString().slice(0, 10)}.egocraft-interviews`.replace(/[\\/:*?"<>|]/g, ' ');
      setExporting({ protocol: p, file: { name, bytes, ids: list.map((iv) => iv.id) } });
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveFile = async () => {
    const f = exporting?.file;
    if (!f) return;
    download(f.name, f.bytes);
    await setBackedUp(f.ids);
    await refreshBackup();
    setExporting(null);
    setAskBackup(null);
    notify(`Saved ${f.ids.length} interview${f.ids.length === 1 ? '' : 's'}, encrypted. Keep the file off this device (a computer, a drive or a cloud folder).`, 'ok');
  };

  const openIncoming = async (pass: string) => {
    if (!incoming) return;
    setBusy(true);
    try {
      const content = await interviewsFromFile(incoming.bytes, pass);
      if (!content.protocol) throw new Error('This file has no questionnaire with it.');
      setBrought((b) => {
        if (b && b.protocol.id !== content.protocol!.id) {
          notify('That file uses a different questionnaire; it replaces the files opened before.', 'error');
          return { protocol: content.protocol!, interviews: content.interviews };
        }
        return { protocol: content.protocol!, interviews: [...(b?.interviews ?? []), ...content.interviews] };
      });
      notify(`Opened ${content.interviews.length} interviews from ${incoming.name}.`, 'ok');
      setIncoming(null);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const makeStudy = (p: Protocol, list: Interview[]) => {
    try {
      const study = interviewsToStudy(p, list, { keepNames, name: p.name });
      onProject({ ...newProject(study), protocol: p });
      notify(`Made a study from ${list.length} interview${list.length === 1 ? '' : 's'}.`, 'ok');
      goChecks();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  if (running) {
    const p = protocolOf(running.protocolId);
    if (p)
      return (
        <InterviewRunner
          protocol={p}
          interview={running}
          onChange={change}
          onClose={() => {
            if (running.finishedAt) setAskBackup(p);
            setRunning(null);
          }}
          saved={saved}
        />
      );
  }
  if (trying && editing) return <InterviewRunner protocol={editing} interview={trying} onChange={setTrying} onClose={() => setTrying(null)} saved />;

  return (
    <div className="page">
      <h1>Interviews</h1>
      <p className="muted">Collect egocentric network data here, on a laptop or an iPad, with or without a network: design the questions, run interviews (you ask, or the respondent fills it in), and turn them into a study for the other steps.</p>
      {exporting && key ? (
        <Panel title={`Back up: ${exporting.protocol.name}`}>
          {exporting.file ? (
            <>
              <p>The encrypted file is ready ({exporting.file.ids.length} interview{exporting.file.ids.length === 1 ? '' : 's'}). Save it, then keep it somewhere other than this device.</p>
              <div className="row">
                <button className="primary" onClick={saveFile}>Save the file</button>
                <button onClick={() => setExporting(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">A passphrase for the file. You will need it to open the file on the analysis computer; it can differ from this device’s passphrase.</p>
              <Passphrase id="exp" twice label="Make the encrypted file" onSubmit={makeFile} busy={busy} />
              <div className="row" style={{ marginTop: 8 }}><button onClick={() => setExporting(null)}>Cancel</button></div>
            </>
          )}
        </Panel>
      ) : askBackup && key ? (
        <Panel title="Back up the interview">
          <p>The interview is finished and kept on this device. Back it up now: save the interviews as an encrypted file and keep it somewhere else (a computer, a drive or a cloud folder). If this device is lost, or the browser clears what it keeps, interviews that aren’t backed up are gone.</p>
          <div className="row">
            <button className="primary" onClick={() => exportFile(askBackup)}>Back up now</button>
            <button onClick={() => setAskBackup(null)}>Later</button>
          </div>
        </Panel>
      ) : backup && backup.pending.length ? (
        <p className="chip warning" style={{ whiteSpace: 'normal', display: 'block', padding: '6px 10px', marginBottom: 12 }}>
          {backupText(backup)} Save the interviews as an encrypted file and keep it off this device: if the device is lost, or the browser clears what it keeps, interviews that aren’t backed up are gone.{' '}
          {key ? null : <>Unlock <strong>Interviews on this device</strong> to back them up.</>}
        </p>
      ) : null}
      <div className="tabs">
        {(['protocols', 'device', 'bring'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ protocols: 'Questionnaires', device: 'Interviews on this device', bring: 'Bring interviews in' }[t]}
          </button>
        ))}
      </div>

      {tab === 'protocols' ? (
        editing ? (
          <>
            <div className="row">
              <button onClick={() => setEditing(null)}>← All questionnaires</button>
              <button onClick={() => download(`${editing.name}.egocraft-protocol`.replace(/[\\/:*?"<>|]/g, ' '), JSON.stringify(editing, null, 2), 'application/json')}>Save as a file</button>
              <span className="muted small">Changes are kept on this device as you type.</span>
            </div>
            <ProtocolEditor protocol={editing} onChange={editProtocol} onTry={() => setTrying(startInterview(editing, { egoId: 'TRY', mode: 'self' }))} />
          </>
        ) : (
          <Panel
            title="Questionnaires on this device"
            actions={
              <>
                <button className="primary" onClick={() => { const p = sampleProtocol(); saveProtocol(p).then(refreshProtocols); setEditing(p); }}>Start from the example</button>
                <button onClick={() => { const p = emptyProtocol('New questionnaire'); saveProtocol(p).then(refreshProtocols); setEditing(p); }}>Start blank</button>
                <button
                  onClick={async () => {
                    const f = await pickFile('.egocraft-protocol,.json');
                    if (!f) return;
                    try {
                      const p = protocolFromJson(new TextDecoder().decode(await fileBytes(f)));
                      await saveProtocol(p);
                      refreshProtocols();
                      notify(`Added ${p.name}.`, 'ok');
                    } catch (e) {
                      notify((e as Error).message, 'error');
                    }
                  }}
                >
                  Open a file
                </button>
              </>
            }
          >
            {protocols.length ? (
              <ul>
                {protocols.map((p) => (
                  <li key={p.id} style={{ margin: '6px 0' }}>
                    <strong>{p.name}</strong> <span className="muted small">{p.screens.length} screens · changed {new Date(p.modifiedAt).toLocaleDateString()}</span>{' '}
                    {protocolProblems(p).length ? <span className="chip warning">not ready</span> : <span className="chip ok">ready</span>}{' '}
                    <button className="link" onClick={() => setEditing(p)}>edit</button>{' '}
                    <button className="link" onClick={() => { if (window.confirm(`Remove the questionnaire "${p.name}" from this device? Interviews made with it stay.`)) deleteProtocol(p.id).then(refreshProtocols); }}>remove</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">None yet. The example has an important-matters name generator, a help generator, questions about each person, how they know them, closeness circles and who knows whom.</p>
            )}
          </Panel>
        )
      ) : null}

      {tab === 'device' ? (
        !key ? (
          <Panel title={hasVault ? 'Unlock the interviews on this device' : 'Lock interviews on this device'}>
            <p className="muted">
              {hasVault
                ? 'Interviews here are encrypted. Enter the device passphrase to see and add to them.'
                : 'Interviews are kept on this device, encrypted with a passphrase you choose now. Anyone without it sees nothing. EgoCraft keeps no copy of the passphrase, so write it down somewhere safe: without it the interviews can’t be opened.'}
            </p>
            {hasVault !== null ? <Passphrase twice={!hasVault} label={hasVault ? 'Unlock' : 'Set the passphrase'} onSubmit={unlock} busy={busy} /> : null}
          </Panel>
        ) : (
          <>
            <Panel title="Start an interview">
              {protocols.some((p) => !protocolProblems(p).length) ? (
                <div className="map">
                  <label htmlFor="st-p">Questionnaire</label>
                  <select id="st-p" value={form.protocolId} onChange={(e) => setForm({ ...form, protocolId: e.target.value })}>
                    {protocols.filter((p) => !protocolProblems(p).length).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <label htmlFor="st-ego">Respondent ID</label>
                  <input id="st-ego" type="text" value={form.egoId} onChange={(e) => setForm({ ...form, egoId: e.target.value })} placeholder="the ID from your sample list" />
                  <label htmlFor="st-wave">Wave (if repeated)</label>
                  <input id="st-wave" type="text" value={form.wave} onChange={(e) => setForm({ ...form, wave: e.target.value })} placeholder="empty, or 1, 2 …" />
                  <label>Who fills it in</label>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <label className="row"><input type="radio" checked={form.mode === 'interviewer'} onChange={() => setForm({ ...form, mode: 'interviewer' })} /> An interviewer asks the questions</label>
                    <label className="row"><input type="radio" checked={form.mode === 'self'} onChange={() => setForm({ ...form, mode: 'self' })} /> The respondent fills it in</label>
                  </div>
                  <label htmlFor="st-int">Interviewer</label>
                  <input id="st-int" type="text" value={form.interviewer} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} placeholder="initials (optional)" />
                  <span />
                  <div><button className="primary" disabled={!form.egoId.trim()} onClick={start}>Start</button></div>
                </div>
              ) : (
                <p className="muted">First make a questionnaire on the Questionnaires tab (the example is ready to use).</p>
              )}
            </Panel>
            <Panel
              title={`${interviews.length} interview${interviews.length === 1 ? '' : 's'} on this device`}
              actions={<button onClick={() => { setKey(null); setInterviews([]); }}>Lock</button>}
            >
              {interviews.length ? (
                <div className="tablewrap">
                  <table className="data">
                    <thead><tr><th>Respondent</th><th>Wave</th><th>Questionnaire</th><th>People</th><th>Status</th><th>Changed</th><th /></tr></thead>
                    <tbody>
                      {interviews.map((iv) => (
                        <tr key={iv.id}>
                          <td>{iv.egoId}</td>
                          <td>{iv.wave ?? ''}</td>
                          <td>{iv.protocolName}</td>
                          <td className="num">{iv.alters.length}</td>
                          <td>{status(iv)}</td>
                          <td>{new Date(iv.updatedAt).toLocaleString()}</td>
                          <td>
                            <button className="link" disabled={!protocolOf(iv.protocolId)} onClick={() => { setSaved(true); setRunning(iv); }}>{iv.finishedAt ? 'open' : 'continue'}</button>{' '}
                            <button className="link" onClick={() => { if (window.confirm(`Delete the interview with respondent ${iv.egoId} from this device? This can't be undone. Save the interviews as a file first if you need them.`)) deleteInterview(iv.id).then(() => { setInterviews((l) => l.filter((x) => x.id !== iv.id)); refreshBackup(); }); }}>delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No interviews yet.</p>
              )}
              {backup ? <p className="muted small" style={{ marginTop: 10 }}>{backupText(backup)}</p> : null}
              {protocols.filter((p) => interviews.some((iv) => iv.protocolId === p.id)).map((p) => (
                <div key={p.id} className="row" style={{ marginTop: 10 }}>
                  <strong>{p.name}:</strong>
                  <button className={backup && interviews.some((iv) => iv.protocolId === p.id && backup.pending.includes(iv.id)) ? 'primary' : ''} onClick={() => exportFile(p)}>Save its interviews as an encrypted file</button>
                  <button className="primary" onClick={() => makeStudy(p, interviews.filter((iv) => iv.protocolId === p.id))}>Make a study from them</button>
                </div>
              ))}
              <label className="row" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={keepNames} onChange={(e) => setKeepNames(e.target.checked)} /> Keep the names people typed in the study (otherwise only A01, A02 …)
              </label>
            </Panel>
          </>
        )
      ) : null}

      {tab === 'bring' ? (
        <Panel title="Interviews from other devices">
          <p className="muted">Open the encrypted interview files saved on each device (Interviews on this device ▸ Save its interviews as an encrypted file). Files with the same questionnaire are put together; an interview found in two files is counted once.</p>
          <button
            className="primary"
            onClick={async () => {
              const f = await pickFile('.egocraft-interviews');
              if (f) setIncoming({ name: f.name, bytes: await fileBytes(f) });
            }}
          >
            Open an interview file
          </button>
          {incoming ? (
            <div style={{ marginTop: 10 }}>
              <p className="small">The passphrase of <strong>{incoming.name}</strong>:</p>
              <Passphrase id="inc" twice={false} label="Open" onSubmit={openIncoming} busy={busy} />
            </div>
          ) : null}
          {brought ? (
            <div style={{ marginTop: 12 }}>
              <p>
                <strong>{brought.protocol.name}</strong>: {new Set(brought.interviews.map((iv) => iv.id)).size} interviews ({brought.interviews.filter((iv) => iv.finishedAt).length} finished).
              </p>
              <label className="row"><input type="checkbox" checked={keepNames} onChange={(e) => setKeepNames(e.target.checked)} /> Keep the names people typed (otherwise only A01, A02 …)</label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="primary" onClick={() => makeStudy(brought.protocol, brought.interviews)}>Make a study from them</button>
                <button onClick={() => setBrought(null)}>Clear</button>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
