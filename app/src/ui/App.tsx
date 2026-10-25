// The app: eight steps down the side, one screen each.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Study } from '../core/study.ts';
import { mappingProblems, newStudy } from '../core/study.ts';
import { runChecks } from '../import/checks.ts';
import type { Results } from '../measures/measures.ts';
import type { Project } from '../project.ts';
import { newProject, projectFromJson, projectToJson } from '../project.ts';
import { sampleStudy } from '../sample/sample.ts';
import { applyRecipe, readRecipe } from '../export/recipe.ts';
import { ChecksView } from './ChecksView.tsx';
import type { Notify } from './common.tsx';
import { download, fileBytes, Panel, pickFile } from './common.tsx';
import { DataView } from './DataView.tsx';
import { ImportView } from './ImportView.tsx';
import { InterviewsView } from './InterviewsView.tsx';
import { MappingView } from './MappingView.tsx';
import { MeasuresView } from './MeasuresView.tsx';
import { ResultsView } from './ResultsView.tsx';
import { SociogramView } from './SociogramView.tsx';
import { loadCurrent, saveCurrent } from './store.ts';

type Step = 'study' | 'interviews' | 'import' | 'columns' | 'checks' | 'data' | 'sociograms' | 'measures' | 'results';
const STEPS: { id: Step; label: string }[] = [
  { id: 'study', label: 'Study' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'import', label: 'Import' },
  { id: 'columns', label: 'Columns' },
  { id: 'checks', label: 'Checks' },
  { id: 'data', label: 'Data' },
  { id: 'sociograms', label: 'Sociograms' },
  { id: 'measures', label: 'Measures' },
  { id: 'results', label: 'Results' },
];

const LAST_FILE = 'egocraft-last-file-save';

function lastFileSave(id: string): string | null {
  try {
    return localStorage.getItem(`${LAST_FILE}:${id}`);
  } catch {
    return null;
  }
}

