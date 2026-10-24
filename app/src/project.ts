// A project: the study plus the analysis choices (subgroups and measures),
// saved together as one .egocraft file (P1.7).

import type { Study } from './core/study.ts';
import { studyFromJson } from './core/study.ts';
import type { MeasureRequest } from './measures/measures.ts';
import type { Slice } from './network/networks.ts';

export interface Project {
  format: 'egocraft-project';
  version: 1;
  study: Study;
  slices: Slice[];
  measures: MeasureRequest[];
  /** Alter positions placed by hand, per ego ID (shared by all waves): alter ID → x, y. */
  layouts?: Record<string, Record<string, { x: number; y: number }>>;
}

export const DEFAULT_MEASURES: MeasureRequest[] = [
  { spec: { kind: 'size' }, sliceId: 'all' },
  { spec: { kind: 'density' }, sliceId: 'all' },
  { spec: { kind: 'meanDegree' }, sliceId: 'all' },
  { spec: { kind: 'egoBetweennessNorm' }, sliceId: 'all' },
  { spec: { kind: 'effectiveSize' }, sliceId: 'all' },
  { spec: { kind: 'efficiency' }, sliceId: 'all' },
  { spec: { kind: 'constraint' }, sliceId: 'all' },
  { spec: { kind: 'components' }, sliceId: 'all' },
  { spec: { kind: 'isolates' }, sliceId: 'all' },
];

export function newProject(study: Study): Project {
  return { format: 'egocraft-project', version: 1, study, slices: [], measures: DEFAULT_MEASURES };
}

export function projectToJson(p: Project): string {
  return JSON.stringify(p);
}

export function projectFromJson(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This is not an EgoCraft project file (it is not valid JSON).');
  }
  const p = raw as Omit<Partial<Project>, 'format'> & { format?: string };
  if (p?.format === 'egocraft-study') return newProject(studyFromJson(text));
  if (p?.format !== 'egocraft-project') throw new Error('This is not an EgoCraft project file.');
  if (p.version !== 1) throw new Error('This project was saved by a newer EgoCraft. Update EgoCraft to open it.');
  return {
    format: 'egocraft-project',
    version: 1,
    study: studyFromJson(JSON.stringify(p.study)),
    slices: Array.isArray(p.slices) ? p.slices : [],
    measures: Array.isArray(p.measures) ? p.measures : DEFAULT_MEASURES,
    ...(p.layouts && typeof p.layouts === 'object' ? { layouts: p.layouts } : {}),
  };
}
