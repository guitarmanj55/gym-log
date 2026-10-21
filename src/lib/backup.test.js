import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupStatus } from './backup.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 21, 12);

test('nothing to back up with no sessions', () => {
  assert.equal(backupStatus({ backupReminder: true }, 0, NOW).overdue, false);
});

test('overdue when never exported', () => {
  const s = backupStatus({ backupReminder: true }, 3, NOW);
  assert.equal(s.overdue, true);
  assert.equal(s.sub, 'No backup exported yet');
});

test('overdue after seven days', () => {
  assert.equal(backupStatus({ backupReminder: true, lastBackupAt: NOW - 6 * DAY }, 3, NOW).overdue, false);
  const s = backupStatus({ backupReminder: true, lastBackupAt: NOW - 9 * DAY }, 3, NOW);
  assert.equal(s.overdue, true);
  assert.equal(s.sub, 'Last export 9 days ago');
});

test('reminder off is never overdue', () => {
  const s = backupStatus({ backupReminder: false }, 3, NOW);
  assert.equal(s.overdue, false);
  assert.equal(s.title, 'Reminder off');
});
