import * as timer from './timer.mjs';
import * as storage from './storage.mjs';
import * as bg from './backgrounds.mjs';
import { playBeep } from './sound.mjs';
import * as session from './session.mjs';
import * as report from './report.mjs';

const store = window.localStorage;
let settings = storage.loadSettings(store);
let active = storage.loadActive(store);
let state = timer.initState(settings);
let currentBg = storage.loadBackground(store) || bg.defaultBackground();
let tickHandle = null;

let sess = session.beginSession(timer.durationMsFor(timer.PHASES.WORK, settings));

function beginWorkSession() {
  sess = session.beginSession(timer.durationMsFor(timer.PHASES.WORK, settings));
}

const $ = (id) => document.getElementById(id);
const PHASE_LABEL = { work: 'in focus', short: 'short break', long: 'long break' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtDur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
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
  const finished = wasWork
    ? session.closeSession(sess, {
        project: active.project,
        task: active.task,
        totalMin: settings.workMin,
      })
    : [];
  state = timer.complete(state, settings);
  if (wasWork) {
    storage.incrementToday(store, new Date());
    for (const seg of finished) {
      storage.logFocus(store, {
        project: seg.project,
        task: seg.task,
        minutes: seg.minutes,
        now: new Date(),
      });
    }
    window.pomodoro?.sessionEnded?.();
  }
  beginWorkSession();
  if (settings.soundEnabled) playBeep();
  if (!$('drawer-reports').hidden) renderReportsDrawer();
  render();
}

/* ---- Daily reset (fresh cycles at 5am) ---- */
let lastResetDay = storage.resetDayKey();

function maybeDailyReset() {
  const day = storage.resetDayKey();
  if (day === lastResetDay) return;
  lastResetDay = day;
  if (!settings.dailyResetEnabled) return;
  if (state.running) {
    // ponytail: mid-session at 5am — keep the running timer, just drop cycle progress
    state = { ...state, completedWork: 0 };
  } else {
    state = timer.reset(state, settings);
    beginWorkSession();
  }
  render();
}
setInterval(maybeDailyReset, 60000);

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
  beginWorkSession();
  render();
});

$('skip').addEventListener('click', () => {
  stopTick();
  state = timer.skip(state, settings);
  beginWorkSession();
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
  $('dailyResetEnabled').checked = settings.dailyResetEnabled;
  $('unsplashKey').value = storage.loadUnsplashKey(store);
  markActiveSwatch();
  refreshFetchButton();
}

function applyAccent() {
  document.documentElement.style.setProperty('--sun', settings.accentColor);
}

function onSettingsChange() {
  settings = {
    workMin: clampInt($('workMin').value, settings.workMin),
    shortMin: clampInt($('shortMin').value, settings.shortMin),
    longMin: clampInt($('longMin').value, settings.longMin),
    soundEnabled: $('soundEnabled').checked,
    dailyResetEnabled: $('dailyResetEnabled').checked,
    accentColor: settings.accentColor,
  };
  storage.saveSettings(store, settings);
  applyAccent();
  loadSettingsUI();
  if (!state.running) {
    state = { ...state, remainingMs: timer.durationMsFor(state.phase, settings) };
    beginWorkSession();
  }
  render();
}

['workMin', 'shortMin', 'longMin', 'soundEnabled', 'dailyResetEnabled'].forEach((id) => {
  $(id).addEventListener('change', onSettingsChange);
});

// Focus-highlight presets: the report palette is already CVD-checked on this
// surface and slot 0 is DEFAULT_ACCENT, so it doubles as the reset swatch.
function buildSwatches() {
  const row = $('accentSwatches');
  for (const hex of report.PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = hex;
    b.style.background = hex;
    b.setAttribute('aria-label', `Focus highlight ${hex}`);
    b.title = hex;
    b.addEventListener('click', () => {
      settings = { ...settings, accentColor: hex };
      onSettingsChange();
    });
    row.appendChild(b);
  }
}

function markActiveSwatch() {
  document.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.color === settings.accentColor);
  });
}

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

