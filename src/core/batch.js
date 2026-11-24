'use strict';
// Runs one job per drawing with limited concurrency and reports progress after each.
// job(item) -> result; failures are collected, never thrown, so one bad file does not stop the batch.
async function runBatch(items, job, { concurrency = 2, onProgress } = {}) {
  const done = [], failed = [];
  let next = 0, finished = 0;
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      try { const result = await job(item); done.push({ item, result }); if (onProgress) onProgress({ item, ok: true, result, done: ++finished, total: items.length }); }
      catch (e) { failed.push({ item, error: String(e && e.message || e) }); if (onProgress) onProgress({ item, ok: false, error: String(e && e.message || e), done: ++finished, total: items.length }); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
  return { done, failed };
}
module.exports = { runBatch };
