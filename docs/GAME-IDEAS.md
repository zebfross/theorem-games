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
- **Something the player builds.** A cut, a set of guards, a weighing — a
  construction they can reason their way to, which then succeeds or fails on its
  merits. Theorems whose content is "this is unavoidable" give the player no
  agency in the outcome, and read as something happening *to* them. That is what
  sank the happy ending problem, and no other test on this list caught it.

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

Built twice, and the first version is the lesson.

**Version one: plan every weighing up front, press run.** The board held a rack
of 3<sup>k</sup> slots, every case dropped into its slot, and two in one slot
was the failure. It passed the fail-state test convincingly — careless play won
0.007% of the time against Untangling's fatal 58% — and it was still wrong. Zeb
put it exactly: *the hard part isn’t deciding which coins to put on which
scale, it’s determining the possible outcomes, which the button does for you.*

The run enumerated the cases, computed every outcome and checked for
collisions, so the player never once reasoned "tips left then balances, so coin
7 heavy". What was left was applying a bookkeeping rule — pick patterns
distinct up to sign with even columns — which you can do forever without
thinking about a balance at all.

**So the fail-state test is necessary and not sufficient.** "Can careless play
win?" is a different question from "is the interesting work still the
player’s?", and a game can pass the first while quietly failing the second. Ask
both. The second one is harder to measure and is best answered by naming, out
loud, the sentence of reasoning the player has to perform — if the machine
performs it instead, that is the game gone.

**Version two: adaptive, and the scales are an adversary.** Weigh, see the tip,
choose the next weighing knowing it, then name the culprit. No fake is chosen
at the start: the balance answers honestly — always consistently with some
surviving fake — but picks the honest answer that leaves you worst off. Par
cannot then be reached by luck, a lazy weighing is punished at once, and the
adversary is the theorem in costume, since its whole power is that three
outcomes cannot separate more than three groups.

The board shows the record and counts the cases that still fit; it does not say
*which*. Naming while two still fit is a guess and loses even when right.

Two things worth keeping. **Adaptivity buys nothing** — the exact minimax
agrees with the plan-ahead optimum at every size from 3 to 39 coins, so looking
between weighings makes the puzzle nicer and not more powerful. And **par is
not always the counting bound**: four coins and thirteen coins each need one
weighing more, because a pan holding an odd number of coins cannot be evened
up. Hand the player one known-genuine coin as ballast and both become possible,
which is the obvious sequel and is sketched below.

## ~~The happy ending problem~~ — built, and removed

**Erdős–Szekeres.** Any 5 points in general position contain a convex
quadrilateral, 9 a convex pentagon, 17 a convex hexagon. Built to completion,
played, and taken back out as unsatisfying. The code is whole and working in
history at commit `9e04826`, README and all.

**Why it failed, which is why this entry stays.** It passed every test this repo
had. Careless play loses. The player's work is not automated. Knowing the
theorem does not trivialise it. Par is exact and comes from the theorem itself.
And it was still flat, for a reason none of those tests could see:

**the theorem is an existence proof, and existence proofs do not decompose into
decisions.** "A convex pentagon is unavoidable" is a statement about what you
*cannot* prevent. So the player has no agency in the outcome — placing a point
is guided by vague spatial intuition rather than reasoning, and the thing that
finally appears is not something they built. It is something that happened to
them.

Compare what does work here. Max-flow, art gallery and coin weighing all hand
the player a **construction** — a cut, a set of guards, a weighing — that
succeeds or fails on its own merits, and that they can reason their way to.
Erdős–Szekeres has no construction in it for the player to find.

The second-order lesson: **the emergent object has to be worth seeing.** The
whole payoff was meant to be the moment the polygon appears, but a convex
pentagon is usually a lopsided blob, and no theorem of this kind can promise
better — regularity is measure-zero, so nudging any point destroys every regular
polygon in a set. Zeb expected something striking and got a quadrilateral with a
dent in it. Before building on a theorem whose punchline is a picture, look at
the picture.

