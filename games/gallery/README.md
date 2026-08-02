# Art gallery

Station guards on the corners of a room until every part of it is watched,
using as few as you can.

**Chvátal:** ⌊n/3⌋ guards always suffice for a room with *n* corners.

## Status

**Playable.** 96 rooms, from six corners up to sixteen.

### The hint is the proof

This is why the theorem was worth a game rather than a paragraph. **Fisk's
proof** is short enough to hand over a step at a time: cut the room into
triangles, colour the corners so that every triangle gets all three colours,
and put guards on whichever colour was used least. Every triangle then has a
guard on one of its corners, and a triangle is convex, so every triangle is
watched — and since the three classes partition *n* corners, the smallest is at
most ⌊n/3⌋.

The second hint draws exactly that: the triangulation appears, the corners take
their three colours, and the text names the least-used class. It gives away no
particular answer, because it is not an answer — it is the reason an answer
exists. Often it is not even optimal: on a ten-corner room Fisk hands you three
guards where two will do, which is the theorem being a guarantee rather than a
recipe, and is worth seeing.

### It can be lost

Checked before building anything. Too few guards, or the wrong corners, leaves
a dark patch you can see. Measured by putting par guards on random corners:

| | |
| --- | --- |
| guessing works | 18% of the time |
| worst room | 35% |

Rooms above 35% are dropped. The soft spot is the familiar one — guard every
corner and you always win, at a ruinous score.

### Guards stand on corners

Chvátal's own setting, and the reason par can be exact: finitely many answers,
so the minimum is found by trying every subset. That is NP-hard in general and
trivial at this size, and worth doing properly, because par is a claim that
nothing smaller exists.

### Nothing here is approximate

Two things had to be exact, and both are checked against an independent second
computation rather than argued.

**Whether a guard can see a spot.** The sight line is cut wherever it meets the
boundary and each piece is tested separately. Neither shortcut works: sampling
the midpoint misses a line that leaves the room and comes back, and testing for
crossings misses a line that passes exactly through a reflex corner and out,
without properly crossing any edge.

**Whether the room is covered.** The room is chopped into convex pieces that no
sight line can cross, so within a piece the set of watching corners cannot
change and one test settles it. The game ships the distinct bitmasks only —
a couple of dozen, down from thousands of pieces — so at runtime the check is a
handful of bitwise ands.

Both were wrong at first in ways only a cross-check found:

- Cutting a piece by a line put a corner lying *on* the line into one part
  only, so the other came back a corner short and the area between went
  missing. Coverage was then decided over a room with holes in it, and it
  passed guard sets that left real dark patches. Caught by sampling thousands
  of points and asking the same question a different way.
- The sight polygon left out the corner the guard stands on, so it closed with
  a chord across the room and the light stopped short of the wall. Caught by
  comparing its area against the total area of the pieces that corner can see —
  two computations that share no code. They now agree to the last decimal on
  608 corners.

### Rooms

Grown as a blob of grid squares and outlined, which makes them read as floor
plans and makes it easy to keep them simple: a blob pinched at a corner
produces two boundary loops rather than one, and those are thrown away. The
outline walk has to be bounded, because at such a pinch one corner starts two
outward edges and only one survives — following it can drop into a loop that
never returns to the start, which hangs rather than fails.

Rectilinear rooms are not where ⌊n/3⌋ is tight; ⌊n/4⌋ suffices for them
(Kahn, Klawe and Kleitman). The bound still holds, the proof still applies, and
the floor-plan look is worth more than the tightness.

### Still to do

- **Rooms where ⌊n/3⌋ bites.** The comb — a row of prongs — is the standard
  example forcing exactly ⌊n/3⌋, and generating those deliberately would let a
  level exist where Fisk's guard set *is* the answer.
- **Guards anywhere, not only on corners.** Fewer guards suffice in general,
  and the minimum stops being a finite search, which is the whole reason it is
  not done here.
