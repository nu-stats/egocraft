// Keeping the open project in this browser (IndexedDB), so closing the tab
// or restarting the computer loses nothing. Nothing leaves the computer.

import type { Project } from '../project.ts';
import { projectFromJson, projectToJson } from '../project.ts';

const DB = 'egocraft';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This browser would not open its local storage.'));
  });
}

async function run<T>(mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = body(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Saving in this browser failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving in this browser failed (the disk may be full).'));
  });
}

export async function loadCurrent(): Promise<Project | null> {
  try {
    const text = await run<unknown>('readonly', (s) => s.get('current'));
    return typeof text === 'string' ? projectFromJson(text) : null;
  } catch {
    return null;
  }
}

export async function saveCurrent(p: Project | null): Promise<void> {
  if (p === null) await run('readwrite', (s) => s.delete('current'));
  else await run('readwrite', (s) => s.put(projectToJson(p), 'current'));
}