function StudyView({ project, onProject, notify, go, kept }: { project: Project | null; onProject: (p: Project | null) => void; notify: Notify; go: (s: Step) => void; kept: boolean | null }) {
  const [, setTick] = useState(0);
  const open = async () => {
    const f = await pickFile('.egocraft,.json');
    if (!f) return;
    try {
      onProject(projectFromJson(new TextDecoder().decode(await fileBytes(f))));
      notify(`Opened ${f.name}.`, 'ok');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  const s = project?.study;
  return (
    <div className="page">
      <h1>EgoCraft</h1>
      <p>
        Egocentric network analysis, start to finish: bring in your ego, alter and tie files, check the IDs, draw each person’s network, compute the measures you choose for any subgroup, and save one row per person to merge back into your survey data, with the Stata and R code that produced it.
      </p>
      <p className="muted">Everything stays on this device. EgoCraft has no account, sends nothing anywhere, keeps your open study in this browser between visits, and works without a network once it has been opened.</p>
      <div className="grid3">
        <Panel title="Try it">
          <p className="muted">A made-up study: 200 people in two survey waves, the people they named, and who knows whom.</p>
          <button className="primary" onClick={() => { onProject(newProject(sampleStudy())); notify('Opened the sample study.', 'ok'); go('checks'); }}>Open the sample study</button>
        </Panel>
        <Panel title="Your own data">
          <p className="muted">CSV, Excel, Stata, SPSS or R files, in three files, two files, or one wide survey file.</p>
          <button onClick={() => { onProject(newProject(newStudy('My study'))); go('import'); }}>Start a new study</button>
        </Panel>
        <Panel title="A saved study">
          <p className="muted">An .egocraft file saved earlier.</p>
          <button onClick={open}>Open a study file</button>
        </Panel>
      </div>
      {s ? (
        <Panel
          title="This study"
          actions={
            <>
              <button
                onClick={() => {
                  download(`${s.name.replace(/[\\/:*?"<>|]/g, ' ')}.egocraft`, projectToJson(project!), 'application/json');
                  try {
                    localStorage.setItem(`${LAST_FILE}:${s.id}`, new Date().toISOString());
                  } catch {
                    // Private browsing: nowhere to remember the time.
                  }
                  setTick((t) => t + 1);
                }}
              >
                Save as a file
              </button>
              <button
                title="Use the column choices, fixes, subgroups and measures of an earlier analysis (egocraft_recipe.json from a results ZIP) on this study's data"
                onClick={async () => {
                  const f = await pickFile('.json');
                  if (!f) return;
                  try {
                    const r = applyRecipe(project!, readRecipe(new TextDecoder().decode(await fileBytes(f))));
                    onProject(r.project);
                    window.alert(['Recipe used.', ...r.done, ...(r.todo.length ? ['', 'Still to do by hand:', ...r.todo] : [])].join('\n'));
                  } catch (e) {
                    notify((e as Error).message, 'error');
                  }
                }}
              >
                Rerun a recipe
              </button>
              <button onClick={() => { if (window.confirm('Close this study? Save it as a file first if you want to keep it.')) onProject(null); }}>Close</button>
            </>
          }
        >
          <div className="map">
            <label htmlFor="study-name">Name</label>
            <input id="study-name" type="text" value={s.name} onChange={(e) => onProject({ ...project!, study: { ...s, name: e.target.value } })} />
            <label>Ego file</label>
            <span>{s.egos.rows.length ? `${s.egos.name}: ${s.egos.rows.length.toLocaleString('en-US')} rows` : 'not yet'}</span>
            <label>Alter file</label>
            <span>{s.alters.rows.length ? `${s.alters.name}: ${s.alters.rows.length.toLocaleString('en-US')} rows` : 'not yet'}</span>
            <label>Tie file</label>
            <span>{s.ties ? `${s.ties.name}: ${s.ties.rows.length.toLocaleString('en-US')} rows` : 'none'}</span>
            <label>Kept in this browser</label>
            <span>{new Date(s.modifiedAt).toLocaleString()}</span>
            <label>Last saved as a file</label>
            <span>{lastFileSave(s.id) ? new Date(lastFileSave(s.id)!).toLocaleString() : 'never'}</span>
          </div>
          {kept !== true ? (
            <p className="chip warning" style={{ marginTop: 10, whiteSpace: 'normal', display: 'block', padding: '6px 10px' }}>
              This browser may clear what it keeps (Safari on iPad and iPhone does after some weeks without a visit, and when space runs low). Save the study as a file now and then, and keep the file somewhere safe.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>('study');
  const [results, setResults] = useState<Results | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [kept, setKept] = useState<boolean | null>(null);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    const on = () => setUpdate(true);
    window.addEventListener('egocraft-update', on);
    return () => window.removeEventListener('egocraft-update', on);
  }, []);

  useEffect(() => {
    loadCurrent().then((p) => {
      setProject(p);
      setLoaded(true);
    });
    // Ask the browser to keep EgoCraft's storage even when space runs low.
    navigator.storage?.persist?.().then(setKept, () => setKept(false));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveCurrent(project).catch((e: Error) => setToast({ text: `Could not keep the study in this browser: ${e.message}. Save it as a file.`, kind: 'error' }));
    }, 600);
  }, [project, loaded]);

  const notify: Notify = (text, kind = 'ok') => {
    setToast({ text, kind });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), kind === 'error' ? 9000 : 3500);
  };
  const onProject = (p: Project | null) => {
    setProject(p);
    setResults(null);
  };
  const onStudy = (s: Study) => {
    setProject((p) => (p ? { ...p, study: { ...s, modifiedAt: new Date().toISOString() } } : p));
    setResults(null);
  };
  const go = (s: Step) => setStep(s);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((x) => x.id === step) + 1)]!.id);

  const status = useMemo(() => {
    const s = project?.study;
    if (!s || !s.egos.rows.length) return null;
    const missing = mappingProblems(s).length;
    const errors = missing ? 0 : runChecks(s).filter((i) => i.severity === 'error').length;
    return { missing, errors };
  }, [project]);

  const study = project?.study;
  let body;
  if (!loaded) body = <div className="empty">Opening…</div>;
  else if (step === 'interviews') body = <InterviewsView notify={notify} onProject={onProject} goChecks={() => setStep('checks')} />;
  else if (step === 'study' || !project || !study) body = <StudyView project={project} onProject={onProject} notify={notify} go={go} kept={kept} />;
  else if (step === 'import') body = <ImportView study={study} onStudy={onStudy} notify={notify} goNext={next} />;
  else if (step === 'columns') body = <MappingView study={study} onStudy={onStudy} goNext={next} />;
  else if (step === 'checks') body = <ChecksView study={study} onStudy={onStudy} notify={notify} goNext={next} />;
  else if (step === 'data') body = <DataView study={study} onStudy={onStudy} notify={notify} />;
  else if (step === 'sociograms') body = <SociogramView study={study} slices={project.slices} notify={notify} layouts={project.layouts ?? {}} onLayouts={(layouts) => setProject({ ...project, layouts })} />;
  else if (step === 'measures')
    body = (
      <MeasuresView
        study={study}
        onStudy={onStudy}
        slices={project.slices}
        onSlices={(slices) => setProject({ ...project, slices })}
        measures={project.measures}
        onMeasures={(measures) => setProject({ ...project, measures })}
        results={results}
        onResults={setResults}
        notify={notify}
        goNext={next}
      />
    );
  else body = <ResultsView study={study} results={results} measures={project.measures} slices={project.slices} notify={notify} {...(project.protocol ? { protocol: project.protocol } : {})} waveMatch={project.waveMatch ?? { rule: { kind: 'id' }, overrides: [] }} onWaveMatch={(waveMatch) => setProject({ ...project, waveMatch })} onStudy={onStudy} />;

  return (
    <div className="shell">
      <nav className="side" aria-label="Steps">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          EgoCraft
        </div>
        {STEPS.map((s, i) => (
          <button key={s.id} className={`step${step === s.id ? ' on' : ''}`} onClick={() => setStep(s.id)} disabled={s.id !== 'study' && s.id !== 'interviews' && !project}>
            <span className="n">{i + 1}</span>
            {s.label}
            {s.id === 'columns' && status?.missing ? <span className="badge chip warning">{status.missing}</span> : null}
            {s.id === 'checks' && status && !status.missing ? <span className={`badge chip ${status.errors ? 'error' : 'ok'}`}>{status.errors || '✓'}</span> : null}
            {s.id === 'results' && results ? <span className="badge chip ok">✓</span> : null}
          </button>
        ))}
        <div className="foot small muted">
          {study ? <span>{study.name}</span> : <span>No study open</span>}
          <span>Your data stays on this device.</span>
        </div>
      </nav>
      <main className="main">{body}</main>
      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">{toast.text}</div> : null}
      {update ? (
        <div className="toast" role="status" style={{ bottom: 70 }}>
          A new version of EgoCraft is ready. <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      ) : null}
    </div>
  );
}