**So, added to the list at the top of this file:** a candidate wants a
construction the player builds, not merely a phenomenon they trigger.

## Sperner's lemma

Label a triangulated triangle under the boundary constraints and try to avoid a
cell carrying all three labels. You cannot.

Five minutes long, and the punchline is that it is Brouwer's fixed point
theorem wearing a disguise. Weakest fit for the scoring model — there is no
minimum — but a good short interlude.

---

## ~~Hall's marriage theorem~~ — built

**Hall; König.** Everyone can be matched to a job they are qualified for exactly
when every group of k applicants has at least k jobs open to them between them.
When that fails, the fewest people you must leave unplaced is the worst
deficiency of any group — and that group is a *proof* that no arrangement could
have done better. See `games/marriage/`.

**Why it passes the criteria**, including the one the happy ending problem
failed. The player builds a matching: a construction they reason their way to,
which succeeds or fails on its merits. Knowing the theorem does not trivialise
it, since "the answer is n minus the worst deficiency" gives the *number* and
not the assignment — you still have to find the augmenting chains. And the
machine computes nothing the player cannot see: whether an applicant has a job
is visible at a glance, unlike whether sixteen points hide a convex hexagon.

**The shape.** Match as many as you can; par is the largest matching, scored as
the number left unplaced, so 0 is a perfect result on a solvable level. That
needed an engine fix — `bestFor` conflated "no record" with "scored zero", so
any game whose optimum is *nothing left over* could not record its best result.

**The second half is the interesting one.** On levels where a perfect matching
is impossible, finishing is not enough: the player must also point at the
bottleneck, the group of applicants sharing too few jobs between them. That is
the theorem as a win condition rather than a footnote — failure with a
certificate — and it is the same move as naming the fake coin.

**Verified so far** (`tools/hall.py`): König's identity holds on 6000 random
instances, with the two sides computed by completely different means —
augmenting paths against an exhaustive sweep over every subset of applicants —
so agreement is evidence rather than tautology. That check earned its place
immediately: it caught a wrong early-exit in the sweep within seconds. The sweep
had stopped as soon as some group of size k had deficiency k, on the theory that
nothing could beat it. One unqualified applicant is such a group; four
unqualified applicants have deficiency 4.

## ~~Conway's soldiers~~ — built

**Conway.** Soldiers below a line, jumping peg-solitaire style. The fewest
needed to put a man on row n is 2, 4, 8, 20 — and row 5 is impossible for any
army whatsoever, proved by weighting cell (x, y) with phi^(n - y - |x|), where
phi is chosen because phi^2 = phi + 1 makes no jump towards the target increase
the total. The whole half-plane sums to exactly the weight of the target cell,
and strictly decreases in play. See `games/soldiers/`.

**Why it is worth building.** It passes every criterion, including the one that
sank the happy ending problem: rows 1 to 4 are constructions the player builds
and reasons toward, with exact classical pars. The impossibility is one capstone
level rather than the whole game, which is the difference — Erdos-Szekeres was
avoidance all the way down.

And it looks like nothing else on the shelf. No graph, no polygon, no scales: a
board of checkers hopping over each other, which is a mechanic anybody
recognises before a word of explanation.

**Where it stands.** `tools/army.py` has the jump mechanics and a search for the
smallest army that reaches a given row. Rows 1 and 2 are confirmed by that
search at 2 and 4 soldiers, matching Conway independently of anything asserted.

Row 3 is the first that brute force cannot reach: eight soldiers out of a
thirty-six cell staging area is thirty million subsets, and the reachability
test inside each is itself a search. It wants either target-directed pruning or,
more sensibly, shipping the known configurations and *checking* them — which is
what the rest of this repo does, and is the right call here too, since the pars
are classical and the interesting question is whether a given army works rather
than which army is smallest.

**Built**; see `games/soldiers/`. Rows 1 to 3 ship armies found by search and
replayed; row 4 ships an army of exactly twenty on Conway's authority, since
re-deriving it means searching about 10^11 armies. Row 5 is the wall.

