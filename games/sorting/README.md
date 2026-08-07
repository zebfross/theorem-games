# Sorting networks — and the trick that makes them checkable

A comparator network is a fixed list of comparisons. Values run left to right;
a comparator joining two wires puts the smaller on the upper and the larger on
the lower. Nothing branches, nothing loops — the same comparisons happen
whatever the numbers are.

That is what makes a network worth having, and also what makes it hard to be
sure of. There are infinitely many inputs.

## The 0-1 principle

> A network sorts every input exactly when it sorts every input made only of
> zeros and ones.

One direction is obvious. The other is the useful one. Suppose some input comes
out unsorted, with a bigger value ending above a smaller one. Take the
threshold *f(v) = 0 if v < t else 1* for a *t* between them. Comparators
commute with any non-decreasing function — min and max do — so running *f(x)*
through the network gives *f* of what *x* gave, which is still out of order. A
zero-one input fails too.

So "sorts all of infinitely many inputs" becomes 2ⁿ checks. But it does
something better than making the question decidable: it makes failure
**exhibitable**. A network that does not sort has a *specific* input of noughts
and ones that it gets wrong, and this game runs that input down the wires in
front of you.

That is the reason this game is here. Every other game on the shelf shows you
**that** you fell short — a dark corner, a leak, an unwalked street. This one
hands you the counterexample.

## Par is searched for, not quoted

The smallest networks are classical, and they are found here rather than looked
up. The state is the set of zero-one vectors not yet sorted; breadth-first
search over comparators finds the depth at which that set becomes entirely
sorted:

| wires | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- |
| fewest comparators | **3** | **5** | **9** | **12** |

which agrees with the known values. Two networks leaving every input in the
same place are the same problem from there on, and collapsing to that set is
what keeps the search runnable: six wires is twelve deep and visits about
twenty thousand states rather than 15¹² networks.

Seven wires is out of reach here, so the pack gets its variety from **finish
it** levels instead — a network somebody started, and the fewest comparators
that complete it. Same question, different starting state.

## The hints are the proof

- **Once** — you do not have to try every input, only the 2ⁿ made of noughts
  and ones, and this many of them still come out wrong.
- **Twice** — a specific one it gets wrong, and what it comes out as. True
  whatever you eventually build, so it teaches the method rather than giving
  away a comparator.
- **Again** — a smallest completion, placed for you to run.

## What is checked

Every par is checked twice, by two different routes. The search returns a
completion as well as a number; the build then runs that completion through a
separate function that tests all 2ⁿ zero-one inputs. A par nothing achieves is
not a par, and a completion that does not sort is not a completion. The build
also refuses a prefix that already sorts, since there would be nothing to do.

And it measures how often comparators thrown down at random finish in par:

| | careless par |
| --- | --- |
| three wires | 21.8% |
| four wires and up | 0.00% – 0.83% |

**Three wires is the outlier and is deliberate.** With three comparators
available and three needed, a random guess lands on the answer about one time
in five. It is kept as the level that teaches the mechanic, and the ladder
proper starts at four — where the same guessing wins 0.18% of the time.

## Files

```
game.js               wires, comparators, and the witness animation
style.css             wires, comparators, and the values running down them
data/index.json       10 levels
tools/network.py      the 0-1 principle, the search, and the witness
tools/build_pack.py   builds the levels and verifies every par twice
```
