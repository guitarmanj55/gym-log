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

test('schema 3 backups get empty food and health lists', () => {
  const out = migrateBackup({ ...valid(), schema: 3 });
  assert.equal(out.schema, BACKUP_SCHEMA);
  assert.deepEqual([out.meals, out.foodLog, out.health], [[], [], []]);
  assert.equal(out.settings.calorieTarget, null);
});

test('food and health records survive and are checked', () => {
  const file = {
    ...valid(), schema: BACKUP_SCHEMA,
    meals: [{ id: 'm1', name: 'Burger and chips', kcal: 950, createdAt: 1 }],
    foodLog: [{ id: 'f1', at: 5, day: '2026-11-01', mealId: 'm1', name: 'Burger and chips', kcal: 950, portion: 1 }],
    health: [{ id: '2026-11-01', weightKg: 84.2, src: { weightKg: 'manual' } }],
  };
  const out = migrateBackup(file);
  assert.equal(out.meals.length + out.foodLog.length + out.health.length, 3);
  assert.throws(() => migrateBackup({ ...file, meals: [{ id: 'm1', name: '', kcal: 1 }] }), /meal has no name/);
  assert.throws(() => migrateBackup({ ...file, foodLog: [{ ...file.foodLog[0], day: 'today' }] }), /no date/);
  assert.throws(() => migrateBackup({ ...file, foodLog: [{ ...file.foodLog[0], portion: 0 }] }), /invalid portion/);
  assert.throws(() => migrateBackup({ ...file, health: [{ id: '2026-11-01', steps: -1 }] }), /invalid steps/);
});

test('a health day may hold any subset of metrics', () => {
  const file = { ...valid(), schema: BACKUP_SCHEMA, health: [{ id: '2026-11-01' }, { id: '2026-11-02', sleepMin: 420 }] };
  assert.equal(migrateBackup(file).health.length, 2);
});

test('calorie and protein targets are clamped to sensible values or cleared', () => {
  assert.equal(normaliseSettings({ calorieTarget: 2300.4 }).calorieTarget, 2300);
  assert.equal(normaliseSettings({ calorieTarget: 5 }).calorieTarget, null);
  assert.equal(normaliseSettings({ proteinTarget: 160 }).proteinTarget, 160);
  assert.equal(normaliseSettings({ proteinTarget: 'lots' }).proteinTarget, null);
});

test('saved workouts are checked', () => {
  const file = { ...valid(), schema: BACKUP_SCHEMA, workouts: [{ id: 'w1', name: 'Legs', exerciseIds: ['e1'], createdAt: 1 }] };
  assert.equal(migrateBackup(file).workouts.length, 1);
  assert.throws(() => migrateBackup({ ...file, workouts: [{ id: 'w1', name: '', exerciseIds: [] }] }), /workout has no name/);
  assert.throws(() => migrateBackup({ ...file, workouts: [{ id: 'w1', name: 'Legs', exerciseIds: 'e1' }] }), /bad exercise list/);
});
