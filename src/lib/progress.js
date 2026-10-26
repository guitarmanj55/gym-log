// Lift progress: e1RM points, range filters, stats and the chart's geometry. Pure: no DOM or browser globals.
import { e1rm, bestByE1rm } from './e1rm.js';

export const RANGES = ['1M', '3M', '1Y', 'All'];
const MONTHS = { '1M': 1, '3M': 3, '1Y': 12 };
// Own names, not toLocaleDateString: some engines write "Sept", the design says "Sep".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}`; };

/** Start of a range ending now, in epoch ms (-Infinity for All). */
export function rangeStart(range, now) {
  if (!MONTHS[range]) return -Infinity;
  const d = new Date(now);
  d.setMonth(d.getMonth() - MONTHS[range]);
  return d.getTime();
}

/** One point per session: that session's best top set. Oldest first. */
export function topSetPoints(sets) {
  const bySession = new Map();
  for (const s of sets) {
    if (s.type !== 'top') continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  return [...bySession.values()]
    .map((list) => { const set = bestByE1rm(list); return { t: set.completedAt, e1rm: e1rm(set.weightKg, set.reps), set }; })
    .sort((a, b) => a.t - b.t);
}

/** "+8 kg in 3 months", "−2.5 kg in 1 month", "+20 kg since Jul 2026"; null with under two points. */
export function changeLabel(points, range) {
  if (points.length < 2) return null;
  const diff = Math.round(points.at(-1).e1rm - points[0].e1rm);
  const first = new Date(points[0].t);
  const span = range === '1M' ? 'in 1 month' : range === '3M' ? 'in 3 months' : range === '1Y' ? 'in 1 year'
    : `since ${MON[first.getMonth()]} ${first.getFullYear()}`;
  if (diff === 0) return { text: `No change ${span}`, diff };
  return { text: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} kg ${span}`, diff };
}

/** Heaviest top set (more reps wins a tie), best reps at the latest top-set weight, and the count. */
export function liftStats(points) {
  if (!points.length) return null;
  const sets = points.map((p) => p.set);
  const heaviest = sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
  const atKg = sets.at(-1).weightKg;
  const repsAt = Math.max(...sets.filter((s) => s.weightKg === atKg).map((s) => s.reps));
  return { heaviest, atKg, repsAt, count: sets.length };
}

/** Least-squares line through the points, as values at the first and last time. */
export function trend(points) {
  if (points.length < 2) return null;
  const n = points.length;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / 86400000);
  const ys = points.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx;
  return { start: my + slope * (xs[0] - mx), end: my + slope * (xs.at(-1) - mx) };
}

/** Round gridline values between min and max, about `count` of them. */
export function niceTicks(min, max, count = 3) {
  if (!(max > min)) return [Math.round(min)];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Everything needed to draw the chart in a width x height box (SVG units).
 * @returns {{line: string, dots: Array<{x,y}>, last: {x,y}, trend: ?{x1,y1,x2,y2},
 *   grid: Array<{y, label}>, xLabels: Array<{x, label, anchor}>}}
 */
export function chartGeometry(points, { width = 350, height = 150, left = 10, right = 10, top = 14, bottom = 26 } = {}) {
  const ys = points.map((p) => p.e1rm);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const padY = Math.max((hi - lo) * 0.15, 2.5);
  lo -= padY;
  hi += padY;
  const t0 = points[0].t;
  const t1 = points.at(-1).t;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (t) => (t1 === t0 ? left + plotW / 2 : left + ((t - t0) / (t1 - t0)) * plotW);
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * plotH;
  const r1 = (v) => Math.round(v * 10) / 10;

  const dots = points.map((p) => ({ x: r1(x(p.t)), y: r1(y(p.e1rm)) }));
  const tr = trend(points);
  const grid = niceTicks(lo, hi, 2).map((v) => ({ y: r1(y(v)), label: String(v) }));

  // Month starts inside the span; with fewer than two, label the first and last day instead.
  let xLabels = [];
  const m = new Date(t0);
  m.setDate(1); m.setHours(0, 0, 0, 0); m.setMonth(m.getMonth() + 1);
  const months = [];
  for (; m.getTime() <= t1; m.setMonth(m.getMonth() + 1)) months.push(m.getTime());
  if (months.length >= 2) {
    const withYear = t1 - t0 > 330 * 86400000;
    xLabels = months.map((t) => {
      const d = new Date(t);
      return { x: r1(x(t)), label: withYear ? `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : MON[d.getMonth()], anchor: 'middle' };
    });
  } else if (t1 > t0) {
    xLabels = [
      { x: left, label: dayMonth(t0), anchor: 'start' },
      { x: width - right, label: dayMonth(t1), anchor: 'end' },
    ];
  } else {
    xLabels = [{ x: r1(x(t0)), label: dayMonth(t0), anchor: 'middle' }];
  }
  // Drop labels that would overlap the one before (about 36 units apart).
  xLabels = xLabels.filter((l, i, all) => i === 0 || l.x - all[i - 1].x >= 36);
  for (const l of xLabels) {
    if (l.x < left + 16) { l.x = left; l.anchor = 'start'; }
    if (l.x > width - right - 16) { l.x = width - right; l.anchor = 'end'; }
  }

  return {
    line: dots.map((d) => `${d.x},${d.y}`).join(' '),
    dots,
    last: dots.at(-1),
    trend: tr ? { x1: dots[0].x, y1: r1(y(tr.start)), x2: dots.at(-1).x, y2: r1(y(tr.end)) } : null,
    grid,
    xLabels,
  };
}

/**
 * Has the e1RM stopped improving? Counts the sessions since the best one (whole kg, so 0.4 kg of
 * noise isn't progress). Stalled from `minSessions` onwards, unless the last three sessions average
 * clearly higher than the three before: a slow climb without a new best isn't a stall.
 * Null with too little history.
 * @param points  topSetPoints(), oldest first
 * @returns {?{sessions: number, best: number, stalled: boolean}}
 */
export function stallInfo(points, minSessions = 3) {
  if (points.length < minSessions + 1) return null;
  const vals = points.map((p) => Math.round(p.e1rm));
  const best = Math.max(...vals);
  const sessions = vals.length - 1 - vals.indexOf(best);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const climbing = vals.length >= 6 && mean(vals.slice(-3)) - mean(vals.slice(-6, -3)) >= 1;
  return { sessions, best, stalled: sessions >= minSessions && !climbing };
}
