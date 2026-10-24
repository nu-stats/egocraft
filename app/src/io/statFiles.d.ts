// Types for statFiles.js (copied from Husky Eye View as plain JavaScript).

export interface StatVariable {
  name: string;
  label?: string;
  kind: 'numeric' | 'string';
  valueLabels?: Record<string, string>;
}

export interface StatDataset {
  title?: string;
  variables: StatVariable[];
  rows: (string | number | null)[][];
}

export interface StatWritten {
  bytes: Uint8Array;
  renames: [string, string][];
  notes: string[];
}

export function writeDta(data: StatDataset, options?: { now?: Date }): StatWritten;
export function writeSav(data: StatDataset, options?: { now?: Date }): StatWritten;
export function writeRData(data: StatDataset, options?: { now?: Date; rds?: boolean }): StatWritten;
export function programNames(variables: StatVariable[], program: 'stata' | 'spss' | 'r'): { names: string[]; renames: [string, string][] };
