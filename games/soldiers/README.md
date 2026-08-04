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

## Row 4 is not in the pack yet

Twenty soldiers is far past brute force, so finding a working army needs either
the published configuration or a directed search. Three attempts so far, none
successful: a hill climb on "how high can this army get" (`tools/climb.py`), and
a best-first search (`army.climb_to`) ordered first by height and then by
Conway weight alone. The best-first search settles rows 1 to 3 instantly, so it
is not simply broken.

Acting on that, four structured candidates were tried — two wide rows, a
triangle broad at the line, a checkerboard, and a column with a shelf — on the
theory that armies with room in them jump better than solid blocks. None
reached row 4 either.

One thing learned along the way, recorded because it was nearly written down as
a fact: feeding the search a deliberately oversized army of 55 soldiers *also*
failed, which looked like proof that the search rather than the armies was at
fault. It is not. A jump needs an empty cell to land in, so extra soldiers block
as readily as they help — a packed board is worse than a sparse one, adding
soldiers is not monotone, and that experiment says nothing at all.

**Where this leaves it.** The mechanics are certainly right: the search finds
2, 4 and 8 for rows 1, 2 and 3, which are Conway's numbers, so the jump rule and
the geometry agree with the literature. Row 4 exists — it is classical. What is
missing is either the published twenty-cell configuration or a search strong
enough to find one, and best-first over 300,000 positions is not remotely that
against a twenty-piece board. The next person should look the configuration up
rather than rediscover it; the pack will replay and verify whatever it is
handed.

So the pack ships rows 1, 2, 3 and the wall. Row 4 is the obvious next piece of
work and the only thing standing between this and the full ladder.

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
