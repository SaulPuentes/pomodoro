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
function tile(value, label) {
  const el = document.createElement('div');
  el.className = 'tile';
  const v = document.createElement('span');
  v.className = 'tile-value';
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'tile-label';
  l.textContent = label;
  el.append(v, l);
  return el;
}

function renderTiles(rep) {
  const el = $('tiles');
  el.innerHTML = '';
  const calendarDays = report.eachDayKey(state.fromKey, state.toKey).length || 1;
  const avg = Math.round(rep.total / calendarDays);
  const daySet = new Set(rep.days.map((d) => d.date));
  const todayKey = storage.todayKey();
  const streakEnd = state.toKey < todayKey ? state.toKey : todayKey;
  const streak = report.streakEndingAt(daySet, streakEnd);
  const best = rep.bestDay
    ? `${fmtDur(rep.bestDay.minutes)}`
    : '—';
  const bestSub = rep.bestDay ? dayLabel(rep.bestDay.date) : 'best day';
  el.append(
    tile(fmtDur(rep.total), 'total focus'),
    tile(fmtDur(avg), 'daily avg'),
    tile(`${streak}d`, 'current streak'),
    tile(best, bestSub),
  );
}
const DAILY_MAX = 45; // beyond this many days, switch to weekly buckets

function renderTrend(rep) {
  const el = $('trend');
  el.innerHTML = '';
  const dayMap = Object.fromEntries(rep.days.map((d) => [d.date, d.minutes]));
  const keys = report.eachDayKey(state.fromKey, state.toKey);
  if (keys.length === 0 || rep.total === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No focus time in this range.';
    el.appendChild(p);
    return;
  }
  const bars = keys.length > DAILY_MAX
    ? report.toWeekly(keys.map((k) => ({ key: k, minutes: dayMap[k] || 0 })))
    : keys.map((k) => ({ label: dayLabel(k), minutes: dayMap[k] || 0 }));
  const max = Math.max(...bars.map((b) => b.minutes), 1);
  const chart = document.createElement('div');
  chart.className = 'trend-bars';
  for (const b of bars) {
    const col = document.createElement('div');
    col.className = 'trend-col';
    col.title = `${b.label}: ${fmtDur(b.minutes)}`;
    const fill = document.createElement('span');
    fill.className = 'trend-fill';
    fill.style.height = `${(b.minutes / max) * 100}%`;
    col.appendChild(fill);
    chart.appendChild(col);
  }
  el.appendChild(chart);
}
function renderSplit(rep) {
  const el = $('split');
  el.innerHTML = '';
  // Cap at PALETTE length so hues never cycle (dataviz non-negotiable):
  // top 7 projects by time + an aggregated "Other" for the rest.
  const MAX_SLICES = report.PALETTE.length; // 8
  const slices = rep.projects.length > MAX_SLICES
    ? [...rep.projects.slice(0, MAX_SLICES - 1),
       { name: 'Other', minutes: rep.projects.slice(MAX_SLICES - 1).reduce((s, p) => s + p.minutes, 0) }]
    : rep.projects;
  const gradient = report.donutGradient(slices, report.PALETTE);
  if (!gradient) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No focus time in this range.';
    el.appendChild(p);
    return;
  }
  const donut = document.createElement('div');
  donut.className = 'donut';
  donut.style.background = gradient;

  const legend = document.createElement('ul');
  legend.className = 'legend';
  slices.forEach((p, i) => {
    const pct = Math.round((p.minutes / rep.total) * 100);
    const li = document.createElement('li');
    li.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = report.PALETTE[i % report.PALETTE.length];
    const name = document.createElement('span');
    name.className = 'legend-name';
    name.textContent = p.name;
    const val = document.createElement('span');
    val.className = 'legend-val';
    val.textContent = `${pct}% · ${fmtDur(p.minutes)}`;
    li.append(dot, name, val);
    legend.appendChild(li);
  });

  el.append(donut, legend);
}
function renderTotals(rep) {
  const el = $('totals');
  el.innerHTML = '';
  if (rep.projects.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No projects logged in this range.';
    el.appendChild(p);
    return;
  }
  const max = Math.max(...rep.projects.map((p) => p.minutes), 1);
  for (const proj of rep.projects) {
    const row = document.createElement('div');
    row.className = 'total-row';

    const head = document.createElement('button');
    head.className = 'total-head';
    head.setAttribute('aria-expanded', 'false');
    const label = document.createElement('span');
    label.className = 'total-name';
    label.textContent = proj.name;
    const track = document.createElement('span');
    track.className = 'total-track';
    const fill = document.createElement('span');
    fill.className = 'total-fill';
    fill.style.width = `${(proj.minutes / max) * 100}%`;
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'total-val';
    val.textContent = fmtDur(proj.minutes);
    head.append(label, track, val);

    const body = document.createElement('div');
    body.className = 'total-tasks';
    body.hidden = true;
    for (const t of proj.tasks) {
      const tr = document.createElement('div');
      tr.className = 'total-task';
      const tn = document.createElement('span');
      tn.textContent = `· ${t.name || '(untitled)'}`;
      const tm = document.createElement('span');
      tm.textContent = fmtDur(t.minutes);
      tr.append(tn, tm);
      body.appendChild(tr);
    }

    head.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
    });
    row.append(head, body);
    el.appendChild(row);
  }
}

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
