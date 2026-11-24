'use strict';
// User presets on disk (userData/presets.json). Built-in presets live in src/models/presets.js.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const Settings = require('../models/settings');

const file = () => path.join(app.getPath('userData'), 'presets.json');

function list() {
  try {
    const all = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return Array.isArray(all) ? all.filter(p => p && typeof p.name === 'string' && p.settings).map(p => ({ name: p.name, settings: Settings.forPreset(p.settings) })) : [];
  } catch { return []; }
}
function write(all) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(all, null, 2)); }
function save(name, settings) {
  const all = list().filter(p => p.name.toLowerCase() !== name.toLowerCase());
  all.push({ name, settings: Settings.forPreset(settings) });
  write(all);
}
function remove(name) { write(list().filter(p => p.name.toLowerCase() !== String(name).toLowerCase())); }

// The settings last used in the app, so right-click "Convert to PDF" and the watch folder match it.
const lastFile = () => path.join(app.getPath('userData'), 'last-settings.json');
function saveLast(settings) {
  try { fs.mkdirSync(path.dirname(lastFile()), { recursive: true }); fs.writeFileSync(lastFile(), JSON.stringify(Settings.normalize(settings))); } catch { /* not fatal */ }
}
function last() {
  try { return Settings.normalize(JSON.parse(fs.readFileSync(lastFile(), 'utf8'))); } catch { return Settings.normalize({}); }
}

module.exports = { list, save, remove, saveLast, last };
