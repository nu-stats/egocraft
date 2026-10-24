// Keeping interviews safe on the collecting device (P6.8) and moving them
// by file. Everything is encrypted with AES-256-GCM under a key made from
// a passphrase (PBKDF2-SHA-256, 310,000 rounds). The passphrase is never
// stored; without it the stored interviews and the files can't be read.

import type { Interview } from './interview.ts';
import { interviewFromJson } from './interview.ts';
import type { Protocol } from './protocol.ts';

const ITERATIONS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = {
  to(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  from(text: string): Uint8Array<ArrayBuffer> {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface Sealed {
  iv: string;
  data: string;
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  return { iv: b64.to(iv), data: b64.to(data) };
}

export async function unseal<T>(key: CryptoKey, s: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(s.iv) }, key, b64.from(s.data));
  return JSON.parse(dec.decode(plain)) as T;
}

/** What the device keeps in the clear: the salt, and a sealed check to tell a wrong passphrase. */
export interface VaultMeta {
  format: 'egocraft-vault';
  salt: string;
  check: Sealed;
  createdAt: string;
}

const CHECK = 'EgoCraft interview vault';

export async function createVault(passphrase: string, now = new Date()): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(passphrase, salt);
  return { meta: { format: 'egocraft-vault', salt: b64.to(salt), check: await seal(key, CHECK), createdAt: now.toISOString() }, key };
}

export async function openVault(meta: VaultMeta, passphrase: string): Promise<CryptoKey> {
  const key = await derive(passphrase, b64.from(meta.salt));
  try {
    if ((await unseal<string>(key, meta.check)) === CHECK) return key;
  } catch {
    // falls through
  }
  throw new Error('Wrong passphrase.');
}

// ---------- moving interviews by file ----------

const MAGIC = 'EGOCRAFT-INTERVIEWS-1\n';

export interface InterviewFile {
  protocol: Protocol | null;
  interviews: Interview[];
  /** Which device and when, for the record. */
  device: string;
  savedAt: string;
}

/** Interviews (and the protocol) as one encrypted file to carry to the analysis computer. */
export async function interviewsToFile(content: InterviewFile, passphrase: string): Promise<Uint8Array> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const sealed = await seal(await derive(passphrase, salt), content);
  return enc.encode(MAGIC + JSON.stringify({ salt: b64.to(salt), ...sealed }));
}

export async function interviewsFromFile(bytes: Uint8Array, passphrase: string): Promise<InterviewFile> {
  const text = dec.decode(bytes);
  if (!text.startsWith(MAGIC)) throw new Error('This is not an EgoCraft interview file.');
  let body: { salt: string } & Sealed;
  try {
    body = JSON.parse(text.slice(MAGIC.length));
  } catch {
    throw new Error('This interview file is damaged.');
  }
  let content: InterviewFile;
  try {
    content = await unseal<InterviewFile>(await derive(passphrase, b64.from(body.salt)), body);
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  return { ...content, interviews: content.interviews.map(interviewFromJson) };
}
