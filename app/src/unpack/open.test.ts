import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { strToU8, zipSync } from 'fflate';
import { extensionsOf, openPicked, withCompressed } from './open.ts';

const DOCS = extensionsOf('.txt,.md,.docx,.pdf');
const text = (b: Uint8Array) => new TextDecoder().decode(b);
// A stand-in for a .docx: any zip will do, since it must come through unopened.
const fakeDocx = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:document/>') });

test('withCompressed adds the compressed kinds once; extensionsOf leaves them out', () => {
  assert.equal(withCompressed('.csv,.zip'), '.csv,.zip,.gz,.tgz,.bz2,.tbz2,.tbz,.xz,.txz,.zst,.tzst,.tar');
  assert.deepEqual(extensionsOf('.CSV, .xlsx,.zip,.gz'), ['.csv', '.xlsx']);
});

test('a plain file and a zip-based format the box reads come through unopened', async () => {
  const plain = strToU8('Interview one.');
  assert.deepEqual(await openPicked('a.txt', plain, DOCS), [{ name: 'a.txt', bytes: plain }]);
  const docx = fakeDocx();
  assert.deepEqual(await openPicked('Interview.DOCX', docx, DOCS), [{ name: 'Interview.DOCX', bytes: docx }]);
  const qdpx = zipSync({ 'project.qde': strToU8('<Project/>') });
  assert.deepEqual(await openPicked('team.qdpx', qdpx, extensionsOf('.qdpx,.qde,.qcproj,.json')), [{ name: 'team.qdpx', bytes: qdpx }]);
});

test('single-file compression arrives as the file inside, even when that file is a zip', async () => {
  const [txt] = await openPicked('notes.txt.gz', gzipSync('Interview one.'), DOCS);
  assert.equal(txt?.name, 'notes.txt');
  assert.equal(text(txt!.bytes), 'Interview one.');
  const docx = fakeDocx();
  const [inner] = await openPicked('Interview.docx.gz', gzipSync(docx), DOCS);
  assert.equal(inner?.name, 'Interview.docx');
  assert.deepEqual(inner?.bytes, docx);
});

test('an archive of documents gives each one, by its own name, leaving out folders and system files', async () => {
  const docx = fakeDocx();
  const zip = zipSync({
    'interviews/one.txt': strToU8('One.'),
    'interviews/two.txt': strToU8('Two.'),
    'interviews/three.docx': docx,
    'interviews/': new Uint8Array(0),
    '__MACOSX/interviews/._one.txt': strToU8('junk'),
    'interviews/.DS_Store': strToU8('junk'),
    'interviews/readme.csv': strToU8('a,b'),
  });
  const files = await openPicked('interviews.zip', zip, DOCS);
  assert.deepEqual(files.map((f) => f.name), ['one.txt', 'two.txt', 'three.docx']);
  assert.deepEqual(files[2]?.bytes, docx);
});

test('a zip inside a zip is opened, and a box with no fitting files is offered them all', async () => {
  const outer = zipSync({ 'batch.zip': zipSync({ 'a.txt': strToU8('A') }), 'b.txt.gz': gzipSync('B') });
  assert.deepEqual((await openPicked('all.zip', outer, DOCS)).map((f) => f.name), ['a.txt', 'b.txt']);
  assert.deepEqual((await openPicked('x.zip', zipSync({ 'data.dat': strToU8('?') }), DOCS)).map((f) => f.name), ['data.dat']);
});

test('an empty archive, a damaged one and a RAR file are refused with a message', async () => {
  await assert.rejects(() => openPicked('empty.zip', zipSync({}), DOCS), /has no files in it/);
  const zip = zipSync({ 'a.txt': [strToU8('Interview one.'), { level: 0 }] });
  zip[Buffer.from(zip).indexOf('Interview')] = 0x4a; // one byte of the stored text
  await assert.rejects(() => openPicked('bad.zip', zip, DOCS), /checksum/);
  await assert.rejects(() => openPicked('a.rar', new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0, 0]), DOCS), /RAR/);
});
