'use strict';
// Runs conversions off the main thread so large drawings never freeze the window.
const { parentPort, workerData } = require('node:worker_threads');
const C = require('../core/convert.js');

const docs = new Map(); // doc id -> parsed DXF
const ready = C.init(workerData || {});

parentPort.on('message', async ({ seq, op, args }) => {
  try {
    const status = await ready;
    let res = null;
    const transfer = [];
    if (op === 'status') res = status;
    else if (op === 'open') {
      const o = C.open(args.data);
      docs.set(args.id, o.dxf);
      res = { layers: o.layers, hidden: o.hidden, units: o.units };
    } else if (op === 'render') {
      const dxf = docs.get(args.id);
      if (!dxf) throw new Error('gone');
      res = C.render(dxf, args.hidden, args.opts, { title: args.title, svg: args.svg !== false, pdf: args.pdf !== false });
      if (res.pdf) transfer.push(res.pdf);
    } else if (op === 'combine') {
      // documents may live in other workers, so the main process sends the file bytes along
      const items = args.items.map(it => ({ ...it, dxf: docs.get(it.id) || (it.data ? C.open(it.data).dxf : null) })).filter(it => it.dxf);
      res = C.combine(items, args.title);
      if (res.pdf) transfer.push(res.pdf);
    } else if (op === 'close') docs.delete(args.id);
    parentPort.postMessage({ seq, ok: true, res }, transfer);
  } catch (e) {
    parentPort.postMessage({ seq, ok: false, error: String(e && e.message || e) });
  }
});
