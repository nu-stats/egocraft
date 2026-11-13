// Opening compressed files picked in an import box (.zip, .gz, .bz2, .xz, .zst,
// .tar and the combinations), so a .txt.gz arrives as its .txt and a zip of
// interviews as the interviews. No DOM: runs in Node and in the browser.
//
// Formats that are zips themselves (.docx, .xlsx, .qdpx, a .qcproj with
// media) reach their own readers unopened: a zip is opened only when its name
// is not one the box reads.

import { COMPRESSED_ACCEPT, kindOf, offered, unpack, type Unpacked } from './unpack.js';

export type { Unpacked };

const COMPRESSED = COMPRESSED_ACCEPT.split(',');

/** An accept list for a file box with the compressed kinds added. */
export function withCompressed(accept: string): string {
  const own = accept.split(',').map((e) => e.trim()).filter(Boolean);
  return [...own, ...COMPRESSED.filter((e) => !own.includes(e))].join(',');
}

/** The extensions a box reads, lower case, from its accept list. */
export function extensionsOf(accept: string): string[] {
  return accept
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.startsWith('.') && !COMPRESSED.includes(e));
}

const baseName = (name: string) => name.split(/[\\/]/).pop() || name;
// Files zip and tar programs add that nobody picked: macOS resource forks, Finder and Explorer caches.
const isJunk = (path: string) => /(^|\/)__MACOSX\//.test(path) || /^\._|^\.DS_Store$|^Thumbs\.db$|^desktop\.ini$/i.test(baseName(path));

const MAX_LAYERS = 4;

async function open(name: string, bytes: Uint8Array, extensions: string[], layer: number, maxBytes: number | undefined): Promise<Unpacked[]> {
  const kind = kindOf(bytes);
  if (kind === 'plain' || layer >= MAX_LAYERS) return [{ name, bytes }];
  const lower = name.toLowerCase();
  if (kind === 'zip' && extensions.some((e) => lower.endsWith(e))) return [{ name, bytes }];
  // depth 3 makes unpack open one layer only, so each file inside gets the zip check above.
  const inside = await unpack(bytes, name, { depth: 3, ...(maxBytes ? { maxBytes } : {}) });
  const out: Unpacked[] = [];
  for (const f of inside) {
    if (isJunk(f.name)) continue;
    out.push(...(await open(baseName(f.name), f.bytes, extensions, layer + 1, maxBytes)));
  }
  return out;
}

/**
 * The files to import from one picked file: the file itself when it isn't
 * compressed, its contents when it is. `extensions` are what the box reads
 * (see extensionsOf); when some inner files fit, only those come back.
 * Damaged, password-protected, 7z and RAR files are refused with a message.
 */
export async function openPicked(name: string, bytes: Uint8Array, extensions: string[], options: { maxBytes?: number } = {}): Promise<Unpacked[]> {
  const files = await open(name, bytes, extensions, 0, options.maxBytes);
  if (!files.length) throw new Error(`"${name}" has no files in it.`);
  return offered(files, extensions);
}
