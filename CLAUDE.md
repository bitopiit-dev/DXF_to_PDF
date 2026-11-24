# DXF to PDF — repo guide

Desktop app (Electron) that converts DXF drawings to vector PDF, fitted or at an exact scale with tiling, and opens the result in the system PDF viewer. All conversion runs locally.

## Layout

- `src/core/` — the converter, free of Electron and DOM APIs so it runs in Node tests, worker threads and the command line.
  - `dxf/` — `parser.js` (sections, tables, units), `entities.js` (entities → world primitives), `geometry.js`, `colors.js`, `mtext.js`.
  - `text/` — `metrics.js` (text widths), `shaper.mjs` (HarfBuzz shaping of Bangla and other scripts) and `fonts/` (Noto, SIL OFL).
  - `layout/` — `plan.js` (fit, exact scale, tiling, title-block clearance), `extents.js`, `title-block.js` (one layout used by both renderers).
  - `render/` — `svg.js` (preview), `pdf.js` (vector PDF pages, sheet marks, title block), `common.js`.
  - `convert.js` — the service everything calls: `init`, `open`, `render`, `combine`, layer overrides, scale parsing and suggestions.
  - `batch.js` — runs one job per drawing with progress and keeps going past failures.
  - `dxf-core.js` — facade with the original API, kept for stable imports.
- `src/models/` — plain data rules shared by the UI, main process and CLI (UMD, no dependencies): `settings.js` (validated export settings), `presets.js` (built-in presets, name rules), `layer-overrides.js`.
- `src/main/` — Electron main process: `main.js` (window, menu, IPC), `pool.js` + `convert-worker.js` (worker threads sized to the PC), `store.js` (user presets and the last-used settings on disk), `cli.js` (headless `--convert`, plus `--last-used` and `--notify` for the Explorer right-click menu), `updater.js` (GitHub Releases: self-update for the NSIS installer and AppImage, notify-only elsewhere), `watcher.js` (watch folder), `preload.js` (the only bridge, `window.desktop`). The window has a custom title bar: the UI's `.bar` is the drag region and the system draws its buttons over it (`titleBarOverlay`).
- `build/installer.nsh` — NSIS additions: the right-click entries for `.dxf` files and folders (current user), removed on uninstall. Compile-check it with `makensis` after edits.
- `src/ui/` — the interface, as plain scripts sharing `window.App` (set up in `state.js`, loaded in order by `index.html`):
  - `canvas/` — `viewport.js` (zoom at cursor, pan, pinch), `rulers.js` (mm rulers and the mat grid), `toolbar.js` (floating toolbar, grid/ruler/sheet-outline switches).
  - `panels/` — `queue.js`, `sheet.js` (paper, scale, smart scale hint), `layers.js` (eye, colour, line weight), `title-block.js`, `presets.js`.
  - `app.js` — wiring: opening, converting, painting results, saving, menus. `icons.js` — inline SVG icons.
  - `styles/tokens.css` (colours, light and dark) and `styles/components.css`.
- `src/ui/chrome.js` (title bar, menu button, update banner, motion), `src/ui/panels/automation.js` (watch folder, update switch, remembering settings), `src/ui/tour.js` (first-run tour).
- Releases must include `latest*.yml` and `.blockmap` files (CI uploads them); without them installed apps cannot update.
- `tests/` — `core.test.js` (unit, `node --test`) with fixtures in `tests/fixtures/`; `e2e/app.e2e.test.js` drives the real app with Playwright.
- `.github/workflows/build.yml` — unit + e2e tests on every push/PR; on `v*` tags builds Windows (x64, ia32, arm64), Linux (AppImage, deb; x64, arm64) and macOS (universal) and attaches them to a release.

## Commands

- `npm start` — run the app
- `npm test` — unit tests
- `npm run test:e2e` — end-to-end tests (Linux without a display: `xvfb-run -a npm run test:e2e`; `SHOTS=dir` saves screenshots)
- `npm run dist:win` / `dist:linux` / `dist:mac` — package into `dist/`

## Rules

- `src/core/` and `src/models/` must stay free of DOM and Electron APIs.
- UI modules talk through `App` (state, `App.emit`/`App.on` events) and never reach into another panel's DOM.
- Renderer runs with `contextIsolation`, `sandbox` and a strict CSP (no inline scripts, no remote content). Only `window.desktop` from the preload talks to the main process.
- HarfBuzz, its WebAssembly and `src/core/text/` are listed in `build.asarUnpack`; `convert.js` resolves them from `app.asar.unpacked` when packaged. Test a packaged build (`npx electron-builder --linux dir`) after touching them.
- Any change to parsing or rendering needs a test and, when new entity types are involved, a fixture. UI changes need the e2e suite to pass.
