import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginSession, switchSegment, closeSession } from '../src/session.mjs';

const MIN = 60000;

test('fresh session has no segments and anchors to full duration', () => {
  const s = beginSession(25 * MIN);
  assert.deepEqual(s, { segments: [], anchorMs: 25 * MIN });
});

test('single-project session logs full duration', () => {
  const s = beginSession(25 * MIN);
  const out = closeSession(s, { project: 'A', task: 't', totalMin: 25 });
  assert.deepEqual(out, [{ project: 'A', task: 't', minutes: 25 }]);
});

test('mid-session switch splits elapsed time', () => {
  let s = beginSession(25 * MIN);
  // 10 min elapsed on A, then switch
  s = switchSegment(s, { project: 'A', task: 'a', remainingMs: 15 * MIN });
  const out = closeSession(s, { project: 'B', task: 'b', totalMin: 25 });
  assert.deepEqual(out, [
    { project: 'A', task: 'a', minutes: 10 },
    { project: 'B', task: 'b', minutes: 15 },
  ]);
});

test('three-way split 10/10/5', () => {
  let s = beginSession(25 * MIN);
  s = switchSegment(s, { project: 'A', task: '', remainingMs: 15 * MIN });
  s = switchSegment(s, { project: 'B', task: '', remainingMs: 5 * MIN });
  const out = closeSession(s, { project: 'C', task: '', totalMin: 25 });
  assert.deepEqual(
    out.map((x) => [x.project, x.minutes]),
    [['A', 10], ['B', 10], ['C', 5]],
  );
});

test('switch with zero elapsed pushes no segment', () => {
  let s = beginSession(25 * MIN);
  s = switchSegment(s, { project: 'A', task: '', remainingMs: 25 * MIN });
  assert.equal(s.segments.length, 0);
});

test('switchSegment does not mutate its input', () => {
  const s0 = beginSession(25 * MIN);
  switchSegment(s0, { project: 'A', task: '', remainingMs: 15 * MIN });
  assert.deepEqual(s0, { segments: [], anchorMs: 25 * MIN });
});

test('rounded minutes always sum to totalMin; last absorbs remainder', () => {
  let s = beginSession(25 * MIN);
  // 1.5 min each -> both round to 2
  s = switchSegment(s, { project: 'A', task: '', remainingMs: 25 * MIN - 90_000 });
  s = switchSegment(s, { project: 'B', task: '', remainingMs: 25 * MIN - 180_000 });
  const out = closeSession(s, { project: 'C', task: '', totalMin: 25 });
  assert.equal(out.reduce((a, x) => a + x.minutes, 0), 25);
  assert.deepEqual(out.map((x) => x.minutes), [2, 2, 21]);
});

test('segments rounding to 0 minutes are dropped', () => {
  let s = beginSession(25 * MIN);
  // 10 s on A -> rounds to 0
  s = switchSegment(s, { project: 'A', task: '', remainingMs: 25 * MIN - 10_000 });
  const out = closeSession(s, { project: 'B', task: '', totalMin: 25 });
  assert.deepEqual(out, [{ project: 'B', task: '', minutes: 25 }]);
});

test('pause spanning a switch attributes no paused time', () => {
  // Timer paused at 20 min remaining; user switches project while paused;
  // remaining is frozen during pause, so the switch sees the same remainingMs.
  let s = beginSession(25 * MIN);
  s = switchSegment(s, { project: 'A', task: '', remainingMs: 20 * MIN });
  const out = closeSession(s, { project: 'B', task: '', totalMin: 25 });
  assert.deepEqual(out.map((x) => x.minutes), [5, 20]);
});
