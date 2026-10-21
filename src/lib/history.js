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
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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

/**
 * Which past session to repeat next, from finished sessions with their lift lists:
 * [{id, startedAt, exerciseIds: string[]}]. Finds the last time today's latest lineup was done
 * and picks whatever came after it, so A/B and A/B/C rotations carry on by themselves.
 * Falls back to the session before last if its lineup differs, then to the last one.
 * @returns {string|null} session id
 */
export function nextTemplate(sessions) {
  const list = sessions.filter((s) => s.exerciseIds.length).sort((a, b) => a.startedAt - b.startedAt);
  if (!list.length) return null;
  const key = (s) => [...s.exerciseIds].sort().join('|');
  const last = list.at(-1);
  for (let i = list.length - 2; i >= 0; i--) {
    if (key(list[i]) === key(last)) return list[i + 1].id;
  }
  const prev = list.at(-2);
  return prev && key(prev) !== key(last) ? prev.id : last.id;
}

/** True if every word of the query appears in the text (case-insensitive). */
export function matchesQuery(text, query) {
  const hay = text.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
