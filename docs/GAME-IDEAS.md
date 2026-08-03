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

## ~~Untangling planar curves~~ — built, and removed

**Chang & Erickson** — a closed curve with *n* self-crossings needs
Θ(n^{3/2}) homotopy moves to become simple.

Built to completion and then taken back out, because it was not enjoyable to
play. The code is not gone: it is in the history, whole and working, at commit
`8e1c615`, along with a README explaining the whole thing.

**Why it failed, which is the reason this entry is still here: there was no way
to lose.** Every move strictly reduces the crossing count, so any sequence of
clicks eventually wins and the only question is how many. That was true from
the first commit, and three rounds of fixes — marking every lens, then marking
none but lighting them on hover, then charging for wrong clicks — could not
touch it, because all three treated a structural problem as a presentation one.
A score cannot create tension where losing is impossible.

**So the test, before building anything: play the losing strategy on paper.**
Click at random, ignore the goal, and see whether it still wins. It takes
minutes. Pinning survives it — a wrong set of pins genuinely fails — and so
does max-flow, where a random spend of par separates the network 1.9% of the
time against untangling's 58%. Where careless play always wins, the game needs
a different move set, not a different interface, and that is worth knowing
before the level format is designed rather than after the pack is built.

Two things from it worth reusing if anyone returns to the idea. Approximate
geometry is safe when it is checked rather than argued: every edit was accepted
only if rebuilding the diagram from it gave back exactly what the move
predicted. And be careful that the thing returned is the thing checked — that
gap flattered the success rate and quietly corrupted the search that ran on
top of it.

## ~~The art gallery theorem~~ — built

**Chvátal**, with **Fisk's** proof — ⌊n/3⌋ guards always suffice for a simple
polygon with *n* vertices. See `games/gallery/`.

It was picked for the hint ladder and the hint ladder is what it delivered: the
second hint draws the triangulation and its three-colouring, which is the proof
itself and gives away no particular answer. Often it is not even optimal, which
turned out to be the better lesson — the theorem is a guarantee, not a recipe.

What it actually cost was exactness. Deciding whether a guard can see a spot,
and whether a room is fully covered, both had to be right in the *unsafe*
direction — a coverage test that is too generous marks wrong answers correct —
and both were wrong on the first attempt in ways no amount of reading would
have found. Each was caught by computing the same quantity a second way and
comparing: sampling the room against the bitmasks, and the area of a sight
polygon against the area of the pieces that corner can see. Worth doing for any
game where the win condition is geometric rather than combinatorial.

## ~~Max-flow min-cut~~ — built

**Menger / Ford–Fulkerson.** Cut pipes to stop the water, as cheaply as
possible. See `games/maxflow/`.

The polynomial-time answer was the draw and it delivered: networks are
generated here and their answers computed, so the game carries no third-party
data and has no ceiling on level size. Pinning's GPL inheritance simply does
not arise.

Two things worth carrying. The fail-state test was run *before* building — a
random spend of par separates the network 1.9% of the time, against
Untangling's 58% — and it took about twenty minutes to answer. And because the
win check is exact and cheap (is the sink still reachable), the animation
cannot disagree with the verdict; that failure mode is designed out rather than
managed.

The nicest accident: par is the max flow, so turning the water on *before*
cutting anything tells you what the answer will cost. The theorem is the
scoreboard.

## ~~Coin weighing~~ — built

**The counting bound.** A weighing comes out one of three ways, so *k* of them
separate at most 3<sup>k</sup> cases. One fake coin among *n*, heavy or light
unknown, is 2*n* cases, so *k* ≥ log₃ 2*n* — the argument behind the classic
twelve-coin puzzle.

Played non-adaptively: choose every weighing up front, then run. That
restriction is what makes it fit the engine — a thing you arrange rather than a
dialogue — and it turns the puzzle into a clean combinatorial object. Each coin
gets the pattern of pans it sits in, and a scheme works exactly when no two of
the 2*n* outcomes agree.

**The board is the proof.** A rack of 3<sup>k</sup> slots sits under the grid,
one per outcome, and it triples each time you bring in another weighing. Every
case drops into its slot when you run. Two in one slot is precisely what the
counting argument counts, so the failure is a picture rather than a message —
and on twelve coins the win is 24 slots filled out of 27, the bound visibly
almost tight.

Careless play (even up the pans, then assign at random) wins 0.007% of the time
at twelve coins, against Untangling's fatal 58%. But the first version of the
design nearly repeated Untangling's mistake in a subtler form: showing the slots
filling *live* would have let a blind hill-climber solve it by nudging, in a
median of 360 tweaks. Measuring that before building is what kept the rack empty
until you press run. **The fail-state test has to be run against the interface,
not only against the mathematics.**

The other thing worth keeping: par is not always the counting bound. Four coins
and thirteen coins both need one weighing more, because every arrangement that
would fit leaves a weighing holding an odd number of coins, and odd will not
split between two pans. Those are the two best levels in the pack, and the first
hint says so — a claim the pack checker verifies rather than takes on trust.

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

## The Chinese postman

**Euler; Edmonds & Johnson.** A connected graph has a closed walk using every
edge exactly once iff every vertex has even degree. When it does not, the
cheapest route repeats exactly a minimum-weight perfect matching on the
odd-degree vertices.

The game: a street map, and you must drive down every street and come back to
the depot, repeating as little as you can. The odd junctions are the whole
answer, they are countable by eye, and there are always an even number of them —
a fact that feels like a trick the first time. Par comes from the matching,
which is exact and cheap at these sizes.

Failure is watchable: run the route and the streets you never reached stay dark,
which is the art gallery's trick again. The risk is that it is close to
max-flow — another weighted graph with pipes and junctions — so it would want to
look quite different to earn its place.

## A known-good coin

The natural extension of the coin weighing game rather than a new one, noted
here because it is a genuinely different puzzle. Give the player one coin they
*know* is honest, to be used as ballast. The balance requirement relaxes from
"the pans hold equal numbers" to "within one", which is exactly the obstruction
that makes thirteen coins impossible in three weighings — so thirteen becomes
possible, and so does four in two. A second dimension of levels at the same
sizes, where the interesting thing is that the counting bound suddenly becomes
achievable everywhere.

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
