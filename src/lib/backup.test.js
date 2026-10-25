import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupStatus, backupFingerprint } from './backup.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12);

test('nothing to back up with no sessions', () => {
  assert.equal(backupStatus({ backupReminder: true }, 0, NOW).overdue, false);
});

test('overdue when never backed up', () => {
  const s = backupStatus({ backupReminder: true }, 3, NOW);
  assert.equal(s.overdue, true);
  assert.equal(s.sub, 'No backup yet');
});

test('overdue after seven days', () => {
  assert.equal(backupStatus({ backupReminder: true, lastBackupAt: NOW - 6 * DAY }, 3, NOW).overdue, false);
  const s = backupStatus({ backupReminder: true, lastBackupAt: NOW - 9 * DAY }, 3, NOW);
  assert.equal(s.overdue, true);
  assert.equal(s.sub, 'Last export 9 days ago');
});

test('an automatic backup counts as a backup', () => {
  const s = backupStatus({ backupReminder: true, lastBackupAt: NOW - 30 * DAY }, 3, NOW, NOW - DAY);
  assert.equal(s.overdue, false);
  assert.equal(s.sub, 'Last automatic backup yesterday');
  // A newer manual export wins.
  assert.equal(backupStatus({ backupReminder: true, lastBackupAt: NOW }, 3, NOW, NOW - DAY).sub, 'Last export today');
});

test('reminder off is never overdue', () => {
  const s = backupStatus({ backupReminder: false }, 3, NOW);
  assert.equal(s.overdue, false);
  assert.equal(s.title, 'Reminder off');
});

test('fingerprint ignores export time and export bookkeeping only', () => {
  const base = { schema: 3, exportedAt: 1, sessions: [{ id: 'a' }], sets: [], settings: { stepKg: 2.5, lastBackupAt: 1 } };
  const same = { ...base, exportedAt: 2, settings: { stepKg: 2.5, lastBackupAt: 9 } };
  assert.equal(backupFingerprint(base), backupFingerprint(same));
  assert.notEqual(backupFingerprint(base), backupFingerprint({ ...base, sets: [{ id: 's' }] }));
  assert.notEqual(backupFingerprint(base), backupFingerprint({ ...base, settings: { stepKg: 5 } }));
});
