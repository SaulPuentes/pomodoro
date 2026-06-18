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
