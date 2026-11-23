# DXF to PDF — repo guide

Desktop app (Electron) that converts DXF drawings to vector PDF and opens the result in the system PDF viewer. All conversion runs locally.

## Layout

- `src/main/` — Electron main process (`main.js`) and the preload bridge (`preload.js`). File dialogs, saving, opening PDFs, single-instance and file-association handling.
- `src/renderer/` — the UI (`index.html`, `styles.css`, `app.js`) and the conversion engine `dxf-core.js`.
- `src/renderer/fonts/` — bundled Barlow fonts (SIL OFL, see `OFL.txt`), so the app works offline.
- `assets/icon/` — app icon: `icon.svg` is the source; PNG, ICO and ICNS are exported from it.
- `tests/` — unit tests for `dxf-core.js` (`node --test`), with DXF fixtures in `tests/fixtures/`.
- `docs/` — supported DXF features and known limits.
- `.github/workflows/build.yml` — tests on every push/PR; builds Windows portable + installer, Linux AppImage and macOS dmg; attaches them to a GitHub release on `v*` tags.

## Commands

- `npm start` — run the app
- `npm test` — unit tests
- `npm run dist:win` / `dist:linux` / `dist:mac` — package into `dist/`

## Rules

- `dxf-core.js` must stay free of DOM and Electron APIs so it runs in Node tests. It exports via `module.exports` when available.
- Renderer runs with `contextIsolation`, `sandbox` and a strict CSP (no inline scripts, no remote content). Only `window.desktop` from the preload talks to the main process.
- Any change to parsing or rendering needs a test and, when new entity types are involved, a fixture.
