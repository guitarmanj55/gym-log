// Health numbers per day (weight now; steps, sleep, active energy and resting heart rate once Apple Health
// sync exists). Pure: no DOM or browser globals. Every metric is optional: a missing day or metric is a gap,
// never a zero, and averages only use the days that have data.
import { dateInputValue, shiftDays } from './history.js';

export const METRICS = ['weightKg', 'steps', 'sleepMin', 'activeKcal', 'restingHr'];

const has = (day, k) => Number.isFinite(day?.[k]);

/** Newest day that has a weight: {day, kg}, or null. */
export function latestWeight(days) {
  const d = days.filter((x) => has(x, 'weightKg')).sort((a, b) => b.id.localeCompare(a.id))[0];
  return d ? { day: d.id, kg: d.weightKg } : null;
}

/** Days with a weight, newest first: [{day, kg}]. */
export function weightRows(days, limit = 14) {
  return days.filter((x) => has(x, 'weightKg')).sort((a, b) => b.id.localeCompare(a.id)).slice(0, limit)
    .map((d) => ({ day: d.id, kg: d.weightKg }));
}

/**
 * Average weight over the last `span` days up to `today` ('YYYY-MM-DD'), from the days that have one.
 * @returns {{kg: number, daysLogged: number}|null}
 */
export function recentWeight(days, today, span = 7) {
  const base = new Date(`${today}T12:00:00`).getTime();
  const wanted = new Set(Array.from({ length: span }, (_, i) => dateInputValue(shiftDays(base, -i))));
  const kgs = days.filter((d) => wanted.has(d.id) && has(d, 'weightKg')).map((d) => d.weightKg);
  if (!kgs.length) return null;
  return { kg: Math.round((kgs.reduce((a, b) => a + b, 0) / kgs.length) * 10) / 10, daysLogged: kgs.length };
}

/** Change in the span-day average against the span days before it, or null if either has no weights. */
export function weightChange(days, today, span = 7) {
  const base = new Date(`${today}T12:00:00`).getTime();
  const before = recentWeight(days, dateInputValue(shiftDays(base, -span)), span);
  const now = recentWeight(days, today, span);
  return now && before ? Math.round((now.kg - before.kg) * 10) / 10 : null;
}

/**
 * Folds one day's numbers from Apple Health sync into what is stored. Imported values replace older
 * imported ones (a day's steps keep growing), but a number typed by hand is never overwritten.
 * Returns the record to save, or null when nothing would change.
 */
export function mergeImported(existing, day, incoming) {
  const rec = { ...(existing || {}), id: day, src: { ...(existing?.src || {}) } };
  let changed = false;
  for (const k of METRICS) {
    const v = incoming?.[k];
    if (!Number.isFinite(v) || rec.src[k] === 'manual') continue;
    if (rec[k] !== v || rec.src[k] !== 'import') { rec[k] = v; rec.src[k] = 'import'; changed = true; }
  }
  return changed ? rec : null;
}

/** Newest value of a metric within the last `within` days up to `today`: {day, value}, or null (no data is fine). */
export function latestMetric(days, key, today, within = 14) {
  const oldest = dateInputValue(shiftDays(new Date(`${today}T12:00:00`).getTime(), -(within - 1)));
  const d = days.filter((x) => has(x, key) && x.id >= oldest && x.id <= today).sort((a, b) => b.id.localeCompare(a.id))[0];
  return d ? { day: d.id, value: d[key] } : null;
}

/** 437 minutes -> "7h 17m". */
export function fmtSleep(min) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** The record to store when weight is typed by hand: keeps the day's other metrics, marks weight as manual. */
export function withManualWeight(existing, day, kg) {
  return { ...(existing || {}), id: day, weightKg: kg, src: { ...(existing?.src || {}), weightKg: 'manual' } };
}

/** The record with its weight removed; null when nothing else is left on that day (so it can be deleted). */
export function withoutWeight(existing) {
  if (!existing) return null;
  const { weightKg, src = {}, ...rest } = existing;
  const { weightKg: _drop, ...keep } = src;
  const out = { ...rest, ...(Object.keys(keep).length ? { src: keep } : {}) };
  return METRICS.some((k) => has(out, k)) ? out : null;
}
