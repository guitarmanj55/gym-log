import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prFor, weeklyMuscleSets, fmtSetCount, staleLifts, sessionSummary, fmtChange, summaryText } from './feedback.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 21); // Wednesday
let n = 0;
const set = (o) => ({ id: `s${++n}`, sessionId: 'x', sessionExerciseId: 'se', exerciseId: 'bench', type: 'top', weightKg: 100, reps: 5, completedAt: NOW, ...o });

test('prFor: beats every earlier top set of the same lift', () => {
  const old = [set({ weightKg: 100, reps: 5, completedAt: at(2026, 10, 1) }), set({ weightKg: 105, reps: 3, completedAt: at(2026, 10, 8) })];
  const pr = prFor(set({ weightKg: 102.5, reps: 5 }), old);
  assert.ok(pr);
  assert.equal(Math.round(pr.previous * 10) / 10, 116.7); // 105 × 3 beats 100 × 5
  assert.equal(Math.round(pr.gain * 10) / 10, 2.9); // 102.5 × 5 = 119.6
});

test('prFor: ties, warm-ups, other lifts and first sets are not PRs', () => {
  const old = [set({ weightKg: 100, reps: 5, completedAt: at(2026, 10, 1) })];
  assert.equal(prFor(set({ weightKg: 100, reps: 5 }), old), null);
  assert.equal(prFor(set({ type: 'backoff', weightKg: 200 }), old), null);
  assert.equal(prFor(set({ exerciseId: 'squat', weightKg: 200 }), old), null);
  assert.equal(prFor(set({ weightKg: 200 }), []), null);
  // A later set doesn't count against an earlier one.
  assert.ok(prFor(set({ weightKg: 110, completedAt: at(2026, 10, 2) }), [...old, set({ weightKg: 150, completedAt: at(2026, 10, 9) })]));
});

test('weeklyMuscleSets: primary counts 1, others ½, only work sets this week', () => {
  const exercises = new Map([
    ['bench', { muscles: ['chest', 'arms'] }],
    ['dip', { muscles: ['arms'] }],
    ['curl', {}],
  ]);
  const sets = [
    set({ exerciseId: 'bench' }), set({ exerciseId: 'bench', type: 'backoff' }), set({ exerciseId: 'bench', type: 'warmup' }),
    set({ exerciseId: 'dip' }),
    set({ exerciseId: 'curl' }),
    set({ exerciseId: 'dip', completedAt: at(2026, 10, 18) }), // last Sunday
  ];
  const { rows, unassigned } = weeklyMuscleSets(sets, exercises, NOW);
  assert.deepEqual(rows.map((r) => [r.label, r.sets]), [['Arms', 2], ['Chest', 2]]);
  assert.equal(unassigned, 1);
});

test('fmtSetCount', () => {
  assert.equal(fmtSetCount(4), '4');
  assert.equal(fmtSetCount(4.5), '4½');
  assert.equal(fmtSetCount(0.5), '½');
});

test('staleLifts: between 10 and 56 days ago, longest gap first', () => {
  const exercises = new Map([['a', { name: 'A' }], ['b', { name: 'B' }], ['c', { name: 'C' }], ['d', { name: 'D' }]]);
  const sets = [
    set({ exerciseId: 'a', completedAt: NOW - 3 * 86400000 }),
    set({ exerciseId: 'b', completedAt: NOW - 12 * 86400000 }),
    set({ exerciseId: 'b', completedAt: NOW - 30 * 86400000 }),
    set({ exerciseId: 'c', completedAt: NOW - 20 * 86400000 }),
    set({ exerciseId: 'd', completedAt: NOW - 90 * 86400000 }),
  ];
  assert.deepEqual(staleLifts(sets, exercises, NOW).map((x) => [x.exercise.name, x.days]), [['C', 20], ['B', 12]]);
});

