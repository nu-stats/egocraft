// A study: the three tables (egos, alters, alter–alter ties), which column
// plays which part, and the record of everything done to them.

import type { DataTable } from './data.ts';
import { emptyTable } from './data.ts';

/** Which column plays which part. Column names refer to the study's tables. */
export interface Mapping {
  /** Egos table: the ego identifier. */
  egoId: string;
  /** Egos table: the survey wave, if there are several. */
  egoWave: string | null;
  /** Alters table: the identifier of the ego who named the alter. */
  alterEgoId: string;
  /** Alters table: the alter's identifier, unique within the ego. */
  alterId: string;
  alterWave: string | null;
  /** Alters table: strength of the ego–alter tie (closeness), for structural holes. */
  egoAlterStrength: string | null;
  /** Ties table: the ego the two alters belong to. */
  tieEgoId: string | null;
  tieA: string | null;
  tieB: string | null;
  /** Ties table: kind of tie (kin, friend …). Empty = one kind. */
  tieType: string | null;
  /** Ties table: strength of the alter–alter tie. Empty = every tie counts 1. */
  tieWeight: string | null;
  /**
   * Ties table: whether the pair is tied. 0 / "no" = not tied, missing =
   * not asked or not known, anything else = tied. Empty = every row is a tie.
   */
  tieValue: string | null;
  tieWave: string | null;
}

export type MissingPairRule = 'noTie' | 'observed';

export interface Settings {
  /** Alter pairs whose tie is not known: counted as no tie, or left out of density. */
  missingPairs: MissingPairRule;
  /**
   * Leave measures that rest on alter pairs empty for an ego when more than
   * this share of its pairs (0–1) is not known. Null = never.
   */
  maxUnknownShare?: number | null;
}

export interface HistoryEntry {
  at: string;
  kind: 'import' | 'layout' | 'fix' | 'mapping' | 'note';
  /** One plain sentence, shown in the import report and the recipe. */
  text: string;
  /** Machine-readable details for the recipe. */
  detail?: Record<string, unknown>;
}

export interface Study {
  format: 'egocraft-study';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  egos: DataTable;
  alters: DataTable;
  ties: DataTable | null;
  mapping: Mapping;
  settings: Settings;
  history: HistoryEntry[];
}

export function emptyMapping(): Mapping {
  return {
    egoId: '',
    egoWave: null,
    alterEgoId: '',
    alterId: '',
    alterWave: null,
    egoAlterStrength: null,
    tieEgoId: null,
    tieA: null,
    tieB: null,
    tieType: null,
    tieWeight: null,
    tieValue: null,
    tieWave: null,
  };
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function newStudy(name: string, now = new Date()): Study {
  const at = now.toISOString();
  return {
    format: 'egocraft-study',
    version: 1,
    id: newId(),
    name,
    createdAt: at,
    modifiedAt: at,
    egos: emptyTable('egos'),
    alters: emptyTable('alters'),
    ties: null,
    mapping: emptyMapping(),
    settings: { missingPairs: 'noTie' },
    history: [],
  };
}

export function withHistory(study: Study, entry: Omit<HistoryEntry, 'at'>, now = new Date()): Study {
  const at = now.toISOString();
  return { ...study, modifiedAt: at, history: [...study.history, { at, ...entry }] };
}

/** Problems with the mapping that stop measures being computed, in plain words. */
export function mappingProblems(study: Study): string[] {
  const m = study.mapping;
  const out: string[] = [];
  const has = (t: DataTable | null, c: string | null) => !!t && !!c && t.columns.some((x) => x.name === c);
  if (!study.egos.rows.length) out.push('No ego file yet.');
  else if (!has(study.egos, m.egoId)) out.push('Choose which column of the ego file holds the ego ID.');
  if (!study.alters.rows.length) out.push('No alter file yet.');
  else {
    if (!has(study.alters, m.alterEgoId)) out.push('Choose which column of the alter file holds the ego ID.');
    if (!has(study.alters, m.alterId)) out.push('Choose which column of the alter file holds the alter ID.');
  }
  if (study.ties && study.ties.rows.length) {
    if (!has(study.ties, m.tieEgoId)) out.push('Choose which column of the tie file holds the ego ID.');
    if (!has(study.ties, m.tieA) || !has(study.ties, m.tieB)) out.push('Choose the two columns of the tie file that hold the alter IDs.');
  }
  const waves = [m.egoWave, m.alterWave, m.tieWave].filter(Boolean).length;
  if (m.egoWave && !m.alterWave) out.push('The ego file has a wave column; choose the wave column of the alter file too.');
  if (waves && study.ties?.rows.length && m.egoWave && !m.tieWave) out.push('The ego file has a wave column; choose the wave column of the tie file too.');
  return out;
}

/** The study as a project file (JSON). */
export function studyToJson(study: Study): string {
  return JSON.stringify(study);
}

/** Read a project file, with a plain message for anything that isn't one. */
export function studyFromJson(text: string): Study {
  let s: unknown;
  try {
    s = JSON.parse(text);
  } catch {
    throw new Error('This is not an EgoCraft study file (it is not valid JSON).');
  }
  const st = s as Partial<Study>;
  if (!st || st.format !== 'egocraft-study') throw new Error('This is not an EgoCraft study file.');
  if (st.version !== 1) throw new Error('This study was saved by a newer EgoCraft. Update EgoCraft to open it.');
  if (!st.egos || !st.alters || !st.mapping) throw new Error('This study file is incomplete.');
  return { ...st, mapping: { ...emptyMapping(), ...st.mapping }, settings: { missingPairs: 'noTie', ...st.settings } } as Study;
}
