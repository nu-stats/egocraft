// Change between waves (P7): how alters are matched, a review of the
// matches for any ego (changed by hand where needed), and the change table.

import { useMemo, useState } from 'react';
import { categoryOf, columnIndex } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { Results } from '../measures/measures.ts';
import type { StudyNetworks } from '../network/networks.ts';
import type { MatchOverride, MatchRule } from '../waves/waves.ts';
import { changeTable, measuresWide, transitions } from '../waves/waves.ts';
import { ColumnSelect, Panel, TablePreview } from './common.tsx';
import { SaveButtons } from './DataView.tsx';

export interface WaveMatch {
  rule: MatchRule;
  overrides: MatchOverride[];
}

export function WavesPanel({ study, nets, results, value, onChange }: { study: Study; nets: StudyNetworks; results: Results; value: WaveMatch; onChange: (w: WaveMatch) => void }) {
  const [ego, setEgo] = useState<string | null>(null);
  const trans = useMemo(() => transitions(study, value.rule, value.overrides, nets), [study, value, nets]);
  const table = useMemo(() => changeTable(study, trans, results), [study, trans, results]);
  const wide = useMemo(() => measuresWide(study, results), [study, results]);
  const alterCols = study.alters.columns.filter((c) => ![study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave].includes(c.name)).map((c) => c.name);
  const base = study.name.replace(/[\\/:*?"<>|]/g, ' ');
  const label = (row: number) => {
    const shown = alterCols.slice(0, 3).map((c) => {
      const j = columnIndex(study.alters, c);
      return categoryOf(study.alters.columns[j], study.alters.rows[row]![j]) ?? '.';
    });
    return shown.join(' · ');
  };
  const egoIds = [...new Set(trans.map((t) => t.egoId))];
  const current = trans.filter((t) => t.egoId === (ego ?? egoIds[0]));
  const setOverride = (o: MatchOverride) => onChange({ ...value, overrides: [...value.overrides.filter((x) => !(x.egoId === o.egoId && x.waveFrom === o.waveFrom && x.waveTo === o.waveTo && x.from === o.from)), o] });
  return (
    <Panel title="Change between waves">
      <p className="muted">Who stayed in each person’s network, who left and who joined, and how each measure changed, for every pair of waves in a row. First say how to tell that an alter in a later wave is the same person.</p>
      <div className="map">
        <label>Same person when</label>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="row"><input type="radio" checked={value.rule.kind === 'id'} onChange={() => onChange({ ...value, rule: { kind: 'id' } })} /> they have the same alter ID (IDs were kept across waves)</label>
          <label className="row">
            <input type="radio" checked={value.rule.kind === 'column'} onChange={() => onChange({ ...value, rule: { kind: 'column', column: alterCols[0] ?? '' } })} /> they have the same
            {value.rule.kind === 'column' ? <ColumnSelect value={value.rule.column} columns={alterCols} onChange={(c) => onChange({ ...value, rule: { kind: 'column', column: c ?? '' } })} allowNone={false} /> : ' name or code'}
          </label>
          <label className="row">
            <input type="radio" checked={value.rule.kind === 'attributes'} onChange={() => onChange({ ...value, rule: { kind: 'attributes', columns: alterCols.slice(0, 2), tolerance: 0 } })} /> their answers agree on several questions (a suggestion to review)
          </label>
          {value.rule.kind === 'attributes' ? (
            <div className="row" style={{ marginLeft: 30 }}>
              <select multiple value={value.rule.columns} onChange={(e) => onChange({ ...value, rule: { ...(value.rule as Extract<MatchRule, { kind: 'attributes' }>), columns: [...e.target.selectedOptions].map((o) => o.value) } })}>
                {alterCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="row">numbers may differ by <input type="number" min={0} value={value.rule.tolerance} style={{ width: 70 }} onChange={(e) => onChange({ ...value, rule: { ...(value.rule as Extract<MatchRule, { kind: 'attributes' }>), tolerance: Number(e.target.value) || 0 } })} /></label>
            </div>
          ) : null}
        </div>
      </div>
      <h3 style={{ marginTop: 14 }}>Check the matches</h3>
      <div className="row">
        <label htmlFor="wv-ego">Ego</label>
        <select id="wv-ego" value={ego ?? egoIds[0] ?? ''} onChange={(e) => setEgo(e.target.value)}>
          {egoIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <span className="muted small">{value.overrides.length ? `${value.overrides.length} match${value.overrides.length === 1 ? '' : 'es'} set by hand` : 'none set by hand'}</span>
      </div>
      {current.map((t) => (
        <div key={`${t.from.wave}-${t.to.wave}`} className="tablewrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Wave {t.from.wave}</th><th>Is the same person as, in wave {t.to.wave}</th><th>How</th></tr></thead>
            <tbody>
              {t.from.alters.map((a) => (
                <tr key={a.id}>
                  <td>{a.id} <span className="muted">{label(a.row)}</span></td>
                  <td>
                    <select value={t.matches.get(a.id) ?? ''} onChange={(e) => setOverride({ egoId: t.egoId, waveFrom: t.from.wave!, waveTo: t.to.wave!, from: a.id, to: e.target.value || null })}>
                      <option value="">nobody (not named again)</option>
                      {t.to.alters.map((b) => <option key={b.id} value={b.id}>{b.id} — {label(b.row)}</option>)}
                    </select>
                  </td>
                  <td className="muted">{t.why.get(a.id) ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <h3 style={{ marginTop: 14 }}>Change table</h3>
      <div className="row" style={{ marginBottom: 8 }}><SaveButtons table={table} base={`${base} change`} /></div>
      <TablePreview table={table} limit={30} showLabels />
      <h3 style={{ marginTop: 14 }}>Measures with the waves side by side</h3>
      <div className="row" style={{ marginBottom: 8 }}><SaveButtons table={wide} base={`${base} measures by wave`} /></div>
      <TablePreview table={wide} limit={10} />
    </Panel>
  );
}
