import * as timer from './timer.mjs';
import * as storage from './storage.mjs';
import * as bg from './backgrounds.mjs';
import { playBeep } from './sound.mjs';
import * as report from './report.mjs';

const store = window.localStorage;
let settings = storage.loadSettings(store);
let active = storage.loadActive(store);
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
    storage.logFocus(store, {
      project: active.project,
      task: active.task,
      minutes: settings.workMin,
      now: new Date(),
    });
    window.pomodoro?.sessionEnded?.();
  }
  if (settings.soundEnabled) playBeep();
  render();
  renderReports();
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

/* ---- Reports ---- */
function fmtMins(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
}

function barRow(name, minutes, max) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  const label = document.createElement('span');
  label.className = 'bar-label';
  label.textContent = name;
  const track = document.createElement('span');
  track.className = 'bar-track';
  const fill = document.createElement('span');
  fill.className = 'bar-fill';
  fill.style.width = `${max > 0 ? (minutes / max) * 100 : 0}%`;
  track.appendChild(fill);
  const val = document.createElement('span');
  val.className = 'bar-val';
  val.textContent = fmtMins(minutes);
  row.append(label, track, val);
  return row;
}

function renderThisWeek() {
  const el = $('thisWeek');
  el.innerHTML = '';
  const data = report.thisWeek(storage.loadTimelog(store), new Date());
  if (data.total === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No focus time yet this week.';
    el.appendChild(p);
    return;
  }
  const total = document.createElement('p');
  total.className = 'report-total';
  total.textContent = `Total  ${fmtMins(data.total)}`;
  el.appendChild(total);
  const max = Math.max(...data.projects.map((p) => p.minutes));
  for (const p of data.projects) el.appendChild(barRow(p.name, p.minutes, max));
}

function weekRow(weekKey, log) {
  const wk = report.weekOf(log, weekKey);
  const li = document.createElement('li');
  li.className = 'week';

  const head = document.createElement('button');
  head.className = 'week-head';
  head.setAttribute('aria-expanded', 'false');
  const lbl = document.createElement('span');
  lbl.textContent = report.weekLabel(weekKey);
  const tot = document.createElement('span');
  tot.className = 'week-total';
  tot.textContent = fmtMins(wk.total);
  head.append(lbl, tot);

  const body = document.createElement('div');
  body.className = 'week-body';
  body.hidden = true;
  for (const p of wk.projects) {
    const pr = document.createElement('div');
    pr.className = 'wb-project';
    const pn = document.createElement('span');
    pn.textContent = p.name;
    const pm = document.createElement('span');
    pm.textContent = fmtMins(p.minutes);
    pr.append(pn, pm);
    body.appendChild(pr);
    for (const t of p.tasks) {
      const tr = document.createElement('div');
      tr.className = 'wb-task';
      const tn = document.createElement('span');
      tn.textContent = `· ${t.name || '(untitled)'}`;
      const tm = document.createElement('span');
      tm.textContent = fmtMins(t.minutes);
      tr.append(tn, tm);
      body.appendChild(tr);
    }
  }

  head.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
  });
  li.append(head, body);
  return li;
}

function renderWeekList() {
  const list = $('weekList');
  list.innerHTML = '';
  const log = storage.loadTimelog(store);
  const current = report.isoWeekKey(new Date());
  const keys = report.weeks(log).filter((k) => k !== current);
  if (keys.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No earlier weeks yet.';
    list.appendChild(li);
    return;
  }
  for (const key of keys) list.appendChild(weekRow(key, log));
}

function renderReports() {
  renderThisWeek();
  renderWeekList();
}

/* ---- Drawers ---- */
let openDrawer = null;
function showDrawer(name) {
  closeDrawer();
  const el = $(`drawer-${name}`);
  if (!el) return;
  if (name === 'reports') renderReports();
  if (name === 'projects') renderProjectList();
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

/* ---- Project + task ---- */
function renderProjects() {
  const sel = $('project');
  const names = storage.loadProjects(store);
  if (active.project && !names.includes(active.project)) names.unshift(active.project);
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No project';
  sel.appendChild(none);
  for (const name of names) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  }
  const add = document.createElement('option');
  add.value = '__new__';
  add.textContent = '＋ New project…';
  sel.appendChild(add);
  sel.value = active.project || '';
}

function setActiveProject(name) {
  active = { ...active, project: name };
  storage.saveActive(store, active);
}

function refreshProjectsUI() {
  renderProjects();     // the <select>
  renderProjectList();  // the drawer list
  renderReports();      // names may have changed
}

function startRename(li, oldName) {
  let done = false;
  const input = document.createElement('input');
  input.className = 'proj-edit';
  input.type = 'text';
  input.maxLength = 40;
  input.value = oldName;
  const finish = (save) => {
    if (done) return;
    done = true;
    input.removeEventListener('blur', onBlur);
    if (save) {
      const next = input.value.trim();
      if (next && next !== oldName && next !== '__new__' && next !== 'No project') {
        storage.renameProject(store, oldName, next);
        if (active.project === oldName) setActiveProject(next);
      }
    }
    refreshProjectsUI();
  };
  const onBlur = () => finish(true);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.stopPropagation(); // keep Escape from bubbling to the drawer-closing handler
    finish(e.key === 'Enter');
  });
  input.addEventListener('blur', onBlur);
  li.replaceChildren(input);
  input.focus();
  input.select();
}

function projectRow(name) {
  const li = document.createElement('li');
  li.className = 'proj-row';

  const label = document.createElement('span');
  label.className = 'proj-name';
  label.textContent = name;

  const rename = document.createElement('button');
  rename.className = 'proj-act';
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => startRename(li, name));

  const del = document.createElement('button');
  del.className = 'proj-act';
  del.textContent = 'Delete';
  del.addEventListener('click', () => {
    storage.deleteProject(store, name);
    if (active.project === name) setActiveProject('');
    refreshProjectsUI();
  });

  li.append(label, rename, del);
  return li;
}

function renderProjectList() {
  const list = $('projectList');
  list.innerHTML = '';
  const names = storage.loadProjects(store);
  if (names.length === 0) {
    const li = document.createElement('li');
    li.className = 'proj-empty';
    li.textContent = 'No projects yet. Add one above.';
    list.appendChild(li);
    return;
  }
  for (const name of names) list.appendChild(projectRow(name));
}

function addProjectFromInput() {
  const input = $('newProject');
  const name = input.value.trim();
  if (name && name !== '__new__' && name !== 'No project') {
    storage.addProject(store, name);
    setActiveProject(name);
  }
  input.value = '';
  refreshProjectsUI();
}

$('addProject').addEventListener('click', addProjectFromInput);
$('newProject').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProjectFromInput();
});

$('project').addEventListener('change', () => {
  const sel = $('project');
  if (sel.value === '__new__') {
    renderProjects();        // restore the real selection; '__new__' is just a trigger
    showDrawer('projects');
    return;
  }
  active = { ...active, project: sel.value };
  storage.saveActive(store, active);
});

$('goal').value = active.task;
$('goal').addEventListener('input', () => {
  active = { ...active, task: $('goal').value };
  storage.saveActive(store, active);
});

/* ---- Boot ---- */
applyBackground(currentBg, { persist: false });
buildFilmstrip();
loadSettingsUI();
renderProjects();
renderReports();
render();
