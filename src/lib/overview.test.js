import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overview, SMOOTH_SESSIONS } from './overview.js';

const DAY = 86400000;
const now = new Date(2026, 9, 28, 12).getTime(); // Wed 28 Oct 2026
const ago = (days) => now - days * DAY;
const lift = (id, name, pairs) => ({ id, name, points: pairs.map(([d, e]) => ({ t: ago(d), e1rm: e })) });

test('progress: every lift starts at 100, headline is the mean change', () => {
  const squat = lift('s', 'Squat', [[28, 100], [14, 105], [0, 110]]); // +10%
  const curl = lift('c', 'Curl', [[28, 20], [14, 20], [0, 21]]); // +5%
  const o = overview([squat, curl], '3M', now);
  assert.equal(o.series[0].e1rm, 100);
  assert.equal(o.headline, 7.5);
  assert.deepEqual(o.rows.map((r) => [r.name, r.pct]), [['Squat', 10], ['Curl', 5]]);
  assert.deepEqual([o.rows[0].from, o.rows[0].to], [100, 110]);
  assert.ok(o.series.every((p, i, a) => i === 0 || p.t > a[i - 1].t));
});

test('progress: lifts with one session in the range are hidden and counted', () => {
  const a = lift('a', 'A', [[20, 100], [0, 104]]);
  const b = lift('b', 'B', [[0, 50]]);
  const o = overview([a, b], '1M', now);
  assert.equal(o.rows.length, 1);
  assert.equal(o.hidden, 1);
  assert.equal(o.headline, 4);
});

test('progress: baseline is the first session inside the range, not before it', () => {
  const a = lift('a', 'A', [[200, 50], [20, 100], [0, 110]]);
  assert.equal(overview([a], '1M', now).headline, 10);
});

test('progress: a lift that starts later joins at 100 and a lift stays at its last value', () => {
  const a = lift('a', 'A', [[28, 100], [0, 100]]);
  const b = lift('b', 'B', [[7, 100], [0, 120]]);
  const o = overview([a, b], '3M', now);
  assert.equal(o.series[0].e1rm, 100);
  assert.equal(o.series.at(-1).e1rm, 110);
});

test('effort: sessions as a % of the lift all-time best', () => {
  const a = lift('a', 'A', [[60, 200], [14, 90], [0, 95]]); // best 200 is outside the 1M range
  const o = overview([a], '1M', now, 'effort');
  assert.equal(o.rows[0].pct, 46.3);
  assert.equal(o.rows[0].best, 200);
  const b = lift('b', 'B', [[14, 90], [0, 100]]);
  const ob = overview([b], '1M', now, 'effort');
  assert.equal(ob.headline, 95);
  assert.equal(ob.series.at(-1).e1rm, 100);
});

test('effort: a single session in the range is enough', () => {
  const o = overview([lift('a', 'A', [[40, 100], [3, 98]])], '1M', now, 'effort');
  assert.equal(o.rows.length, 1);
  assert.equal(o.headline, 98);
});

test('nothing usable gives an empty overview', () => {
  assert.deepEqual(overview([], '3M', now), { series: [], headline: null, rows: [], hidden: 0 });
  const o = overview([lift('a', 'A', [[0, 100]])], '3M', now);
  assert.equal(o.series.length, 0);
  assert.equal(o.hidden, 1);
});

test('stalled flag comes from the whole history', () => {
  const pts = [[70, 118], [60, 120], [50, 110], [40, 112], [30, 111], [10, 112]];
  const o = overview([lift('a', 'A', pts)], '3M', now);
  assert.equal(o.rows[0].stalled, true);
});

test('progress: headline uses the median of the last 3 sessions, so one bad day does not swing it', () => {
  assert.equal(SMOOTH_SESSIONS, 3);
  const steady = lift('a', 'A', [[28, 100], [21, 104], [14, 108], [7, 112], [0, 90]]); // last session was a bad day
  const o = overview([steady], '3M', now);
  assert.equal(o.headline, 8); // median(108, 112, 90) = 108
  assert.equal(o.rows[0].pct, -10); // the row still shows the latest session
});
