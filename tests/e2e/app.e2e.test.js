'use strict';
// Drives the real Electron app. Run with `npm run test:e2e` (on Linux without a display: `xvfb-run -a npm run test:e2e`).
// Set SHOTS=<folder> to save screenshots of each state for visual review.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');

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
