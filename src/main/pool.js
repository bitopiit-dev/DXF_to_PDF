'use strict';
// A small pool of conversion workers, sized to the machine: one per spare CPU core,
// at most 4, and a single worker on PCs with little memory.
const { Worker } = require('node:worker_threads');
const os = require('node:os');
const path = require('node:path');

function poolSize() {
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const gb = os.totalmem() / 1024 ** 3;
  if (gb < 4) return 1;
  return Math.max(1, Math.min(4, cores - 1, Math.floor(gb / 2)));
}

class Pool {
  constructor(workerData) {
    this.size = poolSize();
    this.workers = [];
    this.home = new Map(); // doc id -> worker index, so a document is parsed once
    this.next = 0;
    this.seq = 0;
    this.workerData = workerData;
    for (let i = 0; i < this.size; i++) this.workers.push(this.spawn());
  }

  spawn() {
    const w = { worker: new Worker(path.join(__dirname, 'convert-worker.js'), { workerData: this.workerData }), pending: new Map(), load: 0 };
    w.worker.on('message', ({ seq, ok, res, error }) => {
      const p = w.pending.get(seq);
      if (!p) return;
      w.pending.delete(seq); w.load--;
      ok ? p.resolve(res) : p.reject(new Error(error));
    });
    w.worker.on('error', err => {
      for (const p of w.pending.values()) p.reject(err);
      w.pending.clear(); w.load = 0;
    });
    w.worker.on('exit', code => {
      if (this.closing) return;
      // a crashed worker (for example out of memory on a huge file) is replaced; its documents must be reopened
      const i = this.workers.indexOf(w);
      for (const p of w.pending.values()) p.reject(new Error(code ? 'worker-crashed' : 'worker-exited'));
      for (const [id, idx] of this.home) if (idx === i) this.home.delete(id);
      if (i >= 0) this.workers[i] = this.spawn();
    });
    return w;
  }

  call(w, op, args, transfer) {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      w.pending.set(seq, { resolve, reject }); w.load++;
      w.worker.postMessage({ seq, op, args }, transfer || []);
    });
  }

  leastBusy() {
    return this.workers.reduce((best, w, i) => (w.load < this.workers[best].load ? i : best), 0);
  }

  status() { return this.call(this.workers[0], 'status', {}); }

  open(id, data) {
    const i = this.leastBusy();
    this.home.set(id, i);
    const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    return this.call(this.workers[i], 'open', { id, data: u8 }, [u8.buffer]);
  }

  render(id, args) {
    const i = this.home.get(id);
    if (i == null) return Promise.reject(new Error('gone'));
    return this.call(this.workers[i], 'render', { id, ...args });
  }

  combine(items, title) {
    return this.call(this.workers[this.leastBusy()], 'combine', { items, title });
  }

  close(id) {
    const i = this.home.get(id);
    this.home.delete(id);
    if (i != null) this.call(this.workers[i], 'close', { id }).catch(() => {});
  }

  async destroy() {
    this.closing = true;
    await Promise.all(this.workers.map(w => w.worker.terminate()));
  }
}

module.exports = { Pool, poolSize };
