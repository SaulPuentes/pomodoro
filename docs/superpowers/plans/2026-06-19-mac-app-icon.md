# Local Mac App Bundle with Custom Icon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Electron Pomodoro app into a double-clickable macOS `.app` with a custom tomato-timer dock/Finder icon, built and run locally.

**Architecture:** A hand-authored `build/icon.svg` is rendered to a macOS `.icns` (and a `.png` for the dev dock) by a reproducible shell script. `electron-builder` packages `main.js` + `preload.js` + `src/**` into `dist/mac-arm64/Pomodoro.app`, ad-hoc signed so it launches without Gatekeeper errors. `main.js` sets the dock icon in dev too.

**Tech Stack:** Electron 31, electron-builder, `cairosvg` (render, fallback `magick`), `iconutil` (built-in macOS), bash.

## Global Constraints

- Target `arm64` macOS only. No Windows/Linux build.
- No code-signing certificate, no notarization, no `.dmg`, no Releases. Ad-hoc signing only (electron-builder default).
- Only one new dependency permitted: `electron-builder` (devDependency).
- Icon: single red fill (`#E23A2E`), flat. No text, no shadows, no gradients, no background. Tick-mark "clock" detail as transparent cutouts. Centered, recognizable at 16px.
- Work happens on branch `feat/mac-app-icon` (already checked out).
- `dist/` is already gitignored; never commit it.

---

### Task 1: Icon asset + reproducible icon build

**Files:**
- Create: `build/icon.svg`
- Create: `scripts/make-icon.sh`
- Produces (generated, committed): `build/icon.icns`, `build/icon.png`
- Produces (generated, ignored): `build/icon.iconset/`

**Interfaces:**
- Produces: `build/icon.icns` (electron-builder `mac.icon` input, Task 2), `build/icon.png` (512×512, dev dock icon input, Task 3).
- Consumes: nothing.

- [ ] **Step 1: Create the icon SVG**

Create `build/icon.svg` exactly:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <mask id="cut">
      <!-- white = visible red; black = transparent cutout -->
      <!-- tomato body -->
      <ellipse cx="512" cy="548" rx="345" ry="315" fill="white"/>
      <!-- stem + calyx (same silhouette, no separate colour) -->
      <rect x="496" y="150" width="32" height="80" rx="16" fill="white"/>
      <ellipse cx="470" cy="205" rx="62" ry="26" fill="white" transform="rotate(-25 512 210)"/>
      <ellipse cx="554" cy="205" rx="62" ry="26" fill="white" transform="rotate(25 512 210)"/>
      <!-- clock tick marks (cutouts) -->
      <g fill="black">
        <rect x="503" y="240" width="18" height="64" rx="9" transform="rotate(0 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(30 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(60 512 540)"/>
        <rect x="503" y="240" width="18" height="64" rx="9" transform="rotate(90 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(120 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(150 512 540)"/>
        <rect x="503" y="240" width="18" height="64" rx="9" transform="rotate(180 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(210 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(240 512 540)"/>
        <rect x="503" y="240" width="18" height="64" rx="9" transform="rotate(270 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(300 512 540)"/>
        <rect x="503" y="240" width="18" height="46" rx="9" transform="rotate(330 512 540)"/>
        <!-- centre hub -->
        <circle cx="512" cy="540" r="16"/>
      </g>
    </mask>
  </defs>
  <rect width="1024" height="1024" fill="#E23A2E" mask="url(#cut)"/>
</svg>
```

- [ ] **Step 2: Create the icon build script**

Create `scripts/make-icon.sh` exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/build/icon.svg"
SET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"
PNG="$ROOT/build/icon.png"

[ -f "$SVG" ] || { echo "error: $SVG not found" >&2; exit 1; }

render() {  # render <size> <outfile>
  local size="$1" out="$2"
  if command -v cairosvg >/dev/null 2>&1; then
    cairosvg "$SVG" --output-width "$size" --output-height "$size" -o "$out"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -density 512 "$SVG" -resize "${size}x${size}" "$out"
  else
    echo "error: need cairosvg or magick to render SVG" >&2
    exit 1
  fi
}

rm -rf "$SET"
mkdir -p "$SET"

render 16   "$SET/icon_16x16.png"
render 32   "$SET/icon_16x16@2x.png"
render 32   "$SET/icon_32x32.png"
render 64   "$SET/icon_32x32@2x.png"
render 128  "$SET/icon_128x128.png"
render 256  "$SET/icon_128x128@2x.png"
render 256  "$SET/icon_256x256.png"
render 512  "$SET/icon_256x256@2x.png"
render 512  "$SET/icon_512x512.png"
render 1024 "$SET/icon_512x512@2x.png"

iconutil -c icns "$SET" -o "$ICNS"
render 512 "$PNG"

echo "wrote $ICNS and $PNG"
```

- [ ] **Step 3: Run the icon build**

Run: `bash scripts/make-icon.sh`
Expected output ends with: `wrote .../build/icon.icns and .../build/icon.png`

- [ ] **Step 4: Verify the artifacts exist and are non-empty**

Run: `test -s build/icon.icns && test -s build/icon.png && file build/icon.icns`
Expected: exit 0; `file` reports `build/icon.icns: Mac OS X icon`

- [ ] **Step 5: Eyeball the small-size render**

