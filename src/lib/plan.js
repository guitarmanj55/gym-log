// Planned sets for an exercise, prefilled from last session. Pure: no DOM or browser globals.
import { bestByE1rm } from './e1rm.js';
import { suggestNext } from './suggest.js';

const ORDER = { warmup: 0, top: 1, backoff: 2 };
const strip = ({ type, weightKg, reps, toFailure }) => (toFailure ? { type, weightKg, reps, toFailure: true } : { type, weightKg, reps });

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
 * Today's plan: the same sets as last time, in the same order. The best top set (by e1RM) gets
 * one more step of weight to beat last time; any other top sets repeat as they were.
 * "To failure" carries over. With no history: one warm-up and two top sets at `startKg`.
 * @returns {Array<{type: string, weightKg: number, reps: number, toFailure?: boolean}>}
 */
export function planFromLast(lastSets, { stepKg = 2.5, startKg = 20 } = {}) {
  if (!lastSets.length) {
    return [
      { type: 'warmup', weightKg: startKg, reps: 8 },
      { type: 'top', weightKg: startKg, reps: 5 },
      { type: 'top', weightKg: startKg, reps: 5 },
    ];
  }
  const warm = lastSets.filter((s) => s.type === 'warmup').map(strip);
  const back = lastSets.filter((s) => s.type === 'backoff').map(strip);
  const best = topSetOf(lastSets);
  const suggestion = suggestNext(best, stepKg);
  const tops = suggestion
    ? lastSets.filter((s) => s.type === 'top').map((s) => (s === best ? { ...strip(s), ...suggestion.addWeight } : strip(s)))
    : [{ type: 'top', weightKg: Math.max(startKg, ...lastSets.map((s) => s.weightKg)), reps: 5 }];
  return [...warm, ...tops, ...back];
}

/** Drops the planned sets already covered by logged ones: the first N of each type. */
export function remainingPlan(plan, logged) {
  const done = { warmup: 0, top: 0, backoff: 0 };
  for (const s of logged) done[s.type] = (done[s.type] || 0) + 1;
  return plan.filter((p) => !(done[p.type]-- > 0)).map((p) => ({ ...p }));
}

/**
 * Rows for the screen: logged sets then planned ones, grouped warm-up, top, back-off.
 * Logged rows carry `set`; planned rows carry `planIndex` into `plan`. Every row also has
 * `n` and `of`: its place among the rows of its type ("top set 2 of 3").
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
    .map(([r]) => r)
    .map((r, _, all) => {
      const same = all.filter((x) => x.type === r.type);
      return { ...r, n: same.indexOf(r) + 1, of: same.length };
    });
}

/** Where a new planned set of `type` goes in the plan: after the others of its type. */
export function insertIndex(plan, type) {
  let at = 0;
  plan.forEach((p, i) => { if (ORDER[p.type] <= ORDER[type]) at = i + 1; });
  return at;
}
