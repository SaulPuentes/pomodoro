const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a 'YYYY-MM-DD' key as local midnight (matches storage.todayKey).
function parseDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
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

export function weeks(timelog) {
  const set = new Set();
  for (const key of Object.keys(timelog)) set.add(isoWeekKey(parseDate(key)));
  return [...set].sort().reverse(); // 'YYYY-Www' sorts chronologically
}

export function weekOf(timelog, weekKey) {
  const acc = {}; // name -> { minutes, tasks: { task: minutes } }
  for (const [date, byProject] of Object.entries(timelog)) {
    if (isoWeekKey(parseDate(date)) !== weekKey) continue;
    for (const [proj, byTask] of Object.entries(byProject)) {
      const p = acc[proj] || (acc[proj] = { minutes: 0, tasks: {} });
      for (const [task, mins] of Object.entries(byTask)) {
        p.minutes += mins;
        p.tasks[task] = (p.tasks[task] || 0) + mins;
      }
    }
  }
  const projects = Object.entries(acc)
    .map(([name, p]) => ({
      name,
      minutes: p.minutes,
      tasks: Object.entries(p.tasks)
        .map(([tn, tm]) => ({ name: tn, minutes: tm }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const total = projects.reduce((s, p) => s + p.minutes, 0);
  return { total, projects };
}

export function thisWeek(timelog, now = new Date()) {
  const wk = weekOf(timelog, isoWeekKey(now));
  return {
    total: wk.total,
    projects: wk.projects.map(({ name, minutes }) => ({ name, minutes })),
  };
}
