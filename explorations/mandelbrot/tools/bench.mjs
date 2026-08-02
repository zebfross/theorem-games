/* Time the two kernels against each other, and check they agree.
 *
 * Run with:  node tools/bench.mjs
 *
 * Worth running rather than trusting a number written down: the answer moves
 * about a great deal with the engine and the view, and the two kernels came out
 * on opposite sides of even in node and in a throttled browser tab.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bytes = fs.readFileSync(path.join(here, '..', 'mandel.wasm'));

const STEPS = 1024;
const LUT = 0;
const OUT = (STEPS + 1) * 4;
const RAMP = [[10, 30, 26], [26, 72, 64], [58, 116, 96], [154, 158, 104],
              [217, 164, 65], [242, 233, 214], [138, 90, 28]];

const memory = new WebAssembly.Memory({ initial: 400 });
const { instance } = await WebAssembly.instantiate(bytes, { env: { mem: memory } });
const render = instance.exports.render;

const table = new Uint32Array(memory.buffer, LUT, STEPS + 1);
for (let i = 0; i < STEPS; i++) {
  const at = (i / STEPS) * RAMP.length;
  const k = Math.floor(at);
  const f = at - k;
  const a = RAMP[k % RAMP.length];
  const b = RAMP[(k + 1) % RAMP.length];
  table[i] = (255 << 24) | (Math.round(a[2] + (b[2] - a[2]) * f) << 16)
    | (Math.round(a[1] + (b[1] - a[1]) * f) << 8) | Math.round(a[0] + (b[0] - a[0]) * f);
}
table[STEPS] = (255 << 24) | (15 << 16) | (18 << 8) | 7;

function js(out, w, rows, x0, y0, step, maxIter, useBulb) {
  const lut = new Uint32Array(memory.buffer, LUT, STEPS + 1);
  const px = new Uint32Array(memory.buffer, out, w * rows);
  let total = 0;
  for (let py = 0; py < rows; py++) {
    const ci = y0 + py * step;
    for (let x = 0; x < w; x++) {
      const cr = x0 + x * step;
      const o = py * w + x;
      if (useBulb) {
        const q = (cr - 0.25) ** 2 + ci * ci;
        if (q * (q + (cr - 0.25)) <= 0.25 * ci * ci || (cr + 1) ** 2 + ci * ci <= 0.0625) {
          total++; px[o] = lut[STEPS]; continue;
        }
      }
      let zr = 0, zi = 0, zr2 = 0, zi2 = 0, n = 0;
      while (n < maxIter && zr2 + zi2 < 256) {
        zi = 2 * zr * zi + ci; zr = zr2 - zi2 + cr; zr2 = zr * zr; zi2 = zi * zi; n++;
      }
      total += n;
      if (n >= maxIter) { px[o] = lut[STEPS]; continue; }
      const mu = n + 1 - Math.log2(Math.log2(zr2 + zi2) * 0.5);
      const t = Math.sqrt(mu) * 0.19;
      px[o] = lut[Math.trunc((t - Math.floor(t)) * STEPS) & (STEPS - 1)];
    }
  }
  return total;
}

const W = 1200, H = 800, OUT2 = OUT + W * H * 4;

function run(label, cx, cy, span, maxIter, bulb) {
  const step = span / W;
  const x0 = cx - W / 2 * step;
  const y0 = cy - H / 2 * step;
  js(OUT2, 60, 40, x0, y0, step, maxIter, bulb);            // warm the JIT
  render(OUT, LUT, 60, 40, x0, y0, step, maxIter, bulb);

  let t = performance.now();
  const ij = js(OUT2, W, H, x0, y0, step, maxIter, bulb);
  const mj = performance.now() - t;
  t = performance.now();
  const iw = render(OUT, LUT, W, H, x0, y0, step, maxIter, bulb);
  const mw = performance.now() - t;

  const a = new Uint32Array(memory.buffer, OUT, W * H);
  const b = new Uint32Array(memory.buffer, OUT2, W * H);
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;

  console.log(`${label.padEnd(12)} js ${mj.toFixed(0).padStart(5)}ms `
    + `(${(ij / mj / 1000).toFixed(0).padStart(4)} Miter/s)   `
    + `wasm ${mw.toFixed(0).padStart(5)}ms (${(iw / mw / 1000).toFixed(0).padStart(4)} Miter/s)   `
    + `${(mj / mw).toFixed(2)}x   `
    + `${iw === ij ? 'same count' : 'COUNTS DIFFER'}, `
    + `${(100 * same / a.length).toFixed(2)}% pixels identical`);
}

console.log(`${W}x${H}, one thread\n`);
run('whole set', -0.6, 0, 3.2, 500, 1);
run('seahorse', -0.7436438870371587, 0.1318259042053119, 3e-5, 1200, 0);
run('deep', -0.10109636384562, 0.95628651080914, 4e-6, 2500, 0);
