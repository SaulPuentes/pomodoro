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
