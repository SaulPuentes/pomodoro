import * as storage from './storage.mjs';
import * as report from './report.mjs';
import * as bg from './backgrounds.mjs';

const store = window.localStorage;
const $ = (id) => document.getElementById(id);
const OTHER_COLOR = 'rgba(244, 247, 244, 0.28)'; // aggregate, not a category

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

const RETENTION_DAYS = storage.TIMELOG_MAX_DAYS;

// Oldest date the timelog still retains (today minus retention window).
function retentionFloorKey() {
  const d = new Date();
  d.setDate(d.getDate() - (RETENTION_DAYS - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampKey(k) {
  const lo = retentionFloorKey();
  const hi = storage.todayKey();
  return k < lo ? lo : (k > hi ? hi : k);
}

/* ---- Range state ---- */
let state = { preset: '30d', fromKey: null, toKey: null };
const expandedProjects = new Set();

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
  const floor = retentionFloorKey();
  const today = storage.todayKey();
  $('fromDate').min = floor; $('fromDate').max = today;
  $('toDate').min = floor;   $('toDate').max = today;
  document.querySelectorAll('.chip').forEach((c) => {
    const on = c.dataset.preset === state.preset;
    c.classList.toggle('is-on', on);
    c.setAttribute('aria-pressed', String(on));
  });
  $('rangeSpan').textContent =
    `${dayLabel(state.fromKey)} – ${dayLabel(state.toKey)} · up to ${RETENTION_DAYS} days kept`;
}

/* ---- Render ---- */
function render() {
  const log = storage.loadTimelog(store);
  if (!state.fromKey) applyPreset(state.preset, log);
  syncControls();
  const rep = report.rangeReport(log, state.fromKey, state.toKey);
  renderTiles(rep, log);
  renderTrend(rep);
  renderSplit(rep);
  renderTotals(rep);
}

/* ---- Panels (filled in later tasks) ---- */
function tile(value, label, delta = null) {
  const el = document.createElement('div');
  el.className = 'tile';
  const v = document.createElement('span');
  v.className = 'tile-value';
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'tile-label';
  l.textContent = label;
  el.append(v, l);
  if (delta != null) {
    const dir = delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat';
    const glyph = delta > 0 ? '↑' : delta < 0 ? '↓' : '±';
    const d = document.createElement('span');
    d.className = `tile-delta ${dir}`;
    d.textContent = `${glyph} ${Math.abs(delta)}% vs prev`;
    el.append(d);
  }
  return el;
}

function renderTiles(rep, log) {
  const el = $('tiles');
  el.innerHTML = '';
  const calendarDays = report.eachDayKey(state.fromKey, state.toKey).length || 1;
  const avg = Math.round(rep.total / calendarDays);
  const best = rep.bestDay ? `${fmtDur(rep.bestDay.minutes)}` : '—';
  const bestSub = rep.bestDay ? dayLabel(rep.bestDay.date) : 'best day';

  // Period comparison: equal-length window immediately before this one.
  // Suppressed for the 'all' preset (no prior window) and when the prior
  // window is empty (nothing to compare against).
  let dTotal = null, dBest = null, dActive = null;
  if (state.preset !== 'all') {
    const prev = report.previousRange(state.fromKey, state.toKey);
    const prevRep = report.rangeReport(log, prev.fromKey, prev.toKey);
    if (prevRep.total > 0) {
      dTotal = report.pctChange(rep.total, prevRep.total);
      dBest = report.pctChange(rep.bestDay?.minutes || 0, prevRep.bestDay?.minutes || 0);
      dActive = report.pctChange(rep.activeDays, prevRep.activeDays);
    }
  }

  el.append(
    tile(fmtDur(rep.total), 'total focus', dTotal),
    tile(fmtDur(avg), 'daily avg'),
    tile(best, bestSub, dBest),
    tile(`${rep.activeDays}/${calendarDays}`, 'active days', dActive),
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
  // Top 7 real projects keep their palette hue; everything else folds into a
  // neutral-gray "Other" so an aggregate never masquerades as a category.
  const TOP = 7;
  const hasOther = rep.projects.length > TOP;
  const slices = hasOther
    ? [...rep.projects.slice(0, TOP),
       { name: 'Other', minutes: rep.projects.slice(TOP).reduce((s, p) => s + p.minutes, 0) }]
    : rep.projects;
  const colors = hasOther
    ? [...report.PALETTE.slice(0, TOP), OTHER_COLOR]
    : report.PALETTE;
  const gradient = report.donutGradient(slices, colors);
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
    dot.style.background = colors[i % colors.length];
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
  rep.projects.forEach((proj, i) => {
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
    const isOpen = expandedProjects.has(proj.name);
    body.hidden = !isOpen;
    head.setAttribute('aria-expanded', String(isOpen));
    head.setAttribute('aria-controls', `tasks-${i}`);
    body.id = `tasks-${i}`;

    const stats = document.createElement('p');
    stats.className = 'total-stats';
    const pct = rep.total ? Math.round((proj.minutes / rep.total) * 100) : 0;
    const parts = [
      `${pct}%`,
      `${proj.activeDays} active ${proj.activeDays === 1 ? 'day' : 'days'}`,
      `${fmtDur(proj.avgActive)}/active day`,
    ];
    if (proj.bestDay) parts.push(`best ${fmtDur(proj.bestDay.minutes)}`);
    stats.textContent = parts.join(' · ');
    body.appendChild(stats);

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
      if (open) expandedProjects.add(proj.name); else expandedProjects.delete(proj.name);
    });
    row.append(head, body);
    el.appendChild(row);
  });
}

/* ---- Events ---- */
$('chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  applyPreset(btn.dataset.preset, storage.loadTimelog(store));
  render();
});

function onDateChange() {
  let from = $('fromDate').value;
  let to = $('toDate').value;
  if (!from || !to) return;
  from = clampKey(from);
  to = clampKey(to);
  state.preset = '';
  state.fromKey = from <= to ? from : to;
  state.toKey = from <= to ? to : from;
  render();
}
$('fromDate').addEventListener('change', onDateChange);
$('toDate').addEventListener('change', onDateChange);

// Live refresh: the timer window's logFocus write fires a storage event here;
// window focus is a belt-and-suspenders fallback.
window.addEventListener('storage', (e) => {
  // e.key is null on a full clear(); react only to the data or background keys
  if (e.key === null || e.key === storage.TIMELOG_KEY) render();
  else if (e.key === storage.BACKGROUND_KEY) applyBackground();
});
window.addEventListener('focus', render);

/* ---- Boot ---- */
applyBackground();
render();
