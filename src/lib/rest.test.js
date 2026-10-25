import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REST_SEC, startRest, remainingSec, restProgress, extendRest, fmtClock } from './rest.js';

const NOW = 1_000_000;

test('rest is always one minute', () => {
  assert.equal(REST_SEC, 60);
});

test('remaining time comes from the clock, rounded up', () => {
  const r = startRest(240, NOW);
  assert.equal(remainingSec(r, NOW), 240);
  assert.equal(remainingSec(r, NOW + 134_000), 106);
  assert.equal(remainingSec(r, NOW + 239_500), 1);
  assert.equal(remainingSec(r, NOW + 240_000), 0);
  assert.equal(remainingSec(r, NOW + 999_000), 0); // came back from the background long after
});

test('progress is the share elapsed', () => {
  const r = startRest(200, NOW);
  assert.equal(restProgress(r, NOW), 0);
  assert.equal(restProgress(r, NOW + 50_000), 0.25);
  assert.equal(restProgress(r, NOW + 500_000), 1);
});

test('+30s extends a running rest, or restarts a finished one', () => {
  const r = startRest(60, NOW);
  assert.deepEqual(extendRest(r, 30, NOW + 10_000), { endsAt: NOW + 90_000, totalSec: 90 });
  assert.deepEqual(extendRest(r, 30, NOW + 70_000), { endsAt: NOW + 100_000, totalSec: 30 });
});

test('fmtClock', () => {
  assert.equal(fmtClock(106), '01:46');
  assert.equal(fmtClock(0), '00:00');
  assert.equal(fmtClock(41 * 60 + 12), '41:12');
  assert.equal(fmtClock(3725), '1:02:05');
  assert.equal(fmtClock(-5), '00:00');
});
