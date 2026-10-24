import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { combineDrawings } from '../network/drawing.ts';
import { ALL, buildNetworks } from '../network/networks.ts';
import { DEFAULT_OPTIONS, placeNodes, sociogramData, sociogramDrawing } from '../network/sociogram.ts';
import { sampleStudy } from '../sample/sample.ts';
import { drawingToPdf, textWidth } from './pdf.ts';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

test('a sociogram as PDF: valid structure, every object where the cross-reference table says', () => {
  const s = sampleStudy(new Date('2026-10-24T12:00:00Z'));
  const nets = buildNetworks(s);
  const net = nets.egos.find((n) => n.alters.length >= 8)!;
  const data = sociogramData(s, net, ALL);
  const opts = { ...DEFAULT_OPTIONS, colorBy: 'relation', sizeBy: 'closeness', title: `Ego ${net.id} – wave ${net.wave}` };
  const one = sociogramDrawing({ study: s, data, positions: placeNodes(s, data, opts, net.id), opts, tieTypes: nets.tieTypes });
  const pdf = drawingToPdf(combineDrawings([one, one, one], 2), 'Test');
  if (process.env.EGOCRAFT_PDF_OUT) writeFileSync(process.env.EGOCRAFT_PDF_OUT, pdf);
  const text = latin1(pdf);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, 7);
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  // The en dash in the title is WinAnsi 0x96, written as an octal escape.
  assert.match(text, /\\226/);
  assert.match(text, /\/BaseFont \/Helvetica /);
});

test('Helvetica widths: "Ego" is about 21 points wide at 12 points', () => {
  assert.equal(Math.round(textWidth('Ego', 12)), 21);
});
