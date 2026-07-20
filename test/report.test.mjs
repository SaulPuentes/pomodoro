import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as report from '../src/report.mjs';

// June 22 2026 is a Monday; its ISO week is 2026-W26 (verified by hand).
test('isoWeekKey: mid-year Monday', () => {
  assert.equal(report.isoWeekKey(new Date(2026, 5, 22)), '2026-W26');
});

// Jan 1 2026 is a Thursday -> belongs to ISO week 1 of 2026.
test('isoWeekKey: Jan 1 2026 is W01', () => {
  assert.equal(report.isoWeekKey(new Date(2026, 0, 1)), '2026-W01');
});

// Jan 1 2027 is a Friday -> its ISO week-year is still 2026 (W53).
test('isoWeekKey: Jan 1 2027 rolls back to 2026-W53', () => {
  assert.equal(report.isoWeekKey(new Date(2027, 0, 1)), '2026-W53');
});

test('weekLabel: same-month range', () => {
  assert.equal(report.weekLabel('2026-W26'), 'Jun 22 – 28');
});

test('weekLabel: cross-month range (W01 spans Dec–Jan)', () => {
  assert.equal(report.weekLabel('2026-W01'), 'Dec 29 – Jan 4');
});

const LOG = {
  '2026-06-22': { Website: { landing: 50, nav: 25 }, Emails: { '': 25 } },
  '2026-06-24': { Website: { landing: 25 } },
  '2026-06-15': { Website: { landing: 100 } }, // previous week
};

test('weekOf: rolls tasks into projects, sorted desc', () => {
  const wk = report.weekOf(LOG, '2026-W26');
  assert.equal(wk.total, 125);
  assert.deepEqual(wk.projects.map((p) => [p.name, p.minutes]), [
    ['Website', 100],
    ['Emails', 25],
  ]);
  assert.deepEqual(wk.projects[0].tasks.map((t) => [t.name, t.minutes]), [
    ['landing', 75],
    ['nav', 25],
  ]);
});

test('weeks: keys present, newest first', () => {
  assert.deepEqual(report.weeks(LOG), ['2026-W26', '2026-W25']);
});

test('thisWeek: only the current week, project totals only', () => {
  const tw = report.thisWeek(LOG, new Date(2026, 5, 24));
  assert.equal(tw.total, 125);
  assert.deepEqual(tw.projects.map((p) => p.name), ['Website', 'Emails']);
  assert.equal('tasks' in tw.projects[0], false);
});

test('empty timelog: weekOf and weeks return empty shapes', () => {
  assert.deepEqual(report.weekOf({}, '2026-W26'), { total: 0, projects: [] });
  assert.deepEqual(report.weeks({}), []);
});

test('rangeReport: rolls tasks into projects within range, sorted desc', () => {
  const r = report.rangeReport(LOG, '2026-06-22', '2026-06-24');
  assert.equal(r.total, 125);
  assert.deepEqual(r.projects.map((p) => [p.name, p.minutes]), [
    ['Website', 100],
    ['Emails', 25],
  ]);
  assert.deepEqual(r.projects[0].tasks.map((t) => [t.name, t.minutes]), [
    ['landing', 75],
    ['nav', 25],
  ]);
  assert.deepEqual(r.days, [
    { date: '2026-06-22', minutes: 100 }, // Website 75 + Emails 25 (blank task counts)
    { date: '2026-06-24', minutes: 25 },
  ]);
  assert.equal(r.activeDays, 2);
  assert.deepEqual(r.bestDay, { date: '2026-06-22', minutes: 100 });
});

test('rangeReport: excludes days outside the range', () => {
  const r = report.rangeReport(LOG, '2026-06-22', '2026-06-22');
  assert.equal(r.total, 100); // 2026-06-15 and 2026-06-24 excluded; Website 75 + Emails 25
});

test('rangeReport: empty when no days match', () => {
  assert.deepEqual(report.rangeReport(LOG, '2026-01-01', '2026-01-31'),
    { total: 0, days: [], projects: [], activeDays: 0, bestDay: null });
});

test('streakEndingAt: counts consecutive days ending at endKey', () => {
  const set = new Set(['2026-06-22', '2026-06-23', '2026-06-24']);
  assert.equal(report.streakEndingAt(set, '2026-06-24'), 3);
});

test('streakEndingAt: stops at the first gap', () => {
  const set = new Set(['2026-06-20', '2026-06-23', '2026-06-24']);
  assert.equal(report.streakEndingAt(set, '2026-06-24'), 2);
});

test('streakEndingAt: zero when endKey has no focus', () => {
  const set = new Set(['2026-06-22']);
  assert.equal(report.streakEndingAt(set, '2026-06-24'), 0);
});
