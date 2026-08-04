# Taut — pinning, generated

The same theorem as [Pinning](../pinning/), with levels made here instead of
taken from a catalogue. Pinning derives its 1074 levels from LooPindex, which is
why that game — and through it this whole repository — carries GPL-3.0.
Everything else is MIT and generated. This is the attempt to generate these too,
built alongside rather than in place of the original so the two can be compared.

## Where it stands

**Shipped: 60 levels**, 2 to 8 crossings, needing 2 to 7 pins. Drawings made
here, answers computed here, no third-party data — so this game is MIT while
Pinning, next to it on the shelf, is GPL-3.0 because of its catalogue.

It shares Pinning's board, rope physics, hints and verdict by importing the
module rather than copying it. Two divergent copies of a rope simulation is how
a bug gets fixed in one game and not the other.

## What it cost, and the honest caveat

60 levels took **8144 drawings**. Almost all were thrown away, and that is the
design rather than a defect. The solver declines any position it cannot settle,
and a level is only written when it answered every question about that drawing
without once declining.

That policy is what makes the answers trustworthy. Measured against all 1074
catalogue levels, the solver reproduces 603 exactly, disagrees with 1, and
declines 470 — **99.8% of what it answers is right**. An earlier version
answered far more and was useless for this job: 924 right and 106 wrong, and
wrong in the direction of claiming too few pins suffice, which ships a puzzle
whose stated solution is untrue.

**The caveat, stated rather than buried.** One in 604 answered catalogue levels
is still wrong. That rate is measured on catalogue drawings — canonical minimal
diagrams — and these are random polygons, so the true rate here is not known and
could be better or worse. The single known failure is `11^3_19`, kept as a
regression test in Pinning's validator rather than deleted, since it is the only
witness to a bug that is still there.

## Comparing the two

They are meant to be played side by side. The visible difference is that these
drawings are angular where the catalogue's are smooth and deliberately laid out,
because these are random points joined in a random order. Whether that makes
them worse puzzles is a question about taste and not one the solver can answer.



### How the drawings are made

 `tools/draw.py` makes random multiloops — closed polylines
through scrambled points, which cross generically and avoid the degeneracies the
arrangement code refuses. The planar arrangement is
`lib/geometry/arrangement.py`, written for the original game and reused
unchanged. Over 400 random drawings, 209 came out usable at 2 to 7 crossings,
with no degeneracies and no position the solver declined to classify.

### Solver accuracy by diagram size

| crossings | answered | agreed |
| --- | --- | --- |
| ≤ 4 | 2 | 100% |
| ≤ 6 | 14 | 92.9% |
| ≤ 7 | 32 | 93.8% |
| ≤ 8 | 90 | 86.7% |
| all | 1035 | 86.7% |

The hoped-for shortcut — generate only small drawings, where the solver might be
sound — does not exist. It is already wrong at six crossings.


## Files

```
game.js               Pinning's module, re-exported with its own identity
style.css             imports Pinning's
data/index.json       60 generated levels
tools/draw.py         random multiloop drawings and their arrangements
tools/build_pack.py   generates, solves, filters and writes the pack
```

The solver is `../pinning/tools/solver.py`, with its accuracy and failure
direction recorded at the top; `../pinning/tools/validate_solver.py` measures it.
