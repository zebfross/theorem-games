'use strict';

/* One horizontal chunk of the picture, coloured and handed back.
 *
 * Colouring happens here rather than on the main thread, so what goes back is a
 * plain RGBA buffer that can be transferred rather than copied.
 *
 * A classic worker rather than a module one, so it can be started with a bare
 * `new Worker(url)` and needs nothing from the rest of the page.
 */

const BAILOUT = 256;
const STEPS = 1024;              // entries around the palette

/* A palette that belongs with the rest of the site: deep teal, up through the
   rope brass, to cream, and back. Stops rather than sine waves — sines are
   quick to write and give you a rainbow, which is a different site's picture. */
const RAMP = [
  [10, 30, 26],
  [26, 72, 64],
  [58, 116, 96],
  [154, 158, 104],
  [217, 164, 65],
  [242, 233, 214],
  [138, 90, 28],
];
const INTERIOR = [7, 18, 15];    // the set itself, near black

/** The palette flattened into one word per step, plus the interior at the end.
 *
 *  Little-endian ABGR, which is what a Uint32 view of RGBA bytes looks like, so
 *  a pixel is one store rather than four.
 */
function buildTable() {
  const t = new Uint32Array(STEPS + 1);
  for (let i = 0; i < STEPS; i++) {
    const at = (i / STEPS) * RAMP.length;
    const k = Math.floor(at);
    const f = at - k;
    const a = RAMP[k % RAMP.length];
    const b = RAMP[(k + 1) % RAMP.length];
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    t[i] = (255 << 24) | (bl << 16) | (g << 8) | r;
  }
  t[STEPS] = (255 << 24) | (INTERIOR[2] << 16) | (INTERIOR[1] << 8) | INTERIOR[0];
  return t;
}
const TABLE = buildTable();

/** Is c in the main cardioid or the period-2 bulb?
 *
 *  Both are interior, so every pixel in them runs to the iteration limit and
 *  then reports that it never escaped — the most expensive pixels on the
 *  screen. Two closed-form tests skip them outright.
 */
function inMainBody(cr, ci) {
  const x = cr - 0.25;
  const q = x * x + ci * ci;
  if (q * (q + x) <= 0.25 * ci * ci) return true;
  const b = cr + 1;
  return b * b + ci * ci <= 0.0625;
}

function render(px, w, rows, x0, y0, step, maxIter, useBulb) {
  let total = 0;
  for (let py = 0; py < rows; py++) {
    const ci = y0 + py * step;
    for (let x = 0; x < w; x++) {
      const cr = x0 + x * step;
      const o = py * w + x;

      if (useBulb && inMainBody(cr, ci)) {
        total++;
        px[o] = TABLE[STEPS];
        continue;
      }

      let zr = 0;
      let zi = 0;
      let zr2 = 0;
      let zi2 = 0;
      let n = 0;
      while (n < maxIter && zr2 + zi2 < BAILOUT) {
        zi = 2 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
        zr2 = zr * zr;
        zi2 = zi * zi;
        n++;
      }
      total += n;

      if (n >= maxIter) {
        px[o] = TABLE[STEPS];
        continue;
      }
      // Continuous escape time: n plus how far past the bailout the orbit
      // overshot, which turns the integer bands into a smooth gradient.
      const mu = n + 1 - Math.log2(Math.log2(zr2 + zi2) * 0.5);
      const t = Math.sqrt(mu) * 0.19;
      px[o] = TABLE[Math.trunc((t - Math.floor(t)) * STEPS) & (STEPS - 1)];
    }
  }
  return total;
}

self.onmessage = (ev) => {
  const { job, w, rows, x0, y0, step, maxIter, useBulb } = ev.data;
  const out = new Uint8ClampedArray(w * rows * 4);
  const iterations = render(
    new Uint32Array(out.buffer), w, rows, x0, y0, step, maxIter, useBulb);
  self.postMessage({ job, rows, out, iterations }, [out.buffer]);
};
