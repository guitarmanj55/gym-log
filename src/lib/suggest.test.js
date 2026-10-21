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
