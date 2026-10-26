// Which interviews on this device have not been saved to an encrypted file
// since they last changed. Only interview IDs and the time of the last
// back-up are kept, unencrypted, so the reminder shows before the device
// is unlocked. An interview counts as backed up once a file with it has
// been made; EgoCraft can't see where that file went.

export interface BackupState {
  /** When an encrypted interview file was last made on this device. */
  lastAt: string | null;
  /** Interviews changed since the last file that held them. */
  pending: string[];
}

/** The state on a device that had interviews before back-ups were tracked: every one of them counts as not backed up. */
export function initialBackup(existingIds: string[]): BackupState {
  return { lastAt: null, pending: [...new Set(existingIds)].sort() };
}

export function markChanged(b: BackupState, id: string): BackupState {
  return b.pending.includes(id) ? b : { ...b, pending: [...b.pending, id].sort() };
}

export function markBackedUp(b: BackupState, ids: string[], at: string): BackupState {
  const done = new Set(ids);
  return { lastAt: at, pending: b.pending.filter((id) => !done.has(id)) };
}

export function markDeleted(b: BackupState, id: string): BackupState {
  return { ...b, pending: b.pending.filter((x) => x !== id) };
}

export function backupText(b: BackupState): string {
  const n = b.pending.length;
  const last = b.lastAt ? `last back-up ${new Date(b.lastAt).toLocaleString()}` : 'never backed up on this device';
  return n ? `${n} interview${n === 1 ? '' : 's'} not yet backed up (${last}).` : `Every interview is backed up (${last}).`;
}
