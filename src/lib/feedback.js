// Workout feedback: PRs as they happen, sets per muscle this week, lifts not trained lately and
// the end-of-workout summary. Pure: no DOM or browser globals.
import { e1rm, bestByE1rm } from './e1rm.js';
import { weekStart, headlineSet, prSetIds, fmtSet, fmtDuration, shortDate } from './history.js';
import { muscleLabel } from './exercise.js';
import { topSetPoints, stallInfo } from './progress.js';

const DAY = 24 * 60 * 60 * 1000;
const isWork = (s) => s.type === 'top' || s.type === 'backoff';

/**
 * Is a just-logged top set a new best e1RM for its lift? Only sets logged before it count, and a
 * lift's first top set is not a PR (nothing to beat), the same rule as prSetIds().
 * @param {{id, exerciseId, type, weightKg, reps, completedAt}} set
 * @param {Array} sets  any sets; other lifts, later sets and the set itself are ignored
 * @returns {null | {e1rm: number, previous: number, gain: number}}
 */
export function prFor(set, sets) {
  if (set.type !== 'top') return null;
  const earlier = sets.filter((s) => s.type === 'top' && s.exerciseId === set.exerciseId && s.id !== set.id && s.completedAt <= set.completedAt);
  if (!earlier.length) return null;
  const previous = Math.max(...earlier.map((s) => e1rm(s.weightKg, s.reps)));
  const now = e1rm(set.weightKg, set.reps);
  if (!(now > previous)) return null;
  return { e1rm: now, previous, gain: now - previous };
}

/**
 * Hard sets (top and back-off) since Monday, per target muscle. The first muscle listed is the
 * primary and counts a whole set; the others count half, so a bench press is mostly chest.
 * @param {Array} sets
 * @param {Map<string, {muscles?: string[]}>} exercises  by id
 * @returns {{rows: Array<{id: string, label: string, sets: number}>, unassigned: number}}  most sets first
 */
export function weeklyMuscleSets(sets, exercises, now) {
  const from = weekStart(now);
  const counts = new Map();
  let unassigned = 0;
  for (const s of sets) {
    if (!isWork(s) || s.completedAt < from || s.completedAt > now) continue;
    const muscles = exercises.get(s.exerciseId)?.muscles || [];
    if (!muscles.length) { unassigned++; continue; }
    muscles.forEach((m, i) => counts.set(m, (counts.get(m) || 0) + (i === 0 ? 1 : 0.5)));
  }
  const rows = [...counts].map(([id, n]) => ({ id, label: muscleLabel(id) || id, sets: n }))
    .sort((a, b) => b.sets - a.sets || a.label.localeCompare(b.label));
  return { rows, unassigned };
}

/** 4 -> "4", 4.5 -> "4½", 0.5 -> "½" */
export function fmtSetCount(n) {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return half ? `${whole || ''}½` : String(whole);
}

/**
 * Lifts done in the last `withinDays` but not in the last `afterDays`: the ones slipping out of
 * the rotation. Lifts dropped for longer than that are left alone. Longest gap first.
 * @returns {Array<{exercise, lastAt: number, days: number}>}
 */
export function staleLifts(sets, exercises, now, { afterDays = 10, withinDays = 56 } = {}) {
  const last = new Map();
  for (const s of sets) {
    if (s.completedAt <= now && s.completedAt > (last.get(s.exerciseId) || 0)) last.set(s.exerciseId, s.completedAt);
  }
  const out = [];
  for (const [id, lastAt] of last) {
    const days = Math.floor((now - lastAt) / DAY);
    const exercise = exercises.get(id);
    if (exercise && days >= afterDays && days <= withinDays) out.push({ exercise, lastAt, days });
  }
  return out.sort((a, b) => b.days - a.days || a.exercise.name.localeCompare(b.exercise.name));
}

/**
 * The end-of-workout card: each lift's headline set and e1RM change against the last time it was
 * done before this session, PRs, and totals. Volume is kg × reps over top and back-off sets.
 * @param {{startedAt: number, endedAt?: number}} session
 * @param {Array<{exercise, sets: Array}>} items  this session's lifts in order (from loadAll().bySession)
 * @param {Array} allSets  every set ever logged
 */
