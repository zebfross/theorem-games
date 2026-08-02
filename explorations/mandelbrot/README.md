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
sharpen it after, and skip the interior. WebAssembly would come after all three,
and for this kernel it buys less than people expect — scalar float64 in a tight
loop is what JITs are best at. Its real advantages are SIMD, which JS has no
answer to, and arbitrary precision for zooms past the double-precision floor at
around 10^13, where the hard part is perturbation theory rather than the
language. Neither is worth a build step yet, and the repo has none.

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
- **Three passes**, at 8, 3 and 1 pixels per sample. The coarse pass is sixty-
  four times cheaper and lands immediately, so panning never shows a blank
  canvas, and it is blown up with hard edges rather than blurred so it is
  obvious the picture is still sharpening.
- **Colouring happens in the worker**, so what comes back is a plain RGBA buffer
  that can be transferred rather than copied.
- **Continuous escape time** rather than integer counts, with a bailout radius
  of 256 rather than 2 — the fractional part that smooths the bands is only
  accurate well past the threshold, so the extra iterations are paid gladly.

## Still to do

- **Perturbation theory**, for zooms past about 10^13 where double precision
  runs out and the picture goes blocky. The page says so when you reach it
  rather than quietly degrading.
- **SIMD**, which is the one place WebAssembly would clearly pay.
