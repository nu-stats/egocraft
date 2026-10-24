// Types for statRead.js (copied from Husky Eye View as plain JavaScript).

export interface StatColumn {
  name: string;
  label?: string;
  kind: 'numeric' | 'string' | 'date' | 'datetime';
  valueLabels?: Record<string, string>;
}

export interface StatTable {
  columns: StatColumn[];
  rows: (string | number | null)[][];
  title?: string;
  notes?: string[];
}

export function readDta(bytes: Uint8Array): StatTable;
export function readSav(bytes: Uint8Array): Promise<StatTable>;
export function readRData(bytes: Uint8Array): Promise<StatTable>;
