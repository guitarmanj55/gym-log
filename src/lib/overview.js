// All-lifts overview: puts every lift on one scale so they can be averaged. Pure: no DOM or browser globals.
import { rangeStart, stallInfo } from './progress.js';

export const METRICS = ['progress', 'effort'];
const WEEK = 7 * 86400000;

/** Monday 00:00 local of the week containing t. */
function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Every Monday from the week of `from` to the week of `to`, as epoch ms. */
function weeks(from, to) {
  const out = [];
  const d = new Date(weekStart(from));
  for (; d.getTime() <= to; d.setDate(d.getDate() + 7)) out.push(d.getTime());
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Progress: each lift is indexed to 100 at its first session in the range; a week's value is the mean
 * index across lifts, using each lift's latest session up to that week. Needs 2+ sessions in the range.
 * Effort: each session's e1RM as a % of that lift's all-time best; a week's value is the mean of the
 * sessions in it (weeks without a session are left out). Needs 1+ session in the range.
 * @param lifts  [{id, name, points}] with points from topSetPoints(), oldest first. Bodyweight lifts are
 *               left out by the caller (their e1RM is added kg, so a percentage means nothing).
 * @returns {{series: Array<{t, e1rm}>, headline: ?number, rows: Array, hidden: number}}
 *   series uses the key `e1rm` so chartGeometry can draw it. rows are sorted best first. hidden counts
 *   lifts with too little history in the range.
 */
export function overview(lifts, range, now, metric = 'progress') {
  const start = rangeStart(range, now);
  const need = metric === 'progress' ? 2 : 1;
  const used = [];
  let hidden = 0;
  for (const l of lifts) {
    const inRange = l.points.filter((p) => p.t >= start && p.t <= now);
    if (inRange.length < need) { if (l.points.length) hidden++; continue; }
    const best = Math.max(...l.points.map((p) => p.e1rm));
    used.push({ ...l, inRange, base: inRange[0].e1rm, best });
  }
  if (!used.length) return { series: [], headline: null, rows: [], hidden };

  const first = Math.min(...used.map((l) => l.inRange[0].t));
  const series = [];

  if (metric === 'progress') {
    for (const w of weeks(first, now)) {
      const end = w + WEEK;
      const vals = [];
      for (const l of used) {
        const seen = l.inRange.filter((p) => p.t < end);
        if (seen.length) vals.push((seen.at(-1).e1rm / l.base) * 100);
      }
      if (vals.length) series.push({ t: Math.min(end - 1, now), e1rm: round1(mean(vals)) });
    }
  } else {
    for (const w of weeks(first, now)) {
      const end = w + WEEK;
      const vals = used.flatMap((l) => l.inRange.filter((p) => p.t >= w && p.t < end).map((p) => (p.e1rm / l.best) * 100));
      if (vals.length) series.push({ t: Math.min(end - 1, now), e1rm: round1(mean(vals)) });
    }
  }

  const rows = used.map((l) => {
    const last = l.inRange.at(-1);
    const pct = metric === 'progress'
      ? (last.e1rm / l.base - 1) * 100
      : mean(l.inRange.map((p) => (p.e1rm / l.best) * 100));
    return {
      id: l.id, name: l.name, pct: round1(pct), sessions: l.inRange.length,
      from: Math.round(l.base), to: Math.round(last.e1rm), best: Math.round(l.best),
      stalled: !!stallInfo(l.points)?.stalled,
    };
  }).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  const headline = metric === 'progress'
    ? round1(series.at(-1).e1rm - 100)
    : round1(mean(used.flatMap((l) => l.inRange.map((p) => (p.e1rm / l.best) * 100))));
  return { series, headline, rows, hidden };
}
