import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mealAverage, entryFromMeal, quickEntry, dayTotal, recentAverage, mealsByUse, copyDay, fmtKcal,
} from './food.js';

let n = 0;
const meal = (o = {}) => ({ id: 'm1', name: 'Burger and chips', kcal: 900, createdAt: 1, ...o });
const entry = (o = {}) => ({ id: `e${++n}`, at: 1, day: '2026-11-01', mealId: 'm1', name: 'Burger and chips', kcal: 900, portion: 1, ...o });

test('mealAverage: with nothing logged it uses the meal\'s own estimate', () => {
  assert.deepEqual(mealAverage(meal(), []), { kcal: 900, low: 900, high: 900, protein: null, n: 0 });
});

test('mealAverage: averages logged entries and widens the range to match', () => {
  const out = mealAverage(meal(), [entry({ kcal: 800 }), entry({ kcal: 1000 }), entry({ kcal: 1200 })]);
  assert.equal(out.kcal, 1000);
  assert.equal(out.low, 800);
  assert.equal(out.high, 1200);
  assert.equal(out.n, 3);
});

test('mealAverage: a bigger helping does not pull the average up', () => {
  const out = mealAverage(meal(), [entry({ kcal: 900 }), entry({ kcal: 1125, portion: 1.25 })]);
  assert.equal(out.kcal, 900);
});

test('mealAverage: ignores other meals and keeps the meal\'s own range', () => {
  const out = mealAverage(meal({ low: 700, high: 1100 }), [entry({ mealId: 'other', kcal: 5000 }), entry({ kcal: 950 })]);
  assert.deepEqual([out.kcal, out.low, out.high], [950, 700, 1100]);
});

test('mealAverage: protein averages only the entries that have it', () => {
  assert.equal(mealAverage(meal({ protein: 40 }), []).protein, 40);
  assert.equal(mealAverage(meal(), [entry({ protein: 30 }), entry()]).protein, 30);
});

test('entryFromMeal scales the average by the portion', () => {
  const e = entryFromMeal(meal({ protein: 40 }), [], { portion: 1.25, at: 5, day: '2026-11-02', id: 'x' });
  assert.deepEqual(e, { id: 'x', at: 5, day: '2026-11-02', mealId: 'm1', name: 'Burger and chips', portion: 1.25, kcal: 1125, protein: 50 });
});

test('quickEntry', () => {
  assert.deepEqual(quickEntry({ id: 'q', at: 1, day: 'd', name: '  Lunch ', kcal: 799.6 }), { id: 'q', at: 1, day: 'd', mealId: null, name: 'Lunch', portion: 1, kcal: 800 });
  assert.equal(quickEntry({ id: 'q', at: 1, day: 'd', name: '', kcal: 300 }).name, 'Quick entry');
});

test('dayTotal: sums the day and spreads by each saved meal\'s range', () => {
  const entries = [entry({ kcal: 800 }), entry({ kcal: 1200 }), entry({ mealId: null, name: 'Coffee', kcal: 100 }), entry({ day: '2026-10-31', kcal: 3000 })];
  const t = dayTotal('2026-11-01', entries, [meal()]);
  assert.equal(t.kcal, 2100);
  assert.equal(t.count, 3);
  assert.ok(t.low < 2100 && t.high > 2100);
});

test('dayTotal: an empty day is all zeros', () => {
  assert.deepEqual(dayTotal('2026-11-01', [], []), { kcal: 0, low: 0, high: 0, protein: 0, count: 0 });
});

test('recentAverage: unlogged days are left out, not counted as zero', () => {
  const entries = [entry({ day: '2026-11-01', kcal: 2000 }), entry({ day: '2026-10-30', kcal: 2400 }), entry({ day: '2026-10-01', kcal: 9000 })];
  assert.deepEqual(recentAverage(entries, '2026-11-01', 7), { kcal: 2200, daysLogged: 2 });
  assert.equal(recentAverage([], '2026-11-01'), null);
});

test('mealsByUse: most used first, archived hidden', () => {
  const meals = [meal({ id: 'a', name: 'Salad' }), meal({ id: 'b', name: 'Burger' }), meal({ id: 'c', name: 'Curry', archived: true })];
  const entries = [entry({ mealId: 'b' }), entry({ mealId: 'b' }), entry({ mealId: 'c' })];
  assert.deepEqual(mealsByUse(meals, entries).map((m) => m.id), ['b', 'a']);
});

test('copyDay copies a day onto another with new ids', () => {
  let k = 0;
  const out = copyDay([entry({ day: '2026-10-31' }), entry({ day: '2026-10-30' })], '2026-10-31', '2026-11-01', 100, () => `n${++k}`);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].day, out[0].at, out[0].id], ['2026-11-01', 100, 'n1']);
});

test('fmtKcal shows a range only when it is wide enough to matter', () => {
  assert.equal(fmtKcal({ kcal: 2300, low: 1900, high: 2700 }), '2,300 (1,900–2,700)');
  assert.equal(fmtKcal({ kcal: 2300, low: 2280, high: 2320 }), '2,300');
  assert.equal(fmtKcal({ kcal: 2300, low: 1900, high: 2700 }, { showRange: false }), '2,300');
});
