<p align="center"><img src="assets/icon/256x256.png" width="128" alt="DXF to PDF icon"></p>

# DXF to PDF

[![build](https://github.com/bitopiit-dev/DXF_to_PDF/actions/workflows/build.yml/badge.svg)](https://github.com/bitopiit-dev/DXF_to_PDF/actions/workflows/build.yml)

A portable desktop app that turns DXF drawings into vector PDFs: fitted to a sheet or at an exact scale such as 1:50, with Bangla text printed correctly. Drop in one file or a whole folder, and the PDF opens in your default viewer a moment later. Nothing is uploaded; the conversion runs on your computer.

## Download

Grab a build from the [Releases](https://github.com/bitopiit-dev/DXF_to_PDF/releases) page:

- **Windows:** `DXF-to-PDF-x.y.z-setup.exe` installs on 64-bit, 32-bit and ARM PCs (it picks the right one) and lets you double-click `.dxf` files to open them in the app. `DXF-to-PDF-x.y.z-portable-x64.exe` (or `-ia32` for 32-bit Windows) runs without installing, from a USB stick or any folder. Needs Windows 10 or 11.
- **Linux:** `.AppImage` (make it executable, then run) or `.deb`, for x64 and ARM64.
- **macOS:** `DXF-to-PDF-x.y.z-universal.dmg` runs on Intel and Apple silicon Macs (unsigned: right-click the app, then Open, the first time).

## What the PDF keeps

- Every line, arc and curve as vector paths, so it stays sharp at any zoom or print size
- Line weights, line types (dashed, center, hidden) and colours from the drawing
- Hatch patterns as real pattern lines, solid fills as fills
- Text position, height, rotation, alignment and width factor; MTEXT wraps like in CAD
- Bangla, Greek, Cyrillic and other non-Latin text, shaped with HarfBuzz and drawn as vector outlines (conjuncts such as ক্ষ come out right); Latin text stays searchable
- Blocks, attributes, dimensions and leaders

Full list and current limits: [docs/supported-dxf.md](docs/supported-dxf.md).

## Use it

1. Drop `.dxf` files or a folder on the window, choose **Open drawings**, or press Ctrl+O. With a single drawing, the PDF opens automatically; turn this off on the start screen.
2. Pick the paper (A4 to A0, Letter, Legal, Tabloid), orientation, margin, drawing colours or all-black lines, and layers. The preview and PDF update together.
3. For a scale you can measure, switch **Scale** to **Exact scale** and type it, for example `1:100` or `2:1`. The app reads the drawing's units from the file; set them yourself if the file does not say. A drawing larger than the paper is split across overlapping sheets labelled A1, A2, B1…, each naming its neighbours, with a 50 mm scale bar to check the printer.
4. Optional: tick **Add a title block** for an engineering title block on every sheet (project, drawn by, date, stamp; drawing name, scale and sheet number fill in automatically). In **Layers**, use the eye to hide a layer, the swatch to change its colour in the PDF, and the `1×` menu to make its lines thinner or thicker.
5. Pick a **Preset** such as *A4 fit, black and white* or *A3 1:50 engineering*, or save your own with the disk button.
6. **Save PDF…** writes it next to the DXF. With several drawings open, **Save all** writes one PDF per drawing and **Combine into one** makes a single PDF.

In the preview, drag to move, scroll or pinch to zoom, double-click to fit. The floating toolbar zooms and switches the grid, rulers and sheet outlines on and off. Ctrl+1 shows the sheet at about real size. The rulers show paper millimetres, and the status bar shows the cursor position in drawing units.

### Command line

The same app converts without opening a window:

```bash
"DXF to PDF" --convert plans/ --out pdf/ --scale 1:100 --size A1
"DXF to PDF" --convert a.dxf b.dxf --combine all.pdf --ink black
"DXF to PDF" --convert plans/ --preset "A3 1:50 engineering" --project "Bitopi Tower" --drawn-by "K/Arifur Rahman"
"DXF to PDF" --help
```

## Works on modest PCs

Conversion runs in background workers, so the window stays responsive on large drawings. The app uses one worker per spare CPU core, up to four, and a single worker on PCs with less than 4 GB of memory. The window sizes itself to the screen, remembers where you left it, and moves back on screen if a monitor was unplugged. Panels fold into drawers on small or high-scaling screens such as 1366×768 at 125%.

## Develop

Needs Node.js 20 or newer.

```bash
npm install
npm start            # run the app
npm test             # unit tests for the converter
npm run test:e2e     # drives the real app (on Linux without a display: xvfb-run -a npm run test:e2e)
npm run dist:win     # Windows installer + portable builds in dist/
```

Pushing a tag such as `v2.0.0` makes GitHub Actions run both test suites, build Windows, Linux and macOS packages, and attach them to a release. See [CLAUDE.md](CLAUDE.md) for the code layout.

## বাংলায় সংক্ষেপে

Windows-এ `setup.exe` ৬৪-বিট, ৩২-বিট ও ARM সব পিসিতে চলে; `portable.exe` ইনস্টল ছাড়াই চলে। অ্যাপ খুলে এক বা একাধিক DXF ফাইল বা পুরো ফোল্ডার টেনে ছেড়ে দিন, PDF নিজে থেকেই তৈরি হবে। ড্রয়িংয়ের বাংলা লেখা এখন সঠিকভাবে (যুক্তাক্ষরসহ) PDF-এ আসে। **Exact scale** বেছে 1:100-এর মতো মাপ দিলে আসল মাপে প্রিন্ট হয়; কাগজের চেয়ে বড় ড্রয়িং কয়েকটি পাতায় ভাগ হয়ে যায়, জোড়া লাগানোর চিহ্নসহ।

## Copyright

Copyright © 2026 K/Arifur Rahman. All rights reserved. See [LICENSE](LICENSE).

## Credits

Barlow and Barlow Condensed fonts by Jeremy Tribby, SIL Open Font License (`src/renderer/fonts/OFL.txt`). Noto Sans and Noto Sans Bengali by the Noto Project Authors, SIL Open Font License (`src/core/fonts/OFL-Noto.txt`). Text shaping by [HarfBuzz](https://github.com/harfbuzz/harfbuzzjs) (MIT). PDF output by [jsPDF](https://github.com/parallax/jsPDF) (MIT).
