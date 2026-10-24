// Step 6: sociograms. One ego, one ego across waves (same layout), or a
// grid of egos sorted by a variable or a measure; saved as SVG, PNG or
// PDF. In "one ego", alters can be dragged into place; the layout is kept.

import { useMemo, useRef, useState } from 'react';
import { drawingToPdf } from '../export/pdf.ts';
import type { Drawing } from '../network/drawing.ts';
import { combineDrawings, drawingToSvg } from '../network/drawing.ts';
import { columnIndex, numberOf } from '../core/data.ts';
import type { Study } from '../core/study.ts';
import { mappingProblems } from '../core/study.ts';
import * as S from '../measures/structure.ts';
import type { LayoutKind, Positions } from '../network/layout.ts';
import type { EgoNetwork, Slice, StudyNetworks } from '../network/networks.ts';
import { ALL, buildNetworks, graphFor } from '../network/networks.ts';
import type { SociogramData, SociogramOptions } from '../network/sociogram.ts';
import { DEFAULT_OPTIONS, placeNodes, sociogramData, sociogramDrawing } from '../network/sociogram.ts';
import type { Notify } from './common.tsx';
import { ColumnSelect, download, Panel } from './common.tsx';

type Mode = 'one' | 'waves' | 'grid';

const egoName = (n: EgoNetwork) => (n.wave === null ? `Ego ${n.id}` : `Ego ${n.id}, wave ${n.wave}`);

/** One layout for every wave of an ego: alters placed once, on all waves' alters and ties together. */
function sharedPositions(study: Study, waves: EgoNetwork[], slice: Slice, opts: SociogramOptions, seed: string): Positions {
  const nodes = new Map<string, { id: string; row: number }>();
  const edges = new Map<string, [string, string]>();
  for (const net of waves) {
    const d = sociogramData(study, net, slice);
    for (const n of d.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const e of d.edges) {
      const a = d.nodes[e.a]!.id;
      const b = d.nodes[e.b]!.id;
      edges.set(a < b ? `${a}-${b}` : `${b}-${a}`, [a, b]);
    }
  }
  const list = [...nodes.values()];
  const index = new Map(list.map((n, i) => [n.id, i]));
  const merged: SociogramData = { nodes: list, edges: [...edges.values()].map(([a, b]) => ({ a: index.get(a)!, b: index.get(b)!, weight: 1, types: [] })) };
  return placeNodes(study, merged, opts, seed);
}

