# Candidate theorems

A running list of results that would make good games here. Nothing is claimed;
these are sketches to argue with. If you build one, move it to the table in the
top-level README.

## What makes a candidate good

The engine fits a particular shape: **arrange something, press run, watch it
happen, be told whether it worked.** Beyond that, the ones worth building have:

- **A minimum in the statement.** Fewest guards, fewest moves, cheapest cut.
  That is what gives you a score, a par and a reason to replay a level.
- **Failure you can point at.** A dark corner, a leak, a knot coming undone.
  A red cross is a much worse teacher than a picture of what went wrong.
- **Interesting small instances.** The first level has to be solvable by
  somebody who has never heard of the theorem.
- **An answer that can be precomputed**, or a runtime check that is at least
  wrong in the safe direction.

---

## ~~Untangling planar curves~~ — built, and not worth playing

**Chang & Erickson** — a closed curve with *n* self-crossings needs
Θ(n^{3/2}) homotopy moves to become simple. See `games/untangling/`.

It was billed here as by far the cheapest to build, on the grounds that it
shares Unpinning's rope rendering and can reuse the very same level geometry.
Both were true and neither was the work. Reusing the curves was free; making a
move *look* like a move was not. The combinatorics of a collapse is a deletion
from the Gauss code and took an afternoon. Redrawing the curve afterwards so
the player sees the same puzzle changed rather than a different puzzle took
most of the effort, and still succeeds only 84% of the time, which is why 441
of 498 curves ship rather than all of them.

**The lesson worth carrying, ahead of any of that: check that the game can be
lost before building it.** Untangling cannot be. Every move strictly reduces
the crossing count, so any sequence of clicks wins and the only question is
how many. That was true from the first commit and none of the work that
followed could have changed it. Before building one of these, play the losing
strategy on paper — click at random, ignore the goal — and see whether it
still wins. Unpinning survives that test: a wrong set of pins genuinely fails.

Worth carrying too: the drawing does not have to be argued into
correctness if it can be checked. Every edit is accepted only when rebuilding
the diagram from it gives back exactly what the move predicts, which is what
makes approximate geometry safe to attempt at all. Be careful that the thing
returned is the thing checked — see that game's README for how much that cost.

## The art gallery theorem

**Chvátal**, with **Fisk's** proof — ⌊n/3⌋ guards always suffice for a simple
polygon with *n* vertices.

Place guards so every point of the room is visible, using as few as possible.
The run floods the room with light and leaves the unseen parts dark. Finding
the true minimum is NP-hard, so precompute.

The reason to pick this one: **the hint ladder is Fisk's proof.** Triangulate,
three-colour the triangulation, take the least-used colour class — that is
always a valid guard set of size at most ⌊n/3⌋. Tier 2 shows the triangulation,
tier 3 the colouring. The help you give is the mathematics.

It is also the best test of whether the engine really generalises, since it
shares nothing visually with Unpinning.

## Max-flow min-cut

**Menger / Ford–Fulkerson.** Cut edges to stop flow from source to sink, as
cheaply as possible.

The run sends water through and shows it still getting past an insufficient
cut. Unusual among these because the answer is **polynomial time**: no
precompute ceiling, levels can be generated freely at any size, and the game
could ship a real solver instead of a table.

## The happy ending problem

**Erdős–Szekeres.** Any 5 points in general position contain a convex
quadrilateral; 9 force a convex pentagon, 17 a hexagon.

Inverted: place points *trying to avoid* one. The run searches and highlights
the convex subset you failed to dodge. A game you are guaranteed to lose
eventually, which is a good change of temperature, and the known extremal
numbers give exact pars.

## Sperner's lemma

Label a triangulated triangle under the boundary constraints and try to avoid a
cell carrying all three labels. You cannot.

Five minutes long, and the punchline is that it is Brouwer's fixed point
theorem wearing a disguise. Weakest fit for the scoring model — there is no
minimum — but a good short interlude.

---

## Also considered

- **Three-colouring planar graphs.** Four colours is too familiar; the
  difficulty and the interest both live at three.
- **Jordan curve theorem.** "Inside or outside?" on a vicious spiral is a
  genuinely nice one-shot puzzle, but there is no minimum to optimise, so it
  fits the engine's scoring model poorly.
- **Unknotting number.** The natural sequel to untangling, but knot diagrams
  need over/under strands and a 3D reading, which is a real step up in
  rendering before any of the mathematics starts.
- **Pick's theorem.** Closer to an exercise than a puzzle.
