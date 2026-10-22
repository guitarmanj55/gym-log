import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastSessionSets, topSetOf, planFromLast, remainingPlan, buildRows, insertIndex } from './plan.js';

const set = (sessionId, type, weightKg, reps, completedAt, extra = {}) =>
  ({ id: `${sessionId}-${completedAt}`, sessionId, type, weightKg, reps, completedAt, ...extra });

const history = [
  set('a', 'warmup', 60, 8, 1), set('a', 'top', 135, 5, 2),
  set('b', 'warmup', 60, 8, 10), set('b', 'warmup', 100, 3, 11), set('b', 'top', 140, 5, 12), set('b', 'backoff', 120, 8, 13),
  set('now', 'warmup', 60, 8, 20),
];

test('lastSessionSets picks the latest other session, oldest set first', () => {
  const last = lastSessionSets(history, 'now');
  assert.deepEqual(last.map((s) => s.completedAt), [10, 11, 12, 13]);
  assert.deepEqual(lastSessionSets([], 'now'), []);
  assert.deepEqual(lastSessionSets(history.slice(-1), 'now'), []);
});

test('topSetOf', () => {
  assert.equal(topSetOf(lastSessionSets(history, 'now')).weightKg, 140);
  assert.equal(topSetOf([set('x', 'warmup', 60, 8, 1)]), null);
});

test('plan repeats warm-ups and back-offs and beats the top set by one step', () => {
  assert.deepEqual(planFromLast(lastSessionSets(history, 'now'), { stepKg: 2.5 }), [
    { type: 'warmup', weightKg: 60, reps: 8 },
    { type: 'warmup', weightKg: 100, reps: 3 },
    { type: 'top', weightKg: 142.5, reps: 5 },
    { type: 'backoff', weightKg: 120, reps: 8 },
  ]);
});

test('plan for a new lift is a warm-up and two top sets at the start weight', () => {
  assert.deepEqual(planFromLast([], { startKg: 20 }), [
    { type: 'warmup', weightKg: 20, reps: 8 },
    { type: 'top', weightKg: 20, reps: 5 },
    { type: 'top', weightKg: 20, reps: 5 },
  ]);
});

test('plan repeats several top sets, bumping only the best one, and keeps "to failure"', () => {
  const last = [
    set('a', 'warmup', 60, 8, 1),
    set('a', 'top', 100, 6, 2, { toFailure: true }),
    set('a', 'top', 100, 5, 3, { toFailure: true }),
    set('a', 'top', 95, 5, 4),
  ];
  assert.deepEqual(planFromLast(last, { stepKg: 2.5 }), [
    { type: 'warmup', weightKg: 60, reps: 8 },
    { type: 'top', weightKg: 102.5, reps: 6, toFailure: true },
    { type: 'top', weightKg: 100, reps: 5, toFailure: true },
    { type: 'top', weightKg: 95, reps: 5 },
  ]);
});

test('remainingPlan covers one planned top set per logged top set', () => {
  const plan = [{ type: 'top', weightKg: 100, reps: 6 }, { type: 'top', weightKg: 100, reps: 5 }];
  assert.deepEqual(remainingPlan(plan, [set('now', 'top', 100, 7, 1)]), [{ type: 'top', weightKg: 100, reps: 5 }]);
});

test('plan with no top set last time starts from the heaviest set', () => {
  const plan = planFromLast([set('a', 'warmup', 60, 8, 1), set('a', 'warmup', 80, 5, 2)], { startKg: 20 });
  assert.deepEqual(plan.at(-1), { type: 'top', weightKg: 80, reps: 5 });
});

test('remainingPlan drops the first planned set of each logged type', () => {
  const plan = planFromLast(lastSessionSets(history, 'now'));
  const left = remainingPlan(plan, [set('now', 'warmup', 60, 8, 20)]);
  assert.deepEqual(left.map((p) => `${p.type} ${p.weightKg}`), ['warmup 100', 'top 142.5', 'backoff 120']);
  assert.equal(plan.length, 4); // input untouched
});

test('buildRows groups logged then planned by type', () => {
  const logged = [set('now', 'top', 142.5, 6, 30), set('now', 'warmup', 60, 8, 20)];
  const plan = [{ type: 'warmup', weightKg: 100, reps: 3 }, { type: 'backoff', weightKg: 120, reps: 8 }];
  const rows = buildRows(plan, logged);
  assert.deepEqual(rows.map((r) => `${r.type} ${r.weightKg} ${r.set ? 'done' : r.planIndex}`),
    ['warmup 60 done', 'warmup 100 0', 'top 142.5 done', 'backoff 120 1']);
  assert.deepEqual(rows.map((r) => `${r.n}/${r.of}`), ['1/2', '2/2', '1/1', '1/1']);
});

test('insertIndex puts a new set after the others of its type', () => {
  const plan = [{ type: 'warmup' }, { type: 'top' }, { type: 'backoff' }];
  assert.equal(insertIndex(plan, 'warmup'), 1);
  assert.equal(insertIndex(plan, 'backoff'), 3);
  assert.equal(insertIndex([{ type: 'top' }], 'warmup'), 0);
  assert.equal(insertIndex([], 'backoff'), 0);
});
