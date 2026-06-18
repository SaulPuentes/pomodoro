# Pomodoro

A minimal cross-platform desktop Pomodoro timer built with Electron. Run focused
work cycles, track how many you complete each day, and have the window pop back
to the front the moment a session ends.

## Features

- **Concentration / break cycle** — 25 min concentration, 5 min short break, with
  a 15 min long break after every 4th concentration session.
- **Daily count + history** — counts completed sessions for the current day
  (resets at midnight) and keeps a per-day log of the last 30 days.
- **Configurable durations** — change the concentration, short break, and long
  break lengths from the Settings panel.
- **Window pops to front** — when a concentration session ends, the window
  restores, shows, and focuses itself even if minimized or hidden.
- **Manual transitions** — every phase waits for you to start it; no surprise
  countdowns.
- **Optional sound** — a completion beep you can toggle on (off by default).

## Requirements

- [Node.js](https://nodejs.org/) 20+
- npm

## Getting Started

```bash
npm install   # install Electron
npm start     # launch the app
```

## Development

```bash
npm test      # run the unit tests (Node built-in test runner)
```

The pure logic — the timer state machine (`src/timer.mjs`) and persistence
(`src/storage.mjs`) — is unit tested. UI, window control, and sound are verified
manually.

## How It Works

- `main.js` — Electron main process: owns the single window and the
  pop-to-front action over IPC.
- `preload.js` — minimal, isolated IPC bridge (`contextIsolation` on).
- `src/timer.mjs` — pure state machine: phases, the long-break-after-4 cycle,
  and a timestamp-based countdown that stays accurate through sleep.
- `src/storage.mjs` — `localStorage` wrapper for settings and the daily history.
- `src/renderer.mjs` — wires the pure modules to the DOM.
- `src/sound.mjs` — WebAudio completion beep.

Settings and history persist in `localStorage`. No accounts, no network, no
database.

## License

MIT
