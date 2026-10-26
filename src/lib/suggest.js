// The "beat last time" rule. Pure: no DOM or browser globals.
// There is deliberately no program or progression engine: just add a step or a rep.

import { e1rm } from './e1rm.js';

const round = (kg) => Math.round(kg * 100) / 100;

/**
 * Two ways to beat the last top set: same reps with one more step of weight, or the same weight for one more rep.
 * @param {{weightKg: number, reps: number} | null | undefined} last  previous top set for this lift
 * @param {number} stepKg  default 2.5
 * @returns {null | {addWeight: {weightKg: number, reps: number}, addRep: {weightKg: number, reps: number}}}
 */
export function suggestNext(last, stepKg = 2.5) {
  if (!last || !(last.weightKg >= 0) || !(last.reps > 0)) return null;
  return {
    addWeight: { weightKg: round(last.weightKg + stepKg), reps: last.reps },
    addRep: { weightKg: last.weightKg, reps: last.reps + 1 },
  };
}

/** True if `set` beats `last`: at least as heavy and as many reps, and more of one of them. */
export function beats(set, last) {
  if (!last) return set.reps > 0;
  const heavier = round(set.weightKg) > round(last.weightKg);
  const same = round(set.weightKg) === round(last.weightKg);
  return (heavier && set.reps >= last.reps) || (same && set.reps > last.reps);
}

/**
 * Weight and rep combinations that beat a previous e1RM: for each rep count around `reps`, the
 * lightest weight (in steps of `stepKg`) whose e1RM is higher once rounded to a whole kg.
 * @param {{weightKg: number, reps: number} | null | undefined} last  previous top set
 * @returns {Array<{weightKg: number, reps: number}>} fewest reps first; [] with nothing to beat
 */
export function beatTargets(last, stepKg = 2.5, spread = 2) {
  if (!last || !(last.weightKg > 0) || !(last.reps > 0) || !(stepKg > 0)) return [];
  const target = Math.round(e1rm(last.weightKg, last.reps));
  const out = [];
  for (let reps = Math.max(1, last.reps - spread); reps <= last.reps + spread; reps++) {
    let weightKg = round(Math.floor((target / (1 + (reps === 1 ? 0 : reps / 30))) / stepKg) * stepKg);
    while (Math.round(e1rm(weightKg, reps)) <= target) weightKg = round(weightKg + stepKg);
    out.push({ weightKg, reps });
  }
  return out;
}
