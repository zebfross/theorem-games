# Conway's soldiers

Soldiers stand below a line. One may jump over a neighbour into the empty cell
beyond, orthogonally, and the soldier jumped over is taken off the board — peg
solitaire, with every piece starting on one side of a line.

How few does it take to put a man on row *n*?

| target | soldiers | how it is known here |
| --- | --- | --- |
| row 1 | 2 | found by exhaustive search in `tools/army.py` |
| row 2 | 4 | found by exhaustive search |
| row 3 | 8 | a working army of 8 is found by search; minimality is Conway's |
| row 4 | 20 | classical; not yet shipped — see below |
| row 5 | **impossible** | Conway's weighting argument |

## The wall

Row 5 cannot be reached. Not by a clever arrangement, not by a hundred
soldiers, not by a million.

Give the cell *d* steps from the target the weight φ<sup>−d</sup>, where φ is
the golden ratio. The choice is exact rather than pretty: because
**φ² = φ + 1**, a jump towards the target replaces two adjacent weights by the
one beyond them and never increases the total. And the entire half-plane below
the line sums to precisely 1 — the weight of the single target cell. There is
nothing left over to spend, so the target is never occupied.

That is why the game has a level you are meant to lose. It is one capstone
against four rows you can actually reach, which is the balance the happy ending
problem got wrong: there, avoidance was the whole game and the player never
built anything.

## What is verified, and what is cited

The repo's habit is to say which is which.

**Verified here.** That each shipped par is *enough*. Every level ships an army
of exactly par soldiers together with a jump sequence, both found by search, and
`build_pack.py` replays the sequence move by move and refuses to write the level
if any jump is illegal or the target is not reached. A browser sweep then plays
every level through the real click path.

**Cited, not re-proved.** That each par is *necessary*. Rows 1 and 2 are small
enough to settle by exhaustion and are settled that way. Rows 3 and 4 are
classical, and re-deriving them means searching every subset of a staging area —
around 10<sup>11</sup> armies for row 4. The game states the minimum on Conway's
authority and this file says so rather than implying a search that never ran.

## Row 4, and why it took so long

Row 4 ships at par: twenty soldiers, nineteen jumps, replayed by the build like
every other level.

It should have taken minutes. Every search here failed on it for one reason,
and the reason was mine: they all steered towards a target at column 0. Zeb's
army sat over columns −7 to 0 and pointed at column −3. Conway's own weighting
says so at a glance — scored against column 0 that army is worth 0.84, under the
1.0 a target cell needs, and against column −3 it is worth 1.18. I was aiming
every search at the weakest corner of the board and concluding the search was
too weak.

Retargeted, it fell out in fourteen seconds. Pruned to the soldiers that
actually take part, it came to exactly twenty — Conway's number, arrived at from
a player's thirty-two.

**Two lessons, both about checking rather than reasoning.** The weighting is
computable in five lines and would have diagnosed this at any point in several
hours of searching; I treated it as a fact about row 5 rather than as an
instrument. And when I finally did compute it, I measured against a single
target column and briefly concluded the army was *provably impossible* — which a
sanity check on a known-good army caught immediately, because that one scored
0.53 and plainly worked. The bound applies per target cell, and the game accepts
any column. A measurement pointed at the wrong thing is not better than a guess.

## Files

```
game.js               the module the engine loads
style.css             board, line, soldiers
poster.svg            the homepage card
data/index.json       4 levels
tools/army.py         jumps, reachability, and the search for a smallest army
tools/climb.py        the hill climb for row 4
tools/build_pack.py   writes the pack, replaying every shipped solution
```

Armies and jump sequences are generated here, so this game carries no
third-party data.
