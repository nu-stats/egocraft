// Running an interview (P6.2–P6.6): one screen at a time, touch first.
// Every person can be dragged with a finger or the mouse, or tapped and then
// tapped onto a box, so nothing needs fine dragging. Each change is passed
// up at once and saved on the device.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Answer, Interview } from '../interview/interview.ts';
import { addAlter, blockReason, leaveScreen, pilesOf, removeAlter, setAlterAnswer, setEgoAnswer, setPiles, toggleTie } from '../interview/interview.ts';
import type { Option, Protocol, Question, Screen } from '../interview/protocol.ts';

type Change = (iv: Interview) => void;

// ---------- dragging and tapping ----------

interface Drag {
  id: string;
  label: string;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

/** Drag a person onto anything marked data-drop, or tap the person and then tap the target. */
function useDragDrop(onDrop: (id: string, target: string) => void, onTap?: (id: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      setDrag((d) => {
        if (!d) return null;
        const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8;
        if (moved) {
          const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
          const target = el?.getAttribute('data-drop');
          if (target !== null && target !== undefined) dropRef.current(d.id, target);
          setPicked(null);
        } else if (tapRef.current) tapRef.current(d.id);
        else setPicked((p) => (p === d.id ? null : d.id));
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag !== null]);
  const grab = (id: string, label: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDrag({ id, label, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  };
  /** A tap on a target with someone picked puts them there. */
  const tapTarget = (target: string) => {
    if (picked) {
      dropRef.current(picked, target);
      setPicked(null);
    }
  };
  const ghost = drag && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 8 ? <div className="iv-ghost" style={{ left: drag.x, top: drag.y }}>{drag.label}</div> : null;
  return { grab, tapTarget, picked, setPicked, ghost, dragging: drag?.id ?? null };
}

function Person({ id, name, grab, picked, extra, drop }: { id: string; name: string; grab: (id: string, label: string) => (e: React.PointerEvent) => void; picked: string | null; extra?: ReactNode; drop?: string }) {
  return (
    <span className={`iv-person${picked === id ? ' picked' : ''}`} onPointerDown={grab(id, name)} data-drop={drop} role="button" tabIndex={0} aria-pressed={picked === id}>
      {name}
      {extra}
    </span>
  );
}

// ---------- answers ----------

function QuestionField({ q, value, onChange, id }: { q: Question; value: Answer | undefined; onChange: (v: Answer) => void; id: string }) {
  const choices: Option[] = q.type === 'yesno' ? [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }] : (q.options ?? []);
  return (
    <div className="iv-question">
      <label htmlFor={id}>
        {q.label}
        {q.required ? ' *' : ''}
      </label>
      {q.type === 'text' ? (
        <input id={id} type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      ) : q.type === 'number' ? (
        <input id={id} type="number" inputMode="decimal" min={q.min} max={q.max} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      ) : (
        <div className="iv-choices" id={id} role="radiogroup" aria-label={q.label}>
          {choices.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={String(value) === o.value} className={String(value) === o.value ? 'on' : ''} onClick={() => onChange(String(value) === o.value ? null : o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- screens ----------

function NameGenerator({ s, iv, p, onChange }: { s: Extract<Screen, { kind: 'nameGenerator' }>; iv: Interview; p: Protocol; onChange: Change }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const mine = iv.alters.filter((a) => a.generators.includes(s.id));
  const others = iv.alters.filter((a) => !a.generators.includes(s.id));
  const roster = s.offerRoster ? iv.roster.filter((r) => !iv.alters.some((a) => a.name.toLowerCase() === r.toLowerCase())) : [];
  const add = (n: string) => {
    const r = addAlter(iv, p, n, s.id);
    setNote(r.reason ?? null);
    if (r.added) onChange(r.interview);
  };
  return (
    <div className="iv-stack">
      <form
        className="iv-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
          setName('');
        }}
      >
        <input type="text" value={name} placeholder="Name, nickname or initials" aria-label="Name, nickname or initials" onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" />
        <button type="submit" className="primary">Add</button>
      </form>
      {note ? <p className="iv-note">{note}</p> : null}
      <div className="iv-people">
        {mine.map((a) => (
          <span key={a.id} className="iv-person static">
            {a.name}
            <button type="button" className="iv-x" aria-label={`Remove ${a.name}`} onClick={() => onChange(removeAlter(iv, a.id, s.id))}>×</button>
          </span>
        ))}
        {!mine.length ? <span className="muted">Nobody yet.</span> : null}
      </div>
      {others.length ? (
        <div>
          <p className="muted">Already named on another question. Tap anyone who belongs here too:</p>
          <div className="iv-people">{others.map((a) => <button key={a.id} type="button" className="iv-person" onClick={() => add(a.name)}>+ {a.name}</button>)}</div>
        </div>
      ) : null}
      {roster.length ? (
        <div>
          <p className="muted">Named in the last interview. Tap anyone who still belongs here:</p>
          <div className="iv-people">{roster.map((r) => <button key={r} type="button" className="iv-person" onClick={() => add(r)}>+ {r}</button>)}</div>
        </div>
      ) : null}
      <p className="muted small">{iv.alters.length} of at most {p.maxAlters} people named so far{s.max ? `; this question takes up to ${s.max}` : ''}.</p>
    </div>
  );
}

function Bins({ s, iv, onChange }: { s: Extract<Screen, { kind: 'alterBins' | 'alterScale' }>; iv: Interview; onChange: Change }) {
  const dd = useDragDrop((id, target) => onChange(setAlterAnswer(iv, id, s.variable, target === '__none' ? null : target)));
  const at = (v: string | null) => iv.alters.filter((a) => (a.values[s.variable] ?? null) === v || (v !== null && String(a.values[s.variable] ?? '') === v));
  return (
    <div className="iv-stack">
      <div className={`iv-tray${dd.picked ? ' armed' : ''}`} data-drop="__none" onClick={() => dd.tapTarget('__none')}>
        <span className="muted small">Not placed yet</span>
        <div className="iv-people">{at(null).map((a) => <Person key={a.id} id={a.id} name={a.name} grab={dd.grab} picked={dd.picked} />)}</div>
      </div>
      <div className={s.kind === 'alterScale' ? 'iv-scale' : 'iv-bins'}>
        {s.options.map((o) => (
          <div key={o.value} className={`iv-bin${dd.picked ? ' armed' : ''}`} data-drop={o.value} onClick={() => dd.tapTarget(o.value)}>
            <strong>{o.label}</strong>
            <div className="iv-people">{at(o.value).map((a) => <Person key={a.id} id={a.id} name={a.name} grab={dd.grab} picked={dd.picked} />)}</div>
          </div>
        ))}
      </div>
      {dd.ghost}
    </div>
  );
}

function Closeness({ s, iv, onChange }: { s: Extract<Screen, { kind: 'closeness' }>; iv: Interview; onChange: Change }) {
  const dd = useDragDrop((id, target) => onChange(setAlterAnswer(iv, id, s.variable, target === '__none' ? null : Number(target))));
  const rings = s.rings;
  const ringOf = (a: Interview['alters'][number]) => {
    const v = a.values[s.variable];
    return typeof v === 'number' && v >= 1 && v <= rings ? v : null;
  };
  // Ring value r (rings = closest) is drawn at band (rings - r) from the middle.
  const placed = iv.alters.filter((a) => ringOf(a) !== null);
  // Ring r's outer edge (rings = the closest, smallest ring); the middle 8% is the respondent.
  const radius = (r: number) => 8 + ((rings - r + 1) * 40) / rings;
  return (
    <div className="iv-stack">
      <div className={`iv-tray${dd.picked ? ' armed' : ''}`} data-drop="__none" onClick={() => dd.tapTarget('__none')}>
        <span className="muted small">Not placed yet</span>
        <div className="iv-people">{iv.alters.filter((a) => ringOf(a) === null).map((a) => <Person key={a.id} id={a.id} name={a.name} grab={dd.grab} picked={dd.picked} />)}</div>
      </div>
      <div className="iv-rings">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {/* Largest first, so the smaller rings are drawn on top of it. */}
          {Array.from({ length: rings }, (_, k) => k + 1).map((r) => (
            <circle key={r} cx="50" cy="50" r={radius(r)} data-drop={String(r)} className={`iv-ring r${(rings - r) % 2}`} onClick={() => dd.tapTarget(String(r))} />
          ))}
          <circle cx="50" cy="50" r="3.2" className="iv-ego" />
          <text x="50" y="50.9" dy="0" textAnchor="middle" className="iv-ego-label">You</text>
        </svg>
        {placed.map((a) => {
          const r = ringOf(a)!;
          const same = placed.filter((b) => ringOf(b) === r);
          const k = same.indexOf(a);
          const angle = -Math.PI / 2 + (2 * Math.PI * k) / same.length + (r % 2) * 0.4;
          const rad = (radius(r) + (r < rings ? radius(r + 1) : 8)) / 2;
          return (
            <span key={a.id} className="iv-on-ring" style={{ left: `${50 + rad * Math.cos(angle)}%`, top: `${50 + rad * Math.sin(angle)}%` }}>
              <Person id={a.id} name={a.name} grab={dd.grab} picked={dd.picked} drop={String(r)} />
            </span>
          );
        })}
      </div>
      {dd.ghost}
    </div>
  );
}

function TiesDraw({ s, iv, onChange }: { s: Extract<Screen, { kind: 'tiesDraw' }>; iv: Interview; onChange: Change }) {
  // Tap one person, then another, to draw (or remove) the line between them; or drag one onto another.
  const [first, setFirst] = useState<string | null>(null);
  const dd = useDragDrop(
    (id, target) => {
      if (target.startsWith('person:') && target.slice(7) !== id) onChange(toggleTie(iv, id, target.slice(7), s.tieType));
    },
    (id) => {
      if (first === null) setFirst(id);
      else if (first === id) setFirst(null);
      else {
        onChange(toggleTie(iv, first, id, s.tieType));
        setFirst(null);
      }
    },
  );
  const n = iv.alters.length;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) };
  };
  const index = new Map(iv.alters.map((a, i) => [a.id, i]));
  const ties = iv.ties.filter((t) => t.type === s.tieType && index.has(t.a) && index.has(t.b));
  return (
    <div className="iv-stack">
      <div className="iv-rings iv-ties">
        <svg viewBox="0 0 100 100">
          {ties.map((t) => {
            const a = pos(index.get(t.a)!);
            const b = pos(index.get(t.b)!);
            return (
              <g key={`${t.a}-${t.b}`} onClick={() => onChange(toggleTie(iv, t.a, t.b, s.tieType))} className="iv-tie">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="hit" />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="seen" />
              </g>
            );
          })}
        </svg>
        {iv.alters.map((a, i) => {
          const p = pos(i);
          return (
            <span key={a.id} className="iv-on-ring" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <Person id={a.id} name={a.name} grab={dd.grab} picked={first} drop={`person:${a.id}`} />
            </span>
          );
        })}
      </div>
      <p className="muted small">{ties.length} pair{ties.length === 1 ? '' : 's'} who know each other. {first ? 'Now tap the other person.' : 'Tap a line to remove it.'}</p>
      {dd.ghost}
    </div>
  );
}

function TiesPiles({ s, iv, onChange }: { s: Extract<Screen, { kind: 'tiesPiles' }>; iv: Interview; onChange: Change }) {
  const [piles, setLocal] = useState<string[][]>(() => pilesOf(iv, s.tieType));
  const save = (next: string[][]) => {
    const clean = next.map((p) => p.filter((id, i, all) => all.indexOf(id) === i)).filter((p) => p.length);
    setLocal(clean);
    onChange(setPiles(iv, clean, s.tieType));
  };
  const dd = useDragDrop((id, target) => {
    const without = piles.map((p) => p.filter((x) => x !== id));
    if (target === '__none') save(without);
    else if (target === '__new') save([...without, [id]]);
    else save(without.map((p, i) => (String(i) === target ? [...p, id] : p)));
  });
  const name = (id: string) => iv.alters.find((a) => a.id === id)?.name ?? id;
  const loose = iv.alters.filter((a) => !piles.some((p) => p.includes(a.id)));
  return (
    <div className="iv-stack">
      <div className={`iv-tray${dd.picked ? ' armed' : ''}`} data-drop="__none" onClick={() => dd.tapTarget('__none')}>
        <span className="muted small">Not in a pile (knows nobody else here)</span>
        <div className="iv-people">{loose.map((a) => <Person key={a.id} id={a.id} name={a.name} grab={dd.grab} picked={dd.picked} />)}</div>
      </div>
      <div className="iv-bins">
        {piles.map((p, i) => (
          <div key={i} className={`iv-bin${dd.picked ? ' armed' : ''}`} data-drop={String(i)} onClick={() => dd.tapTarget(String(i))}>
            <strong>Pile {i + 1}</strong>
            <div className="iv-people">{p.map((id) => <Person key={id} id={id} name={name(id)} grab={dd.grab} picked={dd.picked} />)}</div>
          </div>
        ))}
        <div className={`iv-bin new${dd.picked ? ' armed' : ''}`} data-drop="__new" onClick={() => dd.tapTarget('__new')}>
          <strong>+ New pile</strong>
          <span className="muted small">Drop someone here to start a pile</span>
        </div>
      </div>
      {dd.ghost}
    </div>
  );
}

function ScreenBody({ s, iv, p, onChange, onStop }: { s: Screen; iv: Interview; p: Protocol; onChange: Change; onStop: () => void }) {
  switch (s.kind) {
    case 'intro':
    case 'end':
      return null;
    case 'consent':
      return (
        <div className="iv-stack">
          <div className="iv-choices big">
            <button type="button" className={iv.consent === true ? 'on' : ''} onClick={() => onChange({ ...iv, consent: true })}>I agree</button>
            <button type="button" className={iv.consent === false ? 'on' : ''} onClick={() => onChange({ ...iv, consent: false })}>I do not agree</button>
          </div>
          {iv.consent === false ? <button type="button" onClick={onStop}>End the interview here</button> : null}
        </div>
      );
    case 'egoForm':
      return <div className="iv-stack">{s.questions.map((q) => <QuestionField key={q.id} id={`ego-${q.id}`} q={q} value={iv.ego[q.id]} onChange={(v) => onChange(setEgoAnswer(iv, q.id, v))} />)}</div>;
    case 'nameGenerator':
      return <NameGenerator s={s} iv={iv} p={p} onChange={onChange} />;
    case 'alterForm':
      return (
        <div className="iv-stack">
          {iv.alters.map((a) => (
            <div key={a.id} className="iv-card">
              <h3>{a.name}</h3>
              {s.questions.map((q) => <QuestionField key={q.id} id={`${a.id}-${q.id}`} q={q} value={a.values[q.id]} onChange={(v) => onChange(setAlterAnswer(iv, a.id, q.id, v))} />)}
            </div>
          ))}
        </div>
      );
    case 'alterBins':
    case 'alterScale':
      return <Bins s={s} iv={iv} onChange={onChange} />;
    case 'closeness':
      return <Closeness s={s} iv={iv} onChange={onChange} />;
    case 'tiesDraw':
      return <TiesDraw s={s} iv={iv} onChange={onChange} />;
    case 'tiesPiles':
      return <TiesPiles s={s} iv={iv} onChange={onChange} />;
  }
}

export function InterviewRunner({ protocol: p, interview: iv, onChange, onClose, saved }: { protocol: Protocol; interview: Interview; onChange: Change; onClose: () => void; saved: boolean }) {
  const s = p.screens[iv.screen] ?? p.screens[0]!;
  const block = blockReason(iv, s);
  const last = iv.screen >= p.screens.length - 1;
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Newer browsers return a promise from scrollTo, so nothing is returned here.
    top.current?.scrollTo({ top: 0 });
  }, [iv.screen]);
  const stop = () => onChange({ ...iv, screen: p.screens.length - 1, finishedAt: iv.finishedAt ?? new Date().toISOString() });
  return (
    <div className={`iv-shell ${iv.mode}`} role="dialog" aria-label="Interview">
      <header className="iv-head">
        <div>
          <strong>{p.name}</strong>
          <span className="muted small"> · respondent {iv.egoId}{iv.wave ? `, wave ${iv.wave}` : ''}</span>
        </div>
        <div className="row">
          <span className="muted small">{saved ? 'Saved on this device' : 'Saving…'}</span>
          <button type="button" onClick={onClose}>{iv.finishedAt ? 'Close' : 'Pause'}</button>
        </div>
      </header>
      <div className="iv-progress" aria-hidden="true"><span style={{ width: `${(100 * (iv.screen + 1)) / p.screens.length}%` }} /></div>
      <main className="iv-body" ref={top}>
        <h2>{s.title}</h2>
        <p className="iv-prompt">
          {iv.mode === 'interviewer' && !['intro', 'end'].includes(s.kind) ? <span className="iv-ask">Ask: </span> : null}
          {s.prompt}
        </p>
        <ScreenBody s={s} iv={iv} p={p} onChange={onChange} onStop={stop} />
        {s.kind === 'end' ? <p className="iv-note">The interview is saved on this device. {iv.mode === 'self' ? 'Please hand the device back.' : ''}</p> : null}
      </main>
      <footer className="iv-foot">
        <button type="button" disabled={iv.screen === 0} onClick={() => onChange(leaveScreen(iv, p, -1))}>Back</button>
        <span className="muted small">{iv.screen + 1} of {p.screens.length}</span>
        {last ? (
          <button type="button" className="primary" onClick={onClose}>Done</button>
        ) : (
          <button type="button" className="primary" disabled={!!block} title={block ?? ''} onClick={() => onChange(leaveScreen(iv, p, 1))}>Next</button>
        )}
      </footer>
      {block && !last ? <p className="iv-block">{block}</p> : null}
    </div>
  );
}
