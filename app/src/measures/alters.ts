// Results for each alter (P3.11): one row per alter, for models of alters
// nested in egos. Each alter's degree, betweenness and group within the
// ego's network (ego left out), and its share of the ego's constraint.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { Slice, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, graphFor } from '../network/networks.ts';
import { safeName } from './measures.ts';
import * as S from './structure.ts';

export function alterMeasures(study: Study, slice: Slice = ALL, nets: StudyNetworks = buildNetworks(study)): DataTable {
  const m = study.mapping;
  const ej = columnIndex(study.egos, m.egoId);
  const wj = m.egoWave ? columnIndex(study.egos, m.egoWave) : -1;
  const tail = slice.id === 'all' ? '' : `_${slice.id}`;
  const columns: Column[] = [
    { ...study.egos.columns[ej]!, name: safeName(m.egoId) || 'ego_id' },
    ...(wj >= 0 ? [{ ...study.egos.columns[wj]!, name: safeName(m.egoWave!) }] : []),
    { name: 'alter_id', label: 'Alter ID', kind: 'string' },
    { name: `degree${tail}`, label: 'Ties to other alters', kind: 'numeric' },
    { name: `betweenness${tail}`, label: 'Betweenness among alters (ego left out)', kind: 'numeric' },
    { name: `isolate${tail}`, label: 'Tied to no other alter (1 = yes)', kind: 'numeric' },
    { name: `group_size${tail}`, label: 'Alters in this alter’s group (ego left out), itself included', kind: 'numeric' },
    { name: `constraint_part${tail}`, label: 'This alter’s share of the ego’s constraint (Burt)', kind: 'numeric' },
    { name: `ego_size${tail}`, label: 'Alters in the ego’s network', kind: 'numeric' },
  ];
  const rows: Cell[][] = [];
  const r = (v: number) => Math.round(v * 1e10) / 1e10;
  for (const net of nets.egos) {
    const g = graphFor(study, net, slice);
    if (!g.n) continue;
    const er = study.egos.rows[net.row]!;
    const deg = S.degrees(g);
    const bet = S.alterBetweenness(g);
    const parts = S.constraintParts(g);
    const size = new Array<number>(g.n).fill(1);
    for (const comp of S.components(g)) for (const i of comp) size[i] = comp.length;
    for (let i = 0; i < g.n; i++) {
      rows.push([er[ej] ?? net.id, ...(wj >= 0 ? [er[wj] ?? net.wave] : []), g.alterIds[i]!, deg[i]!, r(bet[i]!), deg[i] === 0 ? 1 : 0, size[i]!, r(parts[i]!), g.n]);
    }
  }
  return { name: 'alter measures', columns, rows };
}
