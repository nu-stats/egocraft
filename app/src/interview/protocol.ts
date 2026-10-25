// An interview protocol (P6.1): the screens of an egocentric network interview
// in order, with their wording and limits. Designed from the published
// descriptions of name generators, name interpreters, closeness circles and
// alter–alter tie questions (e.g. McCarty et al. 2019, Perry et al. 2018);
// no other program's protocol format or code is used.

export interface Option {
  /** The code stored in the data (1, 2 … or a word). */
  value: string;
  /** What the respondent sees. */
  label: string;
}

export type QuestionType = 'text' | 'number' | 'choice' | 'yesno';

export interface Question {
  /** The variable name in the data (letters, digits, underscore). */
  id: string;
  /** The wording asked. */
  label: string;
  type: QuestionType;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
}

interface ScreenBase {
  id: string;
  title: string;
  /** What to ask or say. In interviewer mode it is shown as "Ask:". */
  prompt: string;
}

export type Screen =
  | (ScreenBase & { kind: 'intro' })
  | (ScreenBase & { kind: 'consent'; required: boolean })
  | (ScreenBase & { kind: 'egoForm'; questions: Question[] })
  /** Adds alters. Every alter named here gets gen_<id> = 1. */
  | (ScreenBase & { kind: 'nameGenerator'; max: number | null; offerRoster: boolean })
  /** The same questions about every alter. */
  | (ScreenBase & { kind: 'alterForm'; questions: Question[] })
  /** Drag each alter into a box: one categorical alter variable. */
  | (ScreenBase & { kind: 'alterBins'; variable: string; label: string; options: Option[] })
  /** Drag each alter onto a scale: an ordinal alter variable. */
  | (ScreenBase & { kind: 'alterScale'; variable: string; label: string; options: Option[] })
  /** Drag each alter onto rings around the ego: the inner ring is the closest. */
  | (ScreenBase & { kind: 'closeness'; variable: string; label: string; rings: number })
  /** Draw ties: drag (or tap) one alter onto another. */
  | (ScreenBase & { kind: 'tiesDraw'; tieType: string })
  /** Put alters who know each other in the same pile. */
  | (ScreenBase & { kind: 'tiesPiles'; tieType: string })
  | (ScreenBase & { kind: 'end' });

export type ScreenKind = Screen['kind'];

export interface Protocol {
  format: 'egocraft-protocol';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  /** Most alters one interview may name (all generators together). */
  maxAlters: number;
  screens: Screen[];
}

export const SCREEN_INFO: Record<ScreenKind, { name: string; explain: string }> = {
  intro: { name: 'Introduction', explain: 'Text shown before the questions.' },
  consent: { name: 'Consent', explain: 'Consent text and an agree / do not agree answer.' },
  egoForm: { name: 'Questions about the respondent', explain: 'Questions asked once (age, gender …): ego variables.' },
  nameGenerator: { name: 'Name generator', explain: 'A question that collects names into a growing list.' },
  alterForm: { name: 'Questions about each person', explain: 'The same questions for every person named: alter variables.' },
  alterBins: { name: 'Sort into boxes', explain: 'Drag each person into a box (how they know them …).' },
  alterScale: { name: 'Place on a scale', explain: 'Drag each person onto a scale (how often in touch …).' },
  closeness: { name: 'Closeness circles', explain: 'Drag each person onto circles around the respondent; the inner circle is the closest.' },
  tiesDraw: { name: 'Who knows whom (draw)', explain: 'Drag one person onto another to say they know each other.' },
  tiesPiles: { name: 'Who knows whom (piles)', explain: 'Put people who know each other in the same pile.' },
  end: { name: 'End', explain: 'Thank-you text at the end.' },
};

