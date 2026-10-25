import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateBackup, normaliseSettings, backupFileName, BACKUP_SCHEMA, DEFAULT_SETTINGS } from './schema.js';

const valid = () => ({
  schema: 1,
  exportedAt: 1,
  exercises: [{ id: 'e1', name: 'Squat', createdAt: 1 }],
  sessions: [{ id: 's1', startedAt: 1 }],
  sessionExercises: [{ id: 'se1', sessionId: 's1', exerciseId: 'e1', order: 0 }],
  sets: [{ id: 'x1', sessionId: 's1', sessionExerciseId: 'se1', exerciseId: 'e1', type: 'top', weightKg: 140, reps: 5, completedAt: 2 }],
  settings: { id: 'settings', stepKg: 2.5 },
});

test('a valid backup migrates to the current schema', () => {
  const out = migrateBackup(valid());
  assert.equal(out.schema, BACKUP_SCHEMA);
  assert.equal(out.sets.length, 1);
  assert.deepEqual(out.settings.plates, DEFAULT_SETTINGS.plates);
});

test('rejects files that are not backups', () => {
  assert.throws(() => migrateBackup(null), /Not a Gym Log backup/);
  assert.throws(() => migrateBackup([]), /Not a Gym Log backup/);
  assert.throws(() => migrateBackup({ sets: [] }), /no schema number/);
});

test('rejects backups from a newer version', () => {
  assert.throws(() => migrateBackup({ ...valid(), schema: BACKUP_SCHEMA + 1 }), /newer version/);
});

test('rejects damaged records', () => {
  const badType = valid();
  badType.sets[0].type = 'amrap';
  assert.throws(() => migrateBackup(badType), /unknown type/);

  const badReps = valid();
  badReps.sets[0].reps = 2.5;
  assert.throws(() => migrateBackup(badReps), /rep count/);

  const dup = valid();
  dup.sessions.push({ id: 's1', startedAt: 2 });
  assert.throws(() => migrateBackup(dup), /duplicate id/);
});

test('missing stores become empty lists', () => {
  const out = migrateBackup({ schema: 1 });
  assert.deepEqual(out.sets, []);
  assert.deepEqual(out.workouts, []);
  assert.equal(out.settings.id, 'settings');
});

test('migrateBackup does not change its input', () => {
  const file = valid();
  const before = JSON.stringify(file);
  migrateBackup(file);
  assert.equal(JSON.stringify(file), before);
});

test('normaliseSettings fills missing fields', () => {
  const s = normaliseSettings({ stepKg: 5 });
  assert.equal(s.stepKg, 5);
  assert.equal(s.barWeightKg, 20);
});

test('backupFileName', () => {
  assert.equal(backupFileName(new Date(2026, 9, 21).getTime()), 'gym-log-backup-2026-10-21.json');
});

test('schema 1 backups get exercise muscles from muscleGroup', () => {
  const file = valid();
  file.exercises.push({ id: 'e2', name: 'Fly', muscleGroup: 'Chest', createdAt: 1 }, { id: 'e3', name: 'Curl', muscleGroup: 'biceps', createdAt: 1 });
  const out = migrateBackup(file);
  assert.deepEqual(out.exercises.map((e) => [e.muscles, e.setup, 'muscleGroup' in e]), [
    [undefined, undefined, false], [undefined, 'Chest', false], [['arms'], undefined, false],
  ]);
});

test('rejects a muscle list that is not a list', () => {
  const file = { ...valid(), schema: BACKUP_SCHEMA };
  file.exercises[0].muscles = 'quads';
  assert.throws(() => migrateBackup(file), /bad muscle list/);
});

test('schema 2 backups get muscle groups and an empty workout list', () => {
  const file = { ...valid(), schema: 2 };
  file.exercises[0].muscles = ['quads', 'glutes', 'lower-back'];
  const out = migrateBackup(file);
  assert.deepEqual(out.exercises[0].muscles, ['legs', 'back']);
  assert.deepEqual(out.workouts, []);
});

test('saved workouts are checked', () => {
  const file = { ...valid(), schema: BACKUP_SCHEMA, workouts: [{ id: 'w1', name: 'Legs', exerciseIds: ['e1'], createdAt: 1 }] };
  assert.equal(migrateBackup(file).workouts.length, 1);
  assert.throws(() => migrateBackup({ ...file, workouts: [{ id: 'w1', name: '', exerciseIds: [] }] }), /workout has no name/);
  assert.throws(() => migrateBackup({ ...file, workouts: [{ id: 'w1', name: 'Legs', exerciseIds: 'e1' }] }), /bad exercise list/);
});
