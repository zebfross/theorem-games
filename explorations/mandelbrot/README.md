# Mandelbrot

Zoom into the boundary between the orbits that stay and the orbits that run
away. Drag to move, scroll to zoom, point at a bulb to be told its period.

## Not a game

There is nothing to arrange, no minimum to find and no way to lose, so it does
not use the engine and is not in the games registry. It lives on its own shelf
on the homepage. Dressing it up as a puzzle with an empty score would have been
worse than admitting what it is.

It earns its place here by having mathematics on the surface rather than
underneath:

- **The escape test is a theorem.** If |*z*| ever exceeds 2 the orbit is certain
  to run away, which is the only reason a picture can be drawn in finite time at
  all — without it there would be no moment at which a pixel could be declared
  outside.
- **Every bulb is a hyperbolic component**, and inside one the orbit settles
  onto an attracting cycle whose length is the same throughout that bulb.
  Pointing at a bulb runs the orbit until it settles and then measures how long
  it takes to return to itself, which names the bulb: period 2, 3, 5, and the
  Farey arithmetic between them.
- Douady and Hubbard proved the set connected; Shishikura proved its boundary
  has Hausdorff dimension 2.

## Speed, and whether WebAssembly is worth it

**Measured before writing any of it**, in node, on one thread — 1200×800 at 500
iterations:

| | whole set | deep zoom |
| --- | --- | --- |
| straight escape loop | 424 ms | 591 ms |
| + cardioid and bulb test | **54 ms** | 708 ms |

About 300 million iterations a second, and two things follow.

**The largest single win is six lines of algebra, not a faster language.** The
main cardioid and the period-2 bulb are interior, so every pixel in them runs to
the iteration limit before reporting that it never escaped — the most expensive
pixels on the screen. Two closed-form tests skip them: 424 ms down to 54 ms.

**But the same test made the deep zoom slower**, 591 ms to 708 ms, because once
you have zoomed away from those regions it can never fire and is pure tax. So it
is switched on only when the view still contains them. That only shows up if you
measure both cases.

So the order of work is: spread it over cores, draw something immediately and
sharpen it after, and skip the interior.

### WebAssembly was tried, and dropped

Written, shipped as a second explorer beside this one, compared, and taken back
out. The code is in the history at `76ee3f7` if it is ever worth another look.

