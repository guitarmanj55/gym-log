import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestWeight, weightRows, recentWeight, weightChange, withManualWeight, withoutWeight } from './health.js';

const day = (id, o = {}) => ({ id, ...o });

test('latestWeight: newest day that has one, gaps and other metrics ignored', () => {
  const days = [day('2026-10-30', { weightKg: 84.6 }), day('2026-11-01', { steps: 9000 }), day('2026-10-31', { weightKg: 84.4 })];
  assert.deepEqual(latestWeight(days), { day: '2026-10-31', kg: 84.4 });
  assert.equal(latestWeight([]), null);
  assert.equal(latestWeight([day('2026-11-01', { steps: 1 })]), null);
});

test('weightRows: newest first and limited', () => {
  const days = [day('2026-10-29', { weightKg: 85 }), day('2026-10-31', { weightKg: 84 }), day('2026-10-30')];
  assert.deepEqual(weightRows(days, 1), [{ day: '2026-10-31', kg: 84 }]);
  assert.equal(weightRows(days).length, 2);
});

test('recentWeight: averages only the days with a weight inside the span', () => {
  const days = [day('2026-11-01', { weightKg: 84 }), day('2026-10-30', { weightKg: 85 }), day('2026-10-01', { weightKg: 99 })];
  assert.deepEqual(recentWeight(days, '2026-11-01', 7), { kg: 84.5, daysLogged: 2 });
  assert.equal(recentWeight(days, '2026-09-01', 7), null);
});

test('weightChange: needs weights in both weeks, else null', () => {
  const days = [day('2026-11-01', { weightKg: 84 }), day('2026-10-25', { weightKg: 85 })];
  assert.equal(weightChange(days, '2026-11-01', 7), -1);
  assert.equal(weightChange([day('2026-11-01', { weightKg: 84 })], '2026-11-01', 7), null);
});

test('withManualWeight keeps other metrics and marks weight manual', () => {
  const out = withManualWeight({ id: '2026-11-01', steps: 8000, src: { steps: 'import' } }, '2026-11-01', 84.2);
  assert.deepEqual(out, { id: '2026-11-01', steps: 8000, weightKg: 84.2, src: { steps: 'import', weightKg: 'manual' } });
  assert.deepEqual(withManualWeight(undefined, '2026-11-01', 84), { id: '2026-11-01', weightKg: 84, src: { weightKg: 'manual' } });
});

test('withoutWeight: keeps other metrics, and returns null when the day would be empty', () => {
  assert.deepEqual(withoutWeight({ id: 'd', weightKg: 84, steps: 5, src: { weightKg: 'manual', steps: 'import' } }), { id: 'd', steps: 5, src: { steps: 'import' } });
  assert.equal(withoutWeight({ id: 'd', weightKg: 84, src: { weightKg: 'manual' } }), null);
  assert.equal(withoutWeight(undefined), null);
});
