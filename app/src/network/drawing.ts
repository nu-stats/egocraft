// A drawing as a list of simple shapes, so one picture can be written as
// SVG (for the screen and for editing) or as PDF (for journals).

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: string; opacity?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string | null; stroke?: string; strokeWidth?: number; opacity?: number; id?: string }
  | { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; anchor?: 'start' | 'middle'; fill: string; opacity?: number; title?: string };

export interface Drawing {
  width: number;
  height: number;
  shapes: Shape[];
  /** For sociograms: where layout position (0, 0) is drawn and how far 1 unit reaches, so a drag can be turned back into a position. */
  frame?: { cx: number; cy: number; scale: number };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v: number) => (Math.round(v * 10) / 10).toString();

export function drawingToSvg(d: Drawing): string {
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" font-family="Helvetica, Arial, sans-serif" font-size="12">`];
  for (const s of d.shapes) {
    const op = 'opacity' in s && s.opacity !== undefined && s.opacity < 1 ? ` opacity="${s.opacity}"` : '';
    if (s.kind === 'rect') out.push(`<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" fill="${s.fill}"/>`);
    else if (s.kind === 'line') out.push(`<line x1="${f(s.x1)}" y1="${f(s.y1)}" x2="${f(s.x2)}" y2="${f(s.y2)}" stroke="${s.stroke}" stroke-width="${f(s.width)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linecap="round"${op}/>`);
    else if (s.kind === 'circle') out.push(`<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${s.fill ?? 'none'}"${s.id ? ` data-id="${esc(s.id)}"` : ''}${s.stroke ? ` stroke="${s.stroke}" stroke-width="${f(s.strokeWidth ?? 1)}"` : ''}${op}/>`);
    else out.push(`<text x="${f(s.x)}" y="${f(s.y)}"${s.anchor === 'middle' ? ' text-anchor="middle"' : ''}${s.size !== 12 ? ` font-size="${s.size}"` : ''}${s.bold ? ' font-weight="600"' : ''} fill="${s.fill}"${op}>${esc(s.text)}${s.title ? `<title>${esc(s.title)}</title>` : ''}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** Several drawings placed on one larger drawing (a grid of sociograms). */
export function combineDrawings(parts: Drawing[], cols: number): Drawing {
  const w = Math.max(...parts.map((p) => p.width));
  const h = Math.max(...parts.map((p) => p.height));
  const shapes: Shape[] = [];
  const rows = Math.ceil(parts.length / cols);
  shapes.push({ kind: 'rect', x: 0, y: 0, w: cols * w, h: rows * h, fill: '#ffffff' });
  parts.forEach((p, i) => {
    const dx = (i % cols) * w;
    const dy = Math.floor(i / cols) * h;
    for (const s of p.shapes) {
      if (s.kind === 'rect') shapes.push({ ...s, x: s.x + dx, y: s.y + dy });
      else if (s.kind === 'line') shapes.push({ ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy });
      else if (s.kind === 'circle') shapes.push({ ...s, cx: s.cx + dx, cy: s.cy + dy });
      else shapes.push({ ...s, x: s.x + dx, y: s.y + dy });
    }
  });
  return { width: cols * w, height: rows * h, shapes };
}
