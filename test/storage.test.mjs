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
