// A small Word (.docx) writer for EgoCraft's tables and methods text: APA
// style tables (number in bold, title in italics, rules only above and
// below the header and at the bottom), plain paragraphs and headings.
// Written from the Office Open XML structure; no packages beyond fflate.

import { strToU8, zipSync } from 'fflate';

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: string; italic?: boolean }
  | { kind: 'table'; number: number; title: string; header: string[]; rows: string[][]; note?: string };

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

function run(text: string, { bold = false, italic = false, size = 24 } = {}): string {
  return `<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}

function para(content: string, { spacing = 240, align = 'left', keepNext = false } = {}): string {
  return `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:after="0" w:line="${spacing}" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr>${content}</w:p>`;
}

/** A note such as "Note. N = 380 ego-waves." with the first word in italics, as APA does. */
function note(text: string): string {
  const m = /^(Note\.)\s*(.*)$/s.exec(text);
  return para(m ? run('Note.', { italic: true }) + run(' ' + m[2], {}) : run(text), { spacing: 240 });
}

function cell(text: string, { first = false, top = false, bottom = false, header = false } = {}): string {
  const borders = [top ? '<w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>' : '', bottom ? '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>' : ''].join('');
  return `<w:tc><w:tcPr>${borders ? `<w:tcBorders>${borders}</w:tcBorders>` : ''}</w:tcPr>${para(run(text, { size: 22 }), { align: first ? 'left' : header ? 'center' : 'right' })}</w:tc>`;
}

function table(b: Extract<Block, { kind: 'table' }>): string {
  const cols = b.header.length;
  const out: string[] = [];
  out.push(para(run(`Table ${b.number}`, { bold: true }), { keepNext: true }));
  out.push(para(run(b.title, { italic: true }), { keepNext: true }));
  out.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol/>'.repeat(cols)}</w:tblGrid>`);
  out.push(`<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.header.map((h, i) => cell(h, { first: i === 0, top: true, bottom: true, header: true })).join('')}</w:tr>`);
  b.rows.forEach((r, k) => {
    out.push(`<w:tr>${r.map((v, i) => cell(v, { first: i === 0, bottom: k === b.rows.length - 1 })).join('')}</w:tr>`);
  });
  out.push('</w:tbl>');
  if (b.note) out.push(note(b.note));
  out.push(para(''));
  return out.join('');
}

export function buildDocx(blocks: Block[], title = 'EgoCraft'): Uint8Array {
  const body = blocks
    .map((b) => {
      if (b.kind === 'heading') return para(run(b.text, { bold: true }), { keepNext: true, spacing: 480 });
      if (b.kind === 'para') return para(run(b.text, { italic: b.italic }), { spacing: 480 });
      return table(b);
    })
    .join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return zipSync(
    {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
      'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dc:creator>EgoCraft</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`),
      'word/document.xml': strToU8(doc),
    },
    { level: 6 },
  );
}
