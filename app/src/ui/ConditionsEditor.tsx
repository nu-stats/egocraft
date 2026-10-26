// Skip logic in the questionnaire designer: "Show only if …" for a screen or
// a question, from answers given before it.

import type { EarlierVariable } from '../interview/conditions.ts';
import { conditionsText, earlierVariables, OP_TEXT } from '../interview/conditions.ts';
import type { Condition, ConditionOp, Protocol } from '../interview/protocol.ts';

const COUNT_OPS: ConditionOp[] = ['is', 'gt', 'gte', 'lt', 'lte'];
const ALL_OPS = Object.keys(OP_TEXT) as ConditionOp[];
const key = (v: { source: string; id?: string; variable?: string }) => `${v.source}:${v.id ?? v.variable}`;

function sourceName(v: EarlierVariable): string {
  if (v.source === 'named') return v.label;
  return `${v.source === 'alter' ? 'This person' : 'Respondent'}: ${v.id}${v.label ? ` (${v.label.slice(0, 40)})` : ''}`;
}

function ValueInput({ c, v, onChange }: { c: Condition; v: EarlierVariable | undefined; onChange: (values: string[]) => void }) {
  if (c.op === 'answered' || c.op === 'notAnswered') return null;
  const opts = v?.options;
  if (opts?.length && c.op === 'oneOf')
    return (
      <span className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o) => (
          <label key={o.value} className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={c.values.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...c.values, o.value] : c.values.filter((x) => x !== o.value))} />
            {o.label || o.value}
          </label>
        ))}
      </span>
    );
  if (opts?.length && (c.op === 'is' || c.op === 'isNot'))
    return (
      <select aria-label="Answer" value={c.values[0] ?? ''} onChange={(e) => onChange([e.target.value])}>
        <option value="">(choose)</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
      </select>
    );
  return (
    <input
      type={['gt', 'gte', 'lt', 'lte'].includes(c.op) || c.source === 'named' ? 'number' : 'text'}
      aria-label="Value"
      value={c.op === 'oneOf' ? c.values.join(', ') : (c.values[0] ?? '')}
      placeholder={c.op === 'oneOf' ? 'values, separated by commas' : 'value'}
      style={{ width: c.op === 'oneOf' ? 200 : 110 }}
      onChange={(e) => onChange(c.op === 'oneOf' ? e.target.value.split(',').map((x) => x.trim()) : [e.target.value])}
    />
  );
}

export function ConditionsEditor({ p, screenIndex, questionIndex, value, onChange, what }: { p: Protocol; screenIndex: number; questionIndex: number | null; value: Condition[] | undefined; onChange: (c: Condition[] | undefined) => void; what: string }) {
  const avail = earlierVariables(p, screenIndex, questionIndex);
  const list = value ?? [];
  const set = (i: number, patch: Partial<Condition>) => onChange(list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const add = () => {
    const v = avail[0]!;
    onChange([...list, { source: v.source, variable: v.id, op: v.source === 'named' ? 'gte' : 'is', values: [] }]);
  };
  return (
    <div className="iv-conditions" style={{ display: 'grid', gap: 6 }}>
      {list.map((c, i) => {
        const v = avail.find((x) => key(x) === key(c));
        const ops = c.source === 'named' ? COUNT_OPS : ALL_OPS;
        return (
          <div key={i} className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className="small muted">{i === 0 ? 'Only if' : 'and'}</span>
            <select
              aria-label="Earlier answer"
              value={key(c)}
              onChange={(e) => {
                const nv = avail.find((x) => key(x) === e.target.value)!;
                set(i, { source: nv.source, variable: nv.id, op: nv.source === 'named' ? 'gte' : c.op, values: [] });
              }}
            >
              {v ? null : <option value={key(c)}>{c.variable || '(missing)'} (not asked before this)</option>}
              {avail.map((x) => <option key={key(x)} value={key(x)}>{sourceName(x)}</option>)}
            </select>
            <select aria-label="Condition" value={c.op} onChange={(e) => set(i, { op: e.target.value as ConditionOp, values: e.target.value === 'oneOf' ? c.values : c.values.slice(0, 1) })}>
              {ops.map((o) => <option key={o} value={o}>{OP_TEXT[o]}</option>)}
            </select>
            <ValueInput c={c} v={v} onChange={(values) => set(i, { values })} />
            <button type="button" className="link" onClick={() => onChange(list.length > 1 ? list.filter((_, k) => k !== i) : undefined)}>remove</button>
          </div>
        );
      })}
      <div className="row">
        <button type="button" disabled={!avail.length} title={avail.length ? '' : 'Nothing is asked before this yet'} onClick={add}>
          {list.length ? 'Add another condition' : `Show ${what} only if …`}
        </button>
        {list.length ? <span className="muted small">Shown when {conditionsText(p, screenIndex, questionIndex, list)}.</span> : <span className="muted small">{avail.length ? 'Always shown.' : 'Always shown (conditions can use answers given before this).'}</span>}
      </div>
    </div>
  );
}
