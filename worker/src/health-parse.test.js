import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHealth, mergeDay, dayOf } from './health-parse.js';

const NOW = Date.UTC(2026, 10, 1, 12); // 1 Nov 2026

test('dayOf reads dates in the forms phones send and rejects the rest', () => {
  assert.equal(dayOf('2026-11-01'), '2026-11-01');
  assert.equal(dayOf('2026-11-01 07:30:00 +0000'), '2026-11-01');
  assert.equal(dayOf('2026-11-01T07:30:00Z'), '2026-11-01');
  assert.equal(dayOf('2026-02-30'), null);
  assert.equal(dayOf('today'), null);
  assert.equal(dayOf(undefined), null);
});

test('simple payload: every metric is optional', () => {
  const { days } = parseHealth({ date: '2026-11-01', weightKg: 84.24, steps: 8123.6, sleepHours: 7.5, activeKcal: 512, restingHr: 58 }, NOW);
  assert.deepEqual(days, { '2026-11-01': { weightKg: 84.2, steps: 8124, sleepMin: 450, activeKcal: 512, restingHr: 58 } });
  assert.deepEqual(parseHealth({ date: '2026-11-01', steps: 100 }, NOW).days, { '2026-11-01': { steps: 100 } });
});

test('simple payload: numbers sent as text work, junk is dropped, nothing becomes 0', () => {
  const { days, skipped } = parseHealth({ date: '2026-11-01', weightKg: '84,2', steps: '9000', restingHr: 'n/a', activeKcal: null }, NOW);
  assert.deepEqual(days, { '2026-11-01': { weightKg: 84.2, steps: 9000 } });
  assert.equal(skipped, 1); // "n/a" is skipped; a null (nothing sent) is not counted
});

test('out-of-range values are skipped, not clamped', () => {
  const { days, skipped } = parseHealth({ date: '2026-11-01', weightKg: 5, steps: 9000, restingHr: 400 }, NOW);
  assert.deepEqual(days, { '2026-11-01': { steps: 9000 } });
  assert.equal(skipped, 2);
});

test('a day list, and days with nothing usable are left out', () => {
  const { days } = parseHealth({ days: [{ date: '2026-10-30', steps: 1 }, { date: '2026-10-31' }, { date: 'bad', steps: 2 }, { date: '2026-10-29', weightKg: 85 }] }, NOW);
  assert.deepEqual(Object.keys(days).sort(), ['2026-10-29', '2026-10-30']);
});

test('days well in the future are refused', () => {
  const { days, skipped } = parseHealth({ date: '2026-12-25', steps: 5 }, NOW);
  assert.deepEqual(days, {});
  assert.equal(skipped, 1);
  assert.deepEqual(parseHealth({ date: '2026-11-02', steps: 5 }, NOW).days, { '2026-11-02': { steps: 5 } }); // time-zone slack
});

const hae = (metrics) => ({ data: { metrics } });

test('Health Auto Export: steps and energy add up, weight and heart rate take the latest reading', () => {
  const { days } = parseHealth(hae([
    { name: 'step_count', units: 'count', data: [{ date: '2026-11-01 08:00:00 +0000', qty: 3000 }, { date: '2026-11-01 18:00:00 +0000', qty: 4000.4 }] },
    { name: 'active_energy', units: 'kcal', data: [{ date: '2026-11-01 08:00:00 +0000', qty: 200 }, { date: '2026-11-01 18:00:00 +0000', qty: 300 }] },
    { name: 'weight_body_mass', units: 'kg', data: [{ date: '2026-11-01 07:00:00 +0000', qty: 84.6 }, { date: '2026-11-01 21:00:00 +0000', qty: 84.1 }] },
    { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-11-01 00:00:00 +0000', qty: 57 }] },
  ]), NOW);
  assert.deepEqual(days, { '2026-11-01': { steps: 7000, activeKcal: 500, weightKg: 84.1, restingHr: 57 } });
});

test('Health Auto Export: pounds, kilojoules and sleep in hours are converted', () => {
  const { days } = parseHealth(hae([
    { name: 'weight_body_mass', units: 'lb', data: [{ date: '2026-11-01', qty: 185 }] },
    { name: 'active_energy', units: 'kJ', data: [{ date: '2026-11-01', qty: 2092 }] },
    { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-11-01', totalSleep: 7.25, inBed: 8 }] },
  ]), NOW);
  assert.deepEqual(days, { '2026-11-01': { weightKg: 83.9, activeKcal: 500, sleepMin: 435 } });
});

test('Health Auto Export: unknown metrics and samples with no value are ignored', () => {
  const { days } = parseHealth(hae([
    { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-11-01', qty: 50 }] },
    { name: 'step_count', units: 'count', data: [{ date: '2026-11-01' }, { qty: 5 }] },
  ]), NOW);
  assert.deepEqual(days, {});
});

test('garbage bodies give nothing and do not throw', () => {
  for (const body of [null, undefined, 5, 'x', [], {}, { data: {} }, { data: { metrics: 'no' } }]) {
    assert.deepEqual(parseHealth(body, NOW).days, {});
  }
});

test('mergeDay keeps fields that were not sent and takes new ones', () => {
  assert.deepEqual(mergeDay({ weightKg: 84, steps: 100, at: 1 }, { steps: 200 }, 9), { weightKg: 84, steps: 200, at: 9 });
  assert.deepEqual(mergeDay(undefined, { steps: 5 }, 9), { steps: 5, at: 9 });
});
