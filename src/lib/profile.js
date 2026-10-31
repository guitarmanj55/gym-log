// Profile screen logic: training-setting choices, lifetime stats and the "train next" suggestion.
// Pure: no DOM or browser globals.
import { e1rm } from './e1rm.js';
import { weekStart } from './history.js';
import { STORED_MUSCLE, groupLabel } from './library.js';

const DAY = 24 * 60 * 60 * 1000;
const isWork = (s) => s.type === 'top' || s.type === 'backoff';

export const BAR_OPTIONS = [10, 15, 20, 25];
export const STEP_OPTIONS = [1, 1.25, 2.5, 5];
export const REST_OPTIONS = [30, 60, 90, 120, 180];
export const PLATE_CHOICES = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5];

/** `current` joined into the choices if it is a custom value (an old setting or imported backup). */
export function withCurrent(options, current) {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}

/** Adds or removes a plate size; the list stays largest first and never goes empty. */
export function togglePlate(plates, kg) {
  const has = plates.includes(kg);
  if (has && plates.length === 1) return plates;
  const next = has ? plates.filter((p) => p !== kg) : [...plates, kg];
  return next.sort((a, b) => b - a);
}

/** 30 -> "30s", 90 -> "90s", 120 -> "2 min", 150 -> "2.5 min" */
export function fmtRest(sec) {
  return sec < 120 ? `${sec}s` : `${Math.round((sec / 60) * 10) / 10} min`;
}

/** 18430 -> "18.4 t", 184300 -> "184 t", 820 -> "820 kg" */
export function fmtVolume(kg) {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  const t = kg / 1000;
  return `${t >= 100 ? Math.round(t) : Math.round(t * 10) / 10} t`;
}

const prevWeek = (ws) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d.getTime(); };

/**
 * Consecutive weeks (Monday to Sunday) with at least one workout, counting back from this week;
 * a week with no workout yet doesn't break the run until it is over.
 */
export function weekStreak(sessionStarts, now) {
  const weeks = new Set(sessionStarts.map(weekStart));
  let ws = weekStart(now);
  if (!weeks.has(ws)) ws = prevWeek(ws);
  let n = 0;
  while (weeks.has(ws)) { n++; ws = prevWeek(ws); }
  return n;
}

/**
 * Totals over every finished workout.
 * @param {Array} finished  finished sessions
 * @param {Array} sets      all sets
 * @param {Map<string, {name: string, equipment?: string}>} exercises  by id
 */
export function lifetimeStats(finished, sets, exercises, now, bestCount = 3) {
  const ids = new Set(finished.map((s) => s.id));
  const mine = sets.filter((s) => ids.has(s.sessionId));
  const work = mine.filter(isWork);
  const best = new Map();
  for (const s of mine) {
    if (s.type !== 'top') continue;
    const ex = exercises.get(s.exerciseId);
    if (!ex || ex.equipment === 'bodyweight') continue; // bodyweight sets hold added kg only
    const v = e1rm(s.weightKg, s.reps);
    if (!best.has(s.exerciseId) || v > best.get(s.exerciseId)) best.set(s.exerciseId, v);
  }
  const bestLifts = [...best].sort((a, b) => b[1] - a[1]).slice(0, bestCount)
    .map(([id, v]) => ({ id, name: exercises.get(id).name, e1rm: Math.round(v) }));
  return {
    sessions: finished.length,
    workSets: work.length,
    volumeKg: Math.round(work.reduce((a, s) => a + s.weightKg * s.reps, 0)),
    since: finished.length ? Math.min(...finished.map((s) => s.startedAt)) : null,
    streak: weekStreak(finished.map((s) => s.startedAt), now),
    bestLifts,
  };
}

export const splitLabel = (p) => `${groupLabel(p.main)} + ${groupLabel(p.support)}`;

/**
 * Which saved pairing to train next: the one whose main group has gone longest without a hard
 * set (never trained counts as longest). Biceps and triceps are both stored as "arms".
 * Returns null with no pairings, or when every main group was already trained today.
 * @returns {null | {split: {main: string, support: string}, days: number | null}}  days null = never
 */
export function nextSplit(splits, sets, exercises, now) {
  if (!splits?.length) return null;
  const last = new Map(); // stored muscle -> latest hard set
  for (const s of sets) {
    if (!isWork(s)) continue;
    const m = exercises.get(s.exerciseId)?.muscles?.[0];
    if (m && s.completedAt > (last.get(m) || 0)) last.set(m, s.completedAt);
  }
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  let pick = null;
  for (const split of splits) {
    const at = last.get(STORED_MUSCLE[split.main]);
    const days = at ? Math.floor((now - at) / DAY) : null;
    const age = at ? now - at : Infinity;
    if (!pick || age > pick.age) pick = { split, days, age, at };
  }
  if (pick.at && pick.at >= startOfToday) return null;
  return { split: pick.split, days: pick.days };
}
