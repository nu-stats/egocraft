// Writing a drawing as a one-page vector PDF (P4.7): lines, circles (four
// Bézier curves each), text in Helvetica (one of the 14 fonts every PDF
// reader has, so nothing is embedded), dashes and transparency. Written
// from the PDF 1.4 file structure.

import type { Drawing } from '../network/drawing.ts';

// Helvetica character widths (per 1000 units) for the printable ASCII
// characters 32–126, from the font's published metrics.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// Characters outside Latin-1 that Windows' character set (WinAnsi) has.
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
const SWAP: Record<string, string> = { '≥': '>=', '≤': '<=', '−': '-', '×': 'x' };

/** Text as WinAnsi bytes; characters it can't show become "?". */
function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of [...s].map((c) => SWAP[c] ?? c).join('')) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) out.push(c);
    else if (WIN[ch]) out.push(WIN[ch]!);
    else if (c >= 160 && c <= 255) out.push(c);
    else out.push(63);
  }
  return out;
}

export function textWidth(s: string, size: number, bold = false): number {
  const w = winAnsi(s).reduce((a, c) => a + (c >= 32 && c <= 126 ? HELV[c - 32]! : 556), 0);
  return (w / 1000) * size * (bold ? 1.06 : 1);
}

function pdfString(s: string): string {
  return '(' + winAnsi(s).map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c))).join('') + ')';
}

function rgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = (i: number) => (parseInt(full.slice(i, i + 2), 16) / 255).toFixed(3);
  return `${n(0)} ${n(2)} ${n(4)}`;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

export function drawingToPdf(d: Drawing, title = 'EgoCraft'): Uint8Array {
  const H = d.height;
  const Y = (y: number) => H - y;
  const ops: string[] = [];
  const alphas = new Map<number, string>();
  const gs = (o: number | undefined) => {
    if (o === undefined || o >= 1) return '/GS1 gs';
    if (!alphas.has(o)) alphas.set(o, `GSa${alphas.size}`);
    return `/${alphas.get(o)} gs`;
  };
  ops.push('1 J 1 j');
  for (const s of d.shapes) {
    if (s.kind === 'rect') ops.push(`/GS1 gs ${rgb(s.fill)} rg ${n(s.x)} ${n(Y(s.y + s.h))} ${n(s.w)} ${n(s.h)} re f`);
    else if (s.kind === 'line') ops.push(`${gs(s.opacity)} ${rgb(s.stroke)} RG ${n(s.width)} w [${s.dash ?? ''}] 0 d ${n(s.x1)} ${n(Y(s.y1))} m ${n(s.x2)} ${n(Y(s.y2))} l S`);
    else if (s.kind === 'circle') {
      const k = 0.5523 * s.r;
      const x = s.cx;
      const y = Y(s.cy);
      const r = s.r;
      const path = `${n(x + r)} ${n(y)} m ${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c ${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c ${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c ${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c h`;
      const fill = s.fill ? `${rgb(s.fill)} rg ` : '';
      const stroke = s.stroke ? `${rgb(s.stroke)} RG ${n(s.strokeWidth ?? 1)} w [] 0 d ` : '';
      ops.push(`${gs(s.opacity)} ${fill}${stroke}${path} ${s.fill && s.stroke ? 'B' : s.fill ? 'f' : 'S'}`);
    } else {
      const x = s.anchor === 'middle' ? s.x - textWidth(s.text, s.size, s.bold) / 2 : s.x;
      ops.push(`${gs(s.opacity)} BT /${s.bold ? 'F2' : 'F1'} ${n(s.size)} Tf ${rgb(s.fill)} rg ${n(x)} ${n(Y(s.y))} Td ${pdfString(s.text)} Tj ET`);
    }
  }
  const content = ops.join('\n');
  const extG = [`/GS1 << /Type /ExtGState /ca 1 /CA 1 >>`, ...[...alphas].map(([o, name]) => `/${name} << /Type /ExtGState /ca ${o} /CA ${o} >>`)].join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(d.width)} ${n(d.height)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ExtGState << ${extG} >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfString(title)} /Producer (EgoCraft) >>`,
  ];
  const offsets: number[] = [];
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  // The header is 15 bytes: %PDF-1.4, then four high bytes that mark the file as binary.
  let size = 15;
  const parts: string[] = [];
  objects.forEach((o, i) => {
    offsets.push(size);
    const obj = `${i + 1} 0 obj\n${o}\nendobj\n`;
    parts.push(obj);
    size += bytes(obj);
  });
  const xref = size;
  const table = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `)].join('\n');
  const trailer = `${table}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const head = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  const body = new TextEncoder().encode(parts.join('') + trailer);
  const result = new Uint8Array(head.length + body.length);
  result.set(head, 0);
  result.set(body, head.length);
  return result;
}
