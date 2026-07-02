import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.mjs';

function fakeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

test('loadSettings returns defaults on empty store', () => {
  assert.deepEqual(storage.loadSettings(fakeStore()), {
    workMin: 25, shortMin: 5, longMin: 15, soundEnabled: false,
  });
});

test('save then load round-trips settings', () => {
  const st = fakeStore();
  const custom = { workMin: 50, shortMin: 10, longMin: 30, soundEnabled: true };
  storage.saveSettings(st, custom);
  assert.deepEqual(storage.loadSettings(st), custom);
});

test('loadSettings falls back to defaults on corrupt json', () => {
  const st = fakeStore();
  st.setItem('pomodoro.settings', '{not valid');
  assert.equal(storage.loadSettings(st).workMin, 25);
});

test('todayKey formats local date as YYYY-MM-DD', () => {
  assert.equal(storage.todayKey(new Date('2026-06-18T10:00:00')), '2026-06-18');
});

test('incrementToday bumps the count for the given date', () => {
  const st = fakeStore();
  const d = new Date('2026-06-18T10:00:00');
  assert.equal(storage.incrementToday(st, d), 1);
  assert.equal(storage.incrementToday(st, d), 2);
  assert.equal(storage.getCount(st, '2026-06-18'), 2);
});

test('different days are counted independently', () => {
  const st = fakeStore();
  storage.incrementToday(st, new Date('2026-06-18T10:00:00'));
  storage.incrementToday(st, new Date('2026-06-19T10:00:00'));
  assert.equal(storage.getCount(st, '2026-06-18'), 1);
  assert.equal(storage.getCount(st, '2026-06-19'), 1);
});

test('getCount returns 0 for unknown date', () => {
  assert.equal(storage.getCount(fakeStore(), '2000-01-01'), 0);
});

test('history trims to the most recent 30 days', () => {
  const st = fakeStore();
  for (let i = 0; i < 35; i++) {
    const d = new Date('2026-01-01T10:00:00');
    d.setDate(d.getDate() + i);
    storage.incrementToday(st, d);
  }
  const h = storage.loadHistory(st);
  assert.equal(Object.keys(h).length, 30);
  assert.ok(!('2026-01-01' in h)); // oldest dropped
  assert.ok('2026-02-04' in h);    // 35th day kept
});

test('loadProjects empty by default; addProject dedupes and trims', () => {
  const st = fakeStore();
  assert.deepEqual(storage.loadProjects(st), []);
  storage.addProject(st, '  Website  ');
  storage.addProject(st, 'Website');   // dupe ignored
  storage.addProject(st, 'Emails');
  storage.addProject(st, '   ');        // blank ignored
  assert.deepEqual(storage.loadProjects(st), ['Website', 'Emails']);
});

test('loadActive migrates a legacy goal string', () => {
  const st = fakeStore();
  st.setItem('pomodoro.goal', 'Ship the report');
  assert.deepEqual(storage.loadActive(st), { project: '', task: 'Ship the report' });
});

test('save then load round-trips active selection', () => {
  const st = fakeStore();
  storage.saveActive(st, { project: 'Website', task: 'landing' });
  assert.deepEqual(storage.loadActive(st), { project: 'Website', task: 'landing' });
});

test('logFocus accumulates minutes per project/task per day', () => {
  const st = fakeStore();
  const d = new Date('2026-06-22T10:00:00');
  storage.logFocus(st, { project: 'Website', task: 'landing', minutes: 25, now: d });
  storage.logFocus(st, { project: 'Website', task: 'landing', minutes: 25, now: d });
  storage.logFocus(st, { project: 'Website', task: 'nav', minutes: 25, now: d });
  assert.deepEqual(storage.loadTimelog(st)['2026-06-22'], {
    Website: { landing: 50, nav: 25 },
  });
});

test('logFocus skips focus time that has no project', () => {
  const st = fakeStore();
  const d = new Date('2026-06-22T10:00:00');
  storage.logFocus(st, { project: '', task: '', minutes: 25, now: d });
  storage.logFocus(st, { project: '   ', task: 'x', minutes: 25, now: d });
  assert.deepEqual(storage.loadTimelog(st), {});
});

test('loadTimelog strips legacy "No project" buckets and drops emptied days', () => {
  const st = fakeStore();
  st.setItem('pomodoro.timelog', JSON.stringify({
    '2026-06-22': { 'No project': { '': 25 }, Website: { landing: 50 } },
    '2026-06-23': { 'No project': { note: 10 } },
  }));
  assert.deepEqual(storage.loadTimelog(st), {
    '2026-06-22': { Website: { landing: 50 } },
  });
});

test('timelog trims to the most recent 180 days', () => {
  const st = fakeStore();
  for (let i = 0; i < 200; i++) {
    const d = new Date('2026-01-01T10:00:00');
    d.setDate(d.getDate() + i);
    storage.logFocus(st, { project: 'P', task: 't', minutes: 25, now: d });
  }
  assert.equal(Object.keys(storage.loadTimelog(st)).length, 180);
  assert.ok(!('2026-01-01' in storage.loadTimelog(st))); // oldest dropped
});

test('renameProject updates the list and migrates timelog minutes', () => {
  const st = fakeStore();
  storage.addProject(st, 'Website');
  const d = new Date('2026-06-22T10:00:00');
  storage.logFocus(st, { project: 'Website', task: 'landing', minutes: 25, now: d });
  storage.renameProject(st, 'Website', 'Marketing');
  assert.deepEqual(storage.loadProjects(st), ['Marketing']);
  assert.deepEqual(storage.loadTimelog(st)['2026-06-22'], { Marketing: { landing: 25 } });
});

test('renameProject merges into an existing project (dedupes, sums minutes)', () => {
  const st = fakeStore();
  storage.addProject(st, 'Old');
  storage.addProject(st, 'New');
  const d = new Date('2026-06-22T10:00:00');
  storage.logFocus(st, { project: 'Old', task: 't', minutes: 25, now: d });
  storage.logFocus(st, { project: 'New', task: 't', minutes: 25, now: d });
  storage.renameProject(st, 'Old', 'New');
  assert.deepEqual(storage.loadProjects(st), ['New']);
  assert.deepEqual(storage.loadTimelog(st)['2026-06-22'], { New: { t: 50 } });
});

test('renameProject ignores blank or unchanged names', () => {
  const st = fakeStore();
  storage.addProject(st, 'Website');
  storage.renameProject(st, 'Website', '   ');
  storage.renameProject(st, 'Website', 'Website');
  assert.deepEqual(storage.loadProjects(st), ['Website']);
});

test('deleteProject removes it from the list but keeps history', () => {
  const st = fakeStore();
  storage.addProject(st, 'Website');
  const d = new Date('2026-06-22T10:00:00');
  storage.logFocus(st, { project: 'Website', task: 'landing', minutes: 25, now: d });
  storage.deleteProject(st, 'Website');
  assert.deepEqual(storage.loadProjects(st), []);
  assert.deepEqual(storage.loadTimelog(st)['2026-06-22'], { Website: { landing: 25 } });
});
