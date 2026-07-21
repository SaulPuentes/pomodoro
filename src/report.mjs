const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a 'YYYY-MM-DD' key as local midnight (matches storage.todayKey).
function parseDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ISO-8601 week: weeks start Monday; week-year is defined by the Thursday.
function isoParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const isoDay = d.getUTCDay() || 7;            // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);    // shift to this week's Thursday
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  // +1 turns the 0-based day offset from Jan 1 into a 1-based day-of-year before dividing into weeks.
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year, week };
}

export function isoWeekKey(date) {
  const { year, week } = isoParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Monday (UTC) of a given ISO year+week.
function mondayOf(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setUTCDate(mondayW1.getUTCDate() + (week - 1) * 7);
  return monday;
}

export function weekLabel(weekKey) {
  const [y, w] = weekKey.split('-W').map(Number);
  const mon = mondayOf(y, w);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const start = `${MONTHS[mon.getUTCMonth()]} ${mon.getUTCDate()}`;
  const end = mon.getUTCMonth() === sun.getUTCMonth()
    ? `${sun.getUTCDate()}`
    : `${MONTHS[sun.getUTCMonth()]} ${sun.getUTCDate()}`;
  return `${start} – ${end}`;
}

export function rangeReport(log, fromKey, toKey) {
  const acc = {};      // proj -> { minutes, tasks: {task: min}, dayMin: {date: min} }
  const dayMin = {};   // dateKey -> minutes
  for (const [date, byProject] of Object.entries(log)) {
    if (date < fromKey || date > toKey) continue;
    for (const [proj, byTask] of Object.entries(byProject)) {
      const p = acc[proj] || (acc[proj] = { minutes: 0, tasks: {}, dayMin: {} });
      for (const [task, mins] of Object.entries(byTask)) {
        p.minutes += mins;
        p.tasks[task] = (p.tasks[task] || 0) + mins;
        p.dayMin[date] = (p.dayMin[date] || 0) + mins;
        dayMin[date] = (dayMin[date] || 0) + mins;
      }
    }
  }
  const projects = Object.entries(acc)
    .map(([name, p]) => {
      const pDays = Object.entries(p.dayMin);
      const activeDays = pDays.length;
      const bestDay = pDays.reduce(
        (best, [date, minutes]) =>
          (!best || minutes > best.minutes ? { date, minutes } : best),
        null);
      return {
        name,
        minutes: p.minutes,
        activeDays,
        avgActive: activeDays ? Math.round(p.minutes / activeDays) : 0,
        bestDay,
        tasks: Object.entries(p.tasks)
          .map(([tn, tm]) => ({ name: tn, minutes: tm }))
          .sort((a, b) => b.minutes - a.minutes),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const total = projects.reduce((s, p) => s + p.minutes, 0);
  const days = Object.entries(dayMin)
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const bestDay = days.reduce((best, d) => (!best || d.minutes > best.minutes ? d : best), null);
  return { total, days, projects, activeDays: days.length, bestDay };
}

export function streakEndingAt(daySet, endKey) {
  let n = 0;
  let d = parseDate(endKey);
  while (daySet.has(fmtKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

export function presetRange(preset, today = new Date(), earliestKey = null) {
  const toKey = fmtKey(today);
  if (preset === 'all') return { fromKey: earliestKey || toKey, toKey };
  const n = PRESET_DAYS[preset] || 30;
  const from = new Date(today);
  from.setDate(from.getDate() - (n - 1)); // inclusive window of n days
  return { fromKey: fmtKey(from), toKey };
}

export function eachDayKey(fromKey, toKey) {
  const out = [];
  const end = parseDate(toKey);
  let d = parseDate(fromKey);
  while (d <= end) {
    out.push(fmtKey(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return out;
}

// The equal-length window immediately before [fromKey, toKey].
export function previousRange(fromKey, toKey) {
  const len = eachDayKey(fromKey, toKey).length;
  const end = parseDate(fromKey);
  end.setDate(end.getDate() - 1);             // day before the current window
  const start = new Date(end);
  start.setDate(start.getDate() - (len - 1)); // inclusive window of len days
  return { fromKey: fmtKey(start), toKey: fmtKey(end) };
}

// Signed percent change, or null when prev is 0 (undefined change).
export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function toWeekly(daily) {
  const map = new Map(); // weekKey -> minutes
  for (const { key, minutes } of daily) {
    const wk = isoWeekKey(parseDate(key));
    map.set(wk, (map.get(wk) || 0) + minutes);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([wk, minutes]) => ({ label: weekLabel(wk), minutes }));
}

// Categorical palette for the project-split donut: "dusk botanical", anchored on
// --sun (slot 0) and --tide (slot 3). Slot ORDER is the CVD-safety mechanism —
// do NOT reorder or edit hexes. Validated via the dataviz skill on the dark glass
// surface: contrast all >=3:1; adjacent normal-vision ΔE >=15 (worst 15.5); worst
// deutan ΔE 7.2 sits in the 6-8 band, legal because the donut legend (name + %) is
// secondary encoding. The two fixed light anchors miss dataviz's lightness/chroma
// bands by design (brand colors). Re-run the validator before touching any hex.
export const PALETTE = [
  '#f0b454', // amber  (= --sun, anchor)
  '#9a7bd4', // iris
  '#d17a52', // clay
  '#79cfc8', // tide   (= --tide, anchor)
  '#c76aa6', // orchid
  '#5f96cf', // sky
  '#b6c24f', // moss
  '#4fa77a', // sage
];

export function donutGradient(projects, colors) {
  const total = projects.reduce((s, p) => s + p.minutes, 0);
  if (total === 0) return null;
  let acc = 0;
  const stops = projects.map((p, i) => {
    const start = (acc / total) * 360;
    acc += p.minutes;
    const end = (acc / total) * 360;
    const c = colors[i % colors.length];
    return `${c} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}
