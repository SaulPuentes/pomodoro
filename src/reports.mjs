import * as storage from './storage.mjs';
import * as report from './report.mjs';
import * as bg from './backgrounds.mjs';

const store = window.localStorage;
const $ = (id) => document.getElementById(id);

/* ---- Formatting ---- */
function fmtDur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---- Background (mirror the timer window's current view) ---- */
function applyBackground() {
  const cur = storage.loadBackground(store) || bg.defaultBackground();
  const el = $('bg');
  const img = new Image();
  const reveal = () => {
    el.style.backgroundImage = `url("${cur.url}")`;
    requestAnimationFrame(() => el.classList.add('show'));
  };
  img.onload = reveal;
  img.onerror = reveal;
  img.src = cur.url;
}

/* ---- Range state ---- */
let state = { preset: '30d', fromKey: null, toKey: null };

function earliestKey(log) {
  const keys = Object.keys(log).sort();
  return keys[0] || storage.todayKey();
}

function applyPreset(preset, log) {
  state.preset = preset;
  const { fromKey, toKey } = report.presetRange(preset, new Date(), earliestKey(log));
  state.fromKey = fromKey;
  state.toKey = toKey;
}

function syncControls() {
  $('fromDate').value = state.fromKey;
  $('toDate').value = state.toKey;
  document.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('is-on', c.dataset.preset === state.preset);
  });
  $('rangeSpan').textContent =
    `${dayLabel(state.fromKey)} – ${dayLabel(state.toKey)} · up to 180 days kept`;
}

/* ---- Render ---- */
function render() {
  const log = storage.loadTimelog(store);
  if (!state.fromKey) applyPreset(state.preset, log);
  syncControls();
  const rep = report.rangeReport(log, state.fromKey, state.toKey);
  renderTiles(rep);
  renderTrend(rep);
  renderSplit(rep);
  renderTotals(rep);
}

/* ---- Panels (filled in later tasks) ---- */
function renderTiles(rep) {}
function renderTrend(rep) {}
function renderSplit(rep) {}
function renderTotals(rep) {}

/* ---- Events ---- */
$('chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  applyPreset(btn.dataset.preset, storage.loadTimelog(store));
  render();
});

function onDateChange() {
  const from = $('fromDate').value;
  const to = $('toDate').value;
  if (!from || !to) return;
  state.preset = '';                       // custom range: no active chip
  state.fromKey = from <= to ? from : to;  // tolerate reversed input
  state.toKey = from <= to ? to : from;
  render();
}
$('fromDate').addEventListener('change', onDateChange);
$('toDate').addEventListener('change', onDateChange);

// Live refresh: the timer window's logFocus write fires a storage event here;
// window focus is a belt-and-suspenders fallback.
window.addEventListener('storage', render);
window.addEventListener('focus', render);

/* ---- Boot ---- */
applyBackground();
render();
