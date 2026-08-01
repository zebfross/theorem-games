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

**Not playable yet.** The combinatorial layer, the collapsing moves and the
solver are built and checked. The drawing and the engine hook are not.

### What the solver settled

Run over all 498 single-curve drawings in the Unpinning pack, two seconds
altogether:

| crossings | reduce with R1/R2 | need R3 | par | states, median/max |
| --- | --- | --- | --- | --- |
| 4-7 | 16 | 0 | 2-4 | 8-28 |
| 8 | 26 | 1 | 4-5 | 28 / 36 |
| 9 | 99 | 1 | 5-6 | 36 / 52 |
| 10 | 351 | 4 | 5-6 | 48 / 83 |

Two things follow, and both make what is left much smaller than feared.

**The reachable graph is tiny.** The worst level holds 83 diagrams. So
precomputing every reachable diagram offline and shipping a drawing with each
is comfortably affordable, and a move at runtime is a lookup rather than live
geometry surgery — the part most likely to have sunk the idea.

**R3 is barely needed.** 492 of 498 curves reduce with collapses alone; only 6
ever need a triangle flip to expose something collapsible. A first playable
version can offer R1 and R2 only and not ship those 6, taking the fiddliest
surgery off the critical path.

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

Still to do:

- **A drawing for each reachable diagram.** The one genuinely open problem.
  Every state needs a picture, and consecutive states must look related, or a
  move will read as the puzzle being swapped rather than changed.
- **The R3 flip**, if the 6 curves needing it are ever worth having.
- **An engine hook.** Unpinning is arrange, then run, then a verdict. This is
  move by move with no separate run, which the engine does not model yet. It
  needs a mode where a click advances the game and the level ends when the
  game says it is done.

## A note on level data

The curves used to check the diagram layer are Unpinning's, which come from a
GPL-3.0 catalogue. Shipping this game should use curves generated here instead;
the drawings above are for testing only.
