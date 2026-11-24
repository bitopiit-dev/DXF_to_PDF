'use strict';
// Drives the real Electron app. Run with `npm run test:e2e` (on Linux without a display: `xvfb-run -a npm run test:e2e`).
// Set SHOTS=<folder> to save screenshots of each state for visual review.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');
const { execFile } = require('node:child_process');
const electronBin = require('electron');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf2pdf-e2e-'));
for (const f of ['bangla.dxf', 'scale-mm.dxf', 'basic.dxf']) fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', f), path.join(work, f));

let app, win;
const shot = async name => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await win.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const size = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
const text = sel => win.locator(sel).innerText();
const ready = () => win.waitForFunction(() => /PDF ready|Too many|Nothing/.test(document.getElementById('sMsg').textContent));

test.before(async () => {
  app = await _electron.launch({
    cwd: ROOT,
    env: { ...process.env, DXF2PDF_FAKE_UPDATE: '9.9.9', DXF2PDF_TEST: '1' }, // a fake downloaded update; never open other programs
    args: ['--no-sandbox', `--user-data-dir=${path.join(work, 'profile')}`, '.', path.join(work, 'bangla.dxf'), path.join(work, 'scale-mm.dxf'), path.join(work, 'basic.dxf')],
  });
  win = await app.firstWindow();
  await size(1440, 900);
  await win.waitForSelector('#queue li:nth-child(3)');
  await ready();
});
test.after(async () => { if (app) await app.close(); });

test('opens every drawing passed on the command line and previews the first', async () => {
  assert.strictEqual(await win.locator('#queue li').count(), 3);
  assert.match(await text('#sMsg'), /PDF ready/);
  assert.ok(await win.locator('#paper svg').count(), 'preview drawn');
  assert.strictEqual(await win.locator('#bOpenPdf').isEnabled(), true);
  await shot('1-workspace');
});

test('a welcome tour walks through the workspace once, then stays away', async () => {
  await win.waitForSelector('#tour.on', { timeout: 5000 });
  assert.match(await text('#tourStep'), /^1 of 6/);
  assert.ok(await win.locator('#tourSpot').isVisible(), 'the first stop is highlighted');
  await shot('1b-tour-start');
  await win.click('#tourNext'); await win.click('#tourNext');
  assert.match(await text('#tourTitle'), /Exact scale/);
  await win.waitForTimeout(350);
  await shot('1c-tour-scale');
  await win.keyboard.press('ArrowLeft');
  assert.match(await text('#tourStep'), /^2 of 6/);
  for (let i = 0; i < 4; i++) await win.click('#tourNext');
  assert.strictEqual(await text('#tourNext'), 'Done');
  await win.click('#tourNext');
  await win.waitForSelector('#tour', { state: 'hidden' });
  assert.strictEqual(await win.evaluate(() => localStorage.getItem('tourDone')), '3.1');
});

test('a downloaded update is offered without getting in the way', async () => {
  await win.waitForSelector('#updBanner:not([hidden])', { timeout: 5000 });
  assert.match(await text('#updMsg'), /Version 9\.9\.9 is ready/);
  await shot('1d-update-ready');
  await win.click('#updLater');
  await win.waitForSelector('#updBanner', { state: 'hidden' });
});

test('the top bar is the title bar and opens the app menu', async () => {
  const region = await win.evaluate(() => getComputedStyle(document.querySelector('.bar')).webkitAppRegion || getComputedStyle(document.querySelector('.bar')).getPropertyValue('-webkit-app-region'));
  assert.strictEqual(region, 'drag');
  const btn = await win.evaluate(() => getComputedStyle(document.getElementById('bOpen')).getPropertyValue('-webkit-app-region'));
  assert.strictEqual(btn, 'no-drag', 'buttons stay clickable');
  assert.ok(await win.locator('#appMenu').isVisible());
  const frameless = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return typeof w.setTitleBarOverlay === 'function'; });
  assert.ok(frameless);
});

test('Bangla text is drawn as shaped outlines, not question marks', async () => {
  const svg = await win.locator('#paper').innerHTML();
  assert.ok(!svg.includes('?'), 'no "?" in the preview');
  assert.match(await text('#notes'), /non-Latin text drawn as vector outlines/);
});

