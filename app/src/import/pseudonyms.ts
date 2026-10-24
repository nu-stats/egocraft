// Pseudonyms (P1.6): names and other identifying text replaced by codes
// (A01, A02 … within each ego; R001 … for egos), with the name key kept in
// a separate file encrypted with a passphrase, or not kept at all.
//
// The same name keeps the same code in every wave of an ego, so alters can
// still be matched across waves after the names are gone.

import type { Cell, Column, DataTable } from '../core/data.ts';
import { columnIndex, idText, isMissing } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { withHistory } from '../core/study.ts';

export type TableName = 'egos' | 'alters' | 'ties';

const NAMEY = /(^|_)(name|names|first|last|surname|nick|nickname|initials|fullname|full_name|who|person|email|phone|address|street)($|_)/i;

/** Text columns that may identify people, with why they look that way. */
export function identifyingColumns(study: Study): { table: TableName; column: string; why: string }[] {
  const out: { table: TableName; column: string; why: string }[] = [];
  const m = study.mapping;
  const scan = (table: TableName, t: DataTable | null) => {
    if (!t) return;
    t.columns.forEach((c, j) => {
      if (c.kind !== 'string') return;
      const isAlterId = table === 'alters' && c.name === m.alterId;
      const hasLetters = t.rows.some((r) => typeof r[j] === 'string' && /[A-Za-z]{2,}/.test(r[j] as string));
      if (isAlterId && hasLetters) out.push({ table, column: c.name, why: 'the alter IDs are words, probably names' });
      else if (NAMEY.test(c.name) && hasLetters) out.push({ table, column: c.name, why: 'the column name suggests names or contact details' });
    });
  };
  scan('egos', study.egos);
  scan('alters', study.alters);
  return out;
}

function tableOf(study: Study, t: TableName): DataTable | null {
  return t === 'egos' ? study.egos : t === 'alters' ? study.alters : study.ties;
}

function setTable(study: Study, t: TableName, table: DataTable): Study {
  return t === 'egos' ? { ...study, egos: table } : t === 'alters' ? { ...study, alters: table } : { ...study, ties: table };
}

export interface PseudonymResult {
  study: Study;
  /** Code → original value, with the ego it belongs to (for alter columns). */
  key: DataTable;
}

/**
 * Replace a column's values with codes. In the alter file, codes count up
 * within each ego (A01, A02 …); in the ego file they count up across the
 * file (R001 …). When the column is the alter ID, the tie file's alter
 * columns are changed the same way, so ties still point to the right alters.
 */
