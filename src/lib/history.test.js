import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStart, weekStrip, groupLabel, relativeDay, fmtDuration, fmtSet, headlineSet, prSetIds, recentTopSets, matchesQuery, weeklyCounts,
} from './history.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 21); // Wednesday

test('weekStart is Monday midnight', () => {
  assert.equal(weekStart(NOW), new Date(2026, 9, 19).getTime());
  assert.equal(weekStart(at(2026, 10, 19, 0)), new Date(2026, 9, 19).getTime());
  assert.equal(weekStart(at(2026, 10, 25, 23)), new Date(2026, 9, 19).getTime()); // Sunday
});

test('weekStrip marks trained days and today', () => {
  const strip = weekStrip([at(2026, 10, 19), at(2026, 10, 12)], NOW);
  assert.equal(strip.map((d) => d.label).join(''), 'MTWTFSS');
  assert.deepEqual(strip.map((d) => d.trained), [true, false, false, false, false, false, false]);
  assert.deepEqual(strip.map((d) => d.isToday), [false, false, true, false, false, false, false]);
});

test('groupLabel', () => {
  assert.equal(groupLabel(at(2026, 10, 19), NOW), 'This week');
  assert.equal(groupLabel(at(2026, 10, 16), NOW), 'Last week');
  assert.equal(groupLabel(at(2026, 10, 12), NOW), 'Last week');
  assert.equal(groupLabel(at(2026, 10, 11), NOW), 'October 2026');
  assert.equal(groupLabel(at(2026, 9, 30), NOW), 'September 2026');
});

test('relativeDay', () => {
  assert.equal(relativeDay(at(2026, 10, 21, 7), NOW), 'today');
  assert.equal(relativeDay(at(2026, 10, 20, 23), NOW), 'yesterday');
  assert.equal(relativeDay(at(2026, 10, 19), NOW), 'Monday');
  assert.equal(relativeDay(at(2026, 10, 15), NOW), 'Thursday');
  assert.equal(relativeDay(at(2026, 10, 14), NOW), 'last Wednesday');
  assert.equal(relativeDay(at(2026, 10, 8), NOW), 'Thu 8 Oct');
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(64 * 60000), '1h 04');
  assert.equal(fmtDuration(52 * 60000), '0h 52');
  assert.equal(fmtDuration(-5), '0h 00');
});

test('fmtSet', () => {
  assert.equal(fmtSet({ weightKg: 100, reps: 6 }, 'barbell'), '100 × 6');
  assert.equal(fmtSet({ weightKg: 142.5, reps: 5 }), '142.5 × 5');
  assert.equal(fmtSet({ weightKg: 10, reps: 6 }, 'bodyweight'), 'BW + 10 × 6');
  assert.equal(fmtSet({ weightKg: 0, reps: 8 }, 'bodyweight'), 'BW × 8');
});

test('headlineSet prefers the top set, else the heaviest', () => {
  const w = { type: 'warmup', weightKg: 60, reps: 8, completedAt: 1 };
  const t = { type: 'top', weightKg: 100, reps: 6, completedAt: 2 };
  const b = { type: 'backoff', weightKg: 110, reps: 3, completedAt: 3 };
  assert.equal(headlineSet([w, t, b]), t);
  assert.equal(headlineSet([w, b]), b);
  assert.equal(headlineSet([]), null);
});

test('prSetIds: beats every earlier top set of that lift; first one is not a PR', () => {
  const sets = [
    { id: '1', exerciseId: 'sq', type: 'top', weightKg: 135, reps: 5, completedAt: 1 },
    { id: '2', exerciseId: 'sq', type: 'top', weightKg: 140, reps: 5, completedAt: 2 },
    { id: '3', exerciseId: 'sq', type: 'top', weightKg: 137.5, reps: 5, completedAt: 3 },
    { id: '4', exerciseId: 'sq', type: 'backoff', weightKg: 200, reps: 5, completedAt: 4 },
    { id: '5', exerciseId: 'bp', type: 'top', weightKg: 100, reps: 6, completedAt: 5 },
    { id: '6', exerciseId: 'sq', type: 'top', weightKg: 140, reps: 5, completedAt: 6 }, // equal is not a PR
  ];
  assert.deepEqual([...prSetIds(sets)], ['2']);
});

test('recentTopSets: latest per lift, newest first', () => {
  const sets = [
    { id: 'a', exerciseId: 'sq', type: 'top', completedAt: 1 },
    { id: 'b', exerciseId: 'bp', type: 'top', completedAt: 2 },
    { id: 'c', exerciseId: 'sq', type: 'top', completedAt: 3 },
    { id: 'd', exerciseId: 'dl', type: 'warmup', completedAt: 4 },
  ];
  assert.deepEqual(recentTopSets(sets).map((s) => s.id), ['c', 'b']);
  assert.deepEqual(recentTopSets(sets, 1).map((s) => s.id), ['c']);
});

test('matchesQuery', () => {
  assert.equal(matchesQuery('Mon 19 Oct Bench press Barbell row', 'bench'), true);
  assert.equal(matchesQuery('Mon 19 Oct Bench press Barbell row', 'row oct'), true);
  assert.equal(matchesQuery('Squat', 'bench'), false);
  assert.equal(matchesQuery('Squat', '  '), true);
});

import { dateInputValue, dayDiff, shiftDays, parseAmount } from './history.js';

test('dateInputValue and dayDiff', () => {
  assert.equal(dateInputValue(at(2026, 10, 21, 23)), '2026-10-21');
  assert.equal(dayDiff(at(2026, 10, 21), '2026-10-19'), -2);
  assert.equal(dayDiff(at(2026, 10, 21, 23), '2026-10-21'), 0);
  assert.equal(dayDiff(at(2026, 10, 21), '2026-11-02'), 12);
  assert.equal(dayDiff(at(2026, 10, 21), ''), null);
});

test('shiftDays keeps the time of day, even across a clock change', () => {
  assert.equal(shiftDays(at(2026, 10, 21, 18), -2), at(2026, 10, 19, 18));
  assert.equal(shiftDays(at(2026, 10, 20, 18), 10), at(2026, 10, 30, 18)); // UK clocks go back on 25 Oct
});

test('parseAmount', () => {
  assert.equal(parseAmount('62.5'), 62.5);
  assert.equal(parseAmount(' 62,5 '), 62.5);
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-3'), null);
});

test('weeklyCounts: sessions per week, current week last', () => {
  const starts = [at(2026, 10, 19), at(2026, 10, 21), at(2026, 10, 14), at(2026, 10, 12), at(2026, 10, 13), at(2026, 8, 1), at(2026, 10, 26)];
  const counts = weeklyCounts(starts, NOW, 4);
  assert.equal(counts.length, 4);
  assert.deepEqual(counts.map((w) => w.count), [0, 0, 3, 2]); // 1 Aug is too old, 26 Oct is next week
  assert.equal(counts.at(-1).start, new Date(2026, 9, 19).getTime());
});
