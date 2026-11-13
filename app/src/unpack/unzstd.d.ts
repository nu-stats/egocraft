export function xxh64(bytes: Uint8Array): bigint;
export function isZstd(bytes: Uint8Array): boolean;
export function unzstd(bytes: Uint8Array, options?: { maxBytes?: number }): Uint8Array;
