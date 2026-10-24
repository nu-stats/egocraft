// Guessing which column plays which part, from column names and contents.
// Every guess is shown on the mapping screen and can be changed there.

import type { DataTable } from '../core/data.ts';
import { idText } from '../core/data.ts';
import type { Mapping } from '../core/study.ts';
import { emptyMapping } from '../core/study.ts';

const norm = (s: string) => s.toLowerCase().replace(/[\s.\-]/g, '_');

// Column names other programs and common survey layouts use.
const EGO_ID = /^(ego_?id|egoid|ego|respondent_?id|resp_?id|respid|r_?id|case_?id|caseid|participant_?id|pid|subject_?id|id|networkcanvasegouuid|_egoid|ego_?uuid)$/;
const ALTER_ID = /^(alter_?id|alterid|alter|alter_?no|alter_?num(ber)?|alter_?nr|a_?id|networkcanvasuuid|_uid|node_?id|nodeid)$/;
const TIE_A = /^(alter_?a|alter_?1|alter_?i|alter1_?id|from|source|src|sender|ego_?alter_?a|_from|networkcanvassourceuuid|node_?a|i)$/;
const TIE_B = /^(alter_?b|alter_?2|alter_?j|alter2_?id|to|target|tgt|receiver|ego_?alter_?b|_to|networkcanvastargetuuid|node_?b|j)$/;
const TIE_TYPE = /^(tie_?type|type|relation(ship)?|rel_?type|layer|edge_?type|networkcanvasedgetype|_type|kind)$/;
const TIE_WEIGHT = /^(weight|strength|tie_?strength|value_?strength|intensity|closeness)$/;
const TIE_VALUE = /^(knows|tie|tied|know_?each_?other|connected|present|value)$/;
const WAVE = /^(wave|time|round|panel_?wave|survey_?wave|t|year)$/;
const STRENGTH = /^(closeness|close|strength|tie_?strength|intimacy|how_?close)$/;

function find(table: DataTable | null, pattern: RegExp, skip: Set<string> = new Set()): string | null {
  if (!table) return null;
  for (const c of table.columns) if (!skip.has(c.name) && pattern.test(norm(c.name))) return c.name;
  return null;
}

function idSet(table: DataTable, column: string): Set<string> {
  const j = table.columns.findIndex((c) => c.name === column);
  const out = new Set<string>();
  if (j < 0) return out;
  for (const r of table.rows) {
    const v = idText(r[j]);
    if (v !== null) out.add(v);
  }
  return out;
}

/** Share of `inner`'s values found in `outer` (0–1). */
function overlap(inner: Set<string>, outer: Set<string>): number {
  if (!inner.size) return 0;
  let hit = 0;
  for (const v of inner) if (outer.has(v)) hit++;
  return hit / inner.size;
}

/**
 * The column of `table` whose values best match `ids` (the ego IDs), for
 * files whose ego ID column is named differently in each file.
 */
function bestMatch(table: DataTable, ids: Set<string>, skip: Set<string>): string | null {
  let best: string | null = null;
  let score = 0.5;
  for (const c of table.columns) {
    if (skip.has(c.name)) continue;
    const s = overlap(idSet(table, c.name), ids);
    if (s > score) {
      score = s;
      best = c.name;
    }
  }
  return best;
}

export function guessMapping(egos: DataTable, alters: DataTable, ties: DataTable | null): Mapping {
  const m = emptyMapping();
  m.egoId = find(egos, EGO_ID) ?? egos.columns[0]?.name ?? '';
  m.egoWave = find(egos, WAVE, new Set([m.egoId]));
  const egoIds = m.egoId ? idSet(egos, m.egoId) : new Set<string>();

  if (alters.columns.length) {
    const named = find(alters, EGO_ID, new Set(find(alters, ALTER_ID) ? [find(alters, ALTER_ID)!] : []));
    // Prefer the column whose values are the ego IDs.
    m.alterEgoId = named && overlap(idSet(alters, named), egoIds) >= 0.5 ? named : (bestMatch(alters, egoIds, new Set()) ?? named ?? '');
    m.alterId = find(alters, ALTER_ID, new Set([m.alterEgoId])) ?? alters.columns.find((c) => c.name !== m.alterEgoId)?.name ?? '';
    m.alterWave = find(alters, WAVE, new Set([m.alterEgoId, m.alterId]));
    m.egoAlterStrength = find(alters, STRENGTH, new Set([m.alterEgoId, m.alterId]));
  }

  if (ties && ties.columns.length) {
    const named = find(ties, EGO_ID);
    m.tieEgoId = named && overlap(idSet(ties, named), egoIds) >= 0.5 ? named : (bestMatch(ties, egoIds, new Set()) ?? named);
    const used = new Set([m.tieEgoId ?? '']);
    m.tieA = find(ties, TIE_A, used);
    if (m.tieA) used.add(m.tieA);
    m.tieB = find(ties, TIE_B, used);
    if (m.tieB) used.add(m.tieB);
    m.tieType = find(ties, TIE_TYPE, used);
    if (m.tieType) used.add(m.tieType);
    m.tieWave = find(ties, WAVE, used);
    if (m.tieWave) used.add(m.tieWave);
    m.tieValue = find(ties, TIE_VALUE, used);
    if (m.tieValue) used.add(m.tieValue);
    m.tieWeight = find(ties, TIE_WEIGHT, used);
  }
  return m;
}