export function pseudonymize(study: Study, table: TableName, column: string): PseudonymResult {
  const m = study.mapping;
  const t = tableOf(study, table);
  if (!t) throw new Error('That file is not in this study.');
  const j = columnIndex(t, column);
  if (j < 0) throw new Error(`"${t.name}" has no column named "${column}".`);
  const keyRows: Cell[][] = [];
  let out = study;
  if (table === 'alters') {
    const ej = columnIndex(t, m.alterEgoId);
    if (ej < 0) throw new Error('Choose the ego ID column of the alter file first (Columns step).');
    const perEgo = new Map<string, Map<string, string>>();
    const codeFor = (ego: string, value: string): string => {
      const map = perEgo.get(ego) ?? new Map<string, string>();
      perEgo.set(ego, map);
      if (!map.has(value)) {
        const code = `A${String(map.size + 1).padStart(2, '0')}`;
        map.set(value, code);
        keyRows.push([ego, code, value]);
      }
      return map.get(value)!;
    };
    const norm = (v: Cell | undefined) => (isMissing(v) ? null : String(v).trim());
    const alters: DataTable = {
      ...t,
      columns: t.columns.map((c, k) => (k === j ? { ...c, kind: 'string' } : c)),
      rows: t.rows.map((r) => {
        const ego = idText(r[ej]);
        const v = norm(r[j]);
        if (ego === null || v === null) return r;
        const copy = r.slice();
        copy[j] = codeFor(ego, v);
        return copy;
      }),
    };
    out = setTable(out, 'alters', alters);
    if (column === m.alterId && study.ties && m.tieEgoId && (m.tieA || m.tieB)) {
      const T = study.ties;
      const te = columnIndex(T, m.tieEgoId);
      const ends = [m.tieA, m.tieB].map((c) => (c ? columnIndex(T, c) : -1)).filter((x) => x >= 0);
      const ties: DataTable = {
        ...T,
        columns: T.columns.map((c, k) => (ends.includes(k) ? { ...c, kind: 'string' } : c)),
        rows: T.rows.map((r) => {
          const ego = idText(r[te]);
          if (ego === null) return r;
          const copy = r.slice();
          for (const k of ends) {
            const v = norm(r[k]);
            // A name in the tie file that the alter file doesn't have still gets a code, so it can't leak.
            if (v !== null) copy[k] = codeFor(ego, v);
          }
          return copy;
        }),
      };
      out = setTable(out, 'ties', ties);
    }
  } else {
    const codes = new Map<string, string>();
    const width = Math.max(3, String(t.rows.length).length);
    const table2: DataTable = {
      ...t,
      columns: t.columns.map((c, k) => (k === j ? { ...c, kind: 'string' } : c)),
      rows: t.rows.map((r) => {
        if (isMissing(r[j])) return r;
        const v = String(r[j]).trim();
        if (!codes.has(v)) {
          const code = `R${String(codes.size + 1).padStart(width, '0')}`;
          codes.set(v, code);
          keyRows.push([null, code, v]);
        }
        const copy = r.slice();
        copy[j] = codes.get(v)!;
        return copy;
      }),
    };
    out = setTable(out, table, table2);
  }
  const keyCols: Column[] = [
    { name: table === 'alters' ? 'ego_id' : 'scope', kind: 'string' },
    { name: 'code', kind: 'string' },
    { name: 'original', kind: 'string' },
  ];
  out = withHistory(out, { kind: 'fix', text: `Replaced the ${column} column of the ${table === 'egos' ? 'ego' : table === 'alters' ? 'alter' : 'tie'} file with codes (${keyRows.length} different values)${column === m.alterId && table === 'alters' && study.ties ? ', in the tie file too' : ''}.`, detail: { check: 'pseudonyms', table, column } });
  return { study: out, key: { name: `${column} key`, columns: keyCols, rows: keyRows } };
}

/** Remove a column (for free text that should not be kept). */
export function dropColumn(study: Study, table: TableName, column: string): Study {
  const t = tableOf(study, table);
  if (!t) return study;
  const j = columnIndex(t, column);
  if (j < 0) return study;
  const m = study.mapping;
  if (Object.values(m).includes(column) && table !== 'ties' && [m.egoId, m.alterEgoId, m.alterId].includes(column)) throw new Error('This column is an ID EgoCraft needs. Replace it with codes instead of removing it.');
  const next: DataTable = { ...t, columns: t.columns.filter((_, k) => k !== j), rows: t.rows.map((r) => r.filter((_, k) => k !== j)) };
  return withHistory(setTable(study, table, next), { kind: 'fix', text: `Removed the ${column} column from the ${table === 'egos' ? 'ego' : table === 'alters' ? 'alter' : 'tie'} file.`, detail: { check: 'drop-column', table, column } });
}

// ---------- the encrypted key file ----------

const MAGIC = new TextEncoder().encode('EGOCRAFT-KEY-1\n');
const ITERATIONS = 310_000;

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * The key, encrypted with AES-256-GCM under a key made from the passphrase
 * (PBKDF2-SHA-256, 310,000 rounds). Without the passphrase the file is
 * unreadable; EgoCraft keeps no copy of the passphrase.
 */
export async function encryptKey(key: DataTable, passphrase: string): Promise<Uint8Array> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(key));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(passphrase, salt), plain));
  const out = new Uint8Array(MAGIC.length + 16 + 12 + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + 16);
  out.set(cipher, MAGIC.length + 28);
  return out;
}

export async function decryptKey(bytes: Uint8Array, passphrase: string): Promise<DataTable> {
  const head = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (head !== 'EGOCRAFT-KEY-1\n') throw new Error('This is not an EgoCraft name key file.');
  const salt = bytes.slice(MAGIC.length, MAGIC.length + 16);
  const iv = bytes.slice(MAGIC.length + 16, MAGIC.length + 28);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deriveKey(passphrase, salt), bytes.slice(MAGIC.length + 28));
    return JSON.parse(new TextDecoder().decode(plain)) as DataTable;
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
}
