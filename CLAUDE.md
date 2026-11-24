# DXF to PDF — repo guide

Desktop app (Electron) that converts DXF drawings to vector PDF, fitted or at an exact scale with tiling, and opens the result in the system PDF viewer. All conversion runs locally.

## Layout

- `src/core/` — the converter, free of Electron and DOM APIs so it runs in Node tests, worker threads and the command line.
  - `dxf-core.js` — parse → flatten → page plan (fit, exact scale, tiles) → SVG preview / PDF pages.
  - `text-shaper.mjs` — HarfBuzz shaping of non-Latin text (Bangla and others) into glyph outlines, using `fonts/` (Noto, SIL OFL).
  - `convert.js` — the service everything calls: `init`, `open`, `render`, `combine`, scale parsing and suggestions.
- `src/main/` — Electron main process.
  - `main.js` — window (sized to the screen, state remembered and kept on a connected display), menu, IPC, single instance, file association.
  - `pool.js` + `convert-worker.js` — worker threads that run conversions; pool size follows CPU cores and memory. A document stays in the worker that parsed it.
  - `cli.js` — headless `--convert` mode.
  - `preload.js` — the only bridge (`window.desktop`) between the renderer and the main process.
- `src/renderer/` — UI only (`index.html`, `styles.css`, `app.js`): drawing queue, preview with pan/zoom and mm rulers, settings, batch actions. It never touches files or the converter directly.
- `tests/` — `core.test.js` (unit, `node --test`) with DXF fixtures in `tests/fixtures/`; `e2e/app.e2e.test.js` drives the real app with Playwright.
- `.github/workflows/build.yml` — unit + e2e tests on every push/PR; on `v*` tags builds Windows (x64, ia32, arm64), Linux (AppImage, deb; x64, arm64) and macOS (universal) and attaches them to a release.

## Commands

- `npm start` — run the app
- `npm test` — unit tests
- `npm run test:e2e` — end-to-end tests (Linux without a display: `xvfb-run -a npm run test:e2e`; `SHOTS=dir` saves screenshots)
- `npm run dist:win` / `dist:linux` / `dist:mac` — package into `dist/`

## Rules

- `src/core/` must stay free of DOM and Electron APIs.
- Renderer runs with `contextIsolation`, `sandbox` and a strict CSP (no inline scripts, no remote content). Only `window.desktop` from the preload talks to the main process.
- HarfBuzz, its WebAssembly and the fonts are listed in `build.asarUnpack`; `convert.js` resolves them from `app.asar.unpacked` when packaged. Test a packaged build (`npx electron-builder --linux dir`) after touching them.
- Any change to parsing or rendering needs a test and, when new entity types are involved, a fixture. UI changes need the e2e suite to pass.
