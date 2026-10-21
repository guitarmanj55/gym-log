import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platesPerSide, floorToStep } from './plates.js';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

test('standard loads', () => {
  assert.deepEqual(platesPerSide(140, 20, PLATES).perSide, [25, 25, 10]);
  assert.deepEqual(platesPerSide(142.5, 20, PLATES).perSide, [25, 25, 10, 1.25]);
  assert.deepEqual(platesPerSide(100, 20, PLATES).perSide, [25, 15]);
  assert.deepEqual(platesPerSide(62.5, 20, PLATES).perSide, [20, 1.25]);
});

test('exact loads report no remainder', () => {
  const r = platesPerSide(142.5, 20, PLATES);
  assert.equal(r.exact, true);
  assert.equal(r.loadedKg, 142.5);
  assert.equal(r.remainderKg, 0);
});

test('empty bar and below the bar', () => {
  assert.deepEqual(platesPerSide(20, 20, PLATES), { perSide: [], loadedKg: 20, remainderKg: 0, exact: true });
  const r = platesPerSide(15, 20, PLATES);
  assert.deepEqual(r.perSide, []);
  assert.equal(r.loadedKg, 20);
  assert.equal(r.exact, false);
});

test('an impossible load gets the heaviest load below it', () => {
  const r = platesPerSide(101, 20, PLATES);
  assert.deepEqual(r.perSide, [25, 15]);
  assert.equal(r.loadedKg, 100);
  assert.equal(r.remainderKg, 1);
  assert.equal(r.exact, false);
});

test('finds a load greedy would miss', () => {
  // Greedy takes 20 and is stuck at 10 left; 15 + 15 works.
  assert.deepEqual(platesPerSide(80, 20, [20, 15]).perSide, [15, 15]);
});

test('fewest plates, heavier plates on ties', () => {
  assert.deepEqual(platesPerSide(60, 20, PLATES).perSide, [20]);
  assert.deepEqual(platesPerSide(70, 20, PLATES).perSide, [25]);
});

test('floorToStep', () => {
  assert.equal(floorToStep(143.7, 2.5), 142.5);
  assert.equal(floorToStep(142.5, 2.5), 142.5);
  assert.equal(floorToStep(10.1, 1.25), 10);
});
