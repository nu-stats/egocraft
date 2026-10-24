// One interview in progress or finished (P6.2–P6.6): who the respondent
// named, the answers about them and about the respondent, and who knows
// whom. Every change returns a new interview, so the screens can save after
// each answer and nothing is changed in place.

import type { Protocol, Question, Screen } from './protocol.ts';

export type Answer = string | number | null;

export interface Alter {
  /** A01, A02 … in the order named; stays the same if a name is corrected. */
  id: string;
  name: string;
  /** IDs of the name generators that produced this person. */
  generators: string[];
  values: Record<string, Answer>;
}

export interface Interview {
  format: 'egocraft-interview';
  version: 1;
  id: string;
  protocolId: string;
  protocolName: string;
  egoId: string;
  wave: string | null;
  mode: 'interviewer' | 'self';
  interviewer: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** Where the interview is: the index of the current screen. */
  screen: number;
  consent: boolean | null;
  ego: Record<string, Answer>;
  alters: Alter[];
  /** Tied pairs, per tie type, with a < b. */
  ties: { a: string; b: string; type: string }[];
  /** Tie screens that were completed, so unasked pairs stay "not known". */
  tieScreensDone: string[];
  /** Alters from the last wave, offered by name generators (names only). */
  roster: string[];
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `i${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function startInterview(p: Protocol, o: { egoId: string; wave?: string | null; mode: Interview['mode']; interviewer?: string; roster?: string[] }, now = new Date()): Interview {
  const at = now.toISOString();
  return {
    format: 'egocraft-interview',
    version: 1,
    id: newId(),
    protocolId: p.id,
    protocolName: p.name,
    egoId: o.egoId.trim(),
    wave: o.wave?.trim() || null,
    mode: o.mode,
    interviewer: o.interviewer?.trim() ?? '',
    startedAt: at,
    updatedAt: at,
    finishedAt: null,
    screen: 0,
    consent: null,
    ego: {},
    alters: [],
    ties: [],
    tieScreensDone: [],
    roster: o.roster ?? [],
  };
}

const touch = (iv: Interview, now = new Date()): Interview => ({ ...iv, updatedAt: now.toISOString() });
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/**
 * Add a person named on a name generator. A name already on the list (same
 * letters, any case) is not added twice: the generator is added to that
 * person instead, so one person can be named on several generators.
 */
export function addAlter(iv: Interview, p: Protocol, name: string, generator: string): { interview: Interview; added: boolean; reason?: string } {
  const clean = norm(name);
  if (!clean) return { interview: iv, added: false, reason: 'Type a name or initials first.' };
  const same = iv.alters.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (same) {
    if (same.generators.includes(generator)) return { interview: iv, added: false, reason: `${same.name} is already on this list.` };
    return { interview: touch({ ...iv, alters: iv.alters.map((a) => (a === same ? { ...a, generators: [...a.generators, generator] } : a)) }), added: true };
  }
  const screen = p.screens.find((s) => s.id === generator);
  const max = screen?.kind === 'nameGenerator' ? screen.max : null;
  if (max !== null && max !== undefined && iv.alters.filter((a) => a.generators.includes(generator)).length >= max) return { interview: iv, added: false, reason: `This question allows ${max} names.` };
  if (iv.alters.length >= p.maxAlters) return { interview: iv, added: false, reason: `The interview allows ${p.maxAlters} people in all.` };
  const used = new Set(iv.alters.map((a) => a.id));
  let n = iv.alters.length + 1;
  while (used.has(`A${String(n).padStart(2, '0')}`)) n++;
  const alter: Alter = { id: `A${String(n).padStart(2, '0')}`, name: clean, generators: [generator], values: {} };
  return { interview: touch({ ...iv, alters: [...iv.alters, alter] }), added: true };
}

/** Take a person off one generator's list; with no generator left, they are removed with their answers and ties. */
export function removeAlter(iv: Interview, id: string, generator: string): Interview {
  const a = iv.alters.find((x) => x.id === id);
  if (!a) return iv;
  const left = a.generators.filter((g) => g !== generator);
  if (left.length) return touch({ ...iv, alters: iv.alters.map((x) => (x.id === id ? { ...x, generators: left } : x)) });
  return touch({ ...iv, alters: iv.alters.filter((x) => x.id !== id), ties: iv.ties.filter((t) => t.a !== id && t.b !== id) });
}

export function renameAlter(iv: Interview, id: string, name: string): Interview {
  const clean = norm(name);
  if (!clean) return iv;
  return touch({ ...iv, alters: iv.alters.map((a) => (a.id === id ? { ...a, name: clean } : a)) });
}

export function setEgoAnswer(iv: Interview, variable: string, value: Answer): Interview {
  return touch({ ...iv, ego: { ...iv.ego, [variable]: value } });
}

export function setAlterAnswer(iv: Interview, id: string, variable: string, value: Answer): Interview {
  return touch({ ...iv, alters: iv.alters.map((a) => (a.id === id ? { ...a, values: { ...a.values, [variable]: value } } : a)) });
}

const pairKey = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

export function isTied(iv: Interview, a: string, b: string, type: string): boolean {
  const [x, y] = pairKey(a, b);
  return iv.ties.some((t) => t.a === x && t.b === y && t.type === type);
}

/** Draw or remove the tie between two people. */
export function toggleTie(iv: Interview, a: string, b: string, type: string): Interview {
  if (a === b) return iv;
  const [x, y] = pairKey(a, b);
  const has = isTied(iv, x, y, type);
  return touch({ ...iv, ties: has ? iv.ties.filter((t) => !(t.a === x && t.b === y && t.type === type)) : [...iv.ties, { a: x, b: y, type }] });
}

/** Piles: everyone in the same pile knows each other; pairs in different piles don't. */
export function setPiles(iv: Interview, piles: string[][], type: string): Interview {
  const ties = iv.ties.filter((t) => t.type !== type);
  for (const pile of piles)
    for (let i = 0; i < pile.length; i++)
      for (let k = i + 1; k < pile.length; k++) {
        const [a, b] = pairKey(pile[i]!, pile[k]!);
        ties.push({ a, b, type });
      }
  return touch({ ...iv, ties });
}

/** Piles back from the ties: people joined by ties of this type, grouped. */
export function pilesOf(iv: Interview, type: string): string[][] {
  const parent = new Map(iv.alters.map((a) => [a.id, a.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const t of iv.ties) if (t.type === type && parent.has(t.a) && parent.has(t.b)) parent.set(find(t.a), find(t.b));
  const groups = new Map<string, string[]>();
  for (const a of iv.alters) {
    const r = find(a.id);
    groups.set(r, [...(groups.get(r) ?? []), a.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function missingRequired(questions: Question[], get: (q: Question) => Answer | undefined): Question[] {
  return questions.filter((q) => q.required && (get(q) === null || get(q) === undefined || get(q) === ''));
}

/** Why the respondent can't go on from this screen yet; null when they can. */
export function blockReason(iv: Interview, s: Screen): string | null {
  if (s.kind === 'consent' && s.required && iv.consent !== true) return iv.consent === false ? 'The interview stops here: consent was not given.' : 'Choose whether you agree before going on.';
  if (s.kind === 'egoForm') {
    const miss = missingRequired(s.questions, (q) => iv.ego[q.id]);
    if (miss.length) return `Please answer: ${miss.map((q) => q.label).join('; ')}`;
  }
  if (s.kind === 'alterForm') {
    for (const a of iv.alters) {
      const miss = missingRequired(s.questions, (q) => a.values[q.id]);
      if (miss.length) return `Please answer about ${a.name}: ${miss.map((q) => q.label).join('; ')}`;
    }
  }
  return null;
}

/** The next screen to show: screens about alters are skipped when nobody was named, tie screens when fewer than two. */
export function nextScreen(iv: Interview, p: Protocol, from: number, step: 1 | -1): number {
  let i = from + step;
  while (i >= 0 && i < p.screens.length) {
    const s = p.screens[i]!;
    const needs = ['alterForm', 'alterBins', 'alterScale', 'closeness'].includes(s.kind) ? 1 : ['tiesDraw', 'tiesPiles'].includes(s.kind) ? 2 : 0;
    if (iv.alters.length >= needs) return i;
    i += step;
  }
  return Math.max(0, Math.min(p.screens.length - 1, i));
}

/** Move on, recording that a tie screen was completed. */
export function leaveScreen(iv: Interview, p: Protocol, step: 1 | -1, now = new Date()): Interview {
  const s = p.screens[iv.screen];
  let next = iv;
  if (step === 1 && s && (s.kind === 'tiesDraw' || s.kind === 'tiesPiles') && !iv.tieScreensDone.includes(s.id)) next = { ...next, tieScreensDone: [...next.tieScreensDone, s.id] };
  const to = nextScreen(next, p, iv.screen, step);
  const last = p.screens.length - 1;
  const finished = step === 1 && (to === last || iv.screen === last) && p.screens[to]?.kind === 'end' ? (next.finishedAt ?? now.toISOString()) : next.finishedAt;
  return touch({ ...next, screen: to, finishedAt: finished }, now);
}

export function interviewFromJson(raw: unknown): Interview {
  const iv = raw as Partial<Interview>;
  if (iv?.format !== 'egocraft-interview' || iv.version !== 1 || !Array.isArray(iv.alters)) throw new Error('This is not an EgoCraft interview.');
  return iv as Interview;
}
