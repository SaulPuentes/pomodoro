# Pomodoro App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop Pomodoro timer that runs manual work/break cycles, counts completed work sessions per day with history, lets the user change durations, and pops its window to the front when a work session ends.

**Architecture:** Pure logic (`timer.mjs`) and persistence (`storage.mjs`) are framework-free ESM modules, unit-tested with Node's built-in test runner. The Electron main process owns the window and the "pop to front" action over IPC. The renderer (`renderer.mjs`) wires the pure modules to the DOM.

**Tech Stack:** Electron, vanilla JS/HTML/CSS (no framework), `localStorage`, Node built-in `node:test`.

## Global Constraints

- Platform: Electron desktop app. Single `BrowserWindow`.
- No frontend framework — vanilla JS/HTML/CSS only.
- Module formats: logic/render modules are ESM (`.mjs`); Electron `main.js` and `preload.js` are CommonJS (`require`). `package.json` has **no** `"type"` field (CommonJS default).
- Persistence: `localStorage` only. No database. Keys: `pomodoro.settings`, `pomodoro.history`.
- Default settings (verbatim): `{ workMin: 25, shortMin: 5, longMin: 15, soundEnabled: false }`. Sound disabled by default.
- Configurable settings: durations + sound toggle only. Cycle count is fixed: long break after every 4th completed work session (`LONG_BREAK_EVERY = 4`).
- Phase transitions are manual — every phase waits for a user click to start.
- Window pops to front on **work-session** end only (not break end).
- Completion sound implemented via WebAudio beep (no binary asset shipped — replaces the spec's `chime.mp3`).
- Tests: Node built-in test runner, `node --test test/`. Pure modules take an injectable store/now for testability.
- `contextIsolation: true`, `nodeIntegration: false`.
- Daily count derived from local date (`YYYY-MM-DD`), so midnight reset needs no scheduled job.
- Commit after every task.

---

### Task 1: Timer cycle logic (`timer.mjs`)

Pure state machine: phases, durations, completion/cycle logic, reset, skip. No timing yet.

**Files:**
- Create: `src/timer.mjs`
- Test: `test/timer.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PHASES = { WORK:'work', SHORT:'short', LONG:'long' }`, `LONG_BREAK_EVERY = 4`
  - `durationMsFor(phase, settings) -> number`
  - `initState(settings) -> { phase, completedWork, running, remainingMs, targetEndMs }`
  - `complete(state, settings) -> state` (advances phase, counts work, long break after 4, resets cycle after long)
  - `skip(state, settings) -> state` (advances phase without counting)
  - `reset(state, settings) -> state`

- [ ] **Step 1: Write the failing test**

Create `test/timer.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` (or `node --test test/`)
Expected: FAIL — cannot resolve `../src/timer.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `src/timer.mjs`:

```js
export const PHASES = { WORK: 'work', SHORT: 'short', LONG: 'long' };
export const LONG_BREAK_EVERY = 4;

export function durationMsFor(phase, settings) {
  if (phase === PHASES.WORK) return settings.workMin * 60000;
  if (phase === PHASES.SHORT) return settings.shortMin * 60000;
  return settings.longMin * 60000;
}

export function initState(settings) {
  return {
    phase: PHASES.WORK,
    completedWork: 0,
    running: false,
    remainingMs: durationMsFor(PHASES.WORK, settings),
    targetEndMs: null,
  };
}

function transition(phase, completedWork, settings) {
  return {
    phase,
    completedWork,
    running: false,
    remainingMs: durationMsFor(phase, settings),
    targetEndMs: null,
  };
}

export function complete(state, settings) {
  let { phase, completedWork } = state;
  if (phase === PHASES.WORK) {
    completedWork += 1;
    const next = completedWork % LONG_BREAK_EVERY === 0 ? PHASES.LONG : PHASES.SHORT;
    return transition(next, completedWork, settings);
  }
  if (phase === PHASES.LONG) {
    return transition(PHASES.WORK, 0, settings);
  }
  return transition(PHASES.WORK, completedWork, settings);
}

export function skip(state, settings) {
  const { phase, completedWork } = state;
  if (phase === PHASES.LONG) return transition(PHASES.WORK, 0, settings);
  if (phase === PHASES.WORK) return transition(PHASES.SHORT, completedWork, settings);
  return transition(PHASES.WORK, completedWork, settings);
}

export function reset(state, settings) {
  return initState(settings);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all `timer.test.mjs` tests).

- [ ] **Step 5: Commit**

```bash
git add src/timer.mjs test/timer.test.mjs
git commit -m "feat: add pomodoro timer cycle logic"
```

---

### Task 2: Timer countdown timing (`timer.mjs`)

Add timestamp-based start/pause/remaining so the countdown survives throttling and sleep.

**Files:**
- Modify: `src/timer.mjs` (add three functions)
- Test: `test/timer.test.mjs` (append tests)

**Interfaces:**
- Consumes: `initState` from Task 1.
- Produces:
  - `start(state, now) -> state` (sets `running:true`, `targetEndMs = now + remainingMs`)
  - `pause(state, now) -> state` (sets `running:false`, freezes `remainingMs`)
  - `remainingAt(state, now) -> number` (ms remaining; never negative)

- [ ] **Step 1: Write the failing test**

Append to `test/timer.test.mjs`:

```js
test('start sets target end to now + remaining', () => {
  const s = timer.start(timer.initState(settings), 1000);
  assert.equal(s.running, true);
  assert.equal(s.targetEndMs, 1000 + 25 * 60000);
});

test('remainingAt counts down while running', () => {
  const s = timer.start(timer.initState(settings), 1000);
  assert.equal(timer.remainingAt(s, 1000 + 60000), 25 * 60000 - 60000);
});

test('remainingAt never goes negative', () => {
  const s = timer.start(timer.initState(settings), 1000);
  assert.equal(timer.remainingAt(s, 1000 + 999 * 60000), 0);
});

test('pause freezes remaining and ignores later time', () => {
  let s = timer.start(timer.initState(settings), 1000);
  s = timer.pause(s, 1000 + 60000);
  assert.equal(s.running, false);
  assert.equal(s.remainingMs, 25 * 60000 - 60000);
  assert.equal(s.targetEndMs, null);
  assert.equal(timer.remainingAt(s, 9_999_999), 25 * 60000 - 60000);
});

test('remainingAt while paused returns stored remaining', () => {
  const s = timer.initState(settings);
  assert.equal(timer.remainingAt(s, 123456), 25 * 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `timer.start is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/timer.mjs`:

```js
export function start(state, now) {
  if (state.running) return state;
  return { ...state, running: true, targetEndMs: now + state.remainingMs };
}

export function pause(state, now) {
  if (!state.running) return state;
  const remainingMs = Math.max(0, state.targetEndMs - now);
  return { ...state, running: false, remainingMs, targetEndMs: null };
}

export function remainingAt(state, now) {
  if (state.running) return Math.max(0, state.targetEndMs - now);
  return state.remainingMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all timer tests, old + new).

- [ ] **Step 5: Commit**

```bash
git add src/timer.mjs test/timer.test.mjs
git commit -m "feat: add timestamp-based timer countdown"
```

---

### Task 3: Persistence (`storage.mjs`)

`localStorage` wrapper with parse guards, default settings, per-day count, and 30-day history trim. Functions take an injectable store and `now` for testing.

**Files:**
- Create: `src/storage.mjs`
- Test: `test/storage.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_SETTINGS = { workMin:25, shortMin:5, longMin:15, soundEnabled:false }`
  - `todayKey(date=new Date()) -> 'YYYY-MM-DD'` (local date)
  - `loadSettings(store) -> settings`
  - `saveSettings(store, settings) -> void`
  - `loadHistory(store) -> { [date]: count }`
  - `getCount(store, key) -> number`
  - `incrementToday(store, now=new Date()) -> number` (new count for today)
- A `store` is any object with `getItem(key)` and `setItem(key, value)`.

- [ ] **Step 1: Write the failing test**

Create `test/storage.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/storage.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `src/storage.mjs`:

```js
const SETTINGS_KEY = 'pomodoro.settings';
const HISTORY_KEY = 'pomodoro.history';
const MAX_DAYS = 30;

export const DEFAULT_SETTINGS = {
  workMin: 25, shortMin: 5, longMin: 15, soundEnabled: false,
};

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readJSON(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(store) {
  return { ...DEFAULT_SETTINGS, ...readJSON(store, SETTINGS_KEY, {}) };
}

export function saveSettings(store, settings) {
  store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadHistory(store) {
  return readJSON(store, HISTORY_KEY, {});
}

function trim(history) {
  const keys = Object.keys(history).sort(); // YYYY-MM-DD sorts chronologically
  if (keys.length <= MAX_DAYS) return history;
  const keep = keys.slice(keys.length - MAX_DAYS);
  const out = {};
  for (const k of keep) out[k] = history[k];
  return out;
}

export function getCount(store, key) {
  return loadHistory(store)[key] || 0;
}

export function incrementToday(store, now = new Date()) {
  const key = todayKey(now);
  const history = loadHistory(store);
  history[key] = (history[key] || 0) + 1;
  const trimmed = trim(history);
  store.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed[key];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all storage tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage.mjs test/storage.test.mjs
git commit -m "feat: add localStorage persistence with daily history"
```

---

### Task 4: Electron shell + window-on-top (`main.js`, `preload.js`, markup)

App boots, shows a window, and exposes a bridge that pops the window to the front. Markup contains all UI containers used by later tasks.

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `preload.js`
- Create: `src/index.html`
- Create: `src/style.css`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - IPC channel `session-ended` (renderer → main) that restores/shows/focuses the window and briefly sets always-on-top.
  - `window.pomodoro.sessionEnded()` exposed to the renderer via preload.
  - DOM element ids: `phase`, `time`, `dots`, `startPause`, `reset`, `skip`, `count`, `workMin`, `shortMin`, `longMin`, `soundEnabled`, `history`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pomodoro",
  "version": "1.0.0",
  "description": "Desktop Pomodoro timer",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test test/"
  },
  "devDependencies": {
    "electron": "^31.0.0"
  }
}
```

- [ ] **Step 2: Install Electron**

Run: `npm install`
Expected: `node_modules/` created, `electron` present, exit 0.

- [ ] **Step 3: Create `preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoro', {
  sessionEnded: () => ipcRenderer.send('session-ended'),
});
```

- [ ] **Step 4: Create `main.js`**

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('session-ended', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.setAlwaysOnTop(true);
  setTimeout(() => {
    if (win) win.setAlwaysOnTop(false);
  }, 1000);
});
```

- [ ] **Step 5: Create `src/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self'"
    />
    <title>Pomodoro</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <div id="phase" class="phase">Work</div>
      <div id="time" class="time">25:00</div>
      <div id="dots" class="dots"></div>

      <div class="controls">
        <button id="startPause">Start</button>
        <button id="reset">Reset</button>
        <button id="skip">Skip</button>
      </div>

      <div class="today">Today: <span id="count">0</span></div>

      <details class="panel">
        <summary>Settings</summary>
        <label>Work (min) <input id="workMin" type="number" min="1" /></label>
        <label>Short break (min) <input id="shortMin" type="number" min="1" /></label>
        <label>Long break (min) <input id="longMin" type="number" min="1" /></label>
        <label>Sound <input id="soundEnabled" type="checkbox" /></label>
      </details>

      <details class="panel">
        <summary>History</summary>
        <ul id="history"></ul>
      </details>
    </main>
    <script type="module" src="renderer.mjs"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/style.css`**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, system-ui, sans-serif;
  background: #1e1e2e;
  color: #eee;
}
main { padding: 20px; text-align: center; }
.phase { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; }
.time { font-size: 64px; font-variant-numeric: tabular-nums; margin: 8px 0; }
.dots { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #888; }
.dot.filled { background: #f38ba8; border-color: #f38ba8; }
.controls { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
button {
  padding: 8px 16px; border: none; border-radius: 6px;
  background: #585b70; color: #eee; cursor: pointer; font-size: 14px;
}
button:hover { background: #6c7086; }
.today { margin-bottom: 16px; font-size: 16px; }
.panel { text-align: left; margin-top: 8px; }
.panel summary { cursor: pointer; }
.panel label { display: block; margin: 6px 0; }
.panel input[type="number"] { width: 60px; }
#history { max-height: 160px; overflow-y: auto; padding-left: 18px; }
```

- [ ] **Step 7: Add a temporary renderer stub so the page loads**

Create `src/renderer.mjs` (replaced in Task 5):

```js
// Temporary stub — replaced in Task 5.
console.log('renderer loaded');
```

- [ ] **Step 8: Manual test — window boots**

Run: `npm start`
Expected: a 360×520 window opens showing "Work", "25:00", three buttons, and Settings/History sections. DevTools console shows "renderer loaded". Close the window; the process exits (non-mac) or stays in dock (mac) — both fine.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json main.js preload.js src/index.html src/style.css src/renderer.mjs
git commit -m "feat: add electron shell with window-on-top IPC"
```

---

### Task 5: Renderer wiring — timer, controls, count (`renderer.mjs`, `sound.mjs`)

Connect the pure modules to the DOM: render loop, Start/Pause/Reset/Skip, dots, today count, completion handling (increment count + pop window on work end), and the sound beep.

**Files:**
- Create: `src/sound.mjs`
- Modify: `src/renderer.mjs` (replace the Task 4 stub)

**Interfaces:**
- Consumes: `timer.*` (Tasks 1–2), `storage.*` (Task 3), `window.pomodoro.sessionEnded()` (Task 4).
- Produces: `playBeep()` from `sound.mjs`. Establishes the module-level `settings`/`state`/`store` used by Task 6's settings & history wiring.

- [ ] **Step 1: Create `src/sound.mjs`**

```js
export function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    /* audio unavailable — ignore */
  }
}
```

- [ ] **Step 2: Replace `src/renderer.mjs`**

```js
import * as timer from './timer.mjs';
import * as storage from './storage.mjs';
import { playBeep } from './sound.mjs';

const store = window.localStorage;
let settings = storage.loadSettings(store);
let state = timer.initState(settings);
let tickHandle = null;

const $ = (id) => document.getElementById(id);
const PHASE_LABEL = { work: 'Work', short: 'Short Break', long: 'Long Break' };

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderDots() {
  const dots = $('dots');
  dots.innerHTML = '';
  for (let i = 0; i < timer.LONG_BREAK_EVERY; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < state.completedWork ? ' filled' : '');
    dots.appendChild(d);
  }
}