Run: `open build/icon.iconset/icon_16x16.png build/icon.iconset/icon_512x512@2x.png`
Expected: a red tomato with a ring of clock ticks; recognizable at 16px. If the 16px render is muddy, widen the tick rects (`width="18"` → `22`) in `build/icon.svg` and re-run Step 3.

- [ ] **Step 6: Commit**

```bash
git add build/icon.svg build/icon.icns build/icon.png scripts/make-icon.sh
git commit -m "feat: add tomato-timer app icon and reproducible icon build script"
```

---

### Task 2: electron-builder packaging

**Files:**
- Modify: `package.json` (add devDependency, scripts, `build` block)
- Produces (generated, ignored): `dist/mac-arm64/Pomodoro.app`

**Interfaces:**
- Consumes: `build/icon.icns` (Task 1).
- Produces: `dist/mac-arm64/Pomodoro.app`; `npm run dist` script; `npm run icon` script.

- [ ] **Step 1: Install electron-builder**

Run: `npm install --save-dev electron-builder`
Expected: `package.json` `devDependencies` now lists `electron-builder`; exit 0.

- [ ] **Step 2: Add scripts and build config to package.json**

Set `package.json` `scripts` to:

```json
  "scripts": {
    "start": "electron .",
    "test": "node --test test/",
    "icon": "bash scripts/make-icon.sh",
    "dist": "electron-builder"
  },
```

Add a top-level `build` block (sibling of `scripts`):

```json
  "build": {
    "appId": "com.saulpuentes.pomodoro",
    "productName": "Pomodoro",
    "files": [
      "main.js",
      "preload.js",
      "src/**/*"
    ],
    "mac": {
      "icon": "build/icon.icns",
      "category": "public.app-category.productivity",
      "target": "dir"
    }
  }
```

- [ ] **Step 3: Build the app**

Run: `npm run dist`
Expected: electron-builder logs `building target=directory arch=arm64`; exit 0.

- [ ] **Step 4: Verify the bundle and its icon**

Run: `test -d "dist/mac-arm64/Pomodoro.app" && test -s "dist/mac-arm64/Pomodoro.app/Contents/Resources/icon.icns"`
Expected: exit 0.

- [ ] **Step 5: Launch and smoke-test**

Run: `open "dist/mac-arm64/Pomodoro.app"`
Expected: the Pomodoro window opens with the tomato icon in the dock; starting a session and the timer counting down both work. No Gatekeeper "damaged"/"unidentified developer" block (ad-hoc signed, locally built).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: package app into local macOS .app via electron-builder"
```

---

### Task 3: Custom dock icon in development

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `build/icon.png` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: Require nativeImage**

In `main.js`, change the first line:

```js
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
```

- [ ] **Step 2: Set the dock icon on app ready**

In `main.js`, replace the `app.whenReady().then(...)` block with:

```js
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      path.join(__dirname, 'build', 'icon.png')
    );
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
```

- [ ] **Step 3: Verify dev dock icon**

Run: `npm start`
Expected: the dock shows the tomato icon (not the default Electron atom). Close the window when done.

- [ ] **Step 4: Confirm logic tests still pass**

Run: `npm test`
Expected: all tests pass (this change does not touch the tested pure modules, but confirm nothing broke).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat: show custom dock icon when running in development"
```

---

### Task 4: Ignore intermediates + document the build

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `npm run icon` / `npm run dist` scripts (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Ignore the intermediate iconset**

Add to `.gitignore` (new line, keep existing entries):

```
build/icon.iconset/
```

- [ ] **Step 2: Add a build section to the README**

In `README.md`, after the existing `## Development` section, add:

```markdown
## Build the Mac app

Produce a double-clickable `Pomodoro.app` for your own Mac (Apple Silicon):

```bash
npm run icon   # render build/icon.icns from build/icon.svg (run once, or after editing the icon)
npm run dist   # package into dist/mac-arm64/Pomodoro.app
```

Then drag `dist/mac-arm64/Pomodoro.app` into `/Applications`. The build is
ad-hoc signed and self-built, so macOS launches it without a Gatekeeper prompt.
This is a local, unsigned build — it is not notarized for distribution to other
machines.
```

- [ ] **Step 3: Verify the iconset stays untracked**

Run: `git status --porcelain build/icon.iconset/`
Expected: no output (the directory is ignored).

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "docs: ignore icon intermediates and document the Mac build"
```

---

## Self-Review

**Spec coverage:**
- Icon asset (`build/icon.svg`, `scripts/make-icon.sh`, `.icns`) → Task 1. ✓
- electron-builder config + `dist`/`icon` scripts + `.app` output → Task 2. ✓
- Dev dock icon in `main.js` → Task 3. ✓
- Repo hygiene (ignore `icon.iconset/`, README build section) → Task 4. ✓
- Non-goals (signing/notarization/dmg/Releases/other OSes) → excluded, restated in Global Constraints. ✓
- Manual verification steps (icns exists, app exists, launches, icon crisp small, `npm start` icon) → distributed across Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code/script/config step shows full content. ✓

**Type/name consistency:** `build/icon.icns` and `build/icon.png` produced in Task 1 are the exact paths consumed in Tasks 2 (`mac.icon`) and 3 (`createFromPath`). `npm run icon`/`npm run dist` script names match between Task 2 and Task 4 docs. `appId`/`productName` consistent. ✓