/** Variable names the protocol's screens write, for checks and the codebook. */
export function protocolVariables(p: Protocol): { ego: Question[]; alter: { id: string; label: string; options?: Option[]; type: QuestionType }[]; generators: { id: string; label: string }[]; tieTypes: string[] } {
  const ego: Question[] = [];
  const alter: { id: string; label: string; options?: Option[]; type: QuestionType }[] = [];
  const generators: { id: string; label: string }[] = [];
  const tieTypes: string[] = [];
  for (const s of p.screens) {
    if (s.kind === 'egoForm') ego.push(...s.questions);
    else if (s.kind === 'alterForm') alter.push(...s.questions);
    else if (s.kind === 'alterBins' || s.kind === 'alterScale') alter.push({ id: s.variable, label: s.label, options: s.options, type: 'choice' });
    else if (s.kind === 'closeness') alter.push({ id: s.variable, label: s.label, type: 'number' });
    else if (s.kind === 'nameGenerator') generators.push({ id: s.id, label: s.prompt });
    else if ((s.kind === 'tiesDraw' || s.kind === 'tiesPiles') && !tieTypes.includes(s.tieType)) tieTypes.push(s.tieType);
  }
  return { ego, alter, generators, tieTypes };
}

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/** Problems that stop a protocol being used, in plain words. Empty when it is ready. */
export function protocolProblems(p: Protocol): string[] {
  const out: string[] = [];
  const v = protocolVariables(p);
  if (!p.screens.some((s) => s.kind === 'nameGenerator')) out.push('Add at least one name generator.');
  const ids = new Set<string>();
  for (const s of p.screens) {
    if (ids.has(s.id)) out.push(`Two screens have the ID "${s.id}".`);
    ids.add(s.id);
    if (s.kind === 'nameGenerator' && !NAME.test(`gen_${s.id}`)) out.push(`The name generator ID "${s.id}" can only have letters, digits and underscores.`);
  }
  const names = new Map<string, string>();
  for (const q of [...v.ego.map((x) => ({ ...x, where: 'respondent' })), ...v.alter.map((x) => ({ ...x, where: 'each person' }))]) {
    if (!NAME.test(q.id)) out.push(`"${q.id}" is not a usable variable name (letters, digits and underscores, starting with a letter, 32 at most).`);
    const key = `${q.where}:${q.id.toLowerCase()}`;
    if (names.has(key)) out.push(`The variable "${q.id}" is asked twice about ${q.where}.`);
    names.set(key, q.id);
    if ((q.type === 'choice') && !q.options?.length) out.push(`"${q.id}" needs answer choices.`);
  }
  for (const s of p.screens) {
    if ((s.kind === 'tiesDraw' || s.kind === 'tiesPiles') && !s.tieType.trim()) out.push(`The screen "${s.title}" needs a tie type.`);
    if (s.kind === 'closeness' && (s.rings < 2 || s.rings > 6)) out.push('Closeness circles need 2 to 6 rings.');
  }
  if (p.maxAlters < 1) out.push('Allow at least one person to be named.');
  return [...new Set(out)];
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function emptyProtocol(name: string, now = new Date()): Protocol {
  const at = now.toISOString();
  return { format: 'egocraft-protocol', version: 1, id: newId(), name, createdAt: at, modifiedAt: at, maxAlters: 15, screens: [] };
}

/** A blank screen of a kind, with a unique ID within the protocol. */
export function newScreen(kind: ScreenKind, p: Protocol): Screen {
  const used = new Set(p.screens.map((s) => s.id));
  let n = 1;
  const base = { nameGenerator: 'gen', alterForm: 'alters', egoForm: 'ego', alterBins: 'bins', alterScale: 'scale', closeness: 'close', tiesDraw: 'ties', tiesPiles: 'piles', intro: 'intro', consent: 'consent', end: 'end' }[kind];
  while (used.has(`${base}${n}`)) n++;
  const id = `${base}${n}`;
  const title = SCREEN_INFO[kind].name;
  switch (kind) {
    case 'intro': return { kind, id, title, prompt: 'Thank you for taking part. These questions are about the people in your life.' };
    case 'consent': return { kind, id, title, prompt: 'Your answers are kept private and used only for research. You can stop at any time.', required: true };
    case 'egoForm': return { kind, id, title, prompt: 'First, a few questions about you.', questions: [] };
    case 'nameGenerator': return { kind, id, title, prompt: 'Who are the people you talk with about things that matter to you?', max: null, offerRoster: true };
    case 'alterForm': return { kind, id, title, prompt: 'A few questions about each person.', questions: [] };
    case 'alterBins': return { kind, id, title, prompt: 'How do you know each person?', variable: `bins${n}`, label: 'How the respondent knows the person', options: [{ value: '1', label: 'Family' }, { value: '2', label: 'Friend' }, { value: '3', label: 'Work or school' }, { value: '4', label: 'Other' }] };
    case 'alterScale': return { kind, id, title, prompt: 'How often are you in touch with each person?', variable: `scale${n}`, label: 'How often in touch', options: [{ value: '1', label: 'Less than monthly' }, { value: '2', label: 'Monthly' }, { value: '3', label: 'Weekly' }, { value: '4', label: 'Daily' }] };
    case 'closeness': return { kind, id, title, prompt: 'Place each person on the circles: the closer you feel to them, the nearer the middle.', variable: n === 1 ? 'closeness' : `closeness${n}`, label: 'Closeness (higher = closer)', rings: 4 };
    case 'tiesDraw': return { kind, id, title, prompt: 'Which of these people know each other? Drag one person onto another, or tap two people.', tieType: 'knows' };
    case 'tiesPiles': return { kind, id, title, prompt: 'Put people who know each other in the same pile.', tieType: 'knows' };
    case 'end': return { kind, id, title, prompt: 'That is the end of the questions. Thank you!' };
  }
}

/** A ready-made protocol to start from: the important-matters name generator, a few interpreters, closeness and who-knows-whom. */
export function sampleProtocol(now = new Date()): Protocol {
  const p = emptyProtocol('Egocentric network interview (example)', now);
  const gender: Option[] = [{ value: '1', label: 'Woman' }, { value: '2', label: 'Man' }, { value: '3', label: 'Another gender' }];
  p.screens = [
    { kind: 'intro', id: 'intro1', title: 'Welcome', prompt: 'Thank you for taking part. These questions are about the people in your life. There are no right or wrong answers.' },
    { kind: 'consent', id: 'consent1', title: 'Consent', prompt: 'Your answers are kept private and used only for research. You can skip any question and stop at any time. Do you agree to take part?', required: true },
    { kind: 'egoForm', id: 'ego1', title: 'About you', prompt: 'First, a few questions about you.', questions: [
      { id: 'age', label: 'How old are you?', type: 'number', min: 0, max: 120 },
      { id: 'gender', label: 'What is your gender?', type: 'choice', options: gender },
    ] },
    { kind: 'nameGenerator', id: 'discuss', title: 'Important matters', prompt: 'From time to time, most people discuss important matters with other people. Looking back over the last six months, who are the people with whom you discussed matters important to you?', max: null, offerRoster: true },
    { kind: 'nameGenerator', id: 'help', title: 'Help', prompt: 'Who could you ask for help if you were sick or needed a hand around the house?', max: null, offerRoster: false },
    { kind: 'alterForm', id: 'alters1', title: 'About each person', prompt: 'A few questions about each person you named.', questions: [
      { id: 'alter_gender', label: 'Is this person a woman, a man, or another gender?', type: 'choice', options: gender },
      { id: 'alter_age', label: 'About how old is this person?', type: 'number', min: 0, max: 120 },
      { id: 'years_known', label: 'How many years have you known this person?', type: 'number', min: 0, max: 100 },
    ] },
    { kind: 'alterBins', id: 'relation', title: 'How you know them', prompt: 'How do you know each person? Drag each one into a box.', variable: 'relation', label: 'How the respondent knows the person', options: [{ value: '1', label: 'Family' }, { value: '2', label: 'Friend' }, { value: '3', label: 'Work or school' }, { value: '4', label: 'Neighbor' }, { value: '5', label: 'Other' }] },
    { kind: 'closeness', id: 'close', title: 'How close', prompt: 'Place each person on the circles: the closer you feel to them, the nearer the middle.', variable: 'closeness', label: 'Closeness (4 = closest ring)', rings: 4 },
    { kind: 'tiesDraw', id: 'knows', title: 'Who knows whom', prompt: 'Which of these people know each other? Drag one person onto another, or tap two people, to draw a line. Tap a line again to remove it.', tieType: 'knows' },
    { kind: 'end', id: 'end1', title: 'Thank you', prompt: 'That is the end of the questions. Thank you for your time!' },
  ];
  return p;
}

export function protocolFromJson(text: string): Protocol {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not an EgoCraft interview protocol (it is not valid JSON).');
  }
  const p = raw as Partial<Protocol>;
  if (p?.format !== 'egocraft-protocol') throw new Error('This is not an EgoCraft interview protocol.');
  if (p.version !== 1) throw new Error('This protocol was made by a newer EgoCraft. Update EgoCraft to use it.');
  if (!Array.isArray(p.screens)) throw new Error('This protocol file is incomplete.');
  return p as Protocol;
}

