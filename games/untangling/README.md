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

**Not playable yet.** The combinatorial layer is built and checked; the moves
themselves, the solver and the drawing are not.

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

Still to do:

- **The moves.** R1 and R2 removal and the R3 flip, as surgery on the darts.
- **The solver.** Breadth-first search over diagrams, by canonical Gauss code,
  to the simple curve. This gives par, and answers the question the whole
  design hangs on: how large the reachable graph gets.
- **The drawing.** Each move changes the curve, so something has to redraw it.
  The plan is to avoid live geometry entirely by precomputing the reachable
  diagrams offline and shipping a drawing with each, making a move a lookup.
  Whether that is affordable depends on the graph size above.
- **An engine hook.** Unpinning is arrange, then run, then a verdict. This is
  move by move with no separate run, which the engine does not model yet. It
  needs a mode where a click advances the game and the level ends when the game
  says it is done.

## A note on level data

The curves used to check the diagram layer are Unpinning's, which come from a
GPL-3.0 catalogue. Shipping this game should use curves generated here instead;
the drawings above are for testing only.
