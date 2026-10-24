// Drawing one ego network as SVG (P4.2–P4.7): nodes colored and sized by
// any alter variable, line width by tie strength, line color and dash by tie
// type, an automatic legend, colorblind-safe colors. The SVG is a plain
// string, so the same drawing is shown on screen and saved as a file.

import type { Column } from '../core/data.ts';
import { categoryOf, columnIndex, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import type { Drawing, Shape } from './drawing.ts';
import { drawingToSvg } from './drawing.ts';
import type { LayoutKind, Positions } from './layout.ts';
import { layout } from './layout.ts';
import type { EgoNetwork, Slice } from './networks.ts';
import { conditionHolds, graphFor } from './networks.ts';

/** Okabe and Ito's colorblind-safe palette. */
export const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000'];
const SEQUENTIAL = ['#deebf7', '#9ecae1', '#4292c6', '#08519c', '#08306b'];
const DASHES = ['', '6 4', '2 3', '10 3 2 3'];

export interface SociogramOptions {
  colorBy: string | null;
  sizeBy: string | null;
  labelBy: 'id' | 'none' | string;
  showEgo: boolean;
  widthByStrength: boolean;
  styleByType: boolean;
  layout: LayoutKind;
  /** Alter variable for the rings layout (higher = closer) and sectors (groups). */
  ringBy: string | null;
  title: string;
}

export const DEFAULT_OPTIONS: SociogramOptions = { colorBy: null, sizeBy: null, labelBy: 'id', showEgo: true, widthByStrength: true, styleByType: true, layout: 'force', ringBy: null, title: '' };

export interface SociogramData {
  nodes: { id: string; row: number }[];
  edges: { a: number; b: number; weight: number; types: string[] }[];
}

/** The alters and ties to draw for one ego in a slice (ties per pair, with all their types). */
export function sociogramData(study: Study, net: EgoNetwork, slice: Slice): SociogramData {
  const g = graphFor(study, net, slice);
  const index = new Map(g.alterIds.map((id, i) => [id, i]));
  const pairs = new Map<string, { a: number; b: number; weight: number; types: string[] }>();
  const types = slice.tieTypes ? new Set(slice.tieTypes) : null;
  for (const t of net.ties) {
    if (t.state !== true) continue;
    const a = index.get(t.a);
    const b = index.get(t.b);
    if (a === undefined || b === undefined) continue;
    if (types && (t.type === null || !types.has(t.type))) continue;
    if (slice.minWeight !== null && t.weight < slice.minWeight) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const p = pairs.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), weight: 0, types: [] };
    p.weight = Math.max(p.weight, t.weight);
    if (t.type && !p.types.includes(t.type)) p.types.push(t.type);
    pairs.set(key, p);
  }
  return { nodes: g.alterIds.map((id, i) => ({ id, row: g.alterRows[i]! })), edges: [...pairs.values()] };
}

