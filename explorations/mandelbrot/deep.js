'use strict';

/* Going deeper than a double can reach.
 *
 * A double carries about sixteen significant digits, so once a pixel is
 * narrower than about 1e-15 the whole view rounds to the same number and the
 * picture goes blocky. That is around ten trillion times in, which sounds like
 * plenty until you get there.
 *
 * The way past it is perturbation, and the trick is that the *differences* stay
 * small even when the coordinates do not. Take one reference point C near the
 * middle of the view and compute its orbit Z in as much precision as you like.
 * Any other point is c = C + dc, and its orbit is z = Z + dz, where
 *
 *     dz -> 2*Z*dz + dz^2 + dc
 *
 * Every quantity in that line is tiny — dc is at most half a screen wide — so
 * it all fits in ordinary doubles. Only the reference orbit needs the extra
 * precision, and there is exactly one of those per frame rather than one per
 * pixel.
 *
 * The reference is held as a fixed-point BigInt: an integer counting units of
 * 2^-SHIFT. Multiplying two of them multiplies the integers and shifts back.
 * There is no need for a general big-float, because every number here lives
 * within a few units of the origin.
 */

const SHIFT = 220n;                    // fractional bits: about 66 decimal digits
const SHIFT_N = Number(SHIFT);

/** A double as fixed point. Taken apart by exponent rather than multiplied by
 *  a power of two, which would overflow the double long before SHIFT. */
function fromNumber(x) {
  if (!x || !Number.isFinite(x)) return 0n;
  const neg = x < 0;
  x = Math.abs(x);
  const e = Math.floor(Math.log2(x));
  const m = BigInt(Math.round(x * 2 ** (52 - e)));   // 53 significant bits
  const sh = SHIFT + BigInt(e - 52);
  const v = sh >= 0n ? m << sh : m >> -sh;
  return neg ? -v : v;
}

/** Back to a double, keeping the top 53 bits — all one can hold anyway. */
function toNumber(v) {
  if (v === 0n) return 0;
  const neg = v < 0n;
  if (neg) v = -v;
  const bits = v.toString(2).length;
  const drop = Math.max(0, bits - 53);
  const m = Number(v >> BigInt(drop));
  const r = m * 2 ** (drop - SHIFT_N);
  return neg ? -r : r;
}

const mul = (a, b) => (a * b) >> SHIFT;

/** The orbit of the reference point, in fixed point, kept as doubles.
 *
 *  Doubles are all the perturbed iteration ever reads: Z is only ever added to
 *  a small dz, so its own last few bits do not matter. What matters is that Z
 *  was *computed* without rounding, which is why the loop runs in BigInt.
 *
 *  Stops early if the reference escapes. That is not a failure — the pixels
 *  that need more iterations rebase onto the start of the orbit instead.
 */
function referenceOrbit(cx, cy, maxIter) {
  const Zr = new Float64Array(maxIter + 1);
  const Zi = new Float64Array(maxIter + 1);
  let zr = 0n;
  let zi = 0n;
  let n = 0;
  for (; n <= maxIter; n++) {
    const dr = toNumber(zr);
    const di = toNumber(zi);
    Zr[n] = dr;
    Zi[n] = di;
    if (dr * dr + di * di > 4) { n++; break; }
    const zr2 = mul(zr, zr);
    const zi2 = mul(zi, zi);
    const cross = mul(zr, zi);
    zi = 2n * cross + cy;
    zr = zr2 - zi2 + cx;
  }
  return { Zr, Zi, len: n };
}

/** The escape count for one pixel, as an offset from the reference orbit.
 *
 *  Everything here is a double. dc is the pixel's offset from the reference,
 *  at most half a screen; dz stays comparably small, and the reference carries
 *  the magnitude.
 *
 *  The one subtlety is rebasing. If the perturbed point wanders far from the
 *  reference — or the reference escapes first and runs out — then dz is no
 *  longer small and the whole premise fails, which shows up as speckled
 *  "glitch" pixels. Zhuoran's fix is neat: when |z| has become smaller than
 *  |dz|, the point z is itself a better offset from the *start* of the orbit
 *  than dz is from where we are, so restart there. It costs one comparison and
 *  removes the need to hunt for glitched regions and re-render them against
 *  new references.
 */
function escapePerturbed(dcr, dci, ref, maxIter, bailout) {
  let dzr = 0;
  let dzi = 0;
  let m = 0;                       // where we are in the reference orbit
  for (let n = 0; n < maxIter; n++) {
    const Zr = ref.Zr[m];
    const Zi = ref.Zi[m];
    const zr = Zr + dzr;
    const zi = Zi + dzi;
    const mag = zr * zr + zi * zi;
    if (mag > bailout) return { n, mag };

    // rebase: the point itself is the better offset now
    if (mag < dzr * dzr + dzi * dzi || m + 1 >= ref.len) {
      dzr = zr;
      dzi = zi;
      m = 0;
    }

    const Ar = ref.Zr[m];
    const Ai = ref.Zi[m];
    const ndzr = 2 * (Ar * dzr - Ai * dzi) + dzr * dzr - dzi * dzi + dcr;
    const ndzi = 2 * (Ar * dzi + Ai * dzr) + 2 * dzr * dzi + dci;
    dzr = ndzr;
    dzi = ndzi;
    m++;
  }
  return { n: maxIter, mag: 0 };
}

/** A decimal string as fixed point, so a place worth returning to can be
 *  written down in full. A double would round it to sixteen digits, which at
 *  these depths is not enough to find the spot again. */
function fromDecimalString(text) {
  const m = /^\s*(-?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!m) return 0n;
  const frac = m[3] || '';
  const digits = BigInt((m[2] || '0') + frac);
  const v = (digits << SHIFT) / 10n ** BigInt(frac.length);
  return m[1] === '-' ? -v : v;
}

/** Fixed point as a decimal string, so a deep centre can be shown in full.
 *
 *  Converting to a double first would throw away everything past the sixteenth
 *  digit, which at these depths is most of the address.
 */
function toDecimalString(v, digits) {
  const neg = v < 0n;
  if (neg) v = -v;
  const scaled = (v * 10n ** BigInt(digits)) >> SHIFT;
  const s = scaled.toString().padStart(digits + 1, '0');
  const whole = s.slice(0, s.length - digits);
  const frac = s.slice(s.length - digits);
  return (neg ? '-' : '') + whole + (digits ? '.' + frac : '');
}

if (typeof module !== 'undefined') {
  module.exports = { SHIFT, fromNumber, toNumber, toDecimalString,
                    fromDecimalString, mul,
                    referenceOrbit, escapePerturbed };
}