export function sessionSummary(session, items, allSets, now = Date.now()) {
  const prs = prSetIds(allSets);
  const before = allSets.filter((s) => s.completedAt < session.startedAt);
  const lifts = items.filter((it) => it.sets.length).map((it) => {
    const tops = it.sets.filter((s) => s.type === 'top');
    const top = bestByE1rm(tops);
    let change = null;
    if (top) {
      const earlier = before.filter((s) => s.exerciseId === top.exerciseId);
      const lastSessionId = earlier.reduce((a, s) => (!a || s.completedAt > a.completedAt ? s : a), null)?.sessionId;
      const prev = bestByE1rm(earlier.filter((s) => s.sessionId === lastSessionId && s.type === 'top'));
      if (prev) change = Math.round(e1rm(top.weightKg, top.reps)) - Math.round(e1rm(prev.weightKg, prev.reps));
    }
    return {
      name: it.exercise?.name || 'Exercise',
      equipment: it.exercise?.equipment,
      headline: headlineSet(it.sets),
      e1rm: top ? Math.round(e1rm(top.weightKg, top.reps)) : null,
      change,
      pr: it.sets.some((s) => prs.has(s.id)),
      setCount: it.sets.length,
    };
  });
  const sets = items.flatMap((it) => it.sets);
  const work = sets.filter(isWork);
  return {
    startedAt: session.startedAt,
    durationMs: (session.endedAt || now) - session.startedAt,
    lifts,
    sets: sets.length,
    workSets: work.length,
    volumeKg: Math.round(work.reduce((a, s) => a + s.weightKg * s.reps, 0)),
    prCount: lifts.filter((l) => l.pr).length,
  };
}

/** "+3", "−2", "same" (or "" with nothing to compare). */
export function fmtChange(change) {
  if (change === null || change === undefined) return '';
  if (change === 0) return 'same';
  return `${change > 0 ? '+' : '−'}${Math.abs(change)}`;
}

/** Plain text of a summary, for the share sheet or the clipboard. */
export function summaryText(sum) {
  const lines = [`Gym Log · ${shortDate(sum.startedAt)} · ${fmtDuration(sum.durationMs)}`, ''];
  for (const l of sum.lifts) {
    const bits = [];
    if (l.e1rm !== null && l.equipment !== 'bodyweight') bits.push(`e1RM ${l.e1rm}${l.change !== null ? ` ${fmtChange(l.change)}` : ''}`);
    lines.push(`${l.name}: ${l.headline ? fmtSet(l.headline, l.equipment) : ''}${bits.length ? ` (${bits.join(', ')})` : ''}${l.pr ? ' PR' : ''}`);
  }
  lines.push('', `${sum.sets} sets · ${sum.volumeKg.toLocaleString('en-GB')} kg moved${sum.prCount ? ` · ${sum.prCount} PR${sum.prCount > 1 ? 's' : ''}` : ''}`);
  return lines.join('\n');
}

/**
 * Lifts whose e1RM hasn't set a new best in their last few sessions, trained within `withinDays`.
 * Most sessions without progress first.
 */
export function stalledLifts(sets, exercises, now, { minSessions = 3, withinDays = 28 } = {}) {
  const byLift = new Map();
  for (const s of sets) {
    if (s.type !== 'top' || s.completedAt > now) continue;
    if (!byLift.has(s.exerciseId)) byLift.set(s.exerciseId, []);
    byLift.get(s.exerciseId).push(s);
  }
  const out = [];
  for (const [id, list] of byLift) {
    const exercise = exercises.get(id);
    const points = topSetPoints(list);
    const info = stallInfo(points, minSessions);
    if (exercise && info?.stalled && now - points.at(-1).t <= withinDays * DAY) out.push({ exercise, ...info });
  }
  return out.sort((a, b) => b.sessions - a.sessions || a.exercise.name.localeCompare(b.exercise.name));
}
