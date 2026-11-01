import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestWeight, weightRows, recentWeight, weightChange, withManualWeight, withoutWeight, mergeImported, latestMetric, fmtSleep,
} from './health.js';

test('mergeImported: new day, newer import replaces older import, same data changes nothing', () => {
  const first = mergeImported(undefined, '2026-11-01', { steps: 3000, weightKg: 84 });
  assert.deepEqual(first, { id: '2026-11-01', steps: 3000, weightKg: 84, src: { steps: 'import', weightKg: 'import' } });
  const later = mergeImported(first, '2026-11-01', { steps: 9000 });
  assert.equal(later.steps, 9000);
  assert.equal(later.weightKg, 84);
  assert.equal(mergeImported(later, '2026-11-01', { steps: 9000 }), null);
  assert.equal(mergeImported(undefined, '2026-11-01', {}), null);
});

test('mergeImported never overwrites a number typed by hand, but fills the other metrics', () => {
  const mine = withManualWeight(undefined, '2026-11-01', 84.2);
  const out = mergeImported(mine, '2026-11-01', { weightKg: 90, steps: 100 });
  assert.equal(out.weightKg, 84.2);
  assert.equal(out.src.weightKg, 'manual');
  assert.equal(out.steps, 100);
  assert.equal(mergeImported(mine, '2026-11-01', { weightKg: 90 }), null);
});

test('latestMetric: newest value in the window, null when there is no data', () => {
  const days = [day('2026-10-31', { steps: 5000 }), day('2026-10-20', { steps: 1 }), day('2026-11-01', { sleepMin: 400 })];
  assert.deepEqual(latestMetric(days, 'steps', '2026-11-01', 14), { day: '2026-10-31', value: 5000 });
  assert.deepEqual(latestMetric(days, 'sleepMin', '2026-11-01'), { day: '2026-11-01', value: 400 });
  assert.equal(latestMetric(days, 'restingHr', '2026-11-01'), null);
  assert.equal(latestMetric([day('2026-09-01', { steps: 5 })], 'steps', '2026-11-01'), null); // too old
  assert.equal(latestMetric([], 'steps', '2026-11-01'), null);
});

test('fmtSleep', () => {
  assert.equal(fmtSleep(437), '7h 17m');
  assert.equal(fmtSleep(420), '7h 00m');
});

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
