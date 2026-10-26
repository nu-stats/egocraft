// Interviews and protocols kept on this device (IndexedDB). Protocols hold
// only wording, so they are kept as they are; interviews are kept only in
// encrypted form (interview/vault.ts), unlocked with the device passphrase.

import type { BackupState } from '../interview/backup.ts';
import { initialBackup, markBackedUp, markChanged, markDeleted } from '../interview/backup.ts';
import type { Interview } from '../interview/interview.ts';
import type { Protocol } from '../interview/protocol.ts';
import { protocolFromJson } from '../interview/protocol.ts';
import type { Sealed, VaultMeta } from '../interview/vault.ts';
import { seal, unseal } from '../interview/vault.ts';

const DB = 'egocraft-interviews';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta');
      req.result.createObjectStore('protocols');
      req.result.createObjectStore('interviews');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This browser would not open its local storage.'));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = body(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Saving on this device failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving on this device failed (the storage may be full).'));
  });
}

export const getVaultMeta = () => run<VaultMeta | undefined>('meta', 'readonly', (s) => s.get('vault') as IDBRequest<VaultMeta | undefined>);
export const setVaultMeta = (m: VaultMeta) => run('meta', 'readwrite', (s) => s.put(m, 'vault'));

export async function listProtocols(): Promise<Protocol[]> {
  const all = await run<unknown[]>('protocols', 'readonly', (s) => s.getAll());
  return all.map((p) => protocolFromJson(JSON.stringify(p))).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
export const saveProtocol = (p: Protocol) => run('protocols', 'readwrite', (s) => s.put(p, p.id));
export const deleteProtocol = (id: string) => run('protocols', 'readwrite', (s) => s.delete(id));

/** Reads and changes the back-up record in the same transaction as the interview change, so the two never disagree. */
async function withBackup(change: (interviews: IDBObjectStore, b: BackupState) => BackupState): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['interviews', 'meta'], 'readwrite');
    const meta = tx.objectStore('meta');
    const interviews = tx.objectStore('interviews');
    const got = meta.get('backup');
    got.onsuccess = () => {
      const have = got.result as BackupState | undefined;
      if (have) meta.put(change(interviews, have), 'backup');
      else {
        const keys = interviews.getAllKeys();
        keys.onsuccess = () => meta.put(change(interviews, initialBackup(keys.result.map(String))), 'backup');
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Saving on this device failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving on this device failed (the storage may be full).'));
  });
}

export async function saveInterview(key: CryptoKey, iv: Interview): Promise<void> {
  const sealed = await seal(key, iv);
  await withBackup((store, b) => {
    store.put(sealed, iv.id);
    return markChanged(b, iv.id);
  });
}

/** The back-up record; on a device whose interviews predate it, every interview counts as not backed up. */
export async function getBackup(): Promise<BackupState> {
  const have = await run<BackupState | undefined>('meta', 'readonly', (s) => s.get('backup') as IDBRequest<BackupState | undefined>);
  if (have) return have;
  const keys = await run<IDBValidKey[]>('interviews', 'readonly', (s) => s.getAllKeys());
  return initialBackup(keys.map(String));
}

/** After an encrypted file with these interviews was made. */
export const setBackedUp = (ids: string[]) => withBackup((_, b) => markBackedUp(b, ids, new Date().toISOString()));

export async function listInterviews(key: CryptoKey): Promise<Interview[]> {
  const db = await open();
  const entries = await new Promise<{ id: string; sealed: Sealed }[]>((resolve, reject) => {
    const out: { id: string; sealed: Sealed }[] = [];
    const tx = db.transaction('interviews', 'readonly');
    const req = tx.objectStore('interviews').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      out.push({ id: String(c.key), sealed: c.value as Sealed });
      c.continue();
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
  const list: Interview[] = [];
  for (const e of entries) list.push(await unseal<Interview>(key, e.sealed));
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const deleteInterview = (id: string) =>
  withBackup((store, b) => {
    store.delete(id);
    return markDeleted(b, id);
  });