test('exact scale tiles a large drawing across sheets', async () => {
  await win.locator('#queue li', { hasText: 'scale-mm.dxf' }).click();
  await ready();
  await win.selectOption('#size', 'A4');
  await win.click('#scaleMode button[data-v="fixed"]');
  await win.fill('#scale', '1:1');
  await win.press('#scale', 'Enter');
  await win.waitForFunction(() => /sheets \(/.test(document.getElementById('sSheet').textContent));
  assert.ok(await win.locator('#paper .tiles rect').count() > 1, 'tile outlines in the preview');
  assert.match(await text('#scaleHint'), /overlap by 10 mm/);
  await shot('2-tiled');
});

test('an impossible scale explains itself and offers one that works', async () => {
  await win.locator('#queue li', { hasText: 'basic.dxf' }).click();
  await win.waitForSelector('#viewMsg:not([hidden])');
  assert.match(await text('#viewMsg'), /sheets of A4/);
  await shot('3-too-many-sheets');
  await win.locator('#viewMsg button').click();
  await win.waitForFunction(() => /PDF ready/.test(document.getElementById('sMsg').textContent));
  assert.match(await win.inputValue('#scale'), /^1:\d+/);
});

test('hiding a layer re-renders without it', async () => {
  await win.click('#scaleMode button[data-v="fit"]');
  await ready();
  const before = (await win.locator('#paper').innerHTML()).length;
  await win.click('#lNone');
  await win.waitForSelector('#viewMsg:not([hidden])');
  assert.match(await text('#viewMsg'), /Nothing to draw/);
  await win.click('#lAll');
  await win.waitForFunction(() => /PDF ready/.test(document.getElementById('sMsg').textContent));
  // Show all also turns on Defpoints, which starts hidden, so the drawing can only grow
  assert.ok((await win.locator('#paper').innerHTML()).length >= before);
});

test('saves every drawing as a PDF next to its DXF', async () => {
  await win.selectOption('#saveWhere', 'beside');
  await win.click('#bSaveAll');
  await win.waitForFunction(() => /^Saved \d+ PDFs/.test(document.getElementById('sMsg').textContent));
  for (const n of ['bangla', 'scale-mm', 'basic']) {
    const pdf = fs.readFileSync(path.join(work, n + '.pdf'));
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-', n);
  }
});

test('dark theme and zoom controls', async () => {
  await win.click('#theme button[data-v="dark"]');
  assert.strictEqual(await win.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await win.click('#zIn');
  assert.notStrictEqual(await text('#zPct'), '');
  await win.click('#zFit');
  await shot('4-dark');
  await win.click('#theme button[data-v="system"]');
});

test('presets apply settings and can be saved and deleted', async () => {
  await win.locator('#queue li', { hasText: 'scale-mm.dxf' }).click();
  await ready();
  await win.selectOption('#preset', 'A3 1:50 engineering');
  await win.waitForFunction(() => document.getElementById('scale').value === '1:50' && /PDF ready/.test(document.getElementById('sMsg').textContent));
  assert.strictEqual(await win.inputValue('#size'), 'A3');
  assert.strictEqual(await win.isChecked('#tbOn'), true, 'title block switched on by the preset');
  await win.selectOption('#size', 'A2');
  await win.waitForFunction(() => document.getElementById('preset').value === '');
  await win.click('#presetSave');
  await win.fill('#presetName', 'A2 site plan');
  await win.click('#presetOk');
  await win.waitForFunction(() => document.getElementById('preset').value === 'A2 site plan');
  assert.ok(fs.existsSync(path.join(work, 'profile', 'presets.json')), 'saved on disk');
  await win.click('#presetDelete');
  await win.waitForFunction(() => ![...document.querySelectorAll('#preset option')].some(o => o.value === 'A2 site plan'));
});

test('title block fields appear in the preview, Bangla included', async () => {
  await win.fill('#tbProject', 'বিতপি টাওয়ার');
  await win.press('#tbProject', 'Tab');
  await win.fill('#tbStamp', 'Preliminary');
  await win.press('#tbStamp', 'Tab');
  await win.waitForFunction(() => /Preliminary/.test(document.querySelector('#paper .title-block')?.textContent || ''));
  assert.match(await win.locator('#paper .title-block').textContent(), /বিতপি টাওয়ার/);
  await shot('8-title-block');
});

test('layer colour and line weight overrides', async () => {
  await win.locator('#queue li', { hasText: 'basic.dxf' }).click();
  await ready();
  const row = win.locator('#layers li', { hasText: 'WALLS' });
  await row.locator('select').selectOption('2');
  await win.waitForFunction(() => document.querySelector('#layers li select.custom'));
  await row.locator('input[type=color]').evaluate(i => { i.value = '#ff00aa'; i.dispatchEvent(new Event('change')); });
  await win.waitForFunction(() => /#ff00aa/.test(document.getElementById('paper').innerHTML));
  assert.strictEqual(await win.locator('#lReset').isVisible(), true);
  await row.locator('button.eye').click();
  await win.waitForFunction(() => document.querySelector('#layers li.off'));
  await shot('9-layers');
  await win.click('#lReset');
  await row.locator('button.eye').click();
  await win.waitForFunction(() => !/#ff00aa/.test(document.getElementById('paper').innerHTML) && !document.querySelector('#layers li.off'));
});

test('toolbar switches the grid, rulers and sheet outlines', async () => {
  for (const [id, cls] of [['#tGrid', 'no-grid'], ['#tRulers', 'no-rulers'], ['#tTiles', 'no-tiles']]) {
    await win.click(id);
    assert.ok(await win.evaluate(c => document.getElementById('viewer').classList.contains(c), cls), cls);
    await win.click(id);
    assert.ok(!(await win.evaluate(c => document.getElementById('viewer').classList.contains(c), cls)));
  }
});

test('a watched folder turns new drawings into PDFs on its own', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf2pdf-watch-'));
  await app.evaluate(({ dialog }, d) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] }); }, dir);
  await win.click('#watchChoose');
  await win.waitForSelector('#sWatch:not([hidden])');
  assert.strictEqual(await win.getAttribute('#watchBox', 'data-on'), 'true');
  fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'scale-mm.dxf'), path.join(dir, 'new-part.dxf'));
  const pdf = path.join(dir, 'new-part.pdf');
  for (let i = 0; i < 60 && !fs.existsSync(pdf); i++) await win.waitForTimeout(250);
  assert.ok(fs.existsSync(pdf), 'PDF written beside the new drawing');
  assert.strictEqual(fs.readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
  await win.waitForFunction(() => /converted/.test(document.getElementById('sWatch').textContent));
  await shot('9b-watching');
  await win.click('#watchStop');
  await win.waitForSelector('#sWatch', { state: 'hidden' });
});