/** Positions for the data, using the ring/sector variable when the layout needs it. */
export function placeNodes(study: Study, data: SociogramData, opts: SociogramOptions, seed: string): Positions {
  const A = study.alters;
  const j = opts.ringBy ? columnIndex(A, opts.ringBy) : -1;
  return layout(opts.layout, {
    ids: data.nodes.map((n) => n.id),
    edges: data.edges.map((e) => [e.a, e.b] as [number, number]),
    ring: j >= 0 ? data.nodes.map((n) => numberOf(A.rows[n.row]![j])) : undefined,
    group: j >= 0 ? data.nodes.map((n) => categoryOf(A.columns[j], A.rows[n.row]![j])) : undefined,
    seed,
  });
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

export interface Legend {
  colors: { label: string; color: string }[];
  sizes: { label: string; r: number }[];
  types: { label: string; color: string; dash: string }[];
}

/** Category colors that stay the same across egos: categories of the whole alter file. */
export function colorScale(study: Study, column: string | null): ((row: number) => { color: string; label: string | null }) & { legend: Legend['colors'] } {
  const A = study.alters;
  const j = column ? columnIndex(A, column) : -1;
  if (j < 0) {
    const f = Object.assign(() => ({ color: PALETTE[0]!, label: null }), { legend: [] as Legend['colors'] });
    return f;
  }
  const col: Column = A.columns[j]!;
  const nums = A.rows.map((r) => numberOf(r[j])).filter((v): v is number => v !== null);
  const distinct = new Set(A.rows.map((r) => categoryOf(col, r[j])).filter((v): v is string => v !== null));
  if (col.kind === 'numeric' && !col.valueLabels && distinct.size > 8 && nums.length) {
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const step = (hi - lo) / SEQUENTIAL.length || 1;
    const bin = (v: number) => Math.min(SEQUENTIAL.length - 1, Math.floor((v - lo) / step));
    const legend = SEQUENTIAL.map((color, k) => ({ color, label: `${fmt(lo + k * step)}–${fmt(lo + (k + 1) * step)}` }));
    return Object.assign(
      (row: number) => {
        const v = numberOf(A.rows[row]![j]);
        return v === null ? { color: '#bbbbbb', label: null } : { color: SEQUENTIAL[bin(v)]!, label: String(v) };
      },
      { legend: [...legend, { color: '#bbbbbb', label: 'Missing' }] },
    );
  }
  const cats = [...distinct].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const color = (c: string) => (cats.indexOf(c) < PALETTE.length ? PALETTE[cats.indexOf(c)]! : '#888888');
  return Object.assign(
    (row: number) => {
      const c = categoryOf(col, A.rows[row]![j]);
      return c === null ? { color: '#bbbbbb', label: null } : { color: color(c), label: c };
    },
    { legend: [...cats.slice(0, PALETTE.length).map((c) => ({ label: c, color: color(c) })), ...(cats.length > PALETTE.length ? [{ label: 'Other', color: '#888888' }] : []), { label: 'Missing', color: '#bbbbbb' }] },
  );
}

export interface DrawInput {
  study: Study;
  data: SociogramData;
  positions: Positions;
  opts: SociogramOptions;
  tieTypes: string[];
  width?: number;
  height?: number;
  /** Alter IDs to draw faded (dropped since the last wave) and marked (new). */
  faded?: Set<string>;
  marked?: Set<string>;
}

/** The drawing as shapes (for SVG and PDF). Labels are plain text; nothing outside is referenced. */
export function sociogramDrawing(d: DrawInput): Drawing {
  const { study, data, positions, opts } = d;
  const A = study.alters;
  const W = d.width ?? 640;
  const legendW = 190;
  const H = d.height ?? 520;
  const plot = Math.min(W - legendW, H - (opts.title ? 30 : 0)) - 20;
  const cx = 10 + plot / 2;
  const cy = (opts.title ? 30 : 0) + 10 + plot / 2;
  const px = (x: number) => cx + (x * plot) / 2.2;
  const py = (y: number) => cy + (y * plot) / 2.2;
  const colors = colorScale(study, opts.colorBy);
  const sj = opts.sizeBy ? columnIndex(A, opts.sizeBy) : -1;
  const sizeVals = sj >= 0 ? A.rows.map((r) => numberOf(r[sj])).filter((v): v is number => v !== null) : [];
  const sLo = sizeVals.length ? Math.min(...sizeVals) : 0;
  const sHi = sizeVals.length ? Math.max(...sizeVals) : 1;
  const radius = (row: number) => {
    if (sj < 0) return 9;
    const v = numberOf(A.rows[row]![sj]);
    if (v === null) return 6;
    return 6 + (sHi > sLo ? ((v - sLo) / (sHi - sLo)) * 10 : 5);
  };
  const lj = opts.labelBy !== 'id' && opts.labelBy !== 'none' ? columnIndex(A, opts.labelBy) : -1;
  const labelOf = (n: { id: string; row: number }) => (opts.labelBy === 'none' ? '' : lj >= 0 ? (categoryOf(A.columns[lj], A.rows[n.row]![lj]) ?? '') : n.id);
  const typeIndex = (t: string) => Math.max(0, d.tieTypes.indexOf(t));
  const maxW = Math.max(1, ...data.edges.map((e) => e.weight));
  const ink = '#1d2733';
  const out: Shape[] = [{ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: '#ffffff' }];
  if (opts.title) out.push({ kind: 'text', x: 10, y: 20, text: opts.title, size: 15, bold: true, fill: ink });
  const pos = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  if (opts.showEgo)
    for (const n of data.nodes) {
      const p = pos(n.id);
      out.push({ kind: 'line', x1: px(0), y1: py(0), x2: px(p.x), y2: py(p.y), stroke: '#c9d1d9', width: 1 });
    }
  for (const e of data.edges) {
    const a = pos(data.nodes[e.a]!.id);
    const b = pos(data.nodes[e.b]!.id);
    const types = e.types.length ? e.types : [''];
    types.forEach((t, k) => {
      // Several tie types on one pair: parallel lines, side by side.
      const off = (k - (types.length - 1) / 2) * 3;
      const dx = py(b.y) - py(a.y);
      const dy = px(a.x) - px(b.x);
      const len = Math.max(1, Math.hypot(dx, dy));
      const ox = (dx / len) * off;
      const oy = (dy / len) * off;
      const ti = t ? typeIndex(t) : 0;
      const color = opts.styleByType && t ? PALETTE[(ti + 2) % PALETTE.length]! : '#57606a';
      const dash = opts.styleByType && t ? DASHES[ti % DASHES.length]! : '';
      const width = opts.widthByStrength ? 1 + (2.5 * e.weight) / maxW : 1.5;
      out.push({ kind: 'line', x1: px(a.x) + ox, y1: py(a.y) + oy, x2: px(b.x) + ox, y2: py(b.y) + oy, stroke: color, width, ...(dash ? { dash } : {}) });
    });
  }
  if (opts.showEgo) {
    out.push({ kind: 'circle', cx: px(0), cy: py(0), r: 10, fill: ink });
    out.push({ kind: 'text', x: px(0), y: py(0) + 24, text: 'Ego', size: 12, bold: true, anchor: 'middle', fill: ink });
  }
  for (const n of data.nodes) {
    const p = pos(n.id);
    const c = colors(n.row);
    const r = radius(n.row);
    const faded = d.faded?.has(n.id);
    out.push({ kind: 'circle', cx: px(p.x), cy: py(p.y), r, fill: c.color, stroke: '#ffffff', strokeWidth: 1.5, id: n.id, ...(faded ? { opacity: 0.3 } : {}) });
    if (d.marked?.has(n.id)) out.push({ kind: 'circle', cx: px(p.x), cy: py(p.y), r: r + 4, fill: null, stroke: '#D55E00', strokeWidth: 2 });
    const label = labelOf(n);
    if (label) out.push({ kind: 'text', x: px(p.x), y: py(p.y) - r - 4, text: label, size: 12, anchor: 'middle', fill: ink, ...(faded ? { opacity: 0.4 } : {}) });
  }
  // Legend
  let ly = (opts.title ? 30 : 0) + 20;
  const lx = W - legendW + 10;
  const head = (t: string) => {
    const short = t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t;
    out.push({ kind: 'text', x: lx, y: ly, text: short, size: 12, bold: true, fill: ink, ...(short !== t ? { title: t } : {}) });
    ly += 18;
  };
  const item = (x: number, text: string) => out.push({ kind: 'text', x, y: ly, text, size: 12, fill: ink });
  if (opts.colorBy && colors.legend.length) {
    head(A.columns[columnIndex(A, opts.colorBy)]?.label ?? opts.colorBy);
    for (const c of colors.legend) {
      out.push({ kind: 'circle', cx: lx + 6, cy: ly - 4, r: 6, fill: c.color });
      item(lx + 18, c.label);
      ly += 17;
    }
    ly += 8;
  }
  if (opts.styleByType && d.tieTypes.length) {
    head('Tie type');
    d.tieTypes.forEach((t, ti) => {
      const dash = DASHES[ti % DASHES.length]!;
      out.push({ kind: 'line', x1: lx, y1: ly - 4, x2: lx + 14, y2: ly - 4, stroke: PALETTE[(ti + 2) % PALETTE.length]!, width: 2.5, ...(dash ? { dash } : {}) });
      item(lx + 18, t);
      ly += 17;
    });
    ly += 8;
  }
  if (sj >= 0) {
    head(`Size: ${A.columns[sj]?.label ?? opts.sizeBy}`);
    out.push({ kind: 'text', x: lx, y: ly, text: `${fmt(sLo)} (small) – ${fmt(sHi)} (large)`, size: 12, fill: '#57606a' });
    ly += 22;
  }
  if (d.faded?.size || d.marked?.size) {
    head('Since last wave');
    out.push({ kind: 'circle', cx: lx + 6, cy: ly - 4, r: 6, fill: '#888888', opacity: 0.3 });
    item(lx + 18, 'dropped');
    ly += 17;
    out.push({ kind: 'circle', cx: lx + 6, cy: ly - 4, r: 7, fill: null, stroke: '#D55E00', strokeWidth: 2 });
    item(lx + 18, 'new');
  }
  return { width: W, height: H, shapes: out, frame: { cx, cy, scale: plot / 2.2 } };
}

/** The SVG text. */
export function sociogramSvg(d: DrawInput): string {
  return drawingToSvg(sociogramDrawing(d));
}

/** Whether an alter passes a slice's conditions (for listing alters beside a drawing). */
export function alterInSlice(study: Study, row: number, slice: Slice): boolean {
  return slice.alterConditions.every((c) => {
    const j = columnIndex(study.alters, c.column);
    return j >= 0 && conditionHolds(study.alters.columns[j], study.alters.rows[row]![j], c);
  });
}