test('sessionSummary: change vs the last session before it, PRs and totals', () => {
  const s1 = at(2026, 10, 14, 10);
  const s2 = at(2026, 10, 21, 10);
  const prior = [
    set({ sessionId: 'old', weightKg: 100, reps: 5, completedAt: s1 + 60000 }),
    set({ sessionId: 'old', exerciseId: 'row', weightKg: 80, reps: 8, completedAt: s1 + 120000 }),
  ];
  const benchSets = [
    set({ sessionId: 'new', type: 'warmup', weightKg: 60, reps: 8, completedAt: s2 + 60000 }),
    set({ sessionId: 'new', weightKg: 105, reps: 5, completedAt: s2 + 120000 }),
    set({ sessionId: 'new', type: 'backoff', weightKg: 90, reps: 8, completedAt: s2 + 180000 }),
  ];
  const rowSets = [set({ sessionId: 'new', exerciseId: 'row', weightKg: 75, reps: 8, completedAt: s2 + 240000 })];
  const sum = sessionSummary(
    { startedAt: s2, endedAt: s2 + 64 * 60000 },
    [{ exercise: { name: 'Bench' }, sets: benchSets }, { exercise: { name: 'Row' }, sets: rowSets }, { exercise: { name: 'Empty' }, sets: [] }],
    [...prior, ...benchSets, ...rowSets],
  );
  assert.deepEqual(sum.lifts.map((l) => [l.name, l.e1rm, l.change, l.pr]), [['Bench', 123, 6, true], ['Row', 95, -6, false]]);
  assert.equal(sum.sets, 4);
  assert.equal(sum.workSets, 3);
  assert.equal(sum.volumeKg, 105 * 5 + 90 * 8 + 75 * 8);
  assert.equal(sum.prCount, 1);
  assert.equal(summaryText(sum), [
    'Gym Log · Wed 21 Oct · 1h 04',
    '',
    'Bench: 105 × 5 (e1RM 123 +6) PR',
    'Row: 75 × 8 (e1RM 95 −6)',
    '',
    '4 sets · 1,845 kg moved · 1 PR',
  ].join('\n'));
});

test('fmtChange', () => {
  assert.equal(fmtChange(null), '');
  assert.equal(fmtChange(0), 'same');
  assert.equal(fmtChange(3), '+3');
  assert.equal(fmtChange(-2), '−2');
});

import { stalledLifts, volumeChange } from './feedback.js';

test('stalledLifts flags lifts with no new best for 3 sessions, recent ones only', () => {
  const day = 24 * 60 * 60 * 1000;
  const NOW = 100 * day;
  const top = (ex, i, kg, reps = 5, daysAgo = 0) => ({ id: `${ex}${i}`, exerciseId: ex, sessionId: `${ex}s${i}`, type: 'top', weightKg: kg, reps, completedAt: NOW - daysAgo * day });
  const exercises = new Map([['a', { id: 'a', name: 'Bench' }], ['b', { id: 'b', name: 'Squat' }], ['c', { id: 'c', name: 'Row' }]]);
  const sets = [
    top('a', 1, 100, 5, 30), top('a', 2, 105, 5, 23), top('a', 3, 100, 5, 16), top('a', 4, 100, 5, 9), top('a', 5, 100, 5, 2), // stalled
    top('b', 1, 100, 5, 30), top('b', 2, 105, 5, 23), top('b', 3, 105, 6, 16), top('b', 4, 110, 5, 9), top('b', 5, 110, 6, 2), // progressing
    top('c', 1, 60, 5, 90), top('c', 2, 65, 5, 83), top('c', 3, 60, 5, 76), top('c', 4, 60, 5, 69), top('c', 5, 60, 5, 62), // stalled but long ago
  ];
  const out = stalledLifts(sets, exercises, NOW);
  assert.deepEqual(out.map((x) => [x.exercise.name, x.sessions]), [['Bench', 3]]);
});

test('volumeChange is a whole percentage against the last time', () => {
  assert.equal(volumeChange(5400, 5000), 8);
  assert.equal(volumeChange(4500, 5000), -10);
  assert.equal(volumeChange(5000, 5000), 0);
  assert.equal(volumeChange(5000, 0), null);
  assert.equal(volumeChange(5000, undefined), null);
});
