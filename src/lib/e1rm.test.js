import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, bestByE1rm } from './e1rm.js';

test('Epley formula', () => {
  assert.equal(e1rm(100, 6), 120);
  assert.equal(e1rm(180, 3), 198);
  assert.equal(e1rm(60, 30), 120);
});

test('a single is just the weight', () => {
  assert.equal(e1rm(200, 1), 200);
});

test('no reps or no weight gives 0', () => {
  assert.equal(e1rm(100, 0), 0);
  assert.equal(e1rm(0, 5), 0);
  assert.equal(e1rm(NaN, 5), 0);
});

test('bestByE1rm picks the highest, ties go to the later set', () => {
  assert.equal(bestByE1rm([]), null);
  const a = { weightKg: 100, reps: 6, completedAt: 1 };
  const b = { weightKg: 105, reps: 3, completedAt: 2 }; // 115.5
  const c = { weightKg: 100, reps: 6, completedAt: 3 };
  assert.equal(bestByE1rm([a, b]), a);
  assert.equal(bestByE1rm([a, b, c]), c);
  assert.equal(bestByE1rm([b, { weightKg: 110, reps: 3, completedAt: 0 }]).weightKg, 110); // 121
});
