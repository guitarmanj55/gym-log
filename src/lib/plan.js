// Planned sets for an exercise, prefilled from last session. Pure: no DOM or browser globals.
import { bestByE1rm } from './e1rm.js';
import { suggestNext } from './suggest.js';

const ORDER = { warmup: 0, top: 1, backoff: 2 };
const strip = ({ type, weightKg, reps }) => ({ type, weightKg, reps });

/**
 * The sets from the most recent other session that has this lift, oldest first.
 * @param {Array<{sessionId: string, completedAt: number}>} sets  every set of one exercise
 * @param {string=} excludeSessionId  the session in progress
 */
export function lastSessionSets(sets, excludeSessionId) {
  let latest = null;
  for (const s of sets) {
    if (s.sessionId === excludeSessionId) continue;
    if (!latest || s.completedAt > latest.completedAt) latest = s;
  }
  if (!latest) return [];
  return sets.filter((s) => s.sessionId === latest.sessionId).sort((a, b) => a.completedAt - b.completedAt);
}

/** The top set from a list of sets (the best by e1RM if there were several), or null. */
export function topSetOf(sets) {
  return bestByE1rm(sets.filter((s) => s.type === 'top'));
}

/**
 * Today's plan: last time's warm-ups, a top set that beats last time by one step, last time's back-offs.
 * With no history, a single top set at `startKg` for 5.
 * @returns {Array<{type: string, weightKg: number, reps: number}>}
 */
export function planFromLast(lastSets, { stepKg = 2.5, startKg = 20 } = {}) {
  if (!lastSets.length) return [{ type: 'top', weightKg: startKg, reps: 5 }];
  const warm = lastSets.filter((s) => s.type === 'warmup').map(strip);
  const back = lastSets.filter((s) => s.type === 'backoff').map(strip);
  const suggestion = suggestNext(topSetOf(lastSets), stepKg);
  const top = suggestion
    ? { type: 'top', ...suggestion.addWeight }
    : { type: 'top', weightKg: Math.max(startKg, ...lastSets.map((s) => s.weightKg)), reps: 5 };
  return [...warm, top, ...back];
}

/** Drops the planned sets already covered by logged ones: the first N of each type. */
export function remainingPlan(plan, logged) {
  const done = { warmup: 0, top: 0, backoff: 0 };
  for (const s of logged) done[s.type] = (done[s.type] || 0) + 1;
  return plan.filter((p) => !(done[p.type]-- > 0)).map((p) => ({ ...p }));
}

/**
 * Rows for the screen: logged sets then planned ones, grouped warm-up, top, back-off.
 * Logged rows carry `set`; planned rows carry `planIndex` into `plan`.
 */
export function buildRows(plan, logged) {
  const rows = [
    ...[...logged].sort((a, b) => a.completedAt - b.completedAt)
      .map((s) => ({ type: s.type, weightKg: s.weightKg, reps: s.reps, toFailure: !!s.toFailure, set: s })),
    ...plan.map((p, planIndex) => ({ ...p, toFailure: !!p.toFailure, planIndex })),
  ];
  return rows
    .map((r, i) => [r, i])
    .sort(([a, i], [b, j]) => ORDER[a.type] - ORDER[b.type] || i - j)
    .map(([r]) => r);
}

/** Where a new planned set of `type` goes in the plan: after the others of its type. */
export function insertIndex(plan, type) {
  let at = 0;
  plan.forEach((p, i) => { if (ORDER[p.type] <= ORDER[type]) at = i + 1; });
  return at;
}
