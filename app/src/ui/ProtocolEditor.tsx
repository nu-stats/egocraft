// Designing an interview protocol (P6.1): the screens in order, their
// wording, questions and answer choices, and the limits.

import { useState } from 'react';
import type { Option, Protocol, Question, QuestionType, Screen, ScreenKind } from '../interview/protocol.ts';
import { newScreen, protocolProblems, SCREEN_INFO } from '../interview/protocol.ts';
import { Panel } from './common.tsx';

const KINDS = Object.keys(SCREEN_INFO) as ScreenKind[];

function OptionsEditor({ options, onChange }: { options: Option[]; onChange: (o: Option[]) => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {options.map((o, i) => (
        <div key={i} className="row">
          <input type="text" aria-label="Code" value={o.value} style={{ width: 70 }} onChange={(e) => onChange(options.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
          <input type="text" aria-label="Answer shown" value={o.label} onChange={(e) => onChange(options.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
          <button type="button" className="link" onClick={() => onChange(options.filter((_, k) => k !== i))}>remove</button>
        </div>
      ))}
      <div>
        <button type="button" onClick={() => onChange([...options, { value: String(options.length + 1), label: '' }])}>Add an answer</button>
      </div>
      <span className="muted small">The code goes in the data (1, 2 …); the answer is what people see.</span>
    </div>
  );
}

function QuestionsEditor({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const set = (i: number, patch: Partial<Question>) => onChange(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {questions.map((q, i) => (
        <div key={i} className="panel" style={{ padding: 12 }}>
          <div className="map">
            <label>Question</label>
            <input type="text" value={q.label} onChange={(e) => set(i, { label: e.target.value })} />
            <label>Variable name</label>
            <input type="text" value={q.id} onChange={(e) => set(i, { id: e.target.value.replace(/\s+/g, '_') })} />
            <label>Answer</label>
            <select value={q.type} onChange={(e) => set(i, { type: e.target.value as QuestionType, ...(e.target.value === 'choice' && !q.options?.length ? { options: [{ value: '1', label: '' }] } : {}) })}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="choice">Choice</option>
              <option value="yesno">Yes or no</option>
            </select>
            <label>Required</label>
            <input type="checkbox" checked={!!q.required} onChange={(e) => set(i, { required: e.target.checked })} />
            {q.type === 'choice' ? (
              <>
                <label>Choices</label>
                <OptionsEditor options={q.options ?? []} onChange={(options) => set(i, { options })} />
              </>
            ) : null}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="link" disabled={i === 0} onClick={() => onChange(questions.map((x, k) => (k === i - 1 ? questions[i]! : k === i ? questions[i - 1]! : x)))}>move up</button>
            <button type="button" className="link" onClick={() => onChange(questions.filter((_, k) => k !== i))}>remove</button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" onClick={() => onChange([...questions, { id: `q${questions.length + 1}`, label: '', type: 'text' }])}>Add a question</button>
      </div>
    </div>
  );
}

function ScreenEditor({ s, onChange }: { s: Screen; onChange: (s: Screen) => void }) {
  const set = (patch: Partial<Screen>) => onChange({ ...s, ...patch } as Screen);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="map">
        <label htmlFor="sc-title">Screen title</label>
        <input id="sc-title" type="text" value={s.title} onChange={(e) => set({ title: e.target.value })} />
        <label htmlFor="sc-prompt">{s.kind === 'intro' || s.kind === 'end' || s.kind === 'consent' ? 'Text' : 'What to ask'}</label>
        <textarea id="sc-prompt" rows={3} value={s.prompt} onChange={(e) => set({ prompt: e.target.value })} style={{ width: '100%' }} />
        <label>ID</label>
        <span className="small"><code>{s.id}</code>{s.kind === 'nameGenerator' ? ` (the alter file gets gen_${s.id} = 1 for everyone named here)` : ''}</span>
        {s.kind === 'consent' ? (
          <>
            <label>Required to go on</label>
            <input type="checkbox" checked={s.required} onChange={(e) => set({ required: e.target.checked })} />
          </>
        ) : null}
        {s.kind === 'nameGenerator' ? (
          <>
            <label htmlFor="sc-max">Most names here</label>
            <input id="sc-max" type="number" min={1} value={s.max ?? ''} placeholder="no limit" onChange={(e) => set({ max: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 110 }} />
            <label>Offer last wave’s names</label>
            <input type="checkbox" checked={s.offerRoster} onChange={(e) => set({ offerRoster: e.target.checked })} />
          </>
        ) : null}
        {s.kind === 'alterBins' || s.kind === 'alterScale' || s.kind === 'closeness' ? (
          <>
            <label htmlFor="sc-var">Variable name</label>
            <input id="sc-var" type="text" value={s.variable} onChange={(e) => set({ variable: e.target.value.replace(/\s+/g, '_') })} />
            <label htmlFor="sc-label">Variable label</label>
            <input id="sc-label" type="text" value={s.label} onChange={(e) => set({ label: e.target.value })} />
          </>
        ) : null}
        {s.kind === 'closeness' ? (
          <>
            <label htmlFor="sc-rings">Rings</label>
            <input id="sc-rings" type="number" min={2} max={6} value={s.rings} onChange={(e) => set({ rings: Number(e.target.value) })} style={{ width: 90 }} />
          </>
        ) : null}
        {s.kind === 'tiesDraw' || s.kind === 'tiesPiles' ? (
          <>
            <label htmlFor="sc-type">Tie type (as stored)</label>
            <input id="sc-type" type="text" value={s.tieType} onChange={(e) => set({ tieType: e.target.value })} />
          </>
        ) : null}
      </div>
      {s.kind === 'alterBins' || s.kind === 'alterScale' ? (
        <div>
          <h3>{s.kind === 'alterBins' ? 'Boxes' : 'Points on the scale, lowest first'}</h3>
          <OptionsEditor options={s.options} onChange={(options) => set({ options })} />
        </div>
      ) : null}
      {s.kind === 'egoForm' || s.kind === 'alterForm' ? (
        <div>
          <h3>Questions</h3>
          <QuestionsEditor questions={s.questions} onChange={(questions) => set({ questions })} />
        </div>
      ) : null}
    </div>
  );
}

export function ProtocolEditor({ protocol: p, onChange, onTry }: { protocol: Protocol; onChange: (p: Protocol) => void; onTry: () => void }) {
  const [sel, setSel] = useState(0);
  const [kind, setKind] = useState<ScreenKind>('nameGenerator');
  const problems = protocolProblems(p);
  const update = (screens: Screen[]) => onChange({ ...p, screens, modifiedAt: new Date().toISOString() });
  const s = p.screens[sel];
  return (
    <div className="grid2" style={{ gridTemplateColumns: 'minmax(240px, 1fr) minmax(320px, 2fr)' }}>
      <Panel title="Screens">
        <div className="map" style={{ marginBottom: 10 }}>
          <label htmlFor="pr-name">Name</label>
          <input id="pr-name" type="text" value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value, modifiedAt: new Date().toISOString() })} />
          <label htmlFor="pr-max">Most people in all</label>
          <input id="pr-max" type="number" min={1} value={p.maxAlters} onChange={(e) => onChange({ ...p, maxAlters: Number(e.target.value) || 1, modifiedAt: new Date().toISOString() })} style={{ width: 90 }} />
        </div>
        <ol className="iv-screenlist">
          {p.screens.map((x, i) => (
            <li key={x.id} className={i === sel ? 'on' : ''}>
              <button type="button" className="step" onClick={() => setSel(i)}>
                <span className="n">{i + 1}</span>
                <span>
                  {x.title}
                  <div className="muted small">{SCREEN_INFO[x.kind].name}</div>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" disabled={sel === 0} onClick={() => { update(p.screens.map((x, k) => (k === sel - 1 ? p.screens[sel]! : k === sel ? p.screens[sel - 1]! : x))); setSel(sel - 1); }}>Move up</button>
          <button type="button" disabled={sel >= p.screens.length - 1} onClick={() => { update(p.screens.map((x, k) => (k === sel + 1 ? p.screens[sel]! : k === sel ? p.screens[sel + 1]! : x))); setSel(sel + 1); }}>Move down</button>
          <button type="button" disabled={!s} onClick={() => { update(p.screens.filter((_, k) => k !== sel)); setSel(Math.max(0, sel - 1)); }}>Remove</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as ScreenKind)} aria-label="Kind of screen to add">
            {KINDS.map((k) => <option key={k} value={k}>{SCREEN_INFO[k].name}</option>)}
          </select>
          <button type="button" onClick={() => { const next = [...p.screens]; next.splice(sel + 1, 0, newScreen(kind, p)); update(next); setSel(Math.min(sel + 1, next.length - 1)); }}>Add after this</button>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>{SCREEN_INFO[kind].explain}</p>
        {problems.length ? (
          <ul className="small">{problems.map((x) => <li key={x} style={{ color: 'var(--error)' }}>{x}</li>)}</ul>
        ) : (
          <p><span className="chip ok">Ready to use</span></p>
        )}
        <button type="button" className="primary" disabled={!!problems.length} onClick={onTry}>Try it (nothing is saved)</button>
      </Panel>
      <Panel title={s ? `${sel + 1}. ${SCREEN_INFO[s.kind].name}` : 'No screens'}>
        {s ? <ScreenEditor s={s} onChange={(next) => update(p.screens.map((x, k) => (k === sel ? next : x)))} /> : <p className="muted">Add a screen on the left.</p>}
      </Panel>
    </div>
  );
}
