import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeStart, topSetPoints, changeLabel, liftStats, trend, niceTicks, chartGeometry } from './progress.js';

const at = (y, m, d) => new Date(y, m - 1, d, 18).getTime();
const top = (sessionId, weightKg, reps, completedAt, type = 'top') => ({ id: `${sessionId}${completedAt}`, sessionId, type, weightKg, reps, completedAt });

test('rangeStart', () => {
  const now = at(2026, 10, 21);
  assert.equal(rangeStart('1M', now), at(2026, 9, 21));
  assert.equal(rangeStart('3M', now), at(2026, 7, 21));
  assert.equal(rangeStart('1Y', now), at(2025, 10, 21));
  assert.equal(rangeStart('All', now), -Infinity);
});

test('topSetPoints: best top set per session, oldest first, ignores other set types', () => {
  const pts = topSetPoints([
    top('b', 140, 5, 20), top('a', 135, 5, 10), top('a', 130, 8, 11), top('a', 200, 1, 12, 'backoff'),
  ]);
  assert.deepEqual(pts.map((p) => [p.set.sessionId, Math.round(p.e1rm)]), [['a', 165], ['b', 163]]);
});

test('changeLabel', () => {
  const pts = [{ t: at(2026, 7, 21), e1rm: 155 }, { t: at(2026, 10, 14), e1rm: 163.3 }];
  assert.equal(changeLabel(pts, '3M').text, '+8 kg in 3 months');
  assert.equal(changeLabel([...pts].reverse().map((p, i) => ({ ...p, t: i })), '1M').text, '−8 kg in 1 month');
  assert.equal(changeLabel(pts, 'All').text, '+8 kg since Jul 2026');
  assert.equal(changeLabel(pts.slice(0, 1), '3M'), null);
  assert.equal(changeLabel([{ t: 0, e1rm: 100 }, { t: 1, e1rm: 100.2 }], '1M').text, 'No change in 1 month');
});

test('liftStats', () => {
  const pts = topSetPoints([top('a', 145, 3, 1), top('b', 140, 4, 2), top('c', 145, 2, 3), top('d', 140, 5, 4)]);
  const s = liftStats(pts);
  assert.equal(`${s.heaviest.weightKg} × ${s.heaviest.reps}`, '145 × 3');
  assert.equal(s.atKg, 140);
  assert.equal(s.repsAt, 5);
  assert.equal(s.count, 4);
  assert.equal(liftStats([]), null);
});

test('trend is the least-squares line', () => {
  const day = 86400000;
  const tr = trend([{ t: 0, e1rm: 100 }, { t: day, e1rm: 102 }, { t: 2 * day, e1rm: 104 }]);
  assert.equal(Math.round(tr.start * 100) / 100, 100);
  assert.equal(Math.round(tr.end * 100) / 100, 104);
  assert.equal(trend([{ t: 0, e1rm: 100 }]), null);
});

test('niceTicks', () => {
  assert.deepEqual(niceTicks(146, 166, 2), [150, 160]);
  assert.deepEqual(niceTicks(97, 103, 3), [98, 100, 102]);
  assert.deepEqual(niceTicks(100, 100), [100]);
});

test('chartGeometry fits the points in the box', () => {
  const pts = [
    { t: at(2026, 7, 21), e1rm: 148 }, { t: at(2026, 8, 20), e1rm: 152 },
    { t: at(2026, 9, 20), e1rm: 158 }, { t: at(2026, 10, 14), e1rm: 163 },
  ];
  const g = chartGeometry(pts);
  assert.equal(g.dots.length, 4);
  assert.equal(g.dots[0].x, 10);
  assert.equal(g.last.x, 340);
  assert.ok(g.dots.every((d) => d.y >= 14 && d.y <= 124));
  assert.ok(g.last.y < g.dots[0].y); // higher e1RM is higher up
  assert.deepEqual(g.xLabels.map((l) => l.label), ['Aug', 'Sep', 'Oct']);
  assert.ok(g.grid.length >= 1);
  assert.ok(g.trend);
});

test('chartGeometry with one point centres it', () => {
  const g = chartGeometry([{ t: at(2026, 10, 14), e1rm: 163 }]);
  assert.equal(g.last.x, 175);
  assert.equal(g.trend, null);
  assert.equal(g.xLabels.length, 1);
});

import { stallInfo } from './progress.js';

const pts = (...vals) => vals.map((e1rm, i) => ({ t: i * 1000, e1rm }));

test('stallInfo counts sessions since the best e1RM', () => {
  assert.equal(stallInfo(pts(100, 102, 101)), null); // too little history
  assert.deepEqual(stallInfo(pts(100, 105, 104, 105.2, 103)), { sessions: 3, best: 105, stalled: true });
  assert.deepEqual(stallInfo(pts(100, 105, 104, 103, 106)), { sessions: 0, best: 106, stalled: false });
  assert.deepEqual(stallInfo(pts(100, 105, 104, 103)), { sessions: 2, best: 105, stalled: false });
  assert.equal(stallInfo(pts(100, 105, 104, 103, 102), 4)?.stalled, false);
});
