const SETTINGS_KEY = 'pomodoro.settings';
const HISTORY_KEY = 'pomodoro.history';
const BACKGROUND_KEY = 'pomodoro.background';
const UNSPLASH_KEY = 'pomodoro.unsplashKey';
const GOAL_KEY = 'pomodoro.goal';
const PROJECTS_KEY = 'pomodoro.projects';
const ACTIVE_KEY = 'pomodoro.active';
const TIMELOG_KEY = 'pomodoro.timelog';
const MAX_DAYS = 30;
const TIMELOG_MAX_DAYS = 180;

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

function trimDays(obj, maxDays) {
  const keys = Object.keys(obj).sort(); // YYYY-MM-DD sorts chronologically
  if (keys.length <= maxDays) return obj;
  const out = {};
  for (const k of keys.slice(keys.length - maxDays)) out[k] = obj[k];
  return out;
}

export function getCount(store, key) {
  return loadHistory(store)[key] || 0;
}

export function loadBackground(store) {
  return readJSON(store, BACKGROUND_KEY, null);
}

export function saveBackground(store, bg) {
  store.setItem(BACKGROUND_KEY, JSON.stringify(bg));
}

export function loadUnsplashKey(store) {
  const raw = store.getItem(UNSPLASH_KEY);
  return typeof raw === 'string' ? raw : '';
}

export function saveUnsplashKey(store, key) {
  store.setItem(UNSPLASH_KEY, key || '');
}

export function loadGoal(store) {
  const raw = store.getItem(GOAL_KEY);
  return typeof raw === 'string' ? raw : '';
}


export function incrementToday(store, now = new Date()) {
  const key = todayKey(now);
  const history = loadHistory(store);
  history[key] = (history[key] || 0) + 1;
  const trimmed = trimDays(history, MAX_DAYS);
  store.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed[key];
}

export function loadProjects(store) {
  const raw = readJSON(store, PROJECTS_KEY, null);
  return Array.isArray(raw) ? raw : [];
}

export function saveProjects(store, list) {
  store.setItem(PROJECTS_KEY, JSON.stringify(list));
}

export function addProject(store, name) {
  const n = (name || '').trim();
  const list = loadProjects(store);
  if (n && !list.includes(n)) {
    list.push(n);
    saveProjects(store, list);
  }
  return list;
}

export function loadActive(store) {
  const a = readJSON(store, ACTIVE_KEY, null);
  if (a && typeof a === 'object') {
    return { project: a.project || '', task: a.task || '' };
  }
  return { project: '', task: loadGoal(store) || '' }; // migrate legacy goal
}

export function saveActive(store, active) {
  store.setItem(ACTIVE_KEY, JSON.stringify({
    project: active.project || '',
    task: active.task || '',
  }));
}

export function loadTimelog(store) {
  return readJSON(store, TIMELOG_KEY, {});
}

export function logFocus(store, { project, task, minutes, now = new Date() }) {
  const key = todayKey(now);
  const proj = (project || '').trim() || 'No project';
  const t = (task || '').trim();
  const log = loadTimelog(store);
  const day = log[key] || (log[key] = {});
  const byTask = day[proj] || (day[proj] = {});
  byTask[t] = (byTask[t] || 0) + minutes;
  const trimmed = trimDays(log, TIMELOG_MAX_DAYS);
  store.setItem(TIMELOG_KEY, JSON.stringify(trimmed));
  return trimmed;
}
