import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestNext, beats } from './suggest.js';

test('suggests one step heavier or one more rep', () => {
  assert.deepEqual(suggestNext({ weightKg: 140, reps: 5 }, 2.5), {
    addWeight: { weightKg: 142.5, reps: 5 },
    addRep: { weightKg: 140, reps: 6 },
  });
});

test('no last set means no suggestion', () => {
  assert.equal(suggestNext(null), null);
  assert.equal(suggestNext({ weightKg: 100, reps: 0 }), null);
});

test('no float drift on small steps', () => {
  assert.equal(suggestNext({ weightKg: 0.1, reps: 5 }, 0.2).addWeight.weightKg, 0.3);
});

test('beats', () => {
  const last = { weightKg: 140, reps: 5 };
  assert.equal(beats({ weightKg: 142.5, reps: 5 }, last), true);
  assert.equal(beats({ weightKg: 140, reps: 6 }, last), true);
  assert.equal(beats({ weightKg: 140, reps: 5 }, last), false);
  assert.equal(beats({ weightKg: 145, reps: 4 }, last), false);
  assert.equal(beats({ weightKg: 100, reps: 5 }, null), true);
});

import { beatTargets } from './suggest.js';
import { e1rm } from './e1rm.js';

test('beatTargets: each option beats last time by a whole kg, with the lightest step that does', () => {
  const last = { weightKg: 100, reps: 5 }; // e1RM 117
  const out = beatTargets(last, 2.5);
  assert.deepEqual(out.map((t) => t.reps), [3, 4, 5, 6, 7]);
  for (const t of out) {
    assert.ok(Math.round(e1rm(t.weightKg, t.reps)) > 117, `${t.weightKg} x ${t.reps}`);
    assert.ok(Math.round(e1rm(t.weightKg - 2.5, t.reps)) <= 117, `lighter ${t.weightKg} x ${t.reps} would also beat it`);
  }
  assert.deepEqual(out.find((t) => t.reps === 5), { weightKg: 102.5, reps: 5 });
});

test('beatTargets: singles and nothing to beat', () => {
  assert.deepEqual(beatTargets({ weightKg: 140, reps: 1 }, 2.5).map((t) => t.reps), [1, 2, 3]);
  assert.equal(beatTargets({ weightKg: 140, reps: 1 }, 2.5)[0].weightKg, 142.5);
  assert.deepEqual(beatTargets(null), []);
  assert.deepEqual(beatTargets({ weightKg: 0, reps: 5 }), []);
});
