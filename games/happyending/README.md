# The happy ending problem

Scatter points on the field without ever letting a convex polygon appear among
them. You can only get so far, and the theorem says exactly how far.

## The theorem

**Erdős–Szekeres.** Any 5 points in general position contain a convex
quadrilateral. Any 9 contain a convex pentagon. Any 17 contain a convex
hexagon. So a set avoiding one of those shapes can hold at most

| avoid | par | how it is known |
| --- | --- | --- |
| convex quadrilateral | 4 points | classical |
| convex pentagon | 8 points | classical |
| convex hexagon | 16 points | Szekeres & Peters, 2006, by computer |

and nothing past that is known. Whether the pattern continues as
2<sup>k−2</sup> is open, so the last level of this game sits on the edge of the
subject.

The name is Erdős's joke. Esther Klein posed the quadrilateral case, George
Szekeres worked on it, and the two of them married.

## The one game here you cannot beat

Everywhere else in this repo par is an optimum somebody found, and the pleasure
is in finding it too. Here par is a ceiling the theorem fixed in advance. One
point past it is impossible — not hard, impossible, for anyone, forever.

So the tension is a different one. It is not "can I find the answer" but "how
close to the wall can I get before it stops me", and it *will* stop you, on the
next level if not this one. That is a good change of temperature after three
games you can win outright.

## What the game computes, and why that is allowed

Every time a point goes down, the game checks all subsets for a convex k-gon —
8008 of them at worst, which is nothing — and if it finds one it draws it.

That is deliberately doing work for the player, and it is the opposite of the
mistake the coin weighing game made in its first version. There the machine
performed the deduction that *was* the puzzle. Here the puzzle is spatial
judgement — where can the next point go — and spotting a convex hexagon buried
among sixteen points is not judgement, it is bookkeeping no one can do reliably
by eye. Doing it for the player is what lets them learn to see it coming.

## General position, with width

Three points in a line make "convex" a matter of which way the rounding went, so
the game refuses a click that would put three points nearly in a line — the
threshold is on triangle area, not on exact collinearity.

It also refuses a click too near an existing point. That rule cost a round:
the extremal configurations were first generated without it, and eight of the
levels shipped with points packed closer together than the game would let anyone
place. The levels loaded, looked right, and were quietly impossible. The
generator now enforces the same spacing the game does.

## Levels

Each level is a polygon to avoid and a head start: some of an extremal
configuration already on the field, and the rest for you. Completability never
has to be searched for, because every level is a prefix of a set known to work.
Fewer points given is harder.

## Files

```
game.js               the module the engine loads
style.css             field, points, and the polygon that caught you
poster.svg            the homepage card
data/extremal.json    the three configurations, one per polygon
data/index.json       18 levels
tools/points.py       convexity, general position, and the search
tools/build_pack.py   writes the pack
```

Configurations are generated here, so this game carries no third-party data.

The convexity test is checked in both directions, since either error would ruin
the game silently: too strict and it would miss polygons the player made, too
eager and par would be unreachable. 4000 random 5-point sets all contain a
convex quadrilateral and 300 random 9-point sets all contain a convex pentagon,
as the theorem requires; and all three extremal configurations are found. The
16-point set was additionally checked against a separately written
monotone-chain hull test, agreeing across all 8008 of its six-point subsets.
