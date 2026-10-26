// Summaries for the Today and History screens. Pure: no DOM or browser globals.
// Dates use the device's local time zone.
import { e1rm, bestByE1rm } from './e1rm.js';

const DAY = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const round2 = (kg) => Math.round(kg * 100) / 100;

/** Midnight at the start of the Monday of the week containing `ms`. */
export function weekStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Monday to Sunday of this week: [{label, isToday, trained}]. */
export function weekStrip(sessionStarts, now) {
  const trained = new Set(sessionStarts.map(dayKey));
  const start = new Date(weekStart(now));
  return 'MTWTFSS'.split('').map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { label, isToday: dayKey(d.getTime()) === dayKey(now), trained: trained.has(dayKey(d.getTime())) };
  });
}

/** "This week", "Last week", or the month, e.g. "September 2026". */
export function groupLabel(ms, now) {
  const thisWeek = weekStart(now);
  if (ms >= thisWeek) return 'This week';
  if (ms >= weekStart(thisWeek - DAY)) return 'Last week';
  return new Date(ms).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "Mon 19 Oct" */
export function shortDate(ms) {
  // Some engines write "Sept"; the design uses three letters.
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace('Sept', 'Sep');
}

/** When a past day was, said the way people say it: "today", "yesterday", "Monday", "last Thursday", else "Thu 8 Oct". */
export function relativeDay(ms, now) {
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((midnight(now) - midnight(ms)) / DAY);
  const weekday = new Date(ms).toLocaleDateString('en-GB', { weekday: 'long' });
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 7) return weekday;
  if (days === 7) return `last ${weekday}`;
  return shortDate(ms);
}

/** 64 minutes -> "1h 04". */
export function fmtDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(min / 60)}h ${pad(min % 60)}`;
}

/** "100 × 6"; bodyweight lifts read "BW × 8" or "BW + 10 × 6". */
export function fmtSet(set, equipment) {
  const w = round2(set.weightKg);
  if (equipment === 'bodyweight') return `${w > 0 ? `BW + ${w}` : 'BW'} × ${set.reps}`;
  return `${w} × ${set.reps}`;
}

/** The set that sums up a lift in a session: its top set (best by e1RM), else its heaviest set. */
export function headlineSet(sets) {
  const tops = sets.filter((s) => s.type === 'top');
  if (tops.length) return bestByE1rm(tops);
  return sets.reduce((best, s) => (!best || s.weightKg > best.weightKg ? s : best), null);
}

/** Ids of top sets that beat every earlier top set's e1RM for their lift. A lift's first top set is not a PR. */
export function prSetIds(sets) {
  const best = new Map();
  const out = new Set();
  for (const s of sets.filter((x) => x.type === 'top').sort((a, b) => a.completedAt - b.completedAt)) {
    const v = e1rm(s.weightKg, s.reps);
    if (best.has(s.exerciseId) && v > best.get(s.exerciseId)) out.add(s.id);
    if (!best.has(s.exerciseId) || v > best.get(s.exerciseId)) best.set(s.exerciseId, v);
  }
  return out;
}

/** Latest top set per lift, newest first. */
export function recentTopSets(sets, limit = 5) {
  const latest = new Map();
  for (const s of sets) {
    if (s.type !== 'top') continue;
    const cur = latest.get(s.exerciseId);
    if (!cur || s.completedAt > cur.completedAt) latest.set(s.exerciseId, s);
  }
  return [...latest.values()].sort((a, b) => b.completedAt - a.completedAt).slice(0, limit);
}

/** True if every word of the query appears in the text (case-insensitive). */
export function matchesQuery(text, query) {
  const hay = text.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** "2026-10-21" for a date input, in local time. */
export function dateInputValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from the day of `ms` to a date input value ("2026-10-21"), local time; null if it isn't a date. */
export function dayDiff(ms, value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const d = new Date(ms);
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
}

/** `ms` moved by whole days, keeping the time of day (also across clock changes). */
export function shiftDays(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Reads a typed weight or reps ("62,5" works). Null if it isn't a number of at least 0. */
export function parseAmount(text) {
  const n = Number(String(text ?? '').trim().replace(',', '.'));
  return String(text ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Workouts started in each of the last `weeks` weeks (Monday to Sunday), oldest first, the
 * current week last.
 * @returns {Array<{start: number, count: number}>}
 */
export function weeklyCounts(sessionStarts, now, weeks = 8) {
  const thisWeek = weekStart(now);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - 7 * i); // calendar days, so a clock change doesn't shift the week
    out.push({ start: d.getTime(), count: 0 });
  }
  const end = new Date(thisWeek);
  end.setDate(end.getDate() + 7);
  for (const t of sessionStarts) {
    if (t >= end.getTime()) continue;
    const week = out.findLast((w) => t >= w.start);
    if (week) week.count++;
  }
  return out;
}