test('right-click conversion uses the settings last used in the app', async () => {
  await win.selectOption('#size', 'A4');
  await win.click('#scaleMode button[data-v="fixed"]');
  await win.fill('#scale', '1:1'); await win.press('#scale', 'Enter');
  await win.waitForTimeout(600); // settings are remembered shortly after they change
  const src = path.join(work, 'cli-copy.dxf');
  fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'scale-mm.dxf'), src);
  const out = await new Promise((resolve, reject) => execFile(electronBin,
    ['--no-sandbox', `--user-data-dir=${path.join(work, 'profile')}`, ROOT, '--convert', src, '--last-used'],
    { timeout: 60000 }, (err, stdout, stderr) => (err && !stdout ? reject(new Error(stderr || err.message)) : resolve(stdout))));
  assert.match(out, /cli-copy\.pdf .*A4, 1:1/);
});

test('a garment pattern shows its pieces and sizes, and prints one size or a roll', async () => {
  const file = path.join(work, 'aama-pattern.dxf');
  fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'aama-pattern.dxf'), file);
  await app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] }); }, file);
  await win.click('#bOpen');
  await win.waitForSelector('#garmentSec:not([hidden])');
  assert.match(await text('#garmentFacts'), /SLEEVE/);
  assert.match(await text('#garmentFacts'), /Inches \(from the file\)/);
  assert.strictEqual(await win.locator('.size-chip').count(), 2);
  await win.locator('.size-chip', { hasText: 'S' }).first().click();
  await win.waitForSelector('.size-chip[aria-pressed="false"]');
  assert.match(await text('#layers'), /Sew line \(14\)/);
  await win.selectOption('#size', 'Roll');
  assert.ok(await win.locator('#rollField').isVisible(), 'roll width appears for plotter rolls');
  await ready();
  assert.match(await text('#sSheet'), /914 mm roll/);
  await shot('9c-pattern');
  await win.selectOption('#size', 'A4');
});

test('fits small laptop screens and narrow windows without sideways scrolling', async () => {
  for (const [w, h, name] of [[1093, 582, '5-laptop-1366x768-125pct'], [760, 560, '6-narrow']]) {
    await size(w, h);
    await win.waitForTimeout(300);
    const m = await win.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
    assert.ok(m.sw <= m.iw && m.sh <= m.ih, `${name}: page fits (${JSON.stringify(m)})`);
    assert.ok(await win.locator('#bOpenPdf').isVisible() || await win.locator('#tOut').isVisible(), `${name}: actions reachable`);
    await shot(name);
  }
  await win.click('#tOut');
  await win.waitForTimeout(250);
  assert.ok(await win.locator('#bOpenPdf').isVisible(), 'settings drawer opens on narrow windows');
  await shot('7-narrow-settings-drawer');
  await win.keyboard.press('Escape');
});