/** The questionnaire as plain text, screen by screen, with each variable's name and answer codes, for the codebook. */
export function protocolText(p: Protocol): string {
  const L: string[] = [`Questionnaire: ${p.name}`, `Up to ${p.maxAlters} people in all.`, ''];
  const opts = (o?: Option[]) => (o?.length ? ` Answers: ${o.map((x) => `${x.value} = ${x.label}`).join('; ')}.` : '');
  p.screens.forEach((s, i) => {
    L.push(`${i + 1}. ${s.title} (${SCREEN_INFO[s.kind].name})`);
    L.push(`   ${s.prompt}`);
    if (s.kind === 'egoForm' || s.kind === 'alterForm')
      for (const q of s.questions) L.push(`   - ${q.id}: ${q.label} [${q.type}${q.required ? ', required' : ''}]${opts(q.options)}`);
    if (s.kind === 'nameGenerator') L.push(`   Variable gen_${s.id} = 1 for everyone named here${s.max ? `; up to ${s.max} names` : ''}.`);
    if (s.kind === 'alterBins' || s.kind === 'alterScale') L.push(`   Variable ${s.variable}: ${s.label}.${opts(s.options)}`);
    if (s.kind === 'closeness') L.push(`   Variable ${s.variable}: ${s.label} (${s.rings} rings; ${s.rings} = the innermost, closest ring).`);
    if (s.kind === 'tiesDraw' || s.kind === 'tiesPiles') L.push(`   Tie type "${s.tieType}": every pair of people gets knows = 1 (tied) or 0 (not tied).`);
    L.push('');
  });
  return L.join('\n');
}