## ~~The Chinese postman~~ — built, as Route inspection

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

**Built**; see `games/postman/`. The resemblance to max-flow turned out not to
matter, because the mechanic is different in the hand: max-flow is a set of
pipes you cut all at once, this is a walk you make one step at a time, and the
board fills in behind you. Every par is checked by constructing a round that
achieves it and walking it. The one trap in generation was maps with no loop —
a tree forces every street to be walked exactly twice, par comes out at double
the total, and there is nothing whatever to choose.

## Sorting networks and the 0-1 principle

**Knuth; the 0-1 principle.** A network of comparators sorts every input
exactly when it sorts every input made only of zeros and ones. So correctness
over an infinity of inputs collapses to 2^n checks, and a network that fails
has a *witness*: a specific input it leaves out of order.

The game: lay comparators across n wires so that every input comes out sorted,
using as few as you can. Par is the optimal size, which is known and small.
Searched here rather than looked up, by breadth-first search over the set of
0/1 vectors not yet sorted:

    wires        3   4   5   6
    comparators  3   5   9  12

which agrees with the classical values. Seven and eight are 16 and 19 in the
literature; this search has not been run that far.

**Why it is the strongest candidate on this page.** It is the best failure this
list has ever had. Every other game shows you *that* you fell short — a dark
corner, a leak, a street unwalked. This one hands you the exact input your
network gets wrong and runs it down the wires in front of you. That is not a
picture of failure, it is a counterexample, and it is the theorem itself doing
the work: the 0-1 principle is precisely what makes the witness findable.

It also looks like nothing on the shelf — horizontal wires and vertical bars,
no graph, no polygon, no board — and the player builds the thing being scored,
comparator by comparator.

**The risk** is that the first level teaches nothing: three wires and three
comparators is almost forced. The ladder probably wants to start at four.

---

## Fewest monochromatic triangles — Goodman

**Ramsey; Goodman.** Colour the edges of a complete graph with two colours and
some triangle always ends up all one colour, once the graph is big enough. That
much is R(3,3) = 6 and is a yes-or-no fact. Goodman sharpened it into a
*minimum*: the fewest single-coloured triangles a colouring can leave. Counted
here by exhaustion:

    K4  0        K6  2
    K5  0        K7  4

**Why it fits.** The ladder writes itself. On K5 you can avoid them entirely,
and finding that colouring is a real puzzle. On K6 you cannot — that is the
party problem everybody has heard — but the game is not "you lose", it is *how
few*, and the answer is exactly two. That is the move that saves it from the
happy ending problem's fate: the player builds a colouring and is scored on it,
rather than being told the thing they were avoiding was unavoidable all along.

Failure points at itself: the offending triangles light up.

**The risk is generation.** K7 is 2^21 colourings, which brute force handles.
K8 is 2^28 and needs Goodman's formula for the bound plus a construction that
attains it, and shipping a par this repository has not verified would be a
first. The pack may simply have to stop at seven.

---

## The fifteen puzzle, and the half that cannot be solved

**Permutation parity.** Sliding tiles: exactly half of all arrangements can be
solved and half cannot, and which is which is settled by the parity of the
permutation together with the row the blank sits on. Sam Loyd is said to have
offered a prize for one of the impossible ones.

Par is exact and cheap on a three-by-three: the whole state space is 181440
arrangements, so breadth-first search from the goal gives the true minimum
number of slides for every level at build time.

**Why it might work.** The mechanic needs no explaining at all, which is rare,
and the capstone is a wall in the same shape as Conway's row 5 — a level that
cannot be finished, where the invariant is the reason and the hint is the
proof.

**Why it might not.** The failure is weak: you do not fall short in a way the
board can show you, you just keep sliding. And the resemblance to Conway's
soldiers — an invariant with an impossible capstone — is closer than the
resemblance between route inspection and max-flow turned out to be.

---

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

---
