// A made-up sample study (CC0), for trying EgoCraft and for tests: 200 egos
// in two survey waves, alters with four relationship types, alter–alter ties
// of three kinds, some pairs not asked (egos with more than 10 alters were
// asked about the first 10 only), a few missing answers on purpose, and
// made-up census tract codes for maps. No real people.

import type { Cell, Column, DataTable } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { newStudy, withHistory } from '../core/study.ts';

/** Mulberry32: a small seeded random number generator, so the sample is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENDER = { '1': 'Woman', '2': 'Man', '3': 'Nonbinary' };
const RACE = { '1': 'White', '2': 'Black', '3': 'Hispanic or Latino', '4': 'Asian', '5': 'Another race' };
const RELATION = { '1': 'Kin', '2': 'Friend', '3': 'Coworker', '4': 'Neighbor' };
const CLOSE = { '1': 'Not very close', '2': 'Somewhat close', '3': 'Close', '4': 'Very close' };

export interface SampleTables {
  egos: DataTable;
  alters: DataTable;
  ties: DataTable;
}

export function sampleTables(seed = 20261024): SampleTables {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[], weights?: number[]): T => {
    if (!weights) return xs[Math.floor(r() * xs.length)]!;
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r() * total;
    for (let i = 0; i < xs.length; i++) if ((x -= weights[i]!) < 0) return xs[i]!;
    return xs[xs.length - 1]!;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const tract = () => `25025${String(100 + Math.floor(r() * 1800)).padStart(4, '0')}${pick(['00', '01', '02'])}`;

  const egoCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'numeric' },
    { name: 'wave', label: 'Survey wave', kind: 'numeric' },
    { name: 'gender', label: 'Respondent gender', kind: 'numeric', valueLabels: GENDER },
    { name: 'age', label: 'Respondent age (years)', kind: 'numeric' },
    { name: 'race', label: 'Respondent race and ethnicity', kind: 'numeric', valueLabels: RACE },
    { name: 'educ', label: 'Years of schooling', kind: 'numeric' },
    { name: 'tract', label: 'Home census tract (made up)', kind: 'string' },
  ];
  const alterCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'numeric' },
    { name: 'wave', label: 'Survey wave', kind: 'numeric' },
    { name: 'alter_id', label: 'Alter number', kind: 'numeric' },
    { name: 'relation', label: 'How the respondent knows the alter', kind: 'numeric', valueLabels: RELATION },
    { name: 'gender', label: 'Alter gender', kind: 'numeric', valueLabels: GENDER },
    { name: 'age', label: 'Alter age (years)', kind: 'numeric' },
    { name: 'race', label: 'Alter race and ethnicity', kind: 'numeric', valueLabels: RACE },
    { name: 'closeness', label: 'How close the respondent feels', kind: 'numeric', valueLabels: CLOSE },
    { name: 'years_known', label: 'Years known', kind: 'numeric' },
    { name: 'contact', label: 'Days in touch per month', kind: 'numeric' },
    { name: 'tract', label: 'Alter census tract (made up)', kind: 'string' },
  ];
  const tieCols: Column[] = [
    { name: 'ego_id', label: 'Respondent ID', kind: 'numeric' },
    { name: 'wave', label: 'Survey wave', kind: 'numeric' },
    { name: 'alter_a', label: 'First alter', kind: 'numeric' },
    { name: 'alter_b', label: 'Second alter', kind: 'numeric' },
    { name: 'tie_type', label: 'Kind of tie between the alters', kind: 'string' },
    { name: 'knows', label: 'The two alters know each other (1 = yes, empty = not asked)', kind: 'numeric' },
    { name: 'strength', label: 'How well they know each other (1–3)', kind: 'numeric' },
  ];
  const egoRows: Cell[][] = [];
  const alterRows: Cell[][] = [];
  const tieRows: Cell[][] = [];

  interface Alter { id: number; relation: number; gender: number; age: number; race: number; closeness: number; years: number; contact: number; tract: string }
  for (let e = 0; e < 200; e++) {
    const egoId = 101 + e;
    const gender = pick([1, 2, 3], [51, 47, 2]);
    const race = pick([1, 2, 3, 4, 5], [55, 15, 18, 8, 4]);
    let age = Math.round(Math.min(85, Math.max(19, 45 + 15 * normal())));
    const educ = Math.round(Math.min(20, Math.max(8, 14 + 2.5 * normal())));
    const home = tract();
    const size0 = r() < 0.03 ? 0 : Math.max(1, Math.min(15, Math.round(6 + 3 * normal())));
    const makeAlter = (id: number): Alter => {
      const relation = pick([1, 2, 3, 4], [40, 35, 15, 10]);
      const sameRace = r() < 0.7;
      return {
        id,
        relation,
        gender: r() < 0.6 ? gender : pick([1, 2], [50, 50]),
        age: Math.round(Math.min(95, Math.max(5, age + (relation === 1 ? 20 * normal() : 8 * normal())))),
        race: sameRace ? race : pick([1, 2, 3, 4, 5], [55, 15, 18, 8, 4]),
        closeness: pick([1, 2, 3, 4], relation === 1 ? [5, 20, 35, 40] : [15, 35, 30, 20]),
        years: relation === 1 ? Math.min(age, Math.round(age * (0.4 + 0.6 * r()))) : Math.round(1 + 15 * r()),
        contact: Math.round(Math.min(30, Math.max(0, 8 + 6 * normal()))),
        tract: r() < 0.35 ? home : tract(),
      };
    };
    let alters: Alter[] = Array.from({ length: size0 }, (_, i) => makeAlter(i + 1));
    const pairTies = new Map<string, { types: string[]; strength: number }>();
    for (let wave = 1; wave <= 2; wave++) {
      if (wave === 2) {
        if (e % 10 === 9) continue; // 10% did not take part in wave 2
        age += 2;
        const kept = alters.filter(() => r() < 0.65);
        const next = Math.max(0, ...alters.map((a) => a.id)) + 1;
        const added = Array.from({ length: Math.max(0, Math.round(alters.length * 0.35 + normal())) }, (_, i) => makeAlter(next + i));
        alters = [...kept, ...added].slice(0, 15);
      }
      egoRows.push([egoId, wave, gender, age, race, r() < 0.02 ? null : educ, home]);
      for (const a of alters) {
        alterRows.push([egoId, wave, a.id, a.relation, a.gender, r() < 0.04 ? null : a.age, a.race, a.closeness, a.years, r() < 0.03 ? null : a.contact, a.tract]);
      }
      // Ties: likelier between kin, between alters of the same relation and race.
      const asked = alters.slice(0, 10).map((a) => a.id);
      for (let i = 0; i < alters.length; i++)
        for (let k = i + 1; k < alters.length; k++) {
          const a = alters[i]!;
          const b = alters[k]!;
          const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
          if (!asked.includes(a.id) || !asked.includes(b.id)) {
            tieRows.push([egoId, wave, a.id, b.id, null, null, null]);
            continue;
          }
          const before = pairTies.get(key);
          let p = 0.15;
          if (a.relation === b.relation) p += 0.35;
          if (a.relation === 1 && b.relation === 1) p += 0.35;
          if (a.race === b.race) p += 0.05;
          if (a.tract === b.tract) p += 0.1;
          if (wave === 2 && before) p = 0.85;
          if (r() >= Math.min(0.95, p)) {
            pairTies.delete(key);
            continue;
          }
          const types: string[] = [];
          if (a.relation === 1 && b.relation === 1) types.push('kin');
          if (a.relation === 3 && b.relation === 3 && r() < 0.8) types.push('work');
          if (!types.length || r() < 0.3) types.push('friend');
          const strength = before?.strength ?? pick([1, 2, 3], [30, 40, 30]);
          pairTies.set(key, { types, strength });
          for (const t of types) tieRows.push([egoId, wave, a.id, b.id, t, 1, strength]);
        }
    }
  }
  return {
    egos: { name: 'sample-egos.csv', columns: egoCols, rows: egoRows },
    alters: { name: 'sample-alters.csv', columns: alterCols, rows: alterRows },
    ties: { name: 'sample-ties.csv', columns: tieCols, rows: tieRows },
  };
}

/** The sample as a ready study, mapping filled in. */
export function sampleStudy(now = new Date()): Study {
  const t = sampleTables();
  const s = newStudy('Sample study (made up)', now);
  return withHistory(
    {
      ...s,
      egos: t.egos,
      alters: t.alters,
      ties: t.ties,
      mapping: {
        egoId: 'ego_id',
        egoWave: 'wave',
        alterEgoId: 'ego_id',
        alterId: 'alter_id',
        alterWave: 'wave',
        egoAlterStrength: 'closeness',
        tieEgoId: 'ego_id',
        tieA: 'alter_a',
        tieB: 'alter_b',
        tieType: 'tie_type',
        tieWeight: 'strength',
        tieValue: 'knows',
        tieWave: 'wave',
      },
    },
    { kind: 'import', text: 'Opened the made-up sample study: 200 egos in two waves, with alters and alter–alter ties.' },
    now,
  );
}
