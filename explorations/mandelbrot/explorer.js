'use strict';

/* A Mandelbrot explorer.
 *
 * Not a game — there is no arrangement to make, nothing to minimise and no way
 * to lose — so it does not use the engine. It is here because the thing worth
 * looking at is mathematical: the bulbs hanging off the main cardioid each hold
 * an attracting cycle of their own period, and the explorer names it for you as
 * you point at them.
 *
 * Everything is plain JavaScript across web workers. The kernel is scalar
 * float64 arithmetic in a tight loop, which is what JITs are best at — measured
 * at about 300 million iterations a second on one core here — so the wins come
 * from spreading it over cores, from drawing something immediately and
 * sharpening it afterwards, and from not computing the interior at all, rather
 * than from a faster language.
 */

// Resolved against this script rather than the page, so the worker is found
// wherever the page including it happens to live.
const WORKER_URL = new URL('worker.js?v=6', document.currentScript.src).href;

const CORES = Math.max(2, Math.min(12, navigator.hardwareConcurrency || 4));
// Coarse first, then sharper. The coarse pass is 64 times cheaper and lands
// almost instantly, so panning and zooming never show a blank canvas.
const PASSES = [8, 3, 1];

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d', { alpha: false });
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d');
// The last finished sharp picture, kept so that the next one can be covered by
// stretching this rather than by showing coarse blocks.
const snap = document.createElement('canvas');
const nctx = snap.getContext('2d', { alpha: false });

const el = (id) => document.getElementById(id);

/** Hand back to the browser between passes, and always come back.
 *
 *  Not a bare requestAnimationFrame. A tab that is not visible does not merely
 *  throttle those, it can stop delivering them altogether, and the chain from
 *  the coarse pass to the sharp one then never continues — switch tabs while it
 *  is drawing and you return to a permanently blocky picture. Timers keep
 *  firing, so whichever arrives first wins. The engine learned this the same
 *  way; see the note on `schedule` in engine/engine.js. */
function soon(fn) {
  let done = false;
  const once = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(once);
  setTimeout(once, 120);
}

// The centre is fixed-point, not a double: past about ten trillion times in, a
// double no longer has the digits to tell one pixel from the next. Everything
// else — the width of the view, every offset from the centre — stays a double,
// because those stay small however far in you go.
const app = {
  cx: fromNumber(-0.6),
  cy: 0n,
  span: 3.2,            // width of the view in complex units
  job: 0,
  workers: [],
  pending: 0,
  started: 0,
  passIters: 0,
  snapAt: null,          // the view `snap` holds, or null if it holds nothing
  deep: false,           // perturbing against a reference orbit?
  ref: null,
};

/** Below this many units per pixel a double cannot separate one pixel from its
 *  neighbour, and the picture has to be computed as offsets from a reference
 *  instead. Set an order of magnitude above the true floor, so the change
 *  happens before anything is visibly wrong. */
const DOUBLE_FLOOR = 2e-14;

/** Pixel offsets from the centre, which is what the workers actually need. */
function offsetOf(px, py) {
  const scale = app.span / canvas.width;
  return [(px - canvas.width / 2) * scale, (py - canvas.height / 2) * scale];
}

function maxIterations() {
  // More depth as the view narrows: shallow zooms do not need it, and deep ones
  // are all boundary, where the count is what separates one filament from the
  // next.
  return Math.min(12000,
    Math.round(120 + 140 * Math.max(0, Math.log10(3.2 / app.span)) ** 1.25));
}

/** Does the view still contain the cardioid or the period-2 bulb?
 *
 *  The closed-form interior test is worth about eight times on the home view
 *  and is a small tax once you have zoomed away from them, where it can never
 *  fire — measured at 424ms against 54ms zoomed out, and 591ms against 708ms
 *  zoomed in. So it is switched off when it cannot pay.
 */
function bulbTestWorthIt() {
  if (app.deep) return false;          // nowhere near them at that depth
  const cx = toNumber(app.cx);
  const cy = toNumber(app.cy);
  const halfW = app.span / 2;
  const halfH = (app.span * canvas.height / canvas.width) / 2;
  return cx - halfW < 0.4 && cx + halfW > -1.3
    && cy - halfH < 0.7 && cy + halfH > -0.7;
}

function boot() {
  for (let i = 0; i < CORES; i++) {
    const w = new Worker(WORKER_URL);
    w.onmessage = onBand;
    app.workers.push(w);
  }
  el('cores').textContent = CORES;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  render();
}

