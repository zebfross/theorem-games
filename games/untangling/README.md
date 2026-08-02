# Untangling — in progress

A game on Chang and Erickson's result that a closed curve with *n* self
crossings needs Θ(n^{3/2}) homotopy moves to become simple. You are given a
tangled curve and untangle it yourself, in as few moves as you can.

The moves are the usual three, read off the faces of the drawing:

| face | move | crossings |
| --- | --- | --- |
| 1 corner, a monogon | R1, collapse it | −1 |
| 2 corners, a bigon | R2, collapse it | −2 |
| 3 corners, a triangle | R3, flip it | unchanged |

## Status

**Not playable yet.** The combinatorial layer, the collapsing moves, the solver
and the drawing are built and checked, and the engine can now be played move by
move. What is missing is the level pack and the game module itself.

### How much of it works

Building every level's full state graph and drawing every diagram in it, then
asking the question that actually decides shippability — **is there a route to
the simple curve in par using only moves that can be drawn?** Over all 498
single-curve drawings in the Unpinning pack, 6½ minutes altogether:

| crossings | curves | playable in par | need R3 |
| --- | --- | --- | --- |
| 4-7 | 16 | 16 | 0 |
| 8 | 27 | 23 | 1 |
| 9 | 100 | 90 | 1 |
| 10 | 355 | 312 | 6 |
| **all** | **498** | **441 (89%)** | **8** |

So a pack of 441 levels can be built today with no further work on the
drawing. The 57 that fall short are almost all 10 crossings, where a longer
optimal route gives the drawing more chances to block it.

### What the solver settled

Two things follow, and both make what is left much smaller than feared.

**The reachable graph is tiny.** The worst level holds 83 diagrams. So
precomputing every reachable diagram offline and shipping a drawing with each
is comfortably affordable, and a move at runtime is a lookup rather than live
geometry surgery — the part most likely to have sunk the idea.

**R3 is barely needed.** 490 of 498 curves reduce with collapses alone; only 8
ever need a triangle flip to expose something collapsible. A first playable
version can offer R1 and R2 only and not ship those 8, taking the fiddliest
surgery off the critical path. (An earlier count here said 6, from a smaller
run; the full sweep finds 8, none of them merely hitting the search cap.)

Done, in `tools/diagram.py`:

- A curve is read off an actual drawing into darts — four per crossing,
  ordered anticlockwise, paired along edges — because the drawing is what the
  game has to show anyway and the anticlockwise order is right there in it.
- Faces come out as orbits of `sigma . alpha`, so a face's degree is the number
  of crossings around it, which is what the moves key off.
- A canonical Gauss code, minimised over rotation, direction and relabelling,
  for recognising a diagram already seen during a search.

Checked against all 498 single-curve drawings in the Unpinning pack: every one
builds, Euler's formula holds on every one, the crossing counts agree, and the
face degrees match the region degrees the source catalogue published
independently. Every curve starts with between 5 and 10 moves available.

Also done:

- Collapsing a monogon or a bigon, which turns out to be a deletion from the
  code and nothing else: pulling the strands apart leaves the order in which
  the curve meets everything else exactly as it was. Every collapse tried
  produced a valid diagram with the expected number of crossings.
- Breadth-first search to the simple curve, keyed by canonical Gauss code,
  which gives par.

### The drawing, so far

`tools/surgery.py` edits the drawing in place after a move, and checks itself:
every edit is accepted only if rebuilding a diagram from the new drawing gives
back exactly what the combinatorial move predicts. That check is what makes
approximate geometry safe to attempt at all.

**It succeeds on 84% of bigon collapses**, which turns into the 89% of levels
above, since a level survives a failed move as long as some other
best-possible route is still drawable.

What works and what does not:

- Cutting a loop out for an R1 is exact. It never comes up here though: the
  source catalogue holds only irreducible curves, so across all 498 there are
  1912 bigons and not one monogon.
- Translating a bigon's arc sideways does not work at all, 0%. A lens can pair
  a short arc with a long curved one, and shoving the long one along a fixed
  direction drags it through unrelated parts of the curve. It moves the
  crossings rather than removing them.
- Sliding one arc across the lens, by replacing it with a copy of the arc it
  has to clear nudged just past it, works 56% of the time on its own. Trying
  more offsets and easing the ends bought nothing, so the rest needed a
  different construction rather than tuning.
- Contracting the lens — replacing both arcs by the line midway between them,
  parting them by a whisker, and fading the parting into the curve either side
  — is what an R2 physically is: the two crossings slide together and cancel.
  Offering both constructions and keeping whichever verifies takes it to 84%,
  because they fail on different lenses.
- The self-check had a hole worth remembering: the drawing was evened out
  *after* being verified, and evening it out moves points, which can add or
  lose a crossing. So the drawing handed back was not always the one that
  passed. It read as a higher success rate than was real, and worse, the next
  move was then drawn on top of a diagram the maths never sanctioned — one
  seven-crossing curve wandered into 301 states when only 5 are reachable.
  Resampling now happens inside the check.

Still to do:

- **The level pack and the game module.** Nothing blocks these now: 441 levels
  verify, and the engine takes a move-by-move game.
- **Closing the gaps**, or shipping around them. The 57 levels that fall short
  are almost all 10 crossings. Shipping only the 441 that verify is a perfectly
  good first pack; the alternative is a third construction.
- **Speed**, partly. Each collapse tries about eighty candidate drawings and
  checks each by rebuilding the whole arrangement, so that rebuild is the
  entire cost of building a pack. Finding the crossings by a grid over the
  segments rather than by comparing all pairs took it from 24ms to 0.6ms on a
  370-point curve, 40x, giving identical diagrams on all 498. Still untried:
  ordering the candidates by what usually works.
- **The R3 flip**, if the 8 curves needing it are ever worth having.

## A note on level data

The curves used to check the diagram layer are Unpinning's, which come from a
GPL-3.0 catalogue. Shipping this game should use curves generated here instead;
the drawings above are for testing only.
