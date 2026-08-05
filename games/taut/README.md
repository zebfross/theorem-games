# Taut — pinning, generated

The same theorem as [Pinning](../pinning/), with levels made here instead of
taken from a catalogue. Pinning derives its 1074 levels from LooPindex, which is
why that game — and through it this whole repository — carries GPL-3.0.
Everything else is MIT and generated. This is the attempt to generate these too,
built alongside rather than in place of the original so the two can be compared.

## Where it stands

**Shipped: 84 levels**, 2 to 6 crossings, needing 2 to 6 pins. Drawings made
here, answers computed here, no third-party data — so this game is MIT while
Pinning, next to it on the shelf, is GPL-3.0 because of its catalogue.

It shares Pinning's board, rope physics, hints and verdict by importing the
module rather than copying it. Two divergent copies of a rope simulation is how
a bug gets fixed in one game and not the other.

## What it cost, and the honest caveat

**Fewer than one drawing in a hundred becomes a level.** Almost all are thrown
away, and that is the design rather than a defect. The solver declines any
position it cannot settle, and a level is only written when it answered every
question about that drawing without once declining.

That policy is what makes the answers trustworthy. Measured against all 1074
catalogue levels, the solver reproduces 603 exactly, disagrees with 1, and
declines 470 — **99.8% of what it answers is right**. An earlier version
answered far more and was useless for this job: 924 right and 106 wrong, and
wrong in the direction of claiming too few pins suffice, which ships a puzzle
whose stated solution is untrue.

Three other filters do most of the discarding, and they are about the drawing
rather than the answer. A drawing with a corner sharper than 95° looks wrong
next to the catalogue's right angles however much it is smoothed. And every
region has to be comfortably clickable: not by area, which lets a long thin
sliver through, but by how far the region's own pin point sits from the nearest
wall. Zeb hit the version without that check immediately — the first level had a
loop with 1.6% of the view to aim at and could barely be hit. The bar is 3.4% of
the view's width, and the tightest point in the shipped pack has exactly that.

And a quota per crossing count, with at most two levels sharing one pinning
structure. Left alone the build is overwhelmingly bottom-heavy, because small
drawings are commoner and cheaper to answer — an earlier 120-level pack came out
24 levels at two crossings and one at six. At two crossings with a single loop
there is exactly *one* diagram, the figure eight, so those 24 were the same
puzzle drawn 24 ways. Zeb saw it at once: "levels 1-2 to 12-2 are very similar,
basically the same pattern over and over." The pack now runs 4 / 18 / 30 / 24 /
8 across two to six crossings, and its 84 levels hold 56 distinct puzzles.

## Why the pack stops at six crossings

Not a cap — it is where the drawings run out. Every region has to be clickable,
and a denser drawing packs more regions into the same square, so past six
crossings essentially none has room in all of them. Measured on random drawings:
at four crossings 6% clear the bar, at five 2%, at six and beyond 0%.

What bought the sixes was cropping. The view used to be the whole 500-unit
field, and the rope only ever occupied the middle two thirds of it; fitting the
view to the drawing makes every region larger on screen for nothing. Since the
bar is a share of the view rather than an absolute distance, that alone took six
crossings from unreachable to routine. Seven and eight remain out of reach, and
padding the pack with drawings too cramped to pin is worse than stopping.

**The caveat, stated rather than buried.** One in 604 answered catalogue levels
is still wrong. That rate is measured on catalogue drawings — canonical minimal
diagrams — and these are random polygons, so the true rate here is not known and
could be better or worse. The single known failure is `11^3_19`, kept as a
regression test in Pinning's validator rather than deleted, since it is the only
witness to a bug that is still there.

## Comparing the two

They are meant to be played side by side.

The first pack looked wrong in a way that had nothing to do with the
mathematics: random points joined in a random order give very sharp corners,
which read as spikes. The catalogue's ropes are axis-aligned rectangles, whose
right angles round off pleasantly under a thick stroke — that rounded-rectangle
feel is a large part of why the original is nice to look at. Three passes of
Chaikin corner cutting before the drawing is analysed fixes most of it, and a
drawing with any turn sharper than 95° is thrown away — smoothing rounds a
corner but cannot rescue a point the loop nearly doubles back on, and one spike
is enough to make a drawing look wrong. The sharpest turn anywhere in the pack
is now 94°, with a median of 58°, against a worst of 163° before.

What remains different is character rather than quality: these are organic
loops, the catalogue's are rectilinear. Which makes the better puzzle is a
question about taste and not one the solver can answer.



### How the drawings are made

 `tools/draw.py` makes random multiloops — closed polylines
through scrambled points, which cross generically and avoid the degeneracies the
arrangement code refuses. The planar arrangement is
`lib/geometry/arrangement.py`, written for the original game and reused
unchanged. The shipped pack took 9804 drawings to find 84 levels; the view each
one ships with is cropped to the drawing rather than to the field it was made
in, so the rope fills the board.

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
data/index.json       84 generated levels
tools/draw.py         random multiloop drawings and their arrangements
tools/build_pack.py   generates, solves, filters and writes the pack
```

The solver is `../pinning/tools/solver.py`, with its accuracy and failure
direction recorded at the top; `../pinning/tools/validate_solver.py` measures it.