function render() {
  app.job++;
  app.started = performance.now();

  // One reference orbit per frame, computed in full precision, shared by every
  // worker. This is the only arbitrary-precision work in the whole renderer.
  app.deep = app.span / canvas.width < DOUBLE_FLOOR;
  if (app.deep) {
    app.ref = referenceOrbit(app.cx, app.cy, maxIterations());
    for (const w of app.workers) {
      w.postMessage({ setRef: true, job: app.job, len: app.ref.len,
                      Zr: app.ref.Zr, Zi: app.ref.Zi });
    }
  } else {
    app.ref = null;
  }

  // Show the last sharp picture, stretched to where it now belongs, before any
  // of the new one exists. Zooming then slides and scales something sharp
  // instead of flashing up a block mosaic — the coarse passes are still what
  // computes, they just no longer have to be looked at.
  reproject();
  runPass(0);
  status();
}

/** Draw the kept picture into the current view. */
function reproject() {
  const s = app.snapAt;
  if (!s) return false;
  const perPx = app.span / canvas.width;
  const sH = s.span * canvas.height / canvas.width;
  // The gap between two centres is small even when the centres themselves are
  // long numbers, so it is taken in fixed point and only then made a double.
  const gx = toNumber(s.cx - app.cx);
  const gy = toNumber(s.cy - app.cy);
  const dx = (gx - s.span / 2) / perPx + canvas.width / 2;
  const dy = (gy - sH / 2) / perPx + canvas.height / 2;
  const dw = s.span / perPx;
  const dh = sH / perPx;
  // Far enough away and the stretch is worse than nothing.
  if (dw < canvas.width / 24 || dw > canvas.width * 24) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#0a1512';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snap, 0, 0, snap.width, snap.height, dx, dy, dw, dh);
  return true;
}

/** Draw the whole picture at one coarseness, then queue the next one. */
function runPass(passIndex) {
  const job = app.job;
  const step = PASSES[passIndex];
  const w = Math.max(1, Math.ceil(canvas.width / step));
  const h = Math.max(1, Math.ceil(canvas.height / step));
  const scale = app.span / canvas.width * step;
  // Offsets from the centre rather than absolute coordinates, which is what
  // lets the deep path work at all — these stay small however far in you are.
  const x0 = -(w / 2) * scale;
  const y0 = -(h / 2) * scale;
  const maxIter = maxIterations();
  const useBulb = bulbTestWorthIt();

  scratch.width = w;
  scratch.height = h;

  // Many more chunks than workers, handed out as each one finishes. Splitting
  // the picture into one band per core instead leaves whoever draws the middle
  // doing nearly all the work while the rest sit idle: the top and bottom of a
  // view are mostly fast-escaping pixels and the middle is mostly set.
  const chunk = Math.max(1, Math.ceil(h / (app.workers.length * 6)));
  app.queue = [];
  for (let from = 0; from < h; from += chunk) {
    app.queue.push({ from, rows: Math.min(chunk, h - from) });
  }
  app.pending = 0;
  app.passIters = 0;
  app.pass = { job, passIndex, w, h, step, x0, y0, scale, maxIter, useBulb,
               deep: app.deep, cxd: toNumber(app.cx), cyd: toNumber(app.cy),
               t0: performance.now() };

  for (const worker of app.workers) feed(worker);
  if (!app.pending) finishPass();
}

/** Give a worker the next chunk, if there is one left. */
function feed(worker) {
  const next = app.queue.pop();
  if (!next) return;
  const p = app.pass;
  app.pending++;
  worker._at = next.from;
  worker.postMessage({
    job: p.job, w: p.w, rows: next.rows, x0: p.x0,
    y0: p.y0 + next.from * p.scale, step: p.scale,
    maxIter: p.maxIter, useBulb: p.useBulb,
    deep: p.deep, cx: p.cxd, cy: p.cyd,
  });
}

function onBand(ev) {
  const { job, rows, out, iterations } = ev.data;
  if (job !== app.job) return;                 // a stale band from an old view
  const p = app.pass;
  const at = ev.target._at;

  app.passIters += iterations;

  const img = new ImageData(out, p.w, rows);
  sctx.putImageData(img, 0, at);

  app.pending--;
  feed(ev.target);
  if (app.pending === 0) finishPass();
}

function finishPass() {
  const p = app.pass;
  // A coarse pass is only worth showing when there is nothing better already on
  // the canvas. Once a previous picture has been stretched into place, drawing
  // 8-pixel blocks over it is a step backwards, which is exactly what the
  // blockiness while zooming was.
  if (p.step <= 3 || !app.snapAt) {
    ctx.imageSmoothingEnabled = p.step > 1;
    ctx.drawImage(scratch, 0, 0, p.w, p.h, 0, 0, canvas.width, canvas.height);
  }

  if (p.passIndex + 1 < PASSES.length) {
    soon(() => {
      if (p.job === app.job) runPass(p.passIndex + 1);
    });
  } else {
    // The compute time of the sharp pass, not the wall time of the whole
    // chain. The chain waits for the browser to paint between passes, and a
    // hidden tab clamps that wait to something near a second, which would
    // otherwise swamp the number being reported.
    // Keep the finished article, and the view it belongs to, for the next move.
    snap.width = canvas.width;
    snap.height = canvas.height;
    nctx.drawImage(canvas, 0, 0);
    app.snapAt = { cx: app.cx, cy: app.cy, span: app.span };
    status(performance.now() - p.t0);
  }
}