async function svgToPng(svg: string, scale = 2): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The picture could not be turned into a PNG.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('The picture could not be turned into a PNG.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

type SortKey = { kind: 'ego'; column: string } | { kind: 'measure'; measure: 'size' | 'density' | 'constraint' | 'effsize' };

function sortValue(study: Study, net: EgoNetwork, slice: Slice, key: SortKey): number | null {
  if (key.kind === 'ego') {
    const j = columnIndex(study.egos, key.column);
    return j < 0 ? null : numberOf(study.egos.rows[net.row]![j]);
  }
  const g = graphFor(study, net, slice);
  if (key.measure === 'size') return g.n;
  if (key.measure === 'density') return S.density(g, study.settings.missingPairs);
  if (key.measure === 'effsize') return S.effectiveSize(g);
  return S.constraint(g);
}

type Layouts = Record<string, Record<string, { x: number; y: number }>>;

export function SociogramView({ study, slices, notify, layouts, onLayouts }: { study: Study; slices: Slice[]; notify: Notify; layouts: Layouts; onLayouts: (l: Layouts) => void }) {
  const ready = study.egos.rows.length > 0 && mappingProblems(study).length === 0;
  const nets: StudyNetworks | null = useMemo(() => (ready ? buildNetworks(study) : null), [study, ready]);
  const [mode, setMode] = useState<Mode>('one');
  const [egoKey, setEgoKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sliceId, setSliceId] = useState('all');
  const [opts, setOpts] = useState<SociogramOptions>({ ...DEFAULT_OPTIONS });
  const [count, setCount] = useState(12);
  const [sort, setSort] = useState<SortKey>({ kind: 'measure', measure: 'size' });
  const [descending, setDescending] = useState(true);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  if (!study.egos.rows.length) return <div className="empty">Import your files first.</div>;
  if (!nets) return <div className="empty">Choose the columns first.</div>;
  const slice = [ALL, ...slices].find((s) => s.id === sliceId) ?? ALL;
  const alterCols = study.alters.columns.filter((c) => ![study.mapping.alterEgoId, study.mapping.alterId, study.mapping.alterWave].includes(c.name));
  const numericAlter = alterCols.filter((c) => c.kind === 'numeric').map((c) => c.name);
  const egoNumeric = study.egos.columns.filter((c) => c.kind === 'numeric' && c.name !== study.mapping.egoId).map((c) => c.name);
  const current = (egoKey && nets.byKey.get(egoKey)) || nets.egos.find((n) => n.alters.length >= 5) || nets.egos[0]!;
  const set = <K extends keyof SociogramOptions>(k: K, v: SociogramOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const draw = (net: EgoNetwork, positions?: Positions, extra?: { marked?: Set<string>; width?: number; height?: number; title?: string }) => {
    const data = sociogramData(study, net, slice);
    const o = { ...opts, title: extra?.title ?? opts.title ?? '' };
    return sociogramDrawing({ study, data, positions: positions ?? placeNodes(study, data, o, net.id), opts: o, tieTypes: nets.tieTypes, marked: extra?.marked, width: extra?.width, height: extra?.height });
  };

  let svgs: Drawing[] = [];
  let cols = 1;
  let size = { w: 640, h: 520 };
  const sameEgo = nets.egos.filter((n) => n.id === current.id);
  const caption = (n: EgoNetwork) => `${egoName(n)}${slice.id === 'all' ? '' : ` (${slice.label})`}`;
  if (mode === 'one') {
    const auto = sameEgo.length > 1 ? sharedPositions(study, sameEgo, slice, opts, current.id) : placeNodes(study, sociogramData(study, current, slice), opts, current.id);
    // Alters placed by hand keep their place; the one being dragged follows the pointer.
    const pos = new Map(auto);
    for (const [id, p] of Object.entries(layouts[current.id] ?? {})) pos.set(id, p);
    if (drag) pos.set(drag.id, { x: drag.x, y: drag.y });
    svgs = [draw(current, pos, { title: opts.title || caption(current), width: 900, height: 620 })];
  } else if (mode === 'waves') {
    const pos = new Map(sharedPositions(study, sameEgo, slice, opts, current.id));
    for (const [id, p] of Object.entries(layouts[current.id] ?? {})) pos.set(id, p);
    size = { w: 520, h: 440 };
    cols = Math.min(3, sameEgo.length);
    svgs = sameEgo.map((n, i) => {
      const before = i > 0 ? new Set(sameEgo[i - 1]!.alters.map((a) => a.id)) : null;
      const marked = before ? new Set(n.alters.map((a) => a.id).filter((id) => !before.has(id))) : undefined;
      return draw(n, pos, { marked, width: size.w, height: size.h, title: caption(n) });
    });
  } else {
    const scored = nets.egos.map((n) => ({ n, v: sortValue(study, n, slice, sort) })).filter((x) => x.v !== null);
    scored.sort((a, b) => (descending ? b.v! - a.v! : a.v! - b.v!));
    size = { w: 420, h: 340 };
    cols = 3;
    svgs = scored.slice(0, count).map(({ n, v }) => draw(n, undefined, { width: size.w, height: size.h, title: `${caption(n)}: ${Math.round(v! * 1000) / 1000}` }));
  }
  const whole = svgs.length === 1 ? svgs[0]! : combineDrawings(svgs, cols);
  const wholeSvg = drawingToSvg(whole);
  const placed = Object.keys(layouts[current.id] ?? {}).length;
  const toLayout = (e: { clientX: number; clientY: number }) => {
    const svg = box.current?.querySelector('svg');
    const f = svgs[0]?.frame;
    if (!svg || !f) return null;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * whole.width;
    const sy = ((e.clientY - r.top) / r.height) * whole.height;
    const clamp = (v: number) => Math.max(-1.05, Math.min(1.05, v));
    return { x: clamp((sx - f.cx) / f.scale), y: clamp((sy - f.cy) / f.scale) };
  };
  const base = `${study.name} sociogram${mode === 'one' ? ` ${current.id}${current.wave ? `-w${current.wave}` : ''}` : mode === 'waves' ? ` ${current.id} waves` : ' grid'}`.replace(/[\\/:*?"<>|]/g, ' ');
  const shown = nets.egos.filter((n) => !filter || n.id.includes(filter.trim()));

  return (
    <div className="page">
      <h1>Sociograms</h1>
      <Panel>
        <div className="tabs">
          {(['one', 'waves', 'grid'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} disabled={m === 'waves' && nets.waves.length < 2}>
              {{ one: 'One ego', waves: 'Across waves', grid: 'Side by side' }[m]}
            </button>
          ))}
        </div>
        <div className="grid3">
          {mode !== 'grid' ? (
            <label>
              Ego
              <div className="row">
                <input type="search" placeholder="Find an ID" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 100 }} />
                <select value={current.key} onChange={(e) => setEgoKey(e.target.value)}>
                  {shown.slice(0, 2000).map((n) => (
                    <option key={n.key} value={n.key}>
                      {egoName(n)} ({n.alters.length} alters)
                    </option>
                  ))}
                </select>
              </div>
            </label>
          ) : (
            <label>
              Sort by
              <div className="row">
                <select
                  value={sort.kind === 'ego' ? `ego:${sort.column}` : `m:${sort.measure}`}
                  onChange={(e) => {
                    const [k, v] = e.target.value.split(':') as [string, string];
                    setSort(k === 'ego' ? { kind: 'ego', column: v } : { kind: 'measure', measure: v as 'size' });
                  }}
                >
                  <option value="m:size">Size</option>
                  <option value="m:density">Density</option>
                  <option value="m:effsize">Effective size</option>
                  <option value="m:constraint">Constraint</option>
                  {egoNumeric.map((c) => (
                    <option key={c} value={`ego:${c}`}>Ego’s {c}</option>
                  ))}
                </select>
                <select value={descending ? 'd' : 'a'} onChange={(e) => setDescending(e.target.value === 'd')}>
                  <option value="d">highest first</option>
                  <option value="a">lowest first</option>
                </select>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[6, 12, 24].map((n) => <option key={n} value={n}>{n} egos</option>)}
                </select>
              </div>
            </label>
          )}
          <label>
            Subgroup
            <select value={sliceId} onChange={(e) => setSliceId(e.target.value)}>
              {[ALL, ...slices].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>
            Layout
            <select value={opts.layout} onChange={(e) => set('layout', e.target.value as LayoutKind)}>
              <option value="force">Spring (ties pull alters together)</option>
              <option value="circle">Circle</option>
              <option value="rings">Rings (closest inside)</option>
              <option value="sectors">Sectors (one wedge per group)</option>
            </select>
          </label>
          {opts.layout === 'rings' || opts.layout === 'sectors' ? (
            <label>
              {opts.layout === 'rings' ? 'Rings by (higher = closer)' : 'Sectors by'}
              <ColumnSelect value={opts.ringBy} columns={(opts.layout === 'rings' ? numericAlter : alterCols.map((c) => c.name))} onChange={(v) => set('ringBy', v)} />
            </label>
          ) : null}
          <label>
            Color alters by
            <ColumnSelect value={opts.colorBy} columns={alterCols.map((c) => c.name)} onChange={(v) => set('colorBy', v)} />
          </label>
          <label>
            Size alters by
            <ColumnSelect value={opts.sizeBy} columns={numericAlter} onChange={(v) => set('sizeBy', v)} />
          </label>
          <label>
            Labels
            <select value={opts.labelBy} onChange={(e) => set('labelBy', e.target.value)}>
              <option value="id">Alter ID</option>
              <option value="none">None</option>
              {alterCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="row"><input type="checkbox" checked={opts.showEgo} onChange={(e) => set('showEgo', e.target.checked)} /> Show the ego</label>
          <label className="row"><input type="checkbox" checked={opts.widthByStrength} onChange={(e) => set('widthByStrength', e.target.checked)} /> Line width by tie strength</label>
          <label className="row"><input type="checkbox" checked={opts.styleByType} onChange={(e) => set('styleByType', e.target.checked)} /> Color lines by tie type</label>
        </div>
      </Panel>
      <Panel
        actions={
          <>
            <button onClick={() => download(`${base}.svg`, wholeSvg, 'image/svg+xml')}>Save SVG</button>
            <button onClick={() => download(`${base}.pdf`, drawingToPdf(whole, base), 'application/pdf')}>Save PDF</button>
            <button
              onClick={async () => {
                try {
                  download(`${base}.png`, await svgToPng(wholeSvg, 3), 'image/png');
                } catch (e) {
                  notify((e as Error).message, 'error');
                }
              }}
            >
              Save PNG (high resolution)
            </button>
          </>
        }
        title={mode === 'grid' ? `${svgs.length} egos` : undefined}
      >
        {mode === 'one' ? (
          <>
            <div
              ref={box}
              className="svgbox"
              style={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'default' }}
              onPointerDown={(e) => {
                const id = (e.target as Element).getAttribute?.('data-id');
                const p = id ? toLayout(e) : null;
                if (!id || !p) return;
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                setDrag({ id, ...p });
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                const p = toLayout(e);
                if (p) setDrag({ id: drag.id, ...p });
              }}
              onPointerUp={() => {
                if (!drag) return;
                onLayouts({ ...layouts, [current.id]: { ...(layouts[current.id] ?? {}), [drag.id]: { x: drag.x, y: drag.y } } });
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
              dangerouslySetInnerHTML={{ __html: wholeSvg }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted small">Drag an alter to move it; it stays there, in every wave, and in the saved study.</span>
              {placed ? (
                <button
                  className="link"
                  onClick={() => {
                    const next = { ...layouts };
                    delete next[current.id];
                    onLayouts(next);
                  }}
                >
                  Undo hand placement ({placed} alter{placed === 1 ? '' : 's'})
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="thumbs" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mode === 'waves' ? 380 : 300}px, 1fr))` }}>
            {svgs.map((s, i) => <div key={i} className="svgbox" dangerouslySetInnerHTML={{ __html: drawingToSvg(s) }} />)}
          </div>
        )}
        {mode === 'waves' ? <p className="muted small" style={{ marginTop: 8 }}>Alters keep their place in every wave. A ring marks an alter named for the first time.</p> : null}
        {sameEgo.length > 1 && mode === 'one' ? <p className="muted small" style={{ marginTop: 8 }}>This ego has {sameEgo.length} waves; the layout is shared across them, so the pictures can be compared.</p> : null}
      </Panel>
    </div>
  );
}
