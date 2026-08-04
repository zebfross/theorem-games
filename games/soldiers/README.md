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

## Row 4, and what it rests on

Row 4 ships, and it is the one level whose par is not verified here.

The distinction the rest of this file draws — par is *enough* is proved here,
par is *necessary* is Conway's — does not hold for row 4. Neither half is proved
here. A twenty-soldier army that reaches row 4 was never found by any search in
`tools/`, so there is no arrangement to replay and no last hint to give: the
third hint on that level says what is known and admits it has no layout to hand
over.

The last hint does hand over an arrangement: the solid eight-by-four block of 32
soldiers that Zeb played by hand, when every search here had failed. It is well
above Conway's 20 and the hint says so — it gets you across without being the
answer. That is a fair trade for a hint, since an assisted solve never records a
score anyway, so a wasteful army costs the player nothing they would have kept.

It is shipped on the word of the person who played it. No search here has found
a line through it, so `build_pack.py` did not replay it, and the level carries
`replayed: false` to say so. That is a weaker footing than anything else in the
pack, and the only one of its kind.

The level plays perfectly regardless, because the game never needed a worked
answer at all. It reads one only to place a layout for the last hint, and reads
the jump sequence not at all — that exists purely so `build_pack.py` can replay a
solution and refuse to write a level whose answer does not hold up. And since a
player may bring as many soldiers as they like, row 4 is always completable; par
is the target, not a gate.

That whole realisation came from Zeb, after a long detour in which the missing
sequence was treated as a blocker: *"you don't even really need the move history
since for Stuck you just give a layout that works and they have to figure out
the sequence of jumps for themselves."* Quite so. The hint hands over a
position, never a line of play, and row 4 could have shipped hours earlier.

**What was actually tried**, so the next attempt does not repeat it: exhaustive
search over small pools (fine to row 3, hopeless past it); hill-climbing on how
high an army can get; best-first ordered by height, by Conway weight, and by the
nearest soldier's distance to the target; generous armies pruned to their
participants; and staging areas from four to nine rows deep. The two jump-rule
implementations were checked against each other and agree, so none of this was
a rules mismatch. Zeb reached row 4 by hand with a solid eight-by-four block of
32 soldiers, which settles that it is reachable and that the searches here are
simply not strong enough.

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