/* ---------- what the numbers mean ---------- */

function status(ms) {
  const perPixel = app.span / canvas.width;
  el('zoom').textContent = fmtZoom(3.2 / app.span);
  // As many digits as the view can actually resolve, printed from the fixed
  // point rather than through a double, which would stop at sixteen.
  const digits = Math.min(64, Math.max(4, Math.ceil(-Math.log10(perPixel)) + 1));
  const im = toDecimalString(app.cy < 0n ? -app.cy : app.cy, digits);
  el('centre').textContent =
    `${toDecimalString(app.cx, digits)} ${app.cy < 0n ? '−' : '+'} ${im}i`;
  el('iter').textContent = maxIterations();
  el('timing').textContent = ms === undefined ? 'drawing…'
    : `${ms.toFixed(0)} ms · ${(app.passIters / 1e6).toFixed(0)}M iterations · `
      + `${(app.passIters / ms / 1000).toFixed(0)} Miter/s`;
  // Only a real limit now: the fixed point runs out around 2^-220.
  el('limit').hidden = perPixel > 1e-60;
  el('mode').textContent = app.deep ? 'perturbed' : 'direct';
}

function fmtZoom(z) {
  if (z < 1000) return `${z.toFixed(1)}×`;
  const e = Math.floor(Math.log10(z));
  return `${(z / 10 ** e).toFixed(2)}×10^${e}`;
}

/** The period of the attracting cycle at c, or 0 if the orbit escapes.
 *
 *  Every bulb hanging off the cardioid is a hyperbolic component: inside it the
 *  orbit settles onto a cycle, and the length of that cycle is the same for the
 *  whole bulb. So letting the orbit settle and then measuring how long it takes
 *  to come back to itself names the bulb you are pointing at.
 */
function periodAt(cr, ci) {
  let zr = 0;
  let zi = 0;
  for (let n = 0; n < 3000; n++) {          // let it settle onto the cycle
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > 4) return 0;
  }
  const ar = zr;
  const ai = zi;
  for (let q = 1; q <= 512; q++) {
    const t = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = t;
    if (zr * zr + zi * zi > 4) return 0;
    if (Math.abs(zr - ar) < 1e-11 && Math.abs(zi - ai) < 1e-11) return q;
  }
  return -1;                                 // settled, but no short cycle
}

/* ---------- getting about ---------- */

/** Where the pointer is, as an offset from the centre. Never absolute: at
 *  depth the absolute coordinate does not fit in a double, but the offset
 *  always does. */
function pointerOffset(ev) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  return offsetOf((ev.clientX - rect.left) * dpr, (ev.clientY - rect.top) * dpr);
}

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const [ox, oy] = pointerOffset(ev);
  const k = Math.exp(ev.deltaY * 0.0016);
  const span = Math.min(6, app.span * k);
  // Zoom about the pointer, so the point under it stays put. Written as a shift
  // of the centre by a small amount rather than as a formula in absolute
  // coordinates, which is what keeps it exact at depth.
  const move = 1 - span / app.span;
  app.cx += fromNumber(ox * move);
  app.cy += fromNumber(oy * move);
  app.span = span;
  render();
}, { passive: false });

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  drag = { x: ev.clientX, y: ev.clientY, cx: app.cx, cy: app.cy };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (drag) {
    const rect = canvas.getBoundingClientRect();
    const scale = app.span / rect.width;
    app.cx = drag.cx - fromNumber((ev.clientX - drag.x) * scale);
    app.cy = drag.cy - fromNumber((ev.clientY - drag.y) * scale);
    render();
    return;
  }
  // The period is worked out in plain doubles, so it is only meaningful while
  // the coordinates still fit in them.
  if (app.deep) { el('period').textContent = 'too deep to name'; return; }
  const [ox, oy] = pointerOffset(ev);
  const q = periodAt(toNumber(app.cx) + ox, toNumber(app.cy) + oy);
  el('period').textContent = q > 0 ? `period ${q}`
    : q === 0 ? 'outside the set' : 'inside';
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

el('reset').addEventListener('click', () => {
  app.cx = fromNumber(-0.6);
  app.cy = 0n;
  app.span = 3.2;
  render();
});

for (const btn of document.querySelectorAll('[data-goto]')) {
  btn.addEventListener('click', () => {
    // Coordinates stay text all the way into fixed point: routing them through
    // a double would round away everything past the sixteenth digit, which is
    // most of a deep address.
    const [x, y, s] = btn.dataset.goto.split(',');
    app.cx = fromDecimalString(x);
    app.cy = fromDecimalString(y);
    app.span = Number(s);
    render();
  });
}

window.addEventListener('resize', resize);
boot();
resize();