function render() {
  $('time').textContent = fmt(timer.remainingAt(state, Date.now()));
  $('phase').textContent = PHASE_LABEL[state.phase];
  $('count').textContent = String(storage.getCount(store, storage.todayKey()));
  $('startPause').textContent = state.running ? 'Pause' : 'Start';
  renderDots();
}

function startTick() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    if (timer.remainingAt(state, Date.now()) <= 0) {
      onComplete();
    }
    render();
  }, 250);
}

function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function onComplete() {
  stopTick();
  const wasWork = state.phase === timer.PHASES.WORK;
  state = timer.complete(state, settings);
  if (wasWork) {
    storage.incrementToday(store, new Date());
    window.pomodoro.sessionEnded();
  }
  if (settings.soundEnabled) playBeep();
  render();
}

$('startPause').addEventListener('click', () => {
  const now = Date.now();
  if (state.running) {
    state = timer.pause(state, now);
    stopTick();
  } else {
    state = timer.start(state, now);
    startTick();
  }
  render();
});

$('reset').addEventListener('click', () => {
  stopTick();
  state = timer.reset(state, settings);
  render();
});

$('skip').addEventListener('click', () => {
  stopTick();
  state = timer.skip(state, settings);
  render();
});

render();
```

- [ ] **Step 3: Manual test — countdown and count**

Run: `npm start`. To test fast without waiting 25 min, open Settings and set Work to `1` (Task 6 wires this; until then, temporarily edit `DEFAULT_SETTINGS.workMin` to a small value OR clear it after). Simplest check now:
1. Click **Start** → label flips to "Pause", time counts down each second.
2. Click **Pause** → countdown freezes, label shows "Start".
3. Click **Skip** → phase becomes "Short Break", time shows the short duration, one dot does NOT fill (skip doesn't count).
4. Click **Reset** → back to "Work", "25:00", zero dots.

(Full work-completion behavior — count increment + window pop — is verified in Task 6's manual test once durations are editable.)

- [ ] **Step 4: Commit**

```bash
git add src/sound.mjs src/renderer.mjs
git commit -m "feat: wire timer controls, countdown, and daily count"
```

---

### Task 6: Settings panel + history view (`renderer.mjs`)

Wire the durations inputs, sound toggle, and history list. Closing the loop lets a full work session be tested end-to-end (count + window pop).

**Files:**
- Modify: `src/renderer.mjs` (append settings/history wiring; call from init)

**Interfaces:**
- Consumes: module-level `settings`, `state`, `store`, `render` from Task 5; `timer.durationMsFor`; `storage.saveSettings`, `storage.loadHistory`.
- Produces: nothing new — completes the UI.

- [ ] **Step 1: Append settings + history wiring to `src/renderer.mjs`**

Add below the existing control listeners, replacing the final `render();` line with this block:

```js
function clampInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function loadSettingsUI() {
  $('workMin').value = settings.workMin;
  $('shortMin').value = settings.shortMin;
  $('longMin').value = settings.longMin;
  $('soundEnabled').checked = settings.soundEnabled;
}

