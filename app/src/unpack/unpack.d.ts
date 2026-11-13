// Types for unpack.js (plain JavaScript, shared with Husky Explorer).
export { crc32 } from './crc32.js';

export interface Unpacked {
  name: string;
  bytes: Uint8Array;
}

/** The extensions to add to a file box's accept list. */
export const COMPRESSED_ACCEPT: string;

export function kindOf(bytes: Uint8Array): 'gzip' | 'zip' | 'bzip2' | 'tar' | 'xz' | 'zstd' | '7z' | 'rar' | 'plain';

/** The files inside. A plain file comes back as itself; archives inside are opened too, up to `depth` 3. */
export function unpack(bytes: Uint8Array, name?: string, options?: { maxBytes?: number; depth?: number }): Promise<Unpacked[]>;

/** The files whose names end with one of `extensions`, or all of them when none do. */
export function offered<T extends { name: string }>(files: T[], extensions: string[]): T[];
