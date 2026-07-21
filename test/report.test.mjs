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

test('rangeReport: per-project activeDays, bestDay, avgActive', () => {
  const r = report.rangeReport(LOG, '2026-06-22', '2026-06-24');
  const web = r.projects.find((p) => p.name === 'Website');
  assert.equal(web.activeDays, 2); // 06-22 (75m) + 06-24 (25m)
  assert.deepEqual(web.bestDay, { date: '2026-06-22', minutes: 75 });
  assert.equal(web.avgActive, 50); // round(100 / 2)
  const emails = r.projects.find((p) => p.name === 'Emails');
  assert.equal(emails.activeDays, 1);
  assert.equal(emails.avgActive, 25);
  assert.deepEqual(emails.bestDay, { date: '2026-06-22', minutes: 25 });
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

test('presetRange: 7d is a 7-day inclusive window ending today', () => {
  assert.deepEqual(report.presetRange('7d', new Date(2026, 6, 20)),
    { fromKey: '2026-07-14', toKey: '2026-07-20' });
});

test('presetRange: 30d window', () => {
  assert.deepEqual(report.presetRange('30d', new Date(2026, 6, 20)),
    { fromKey: '2026-06-21', toKey: '2026-07-20' });
});

test('presetRange: all uses earliestKey', () => {
  assert.deepEqual(report.presetRange('all', new Date(2026, 6, 20), '2026-01-15'),
    { fromKey: '2026-01-15', toKey: '2026-07-20' });
});

test('eachDayKey: inclusive ascending day span', () => {
  assert.deepEqual(report.eachDayKey('2026-06-29', '2026-07-02'),
    ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02']);
});

test('eachDayKey: empty when from is after to', () => {
  assert.deepEqual(report.eachDayKey('2026-07-02', '2026-07-01'), []);
});

test('toWeekly: groups days into ISO-week buckets, ascending', () => {
  const daily = [
    { key: '2026-06-22', minutes: 60 }, // W26 (Mon)
    { key: '2026-06-24', minutes: 30 }, // W26
    { key: '2026-06-29', minutes: 20 }, // W27 (Mon)
  ];
  assert.deepEqual(report.toWeekly(daily), [
    { label: 'Jun 22 – 28', minutes: 90 },
    { label: 'Jun 29 – Jul 5', minutes: 20 },
  ]);
});

test('donutGradient: cumulative conic stops per project', () => {
  const g = report.donutGradient(
    [{ name: 'A', minutes: 75 }, { name: 'B', minutes: 25 }],
    ['#111', '#222']);
  assert.equal(g, 'conic-gradient(#111 0.00deg 270.00deg, #222 270.00deg 360.00deg)');
});

test('donutGradient: null when there is no time', () => {
  assert.equal(report.donutGradient([{ name: 'A', minutes: 0 }], ['#111']), null);
});

test('previousRange: equal-length window ending the day before', () => {
  assert.deepEqual(report.previousRange('2026-07-14', '2026-07-20'),
    { fromKey: '2026-07-07', toKey: '2026-07-13' });
});

test('previousRange: single-day range', () => {
  assert.deepEqual(report.previousRange('2026-07-20', '2026-07-20'),
    { fromKey: '2026-07-19', toKey: '2026-07-19' });
});

test('pctChange: increase, decrease, and null on zero base', () => {
  assert.equal(report.pctChange(120, 100), 20);
  assert.equal(report.pctChange(90, 100), -10);
  assert.equal(report.pctChange(50, 0), null);
});

test('PALETTE: has at least 8 distinct colors', () => {
  assert.ok(report.PALETTE.length >= 8);
  assert.equal(new Set(report.PALETTE).size, report.PALETTE.length);
});

test('rangeReport: per-project bestDay tie-break picks the earliest day', () => {
  const log = {
    '2026-06-10': { Deep: { '': 40 } },
    '2026-06-12': { Deep: { '': 40 } }, // same minutes → earliest day wins
  };
  const r = report.rangeReport(log, '2026-06-10', '2026-06-12');
  assert.deepEqual(r.projects[0].bestDay, { date: '2026-06-10', minutes: 40 });
});
