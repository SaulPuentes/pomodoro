import * as timer from './timer.mjs';
import * as storage from './storage.mjs';
import * as bg from './backgrounds.mjs';
import { playBeep } from './sound.mjs';

const store = window.localStorage;
let settings = storage.loadSettings(store);
let state = timer.initState(settings);
let currentBg = storage.loadBackground(store) || bg.defaultBackground();
let tickHandle = null;

const $ = (id) => document.getElementById(id);
const PHASE_LABEL = { work: 'in focus', short: 'short break', long: 'long break' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ---- Background ---- */
function applyBackground(next, { persist = true } = {}) {
  currentBg = next;
  if (persist) storage.saveBackground(store, next);
  const el = $('bg');
  const img = new Image();
  const reveal = () => {
    el.style.backgroundImage = `url("${next.url}")`;
    requestAnimationFrame(() => el.classList.add('show'));
  };
  img.onload = reveal;
  img.onerror = reveal; // reveal anyway; broken art beats a black void
  img.src = next.url;
  renderCredit();
  markActiveThumb();
}

function renderCredit() {
  const el = $('bgCredit');
  el.textContent = `${currentBg.name} · `;
  const a = document.createElement('a');
  a.textContent = currentBg.credit;
  a.href = currentBg.creditUrl;
  a.target = '_blank';
  a.rel = 'noreferrer';
  el.appendChild(a);
}

function buildFilmstrip() {
  const strip = $('filmstrip');
  strip.innerHTML = '';
  for (const view of bg.VIEWS) {
    const t = document.createElement('button');
    t.className = 'thumb';
    t.dataset.id = view.id;
    t.setAttribute('aria-label', view.name);
    t.title = view.name;
    t.style.backgroundImage = `url("${bg.thumbUrl(view.id)}")`;
    t.addEventListener('click', () => applyBackground(bg.curatedBackground(view)));
    strip.appendChild(t);
  }
  markActiveThumb();
}

function markActiveThumb() {
  document.querySelectorAll('.thumb').forEach((t) => {
    t.classList.toggle('active', t.dataset.id === currentBg.id);
  });
}

/* ---- Timer rendering ---- */
function renderDots() {
  const dots = $('dots');
  dots.innerHTML = '';
  for (let i = 0; i < timer.LONG_BREAK_EVERY; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < state.completedWork ? ' filled' : '');
    dots.appendChild(d);
  }
}

function renderProgress(now) {
  const dur = timer.durationMsFor(state.phase, settings);
  const rem = timer.remainingAt(state, now);
  const p = dur > 0 ? Math.min(1, Math.max(0, (dur - rem) / dur)) : 0;
  const fill = $('horizonFill');
  fill.style.width = `${(p * 100).toFixed(2)}%`;
  fill.style.opacity = p > 0.0005 ? '1' : '0';
}

function render() {
  const now = Date.now();
  $('time').textContent = fmt(timer.remainingAt(state, now));
  $('phase').textContent = PHASE_LABEL[state.phase];
  document.documentElement.dataset.phase = state.phase === 'work' ? 'focus' : 'break';
  $('count').textContent = String(storage.getCount(store, storage.todayKey()));
  $('startPause').textContent = state.running ? 'Pause' : 'Start';
  renderDots();
  renderProgress(now);
}

function startTick() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    if (timer.remainingAt(state, Date.now()) <= 0) onComplete();
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
    window.pomodoro?.sessionEnded?.();
  }
  if (settings.soundEnabled) playBeep();
  render();
  renderHistory();
}

/* ---- Controls ---- */
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

/* ---- Settings ---- */
function clampInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function loadSettingsUI() {
  $('workMin').value = settings.workMin;
  $('shortMin').value = settings.shortMin;
  $('longMin').value = settings.longMin;
  $('soundEnabled').checked = settings.soundEnabled;
  $('unsplashKey').value = storage.loadUnsplashKey(store);
  refreshFetchButton();
}

function onSettingsChange() {
  settings = {
    workMin: clampInt($('workMin').value, settings.workMin),
    shortMin: clampInt($('shortMin').value, settings.shortMin),
    longMin: clampInt($('longMin').value, settings.longMin),
    soundEnabled: $('soundEnabled').checked,
  };
  storage.saveSettings(store, settings);
  loadSettingsUI();
  if (!state.running) {
    state = { ...state, remainingMs: timer.durationMsFor(state.phase, settings) };
  }
  render();
}

['workMin', 'shortMin', 'longMin', 'soundEnabled'].forEach((id) => {
  $(id).addEventListener('change', onSettingsChange);
});

$('unsplashKey').addEventListener('change', () => {
  storage.saveUnsplashKey(store, $('unsplashKey').value.trim());
  refreshFetchButton();
});

function refreshFetchButton() {
  const hasKey = storage.loadUnsplashKey(store).length > 0;
  $('fetchUnsplash').hidden = !hasKey;
}

/* ---- Views: shuffle + live Unsplash ---- */
$('shuffle').addEventListener('click', () => {
  const pool = bg.VIEWS.filter((v) => v.id !== currentBg.id);
  const pick = pool[Math.floor(Math.random() * pool.length)] || bg.VIEWS[0];
  applyBackground(bg.curatedBackground(pick));
});

$('fetchUnsplash').addEventListener('click', async () => {
  const btn = $('fetchUnsplash');
  const key = storage.loadUnsplashKey(store);
  if (!key) return;
  btn.disabled = true;
  btn.textContent = 'Fetching…';
  try {
    const next = await bg.fetchRandomNature(key);
    applyBackground(next);
  } catch (err) {
    $('bgCredit').textContent = err.message || 'Could not reach Unsplash.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'New from Unsplash';
  }
});

/* ---- History ---- */
function renderHistory() {
  const history = storage.loadHistory(store);
  const list = $('history');
  list.innerHTML = '';
  const dates = Object.keys(history).sort().reverse();
  if (dates.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No sessions yet. Start your first focus block.';
    list.appendChild(li);
    return;
  }
  for (const date of dates) {
    const li = document.createElement('li');
    const d = document.createElement('span');
    d.textContent = date;
    const c = document.createElement('span');
    c.className = 'h-count';
    c.textContent = history[date];
    li.append(d, c);
    list.appendChild(li);
  }
}

/* ---- Drawers ---- */
let openDrawer = null;
function showDrawer(name) {
  closeDrawer();
  const el = $(`drawer-${name}`);
  if (!el) return;
  el.hidden = false;
  $('backdrop').hidden = false;
  openDrawer = el;
}
function closeDrawer() {
  if (openDrawer) openDrawer.hidden = true;
  $('backdrop').hidden = true;
  openDrawer = null;
}

document.querySelectorAll('[data-drawer]').forEach((b) => {
  b.addEventListener('click', () => showDrawer(b.dataset.drawer));
});
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', closeDrawer);
});
$('backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

/* ---- Boot ---- */
applyBackground(currentBg, { persist: false });
buildFilmstrip();
loadSettingsUI();
renderHistory();
render();
