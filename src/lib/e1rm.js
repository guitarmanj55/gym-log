// Estimated one-rep max. Pure: no DOM or browser globals.

/** Epley: weight * (1 + reps / 30); a single is just the weight. 0 reps gives 0. */
export function e1rm(weightKg, reps) {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weightKg;
  return weightKg + (weightKg * reps) / 30; // same as w * (1 + r/30), with less float noise (180 x 3 = 198, not 198.00000000000003)
}

/** The set with the highest e1RM, or null for an empty list. Ties go to the later set. */
export function bestByE1rm(sets) {
  let best = null;
  let bestValue = -1;
  for (const s of sets) {
    const v = e1rm(s.weightKg, s.reps);
    if (v > bestValue || (v === bestValue && s.completedAt >= best.completedAt)) {
      best = s;
      bestValue = v;
    }
  }
  return best;
}
