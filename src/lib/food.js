// Food log maths for the Food and Today screens. Pure: no DOM or browser globals.
// Calories are estimates (Oli mostly eats out), so a saved meal keeps a running average and a range.
import { dateInputValue, shiftDays } from './history.js';

export const PORTIONS = [
  { value: 0.75, label: 'Smaller' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Bigger' },
];

const round = (n) => Math.round(n);

/**
 * What a saved meal usually comes to. Each logged entry is divided by its portion, so a "bigger"
 * helping doesn't pull the average up. With no entries yet the meal's own estimate is used.
 * `low`/`high` are the meal's own range if it has one, widened by anything logged outside it.
 * @returns {{kcal: number, low: number, high: number, protein: number|null, n: number}}
 */
export function mealAverage(meal, entries) {
  const mine = entries.filter((e) => e.mealId === meal.id && e.kcal >= 0 && e.portion > 0);
  const per = mine.map((e) => e.kcal / e.portion);
  const kcal = per.length ? round(per.reduce((a, b) => a + b, 0) / per.length) : round(meal.kcal);
  let low = Number.isFinite(meal.low) ? meal.low : kcal;
  let high = Number.isFinite(meal.high) ? meal.high : kcal;
  for (const v of per) { low = Math.min(low, v); high = Math.max(high, v); }
  const prot = mine.filter((e) => Number.isFinite(e.protein)).map((e) => e.protein / e.portion);
  const protein = prot.length
    ? round(prot.reduce((a, b) => a + b, 0) / prot.length)
    : Number.isFinite(meal.protein) ? round(meal.protein) : null;
  return { kcal, low: round(Math.min(low, kcal)), high: round(Math.max(high, kcal)), protein, n: per.length };
}

/** The entry to store when Oli taps a meal: calories are the meal's average times the portion. */
export function entryFromMeal(meal, entries, { portion = 1, at, day, id }) {
  const avg = mealAverage(meal, entries);
  return {
    id, at, day, mealId: meal.id, name: meal.name, portion,
    kcal: round(avg.kcal * portion),
    ...(avg.protein !== null ? { protein: round(avg.protein * portion) } : {}),
  };
}

/** A quick entry that isn't a saved meal. */
export function quickEntry({ id, at, day, name, kcal, protein }) {
  return { id, at, day, mealId: null, name: name?.trim() || 'Quick entry', portion: 1, kcal: round(kcal), ...(Number.isFinite(protein) ? { protein: round(protein) } : {}) };
}

/**
 * One day's total. The range widens by each saved meal's spread (scaled by its portion);
 * quick entries count as typed with no spread.
 * @returns {{kcal: number, low: number, high: number, protein: number, count: number}}
 */
export function dayTotal(day, entries, meals) {
  const byId = new Map(meals.map((m) => [m.id, m]));
  let kcal = 0, low = 0, high = 0, protein = 0, count = 0;
  for (const e of entries.filter((x) => x.day === day)) {
    count++;
    kcal += e.kcal;
    protein += Number.isFinite(e.protein) ? e.protein : 0;
    const meal = e.mealId ? byId.get(e.mealId) : null;
    const avg = meal ? mealAverage(meal, entries) : null;
    if (avg && avg.high > avg.low) {
      const per = e.kcal / (avg.kcal || 1); // entry vs the average, so the spread keeps its shape
      low += e.kcal - (avg.kcal - avg.low) * per;
      high += e.kcal + (avg.high - avg.kcal) * per;
    } else { low += e.kcal; high += e.kcal; }
  }
  return { kcal: round(kcal), low: round(low), high: round(high), protein: round(protein), count };
}

/**
 * Average daily calories over the last `days` days up to and including `today` ('YYYY-MM-DD').
 * A day with no entries is "not logged", not zero, so it is left out. Null if nothing was logged.
 * @returns {{kcal: number, daysLogged: number}|null}
 */
export function recentAverage(entries, today, days = 7) {
  const base = new Date(`${today}T12:00:00`).getTime();
  const wanted = new Set(Array.from({ length: days }, (_, i) => dateInputValue(shiftDays(base, -i))));
  const perDay = new Map();
  for (const e of entries) if (wanted.has(e.day)) perDay.set(e.day, (perDay.get(e.day) || 0) + e.kcal);
  if (!perDay.size) return null;
  const total = [...perDay.values()].reduce((a, b) => a + b, 0);
  return { kcal: round(total / perDay.size), daysLogged: perDay.size };
}

/** Saved meals, most-used first then by name; archived ones are left out. */
export function mealsByUse(meals, entries) {
  const uses = new Map();
  for (const e of entries) if (e.mealId) uses.set(e.mealId, (uses.get(e.mealId) || 0) + 1);
  return meals
    .filter((m) => !m.archived)
    .sort((a, b) => (uses.get(b.id) || 0) - (uses.get(a.id) || 0) || a.name.localeCompare(b.name));
}

/** The entries of the day before `day`, ready to copy onto `day` ("same as yesterday"). */
export function copyDay(entries, fromDay, toDay, now, newId) {
  return entries
    .filter((e) => e.day === fromDay)
    .map((e, i) => ({ ...e, id: newId(), day: toDay, at: now + i }));
}

/** 'kcal' text for a total with a range: "2,300" or "2,300 (1,900–2,700)". */
export function fmtKcal(total, { showRange = true } = {}) {
  const n = (v) => v.toLocaleString('en-GB');
  const spread = total.high - total.low;
  return showRange && spread >= 100 ? `${n(total.kcal)} (${n(total.low)}–${n(total.high)})` : n(total.kcal);
}
