import test from 'node:test';
import assert from 'node:assert/strict';
import { withCurrent, togglePlate, fmtRest, fmtVolume, weekStreak, lifetimeStats, nextSplit, splitLabel } from './profile.js';
import { normaliseSettings } from '../db/schema.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 31, 12).getTime(); // Saturday 31 Oct 2026

test('withCurrent keeps custom values', () => {
  assert.deepEqual(withCurrent([1, 2.5, 5], 2.5), [1, 2.5, 5]);
  assert.deepEqual(withCurrent([1, 2.5, 5], 2), [1, 2, 2.5, 5]);
});

test('togglePlate adds, removes and never empties', () => {
  assert.deepEqual(togglePlate([20, 10], 25), [25, 20, 10]);
  assert.deepEqual(togglePlate([25, 20, 10], 20), [25, 10]);
  assert.deepEqual(togglePlate([10], 10), [10]);
});

test('formatters', () => {
  assert.equal(fmtRest(30), '30s');
  assert.equal(fmtRest(90), '90s');
  assert.equal(fmtRest(120), '2 min');
  assert.equal(fmtRest(150), '2.5 min');
  assert.equal(fmtVolume(820), '820 kg');
  assert.equal(fmtVolume(18430), '18.4 t');
  assert.equal(fmtVolume(184300), '184 t');
  assert.equal(fmtVolume(1234567), '1235 t');
});

test('weekStreak counts back from this week or last', () => {
  const at = (daysAgo) => NOW - daysAgo * DAY;
  assert.equal(weekStreak([], NOW), 0);
  assert.equal(weekStreak([at(1), at(8), at(15)], NOW), 3);
  assert.equal(weekStreak([at(8), at(15)], NOW), 2); // nothing yet this week: not broken
  assert.equal(weekStreak([at(1), at(15)], NOW), 1);  // a missed week breaks it
  assert.equal(weekStreak([at(22)], NOW), 0);
});

test('lifetimeStats totals finished workouts only', () => {
  const finished = [{ id: 's1', startedAt: NOW - 3 * DAY }, { id: 's2', startedAt: NOW - 10 * DAY }];
  const ex = new Map([['bench', { name: 'Bench', equipment: 'barbell' }], ['pull', { name: 'Pull-up', equipment: 'bodyweight' }]]);
  const sets = [
    { sessionId: 's1', exerciseId: 'bench', type: 'top', weightKg: 100, reps: 5 },
    { sessionId: 's1', exerciseId: 'bench', type: 'warmup', weightKg: 60, reps: 8 },
    { sessionId: 's2', exerciseId: 'bench', type: 'top', weightKg: 90, reps: 5 },
    { sessionId: 's2', exerciseId: 'pull', type: 'top', weightKg: 10, reps: 8 },
    { sessionId: 'live', exerciseId: 'bench', type: 'top', weightKg: 200, reps: 5 },
  ];
  const out = lifetimeStats(finished, sets, ex, NOW);
  assert.equal(out.sessions, 2);
  assert.equal(out.workSets, 3);
  assert.equal(out.volumeKg, 100 * 5 + 90 * 5 + 10 * 8);
  assert.equal(out.since, NOW - 10 * DAY);
  assert.deepEqual(out.bestLifts, [{ id: 'bench', name: 'Bench', e1rm: 117 }]);
});

test('nextSplit picks the longest-neglected main group', () => {
  const ex = new Map([['bench', { muscles: ['chest'] }], ['row', { muscles: ['back'] }]]);
  const splits = [{ main: 'chest', support: 'triceps' }, { main: 'back', support: 'biceps' }];
  const set = (exerciseId, daysAgo) => ({ exerciseId, type: 'top', completedAt: NOW - daysAgo * DAY });
  const out = nextSplit(splits, [set('bench', 2), set('row', 6)], ex, NOW);
  assert.deepEqual(out.split, splits[1]);
  assert.equal(out.days, 6);
  assert.equal(splitLabel(out.split), 'Back + Biceps');
  assert.equal(nextSplit(splits, [set('bench', 2)], ex, NOW).days, null); // back never trained
  assert.equal(nextSplit([], [], ex, NOW), null);
  assert.equal(nextSplit([splits[0]], [set('bench', 0)], ex, NOW), null); // already trained today
});

test('normaliseSettings sanitises the profile fields', () => {
  const s = normaliseSettings({ restSec: 5, sound: 0, name: '  Oli ', splits: [{ main: 'chest', support: 'triceps' }, { main: 'chest', support: 'chest' }, { main: 'x', support: 'legs' }] });
  assert.equal(s.restSec, 60);
  assert.equal(s.sound, true);
  assert.equal(s.name, 'Oli');
  assert.deepEqual(s.splits, [{ main: 'chest', support: 'triceps' }]);
  assert.equal(normaliseSettings({ sound: false }).sound, false);
  assert.equal(normaliseSettings({ restSec: 90 }).restSec, 90);
});
