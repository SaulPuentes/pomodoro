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
- **Nature backdrops** — a frosted-glass timer floats over a full-bleed nature
  photo. Pick from a curated set of Unsplash views, shuffle, or add your own
  Unsplash access key in Settings to pull fresh photos. A luminous horizon line
  sweeps across the glass as the phase elapses — amber while focusing, aqua while
  resting.

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

## Build the Mac app

Produce a double-clickable `Pomodoro.app` for your own Mac (Apple Silicon):

```bash
npm run icon   # render build/icon.icns from build/icon.svg (run once, or after editing the icon)
npm run dist   # package into dist/mac-arm64/Pomodoro.app
```

Then drag `dist/mac-arm64/Pomodoro.app` into `/Applications`. This is a local,
unsigned build — because you built it yourself it carries no quarantine flag, so
macOS launches it without a Gatekeeper prompt. It is not notarized for
distribution to other machines.

## How It Works

- `main.js` — Electron main process: owns the single window and the
  pop-to-front action over IPC.
- `preload.js` — minimal, isolated IPC bridge (`contextIsolation` on).
- `src/timer.mjs` — pure state machine: phases, the long-break-after-4 cycle,
  and a timestamp-based countdown that stays accurate through sleep.
- `src/storage.mjs` — `localStorage` wrapper for settings, daily history, the
  chosen background, and the optional Unsplash key.
- `src/backgrounds.mjs` — the curated view list, Unsplash CDN URL helpers, and
  the live "random nature" fetch.
- `src/renderer.mjs` — wires the pure modules to the DOM.
- `src/sound.mjs` — WebAudio completion beep.
- `src/fonts/` — bundled Bricolage Grotesque and Newsreader woff2 (so type works
  offline under the strict CSP).

Settings, history, and your chosen view persist in `localStorage`. No accounts,
no database. Photos are hot-linked from the Unsplash CDN per their guidelines —
the only network calls — so backgrounds need an internet connection.

## License

MIT