/* ---- Reports drawer (last 7 days glance) ---- */
function drawerTile(value, label) {
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

function renderReportsDrawer() {
  const log = storage.loadTimelog(store);
  const { fromKey, toKey } = report.presetRange('7d', new Date());
  const rep = report.rangeReport(log, fromKey, toKey);

  const tiles = $('drawerTiles');
  tiles.innerHTML = '';
  tiles.append(
    drawerTile(fmtDur(rep.total), 'this week'),
    // fixed /7: the drawer always reports the 7d window (presetRange('7d'))
    drawerTile(fmtDur(Math.round(rep.total / 7)), 'daily avg'),
  );

  const head = $('drawerProjHead');
  head.hidden = rep.projects.length === 0;
  $('drawerProjCount').textContent = String(rep.projects.length);

  const totals = $('drawerTotals');
  totals.innerHTML = '';
  if (rep.projects.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No focus time this week.';
    totals.appendChild(p);
    return;
  }
  const max = Math.max(...rep.projects.map((p) => p.minutes), 1);
  for (const proj of rep.projects) {
    const row = document.createElement('div');
    row.className = 'total-row';
    const head = document.createElement('div');
    head.className = 'total-head total-head--static';
    const name = document.createElement('span');
    name.className = 'total-name';
    name.textContent = proj.name;
    const track = document.createElement('span');
    track.className = 'total-track';
    const fill = document.createElement('span');
    fill.className = 'total-fill';
    fill.style.width = `${(proj.minutes / max) * 100}%`;
    track.appendChild(fill);
    const val = document.createElement('span');
    val.className = 'total-val';
    const pct = Math.round((proj.minutes / rep.total) * 100);
    val.textContent = `${pct}% · ${fmtDur(proj.minutes)}`;
    head.append(name, track, val);
    row.appendChild(head);
    totals.appendChild(row);
  }
}

/* ---- Drawers ---- */
let openDrawer = null;
function showDrawer(name) {
  closeDrawer();
  const el = $(`drawer-${name}`);
  if (!el) return;
  if (name === 'projects') renderProjectList();
  if (name === 'reports') renderReportsDrawer();
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
$('openReports').addEventListener('click', () => {
  window.pomodoro?.openReports?.();
  closeDrawer();
});
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', closeDrawer);
});
$('backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

/* ---- Fullscreen (immersive focus) ---- */
const AWAKE_MS = 3000;
let awakeTimer = null;

function wake() {
  document.documentElement.classList.add('awake');
  clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => document.documentElement.classList.remove('awake'), AWAKE_MS);
}

$('fullscreenBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  document.documentElement.classList.toggle('fs', fs);
  if (fs) {
    wake(); // show chrome on entry so its fade-out tells you where it went
  } else {
    clearTimeout(awakeTimer);
    document.documentElement.classList.remove('awake');
  }
});

document.addEventListener('mousemove', () => {
  if (document.fullscreenElement) wake();
});

/* ---- Project + task ---- */
function renderProjects() {
  const sel = $('project');
  const names = storage.loadProjects(store);
  if (active.project && !names.includes(active.project)) names.unshift(active.project);
  if (!active.project && names.length) setActiveProject(names[0]); // force a project whenever any exist
  sel.innerHTML = '';
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
  sel.value = active.project || '__new__';
}

function setActiveProject(name) {
  // Close the current segment before the project changes; only the work
  // phase tracks segments. Paused time never counts: remaining is frozen.
  if (state.phase === timer.PHASES.WORK) {
    sess = session.switchSegment(sess, {
      project: active.project,
      task: active.task,
      remainingMs: timer.remainingAt(state, Date.now()),
    });
  }
  active = { ...active, project: name };
  storage.saveActive(store, active);
}

function refreshProjectsUI() {
  renderProjects();     // the <select>
  renderProjectList();  // the drawer list
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
        if (active.project === oldName) {
          active = { ...active, project: next };
          storage.saveActive(store, active);
        }
        // keep pending segments consistent with the new name
        sess = {
          ...sess,
          segments: sess.segments.map((s) => (s.project === oldName ? { ...s, project: next } : s)),
        };
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
  setActiveProject(sel.value);
});

$('goal').value = active.task;
$('goal').addEventListener('input', () => {
  active = { ...active, task: $('goal').value };
  storage.saveActive(store, active);
});

/* ---- Boot ---- */
applyAccent();
applyBackground(currentBg, { persist: false });
buildFilmstrip();
buildSwatches();
loadSettingsUI();
renderProjects();
render();