It was a fair test rather than a token one: a 692-byte module assembled byte by
byte (this machine has no WebAssembly toolchain — no wat2wasm, no emscripten,
and Apple's clang cannot target wasm32), reading the same palette table as the
JavaScript kernel so that any difference in the picture would be a difference in
the arithmetic. There was almost none — identical iteration counts, and 99.99%
of pixels byte-identical, the rest off by one in a single channel from a
hand-rolled `log2`.

At 1200×800 on one thread:

| | JavaScript | WebAssembly | |
| --- | --- | --- | --- |
| whole set | 78 ms | 116 ms | **0.67×** |
| seahorse valley | 695 ms | 667 ms | 1.04× |
| deep zoom | 172 ms | 156 ms | 1.10× |

**A loss on the view with the most interior in it, and a rounding error on the
others.** Scalar float64 in a tight loop is exactly what a JIT is good at, and
hand-written WebAssembly has no register allocator behind it. Put side by side
in a real browser, nobody could tell them apart.

The one measurement that looked like a win — 610 ms against 210 ms — came from a
tab that was not visible, which throttles JavaScript hard and WebAssembly far
less. An artefact of automation, not anything a person would see.

So the ordering stands as it was guessed before any of it was built: spread it
over cores, draw something immediately and sharpen it after, and skip the
interior. WebAssembly is worth revisiting only for the two things JavaScript
genuinely cannot do — SIMD, and the arbitrary precision needed past the
double-precision floor at around 10^13, where the hard part is perturbation
theory rather than the language.

### A warning about measuring in a browser

Every timing taken through browser automation here was wrong, in three
compounding ways, because the tab was not visible:

- `requestAnimationFrame` is **suspended**, not throttled — the chain from the
  coarse pass to the sharp one simply stopped, and the picture stayed blocky for
  ever. This is a real bug for real users too: switch tabs mid-render and you
  would come back to an unfinished picture. Fixed by racing the frame callback
  against a timer, exactly as `engine/engine.js` already does for the same
  reason.
- `setTimeout(120)` was clamped to 466 ms, so the fallback dominated the
  reported wall time.
- The kernel itself ran at 135 Miter/s against 300 in node — background tabs are
  throttled for compute as well.

The number the page now reports is the compute time of the sharp pass alone, not
the wall time of the whole chain, so the waits between passes cannot flatter or
disgrace it. Judge the speed in a window you can see.

## How it draws

Plain JavaScript, no build step.

- **Workers**, one per core, fed from a queue of many small horizontal chunks
  rather than one band each. One band per core leaves whoever draws the middle
  doing nearly all of the work: the top and bottom of a view escape quickly and
  the middle is mostly set.
- **Presets are measured, not guessed.** Two of the first ones were duds — one
  99% interior, one entirely black — because they were picked by writing down
  coordinates that sounded right. They are now found by walking inwards, at each
  step re-centring on a patch that never escapes but is small enough that a few
  pixels away everything does, which is what a minibrot is. Scoring by the
  *variety* of escape counts was tried first and is a trap: noise maximises it,
  and the view it chose was static.
- **The previous picture is kept and stretched into place** the instant the
  view changes, so a zoom slides something sharp rather than flashing up a
  mosaic of 8-pixel blocks. That blockiness was the first thing anyone
  complained about, and it was never a speed problem — a faster kernel would
  only have reached the sharp pass sooner, showing the same blocks on the way.
  Coarse passes are drawn only when the stretch could not cover the new view —
  which is the case on the first render, and on any jump long enough that the
  kept picture would scale to millions of pixels wide. Gating that on merely
  *having* a previous picture rather than on having drawn it was a real bug: a
  jump to a deep preset then showed nothing at all until the sharp pass landed,
  twenty seconds of black that read as the location being empty.
- **Three passes**, at 8, 3 and 1 pixels per sample. The coarse pass is sixty-
  four times cheaper and lands immediately, so panning never shows a blank
  canvas, and it is blown up with hard edges rather than blurred so it is
  obvious the picture is still sharpening.
- **Colouring happens in the worker**, so what comes back is a plain RGBA buffer
  that can be transferred rather than copied — through a 1024-entry lookup table
  built once, rather than interpolating the ramp per pixel. That table was
  written so the WebAssembly kernel could be compared against this one fairly,
  and it is the one thing from that detour worth keeping.
- **Continuous escape time** rather than integer counts, with a bailout radius
  of 256 rather than 2 — the fractional part that smooths the bands is only
  accurate well past the threshold, so the extra iterations are paid gladly.

## Going deeper than a double

A double holds about sixteen significant digits, so once a pixel is narrower
than roughly 1e-15 the whole view rounds to the same number and the picture
goes blocky. That is about ten trillion times in — which sounds like plenty
until you get there, and it was the first thing anyone hit.

**Perturbation** gets past it, and the trick is that the *differences* stay
small even when the coordinates cannot. Take one reference point *C* near the
middle and compute its orbit *Z* in as much precision as you like. Any other
point is *c* = *C* + d*c*, with orbit *z* = *Z* + d*z*, and

    dz -> 2*Z*dz + dz² + dc

Every term there is tiny — d*c* is at most half a screen wide — so it all fits
in ordinary doubles. Only the reference needs the extra precision, and there is
one of those per frame rather than one per pixel. The explorer switches over on
its own and says which mode it is in.

The reference is a fixed-point BigInt: an integer counting units of 2^-220,
about 66 digits. No general big-float is needed, because every number here
lives within a few units of the origin. That puts the new floor around a zoom
of 1e60; the readout prints as many digits as the view can actually resolve,
straight from the fixed point rather than through a double.

**Rebasing** is what keeps it honest. If a point wanders far from the reference,
or the reference escapes first and runs out, d*z* stops being small and the
premise fails — which shows up as speckle. Zhuoran's fix: when |*z*| has become
smaller than |d*z*|, the point *z* is a better offset from the *start* of the
orbit than d*z* is from where we are, so restart there. One comparison, and no
hunting for glitched regions to re-render.

Checked rather than assumed. Against an arbiter that iterates wholly in fixed
point, at the same coordinates:

| | agreement |
| --- | --- |
| double spiral | 8100/8100 |
| antenna | 8100/8100 |
| seahorse valley | 8087/8100 |

The thirteen are boundary pixels whose true escape count needs more than the 53
bits the reference orbit is stored in — a limit of double arithmetic itself,
not of the perturbation, and adding Pauldelbrot's glitch criterion as a second
rebase trigger changed none of them.

## Still to do
- **SIMD**, the one place WebAssembly would clearly pay, and the reason to
  revisit it — see above for why the plain port did not.
- **Series approximation**, which skips the early iterations of a deep zoom
  wholesale. The deepest views now take seconds rather than a moment, and that
  is where the time goes.
