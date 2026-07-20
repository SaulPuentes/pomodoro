import * as storage from './storage.mjs';
import * as report from './report.mjs';
import * as bg from './backgrounds.mjs';

const store = window.localStorage;
const $ = (id) => document.getElementById(id);

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

/* ---- Boot ---- */
applyBackground();