function onSettingsChange() {
  settings = {
    workMin: clampInt($('workMin').value, settings.workMin),
    shortMin: clampInt($('shortMin').value, settings.shortMin),
    longMin: clampInt($('longMin').value, settings.longMin),
    soundEnabled: $('soundEnabled').checked,
  };
  storage.saveSettings(store, settings);
  loadSettingsUI(); // reflect any clamped values
  if (!state.running) {
    state = { ...state, remainingMs: timer.durationMsFor(state.phase, settings) };
  }
  render();
}

function renderHistory() {
  const history = storage.loadHistory(store);
  const list = $('history');
  list.innerHTML = '';
  Object.keys(history)
    .sort()
    .reverse()
    .forEach((date) => {
      const li = document.createElement('li');
      li.textContent = `${date}: ${history[date]}`;
      list.appendChild(li);
    });
}

['workMin', 'shortMin', 'longMin', 'soundEnabled'].forEach((id) => {
  $(id).addEventListener('change', onSettingsChange);
});

// Re-render history whenever a session completes.
const _onComplete = onComplete;
onComplete = function () {
  _onComplete();
  renderHistory();
};

loadSettingsUI();
renderHistory();
render();
```

Note: `onComplete` is a function declaration in Task 5, so it can be reassigned here. If the implementer prefers, fold `renderHistory()` directly into the Task 5 `onComplete` body instead — either is acceptable, but do not call it twice.

- [ ] **Step 2: Manual test — settings persist and durations apply**

Run: `npm start`
1. Open **Settings**, set Work to `1`, Short break to `1`. Fields update.
2. The timer (idle) now shows `01:00` for Work.
3. Quit and `npm start` again → Work still `1` (persisted to `localStorage`).
4. Enter `0` or blank in Work → reverts to the last valid value (clamp).

- [ ] **Step 3: Manual test — full work session: count + window pop + history**

Run: `npm start` with Work set to `1` minute.
1. Click **Start**. **Minimize the window.**
2. After ~1 minute the window should **pop to the front** (restore + focus) and the phase becomes "Short Break".
3. "Today" count increased by 1.
4. Open **History** → today's date shows the count.
5. Open **Settings**, enable **Sound**, complete another short→work→work cycle → a beep plays on completion. Disable sound → no beep.

- [ ] **Step 4: Manual test — long break after 4**

With Work and breaks set to `1` minute, complete 4 work sessions (start each phase manually). After the 4th work session the phase should be "Long Break" with `15:00`-equivalent (long duration), and all 4 dots filled. Completing the long break resets dots to zero.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.mjs
git commit -m "feat: add settings panel and history view"
```

---

## Self-Review Notes

- **Spec coverage:** cycle logic (T1), countdown (T2), daily count + history + midnight-via-date + defaults (T3), window-on-top + Electron shell + manual transitions (T4), controls + count + sound toggle (T5), durations config + history view + end-to-end (T6). All spec sections mapped.
- **Deviation from spec:** completion sound is a WebAudio beep, not a bundled `chime.mp3` — avoids shipping a binary asset that can't be authored as text. Recorded in Global Constraints.
- **Type consistency:** `PHASES`, `LONG_BREAK_EVERY`, `durationMsFor`, `initState/complete/skip/reset/start/pause/remainingAt`, `loadSettings/saveSettings/loadHistory/getCount/incrementToday/todayKey`, and DOM ids are used identically across tasks.
- **No placeholders:** every code step contains complete code; every test step contains real assertions and an exact run command.
