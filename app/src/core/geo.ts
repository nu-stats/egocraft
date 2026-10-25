// Small geography helpers shared by the measures and the Husky Eye View link.

import type { Cell } from './data.ts';
import { idText } from './data.ts';

/** Kilometers between two points on the earth (haversine, mean radius 6,371 km). */
export function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A GEOID as text with its leading zeros (Excel often drops them). Tract 11 digits, county 5, state 2. */
export function geoidText(v: Cell | undefined): string | null {
  const s = idText(v);
  if (s === null || !/^\d+$/.test(s)) return null;
  const lengths = [2, 5, 11, 12, 15];
  // A code that already has a valid length is kept: 11 digits is a tract, not a block group missing its zero.
  if (lengths.includes(s.length)) return s;
  for (const len of lengths) if (s.length === len - 1) return s.padStart(len, '0');
  return s;
}

export const LEVEL_DIGITS = { state: 2, county: 5, tract: 11 } as const;
export type GeoLevel = keyof typeof LEVEL_DIGITS;

