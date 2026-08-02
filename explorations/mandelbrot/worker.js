'use strict';

/* One horizontal band of the picture, coloured and handed back.
 *
 * Colouring happens here rather than on the main thread: the result is then a
 * plain RGBA buffer that can be transferred rather than copied, and the main
 * thread does nothing but blit it.
 *
 * A classic worker rather than a module one, so it can be started with a bare
 * `new Worker(url)` and needs nothing from the rest of the page.
 */

// Bigger than the escape radius of 2 that the maths needs. Escape time is an
// integer, and an integer makes bands; the fractional part that smooths them
// out is only accurate once |z| is well past the threshold, so the loop is let
// run to a much larger bailout and the extra iterations are paid gladly.
const BAILOUT = 256;
const LOG2 = Math.log(2);

/** Is c in the main cardioid or the period-2 bulb?
 *
 *  Both are interior, so every pixel in them runs to the iteration limit and
 *  then reports that it never escaped — they are the most expensive pixels on
 *  the screen. Two closed-form tests skip them outright.
 */
function inMainBody(cr, ci) {
  const x = cr - 0.25;
  const q = x * x + ci * ci;
  if (q * (q + x) <= 0.25 * ci * ci) return true;
  const b = cr + 1;
  return b * b + ci * ci <= 0.0625;
}

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

function colour(out, o, mu, maxIter) {
  if (mu >= maxIter) {
    // The set itself, near black: it is the one region that is not a count of
    // anything, and colouring it would suggest it were.
    out[o] = 7; out[o + 1] = 18; out[o + 2] = 15; out[o + 3] = 255;
    return;
  }
  // Square-rooted, because escape counts crowd together near the boundary and
  // spread out away from it; this evens the bands into something like equal
  // widths.
  const t = Math.sqrt(mu) * 0.19;
  const at = (t - Math.floor(t)) * RAMP.length;
  const i = Math.floor(at);
  const f = at - i;
  const a = RAMP[i % RAMP.length];
  const b = RAMP[(i + 1) % RAMP.length];
  out[o] = a[0] + (b[0] - a[0]) * f;
  out[o + 1] = a[1] + (b[1] - a[1]) * f;
  out[o + 2] = a[2] + (b[2] - a[2]) * f;
  out[o + 3] = 255;
}

self.onmessage = (ev) => {
  const { job, w, rows, x0, y0, step, maxIter, useBulb } = ev.data;
  const out = new Uint8ClampedArray(w * rows * 4);
  let iterations = 0;

  for (let py = 0; py < rows; py++) {
    const ci = y0 + py * step;
    for (let px = 0; px < w; px++) {
      const cr = x0 + px * step;
      const o = (py * w + px) * 4;

      if (useBulb && inMainBody(cr, ci)) {
        iterations++;
        colour(out, o, maxIter, maxIter);
        continue;
      }

      let zr = 0;
      let zi = 0;
      let n = 0;
      let zr2 = 0;
      let zi2 = 0;
      while (n < maxIter && zr2 + zi2 <= BAILOUT) {
        zi = 2 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
        zr2 = zr * zr;
        zi2 = zi * zi;
        n++;
      }
      iterations += n;

      if (n >= maxIter) {
        colour(out, o, maxIter, maxIter);
      } else {
        // Continuous escape time: n plus how far past the bailout the orbit
        // overshot, which turns the integer bands into a smooth gradient.
        const mag = Math.log(zr2 + zi2) / 2;
        const nu = Math.log(mag / LOG2) / LOG2;
        colour(out, o, n + 1 - nu, maxIter);
      }
    }
  }

  self.postMessage({ job, rows, out, iterations }, [out.buffer]);
};
