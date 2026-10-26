import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupText, initialBackup, markBackedUp, markChanged, markDeleted } from './backup.ts';

test('back-up state: changes are pending until a file holds them; changing again makes them pending again', () => {
  let b = initialBackup([]);
  assert.equal(backupText(b), 'Every interview is backed up (never backed up on this device).');
  b = markChanged(b, 'a');
  b = markChanged(b, 'b');
  b = markChanged(b, 'a');
  assert.deepEqual(b.pending, ['a', 'b']);
  assert.match(backupText(b), /^2 interviews not yet backed up \(never backed up on this device\)\.$/);
  // A file with only interview a (another questionnaire's file leaves b pending).
  b = markBackedUp(b, ['a'], '2026-10-25T12:00:00Z');
  assert.deepEqual(b.pending, ['b']);
  assert.equal(b.lastAt, '2026-10-25T12:00:00Z');
  assert.match(backupText(b), /^1 interview not yet backed up \(last back-up /);
  // Interview a changes after its back-up: it needs another one.
  b = markChanged(b, 'a');
  assert.deepEqual(b.pending, ['a', 'b']);
  b = markDeleted(b, 'b');
  assert.deepEqual(b.pending, ['a']);
});

test('interviews from before back-ups were tracked count as not backed up', () => {
  assert.deepEqual(initialBackup(['z', 'y', 'z']).pending, ['y', 'z']);
});
