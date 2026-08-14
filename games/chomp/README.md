# Chomp

A bar of chocolate with one poisoned corner. Take a square and everything above
and to the right of it goes with it. Whoever is left facing the poison alone has
to eat it.

## The theorem

**On any rectangle bigger than a single square, the player who moves first
wins** — by strategy stealing. Suppose the second player had a winning reply to
every opening. The first player could take the far corner alone, look up the
reply that is supposed to beat that, and — since the reply is itself a position
one move from the full bar — could have opened with it instead. The assumption
defeats itself, so no second-player strategy exists.

The proof is non-constructive, and unusually blatant about it. It proves a
winning move is there and tells you nothing about which. Chomp is due to
**David Gale** (1974); the poset form of the argument goes back to **Schuh**
(1952).

## What that does to the game

Every rectangle in the pack has **exactly one winning opening**, and no known
rule produces it. That is not a quirk of these sizes — it held on every
rectangle up to six by eight when the solver was run across them.

| Bar | positions | winning openings | positions with one right answer |
| --- | --- | --- | --- |
| 2×7 | 35 | 1 | 28 / 28 — all of them |
| 3×7 | 119 | 1 | 81 / 102 |
| 5×7 | 791 | 1 | 415 / 743 |

Two rows is the one case where the single right answer is *findable*: the
positions you want to hand over are exactly those with the bottom row one longer
than the top, and three levels is enough to see it. Past that the structure
stops being nameable, and by five by seven the opening is one square in
thirty-four with nothing to reason from.

This makes Chomp the odd one out here. Every other game in this collection
teaches something you can carry to the next board. This one is a demonstration
that a proof can be completely convincing and completely useless, which is worth
one game and probably not two.

## What ships

`tools/theory.py` solves each bar exhaustively — a position is just the row
widths, so there are only `C(rows+cols, rows)` of them, 792 for a five by seven
bar. Each level file carries three tables:

| | |
| --- | --- |
| `reply` | the opponent's move from every position it can face |
| `need` | how many moves the player still needs, from every position |
| `best` | a move that achieves that `need` |

`need` and `best` are measured **against the shipped opponent**, not against
perfect play in the abstract, so the number a hint quotes is the number the
player will actually take if they follow it.

The game module contains no theory at all. It looks things up. A second
implementation in JavaScript would be free to drift from the one that was
checked, and the drift would show up as a par nobody can reach.

The build asserts, on every position of every bar, that a position is winnable
against the shipped opponent exactly when it is winnable against any opponent.
If those ever parted company the opponent would not be perfect.

## The opponent

Perfect, and deterministic so that par is reproducible. Among winning moves it
plays the first in reading order. When it is already lost it plays the move that
drags the game out longest — the least helpful thing it can do, and so the
honest thing to measure a par against.

## Building

```
python3 games/chomp/tools/build_pack.py    # writes data/
python3 games/chomp/tools/theory.py        # prints what it knows about each bar
```

## Licence

MIT, like the engine. Every position, reply and par here is computed by the
search in `tools/`, so this game carries no third-party data.
