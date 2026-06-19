# Local Mac App Bundle with Custom Icon — Design

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Package the Electron Pomodoro app into a double-clickable macOS `.app`
bundle with a custom dock/Finder icon, runnable locally on the author's Apple
Silicon Mac.

## Goal

Today the app launches only via `npm start`. The goal is a real macOS
application: a `Pomodoro.app` you drag into `/Applications` and launch from
Finder, Spotlight, or the dock, showing a custom icon everywhere macOS shows app
icons.

## Non-Goals

Explicitly out of scope (these belong to "distribute to other people," which the
author confirmed is not the current goal):

- Apple Developer code-signing certificate and notarization.
- `.dmg` / installer artifacts.
- GitHub Releases or any download distribution.
- Windows / Linux builds.

These are excluded because a locally built, self-run app needs none of them: the
build is ad-hoc signed and carries no quarantine flag, so Gatekeeper does not
block it.

## Audience & Platform

- Single user, the repository author.
- macOS on Apple Silicon (`arm64`). Build target is `arm64` only.
- Available local tooling (verified): `cairosvg`, `magick` (ImageMagick),
  `iconutil` (built into macOS). No new system installs required.

## Components

### 1. Icon asset

- **`build/icon.svg`** — hand-authored vector source, the single source of
  truth. Specification:
  - Minimal flat tomato-inspired timer silhouette.
  - Monochromatic red only (no leaf color variation, one fill color).
  - Subtle clock tick markings on the body.
  - Rounded edges, centered composition.
  - No text, no shadows, no gradients, no background.
  - Tuned to stay recognizable at 16px.
- **`scripts/make-icon.sh`** — reproducible icon build:
  1. Render `build/icon.svg` to PNGs at the 10 Apple iconset sizes (16, 32,
     128, 256, 512 plus each `@2x`: 32, 64, 256, 512, 1024) into
     `build/icon.iconset/` using `cairosvg` (fallback: `magick`).
  2. `iconutil -c icns build/icon.iconset -o build/icon.icns`.
  - Idempotent; safe to re-run after editing the SVG.

### 2. Build pipeline — electron-builder

- Add `electron-builder` as a devDependency.
- `package.json` `build` block:
  - `appId`: `com.saulpuentes.pomodoro`
  - `productName`: `Pomodoro`
  - `mac.icon`: `build/icon.icns`
  - `mac.category`: `public.app-category.productivity`
  - `mac.target`: `dir` (emit just the `.app`; no `.dmg`, since this is local
    and faster).
  - `files`: limited to `main.js`, `preload.js`, `src/**` (the runtime surface).
- `package.json` scripts:
  - `"icon": "bash scripts/make-icon.sh"`
  - `"dist": "electron-builder"`
- Output: `dist/mac-arm64/Pomodoro.app`. The user drags it into `/Applications`.
- electron-builder ad-hoc signs by default, so the app launches without a
  Gatekeeper "damaged" error on Apple Silicon.

### 3. Dock icon in development

- In `main.js`, on app ready, call `app.dock?.setIcon(...)` (guarded, macOS
  only) pointing at the rendered icon, so `npm start` shows the tomato icon in
  the dock instead of the default Electron atom. Cosmetic dev-experience touch.

### 4. Repository hygiene

- Commit: `build/icon.svg`, `build/icon.icns`, `scripts/make-icon.sh`, the
  `package.json` changes, the `main.js` change.
- `.gitignore`: add `build/icon.iconset/` (intermediate render output). `dist/`
  is already ignored.
- README: add a short "Build the Mac app" section — run `npm run icon` once,
  then `npm run dist`, then drag `dist/mac-arm64/Pomodoro.app` to
  `/Applications`.

## Data / Build Flow

```
build/icon.svg
   │ cairosvg (fallback: magick)
   ▼
build/icon.iconset/*.png  (10 sizes)
   │ iconutil -c icns
   ▼
build/icon.icns ──────────► electron-builder (mac.icon)
                                   │
main.js, preload.js, src/** ───────┤
                                   ▼
                         dist/mac-arm64/Pomodoro.app
                                   │ drag
                                   ▼
                            /Applications
```

## Error Handling

- `make-icon.sh`: fail fast (`set -euo pipefail`). If `cairosvg` render fails or
  is absent, fall back to `magick`; if neither works, exit non-zero with a clear
  message naming the missing tool.
- `electron-builder`: surfaces its own errors; a missing `build/icon.icns` is a
  hard failure prompting the user to run `npm run icon` first (documented in
  README).

## Testing / Verification

Manual, because this is packaging/asset work (the existing `npm test` covers the
pure logic and is unaffected):

1. `npm run icon` → `build/icon.icns` exists and is non-empty.
2. `npm run dist` → `dist/mac-arm64/Pomodoro.app` exists.
3. Launch the `.app` from Finder → window opens, timer runs.
4. Icon renders crisply in: dock, Finder, and Cmd-Tab (small size).
5. `npm start` still works and now shows the custom dock icon.

## Risks

- ImageMagick lives at an Intel Homebrew path (`/usr/local/bin`) on this arm64
  machine; it runs under Rosetta if needed. `cairosvg` is the primary renderer,
  so this is only a fallback concern.
- Small-size legibility of the icon is the main design risk; mitigated by tuning
  the SVG explicitly for 16px and verifying at step 4.
