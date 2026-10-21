import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadsPlates, barKgFor, startKgFor, detailLine, musclesLine, searchText, cleanDetails, withDetails,
  migrateExerciseV2, equipmentLabel,
} from './exercise.js';

test('plate-loaded equipment', () => {
  for (const eq of ['barbell', 'ezbar', 'trapbar', 'smith', 'plate-loaded', undefined]) assert.equal(loadsPlates(eq), true, eq);
  for (const eq of ['dumbbell', 'cable', 'machine', 'kettlebell', 'bodyweight', 'band']) assert.equal(loadsPlates(eq), false, eq);
});

test('bar weight: settings for a barbell, defaults per bar, override per exercise', () => {
  assert.equal(barKgFor({ equipment: 'barbell' }, 20), 20);
  assert.equal(barKgFor({}, 15), 15);
  assert.equal(barKgFor({ equipment: 'ezbar' }, 20), 10);
  assert.equal(barKgFor({ equipment: 'trapbar' }, 20), 25);
  assert.equal(barKgFor({ equipment: 'plate-loaded' }, 20), 0);
  assert.equal(barKgFor({ equipment: 'smith', barKg: 7.5 }, 20), 7.5);
  assert.equal(barKgFor({ equipment: 'dumbbell', barKg: 7.5 }, 20), 0);
});

test('starting weight for a new lift', () => {
  assert.equal(startKgFor({ equipment: 'barbell' }, 20), 20);
  assert.equal(startKgFor({ equipment: 'trapbar' }, 20), 25);
  assert.equal(startKgFor({ equipment: 'plate-loaded' }, 20), 20);
  assert.equal(startKgFor({ equipment: 'bodyweight' }, 20), 0);
  assert.equal(startKgFor({ equipment: 'cable' }, 20), 10);
});

test('detail line', () => {
  assert.equal(detailLine({ equipment: 'barbell' }), 'Barbell');
  assert.equal(detailLine({}), 'Barbell');
  assert.equal(
    detailLine({ equipment: 'dumbbell', position: 'incline', grip: 'neutral', unilateral: true }),
    'Incline · Dumbbell · Neutral grip · One side at a time',
  );
  assert.equal(detailLine({ equipment: 'cable', attachment: 'rope', width: 'close', grip: 'neutral' }), 'Cable · Rope · Close neutral grip');
  assert.equal(detailLine({ equipment: 'machine', attachment: 'rope' }), 'Machine (stack)');
  assert.equal(equipmentLabel('nonsense'), '');
});

test('muscles line and search text', () => {
  const e = { name: 'Press', equipment: 'barbell', position: 'incline', muscles: ['upper-chest', 'triceps', 'bogus'] };
  assert.equal(musclesLine(e), 'Upper chest, Triceps');
  assert.ok(/Press.*Incline.*Upper chest/.test(searchText(e)));
});

test('cleanDetails keeps known values and drops the rest', () => {
  const out = cleanDetails({
    name: '  Incline   press ', equipment: 'smith', muscles: ['upper-chest', 'upper-chest', 'nope'],
    position: 'incline', grip: 'sideways', attachment: 'rope', unilateral: 'on', barKg: '12,5', setup: '  Bench notch 3 ',
  });
  assert.deepEqual(out, {
    name: 'Incline press', equipment: 'smith', muscles: ['upper-chest'], position: 'incline',
    unilateral: true, barKg: 12.5, setup: 'Bench notch 3',
  });
  assert.deepEqual(cleanDetails({ equipment: 'cable', attachment: 'rope', barKg: '5' }), { equipment: 'cable', attachment: 'rope' });
  assert.deepEqual(cleanDetails({}), { equipment: 'barbell' });
});

test('withDetails replaces details but keeps identity', () => {
  const e = { id: 'e1', name: 'Row', createdAt: 5, equipment: 'barbell', grip: 'overhand', setup: 'old' };
  assert.deepEqual(withDetails(e, { equipment: 'cable', attachment: 'v-handle', position: 'seated' }), {
    id: 'e1', name: 'Row', createdAt: 5, equipment: 'cable', attachment: 'v-handle', position: 'seated',
  });
  assert.equal(withDetails(e, { name: 'Seated row' }).name, 'Seated row');
});

test('migrateExerciseV2 turns muscleGroup into muscles or setup', () => {
  assert.deepEqual(migrateExerciseV2({ id: 'a', name: 'X', muscleGroup: 'Quads' }), { id: 'a', name: 'X', muscles: ['quads'] });
  assert.deepEqual(migrateExerciseV2({ id: 'a', name: 'X', muscleGroup: 'Chest' }), { id: 'a', name: 'X', setup: 'Chest' });
  assert.deepEqual(migrateExerciseV2({ id: 'a', name: 'X', muscleGroup: '' }), { id: 'a', name: 'X' });
  assert.deepEqual(migrateExerciseV2({ id: 'a', name: 'X', equipment: 'cable' }), { id: 'a', name: 'X', equipment: 'cable' });
});
