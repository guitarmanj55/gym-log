import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from './library-data.js';
import { LIBRARY_GROUPS, filterLibrary, detailsFor, imagePaths, subtitle } from './library.js';
import { EQUIPMENT, cleanDetails } from './exercise.js';

test('every entry has a known group, equipment, steps and photos', () => {
  const groups = new Set(LIBRARY_GROUPS.map(([k]) => k));
  const equipment = new Set(EQUIPMENT.map(([k]) => k));
  const ids = new Set();
  for (const e of LIBRARY) {
    assert.ok(groups.has(e.group), `${e.id} group`);
    assert.ok(equipment.has(e.equipment), `${e.id} equipment`);
    assert.ok(e.steps.length > 0 && e.primary.length > 0, `${e.id} text`);
    assert.ok(!ids.has(e.id), `${e.id} duplicate`);
    ids.add(e.id);
  }
  for (const [g] of LIBRARY_GROUPS) assert.ok(LIBRARY.some((e) => e.group === g), `${g} has lifts`);
});

test('filter by group and by search words', () => {
  const chest = filterLibrary(LIBRARY, { group: 'chest' });
  assert.ok(chest.length > 5 && chest.every((e) => e.group === 'chest'));
  const hits = filterLibrary(LIBRARY, { query: 'dumbbell incline' });
  assert.ok(hits.length > 0 && hits.every((e) => /incline/i.test(e.name) && e.equipment === 'dumbbell'));
  assert.equal(filterLibrary(LIBRARY, { query: 'zzzz' }).length, 0);
});

test('detailsFor maps to a saved exercise (biceps and triceps are stored as arms)', () => {
  const curl = LIBRARY.find((e) => e.group === 'biceps');
  const d = cleanDetails(detailsFor(curl));
  assert.equal(d.name, curl.name);
  assert.deepEqual(d.muscles, ['arms']);
  assert.equal(d.equipment, curl.equipment);
});

test('imagePaths and subtitle', () => {
  assert.deepEqual(imagePaths({ id: 'X', images: 2 }), ['library/X/0.jpg', 'library/X/1.jpg']);
  assert.equal(subtitle({ primary: ['Chest'], equipment: 'barbell' }), 'Chest · Barbell');
});
