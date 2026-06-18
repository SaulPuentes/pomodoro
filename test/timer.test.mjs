import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as timer from '../src/timer.mjs';

const settings = { workMin: 25, shortMin: 5, longMin: 15, soundEnabled: false };

test('initial state: work phase, not running, full work duration', () => {
  const s = timer.initState(settings);
  assert.equal(s.phase, 'work');
  assert.equal(s.running, false);
  assert.equal(s.completedWork, 0);
  assert.equal(s.remainingMs, 25 * 60000);
  assert.equal(s.targetEndMs, null);
});

test('durationMsFor returns minutes-as-ms per phase', () => {
  assert.equal(timer.durationMsFor('work', settings), 25 * 60000);
  assert.equal(timer.durationMsFor('short', settings), 5 * 60000);
  assert.equal(timer.durationMsFor('long', settings), 15 * 60000);
});

test('completing first work gives a short break and increments cycle', () => {
  let s = timer.initState(settings);
  s = timer.complete(s, settings);
  assert.equal(s.completedWork, 1);
  assert.equal(s.phase, 'short');
  assert.equal(s.remainingMs, 5 * 60000);
  assert.equal(s.running, false);
});

test('4th completed work triggers long break, then cycle resets after long', () => {
  let s = timer.initState(settings);
  s = timer.complete(s, settings); // work#1 -> short
  s = timer.complete(s, settings); // short -> work
  s = timer.complete(s, settings); // work#2 -> short
  s = timer.complete(s, settings); // short -> work
  s = timer.complete(s, settings); // work#3 -> short
  s = timer.complete(s, settings); // short -> work
  s = timer.complete(s, settings); // work#4 -> long
  assert.equal(s.phase, 'long');
  assert.equal(s.completedWork, 4);
  s = timer.complete(s, settings); // long -> work, reset
  assert.equal(s.phase, 'work');
  assert.equal(s.completedWork, 0);
});

test('skip advances phase without counting completion', () => {
  let s = timer.initState(settings);
  s = timer.skip(s, settings);
  assert.equal(s.phase, 'short');
  assert.equal(s.completedWork, 0);
});

test('reset returns to fresh work state', () => {
  let s = timer.initState(settings);
  s = timer.complete(s, settings);
  s = timer.reset(s, settings);
  assert.deepEqual(s, timer.initState(settings));
});
