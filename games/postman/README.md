# Route inspection — walk every street, and come home

A postman has to cover every street on the round and finish back at the depot.
Streets may be walked twice, and on most maps some must be. The question is
which, and how little that can cost.

## The theorem

**Euler** (1736) settles the easy half. A round that repeats nothing exists
exactly when every corner has an even number of streets meeting it — because
walking into a corner and out again uses two of them each visit, so an odd
corner can never balance.

**Guan** (1962) asked what to do about the rest, and **Edmonds & Johnson**
(1973) answered it. Two facts do the work:

- The odd corners always come in an even number. The degrees add up to twice
  the number of streets, and an even total cannot be made of an odd count of
  odd numbers.
- Walking a street twice flips the parity at *both* its ends.

So the streets you double form a set of paths pairing the odd corners off, and

> **cheapest round = every street once + the cheapest pairing of the odd corners**

where pairing two corners costs the shortest path between them. That is a
minimum weight perfect matching. On these maps it is found by trying every
pairing: with 2*k* odd corners there are (2*k*−1)!! of them, which is 105 at
eight and 945 at ten.

## The hints are the proof

- **Once** — how many odd corners there are, why they force doubling, and what
  the cheapest round costs.
- **Twice** — *which* corners are odd, lit on the map, plus the rule that the
  repeats pair them off, and what the cheapest pairing is.
- **Again** — the streets a cheapest round doubles. The repeats, not the route:
  the repeats are the theorem and the route is bookkeeping.

## The ladder

The first level has no odd corners at all, so nothing need be walked twice —
Euler's half on its own, before the pairing matters. After that the odd corners
arrive two at a time.

| | streets | odd corners | streets once | cheapest round |
| --- | --- | --- | --- | --- |
| Once round | 8 | 0 | 880 | **880** |
| Two blocks | 6 | 2 | 700 | **960** |
| Three blocks | 9 | 2 | 1130 | **1220** |
| A gap in the grid | 9 | 2 | 1030 | **1180** |
| Four corners | 11 | 4 | 1490 | **1900** |
| The long way round | 14 | 4 | 1860 | **2420** |
| Six odd corners | 11 | 6 | 1590 | **2580** |
| A wider round | 19 | 6 | 2210 | **2760** |
| The whole town | 24 | 8 | 3000 | **3560** |

## What is checked

No par is shipped on the strength of a formula. For every level the build

- refuses a map with two streets between the same pair of corners, which would
  be walked once and credited twice and make every count downstream wrong;
- requires the map to be connected, and drops corners no street reaches;
- computes par from the matching, then **builds a round and walks it**,
  asserting it covers every street, returns to the depot, and costs exactly
  par — the number is only worth printing if a round realises it;
- refuses a map with no loop in it, because a tree forces every street to be
  walked exactly twice and there is nothing left to choose.

And it measures how often a postman choosing streets at random walks the
cheapest round, because a best answer that is easy to stumble into is not worth
finding:

| | best answer found by wandering |
| --- | --- |
| across the nine levels | 0.00% – 0.40% |

## Files

```
game.js               the map, the walk, the hints
style.css             streets, and how often each has been walked
data/index.json       9 levels
tools/graph.py        parity, shortest paths, the matching, Hierholzer
tools/build_pack.py   builds the maps and verifies every par by walking it
```
