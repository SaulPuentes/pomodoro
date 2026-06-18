# Pomodoro App — Design

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Summary

A cross-platform desktop Pomodoro timer built with Electron. It runs work/break
cycles, counts completed work sessions per day, keeps a daily history, lets the
user change the work and break durations, and — the defining requirement — pops
its window to the front when a work session ends, even if the window is
minimized or hidden.

## Goals

- Run the standard Pomodoro cycle: work, short break, work, … with a long break
  after every 4th work session.
- Count completed work sessions for the current day; reset automatically at
  midnight (local time).
- Keep a per-day history of completed counts (roughly the last 30 days).
- Allow the user to change the default durations: work (25 min), short break
  (5 min), long break (15 min).
- When a work session finishes, bring the app window to the front (restore,
  show, focus) even if minimized or hidden.
- Optional completion sound, toggleable, disabled by default.

## Non-Goals (YAGNI)

- No configurable cycle length — long break always comes after 4 work sessions.
- No accounts, sync, or cloud storage.
- No OS notification banner or window-flash alert (window pop + optional sound
  only).
- No fully automatic chaining of phases — every phase is started manually.

## Decisions

| Topic | Decision |
|-------|----------|
| Platform | Electron desktop app (cross-platform; full window control). |
| Framework | None. Vanilla JS/HTML/CSS to keep the codebase small. |
| Phase transitions | Manual. Each phase (work and break) waits for a user click to start. |
| History | Per-day log, roughly last 30 days. Today's count shown prominently. |
| Configurable settings | Durations only (work / short break / long break) + sound on/off. Cycle count fixed at 4. |
| Completion alert | Window pops to front (always) + sound (toggle, default off). |
| Persistence | `localStorage` in the renderer. No database. |

## Architecture

- **Main process (`main.js`)** — creates a single `BrowserWindow`, manages app
  lifecycle, and handles the "pop to front" action over IPC.
- **Preload (`preload.js`)** — exposes a minimal, safe IPC bridge to the
  renderer. `contextIsolation` enabled, `nodeIntegration` disabled.
- **Renderer (`src/`)** — owns the UI, the timer state machine, and persistence.

### Core logic — `timer.js` (pure module)

A pure state machine with no DOM or Electron dependencies, so it can be unit
tested directly.

- **Phases:** `idle → work → idle (break-ready) → break → idle → …`. Because
  transitions are manual, after a session ends the machine returns to an idle
  state that knows which phase comes next and waits for a start click.
- **Cycle:** track the number of completed work sessions. The repeating pattern
  is `W S W S W S W L` — a long break follows the 4th completed work session,
  then the cycle counter resets to 0.
- **Countdown:** timestamp-based. The machine stores a target end-time and
  computes remaining time from `Date.now()`, so the countdown stays accurate
  even if the renderer is throttled or the machine sleeps. Pausing stores the
  remaining milliseconds; resuming computes a fresh target end-time.

### Persistence — `storage.js`

Thin wrapper over `localStorage` with parse guards that fall back to defaults if
data is missing or corrupt.

```js
settings = { workMin: 25, shortMin: 5, longMin: 15, soundEnabled: false }
history  = { "2026-06-18": 3, "2026-06-17": 5, /* … */ }   // date → completed work count
```

- "Today" is derived from the current local date string. A new day produces a
  new key whose count starts at 0, so the midnight reset requires no scheduled
  job.
- History is trimmed to roughly the last 30 entries on write.

### Window-on-top — main process

When a **work** session ends, the renderer sends an IPC message
(`session-ended`). The main process then:

1. `win.restore()` if minimized,
2. `win.show()` if hidden,
3. `win.focus()`,
4. briefly `win.setAlwaysOnTop(true)` then `win.setAlwaysOnTop(false)` — pop the
   window above others without pinning it permanently.

After the window is fronted, the completion sound plays if `soundEnabled` is
true.

### Sound — `sound.js`

Plays a bundled audio file (`assets/chime.mp3`) on session completion, only when
`soundEnabled` is true. Default off.

## UI

- Large `mm:ss` countdown with a phase label: **Work** / **Short Break** /
  **Long Break**.
- Today's completed count, plus 4 progress dots showing how close the next long
  break is.
- Controls: **Start/Pause**, **Reset**, **Skip**.
- Settings panel: work / short break / long break minutes, and a sound on/off
  toggle.
- History view: list of the last ~30 days with their counts.

## Error Handling

- `localStorage` reads are guarded; malformed or missing data falls back to the
  default settings and an empty history.
- Duration inputs are validated (positive integers); invalid input reverts to
  the previous valid value.
- Timestamp-based countdown tolerates renderer throttling and sleep without
  drift.

## Testing

- **Unit tests (`test/timer.test.js`, Node built-in `node:test`)** on the pure
  `timer.js` module:
  - phase transitions (work → break-ready → break → …),
  - long-break-after-4 cycle logic and counter reset,
  - date rollover producing a fresh count,
  - pause/resume remaining-time math.
- **Manual test** for window-on-top behavior (cannot unit-test OS window
  control): minimize/hide the window, let a work session end, confirm it pops to
  the front.

## Project Structure

```
pomodoro/
  package.json
  main.js          # Electron main + IPC (window-on-top)
  preload.js       # safe IPC bridge
  src/
    index.html
    style.css
    renderer.js    # DOM wiring
    timer.js       # pure state machine + cycle logic  ← unit tested
    storage.js     # localStorage wrapper
    sound.js       # completion sound
  assets/
    chime.mp3
  test/
    timer.test.js
  docs/
    superpowers/specs/2026-06-18-pomodoro-app-design.md
```

Dependencies: `electron` (dev dependency). Nothing else.
