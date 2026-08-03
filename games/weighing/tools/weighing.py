"""Balance puzzles: one fake coin among n, found in as few weighings as possible.

Every weighing has three outcomes — left down, right down, level — so k of them
can tell at most 3^k cases apart. There are 2n cases to tell (which coin,
and whether it is heavy or light), so no scheme can work with fewer than
log_3(2n) weighings. That counting argument is the whole theorem, and it is
visible in the game: 3^k slots, 2n coins to drop into them, and if two land in
the same slot you cannot tell them apart.

The weighings are all chosen in advance rather than one after another. That is a
real restriction — adaptive schemes are what the classic twelve-coin puzzle
usually means — but it is what makes the puzzle a thing you *arrange* and then
run, and the minimum is the same for every size that matters here.

A scheme is written as a vector per coin, one entry per weighing:

    +1  on the left pan        -1  on the right pan        0  set aside

If coin i is heavy, weighing j tips towards the pan holding it, so the outcome
vector is exactly v_i. If it is light, the scales tip the other way: -v_i. So
the scheme works exactly when all those 2n vectors are different, which needs

  * no coin set aside every time (v_i = 0 would be indistinguishable from -v_i,
    i.e. you could not say whether it was heavy or light), and
  * no two coins with v_i = ±v_j.

And each weighing needs the same number of coins on both pans, or it tips for
reasons that have nothing to do with the fake.
"""

import itertools
import random


def outcomes(design, n, k):
    """Every case this scheme can produce, as (coin, heavy?, outcome vector)."""
    out = []
    for i in range(n):
        v = tuple(design[i])
        out.append((i, True, v))
        out.append((i, False, tuple(-x for x in v)))
    return out


def balanced(design, k):
    """Does every weighing put the same number of coins on each pan?"""
    for j in range(k):
        col = [row[j] for row in design]
        if col.count(1) != col.count(-1):
            return False
    return True


def faults(design, n, k):
    """Everything wrong with a scheme, in words the game can show."""
    bad = []
    for j in range(k):
        col = [row[j] for row in design]
        if col.count(1) != col.count(-1):
            bad.append(('unbalanced', j))
    seen = {}
    for i, heavy, v in outcomes(design, n, k):
        seen.setdefault(v, []).append((i, heavy))
    for v, who in seen.items():
        if len(who) > 1:
            bad.append(('collision', v, who))
    return bad


def works(design, n, k):
    return not faults(design, n, k)


def bound(n):
    """The fewest weighings the counting argument allows: 3^k >= 2n."""
    k = 0
    while 3 ** k < 2 * n:
        k += 1
    return k


def classes(k):
    """One representative of each pair {v, -v}, excluding the all-zero vector.

    A scheme may use at most one coin from each pair: if v_i = -v_j then coin i
    heavy and coin j light tip the scales identically. And v = 0 is barred
    outright, since a coin set aside every time is its own mirror image — the
    scales stay level whether it is heavy or light.
    """
    reps = []
    seen = set()
    for v in itertools.product((-1, 0, 1), repeat=k):
        if all(x == 0 for x in v) or v in seen:
            continue
        seen.add(v)
        seen.add(tuple(-x for x in v))
        reps.append(v)
    return reps


EXACT_UPTO = 14           # above this the exhaustive walk stops finishing


def solve_exact(n, k):
    """A scheme for n coins in k weighings, or None if there is provably none.

    Exhaustive, with a prune. Coins are assigned one at a time from the class
    list, each in whichever of its two orientations still allows the pans to
    come out even; the running column sums must stay within reach of the coins
    not yet placed, since each of those can shift a column by at most one.

    Choosing the orientation during the walk rather than after it is what makes
    this finish at all: the alternative — pick n classes, then try all 2^n
    flips — gave up above twelve coins. Even so this is exponential, and past
    about twenty coins it stops returning. `solve` falls back there.
    """
    reps = classes(k)
    if len(reps) < n:
        return None
    # Vectors that use more pans first: they are the constrained ones, and the
    # sparse vectors left over are the easiest to balance the columns with.
    reps.sort(key=lambda v: -sum(abs(x) for x in v))

    def walk(design, sums, start):
        left = n - len(design)
        if any(abs(s) > left for s in sums):
            return None
        if not left:
            return design if all(s == 0 for s in sums) else None
        if len(reps) - start < left:
            return None
        for idx in range(start, len(reps)):
            v = reps[idx]
            for cand in (v, tuple(-x for x in v)):
                got = walk(design + [cand],
                           [s + x for s, x in zip(sums, cand)], idx + 1)
                if got:
                    return got
        return None

    got = walk([], [0] * k, 0)
    # Never trust the search over the rules it was meant to obey.
    return got if got and works(got, n, k) else None


def solve_random(n, k, tries=4000, seed=0):
    """A scheme found by searching rather than proved absent: pick n patterns,
    then flip their orientations until the pans come out even.

    Only ever used to *find* one. A failure here says nothing — which is why
    par is never derived from it (see `minimum`).

    The parity check is what makes this quick. Flipping a coin's orientation
    changes its column entry by 0 or 2, so the parity of each column sum is
    fixed the moment the patterns are chosen: a column touched by an odd number
    of them can never come out even, whatever the orientations. Testing that
    first throws away most subsets for the cost of a count.
    """
    reps = classes(k)
    if len(reps) < n:
        return None
    rng = random.Random(seed if seed else (n * 1000 + k))
    for _ in range(tries):
        pick = rng.sample(reps, n)
        if any(sum(1 for v in pick if v[j]) % 2 for j in range(k)):
            continue
        design = [v if rng.random() < 0.5 else tuple(-x for x in v)
                  for v in pick]
        sums = [sum(r[j] for r in design) for j in range(k)]
        # Flip whichever coin brings the pans closest to even, until none does.
        for _ in range(60 * n):
            if not any(sums):
                break
            best, gain = None, 0
            for i, v in enumerate(design):
                drop = (sum(abs(s) for s in sums)
                        - sum(abs(s - 2 * x) for s, x in zip(sums, v)))
                if drop > gain:
                    best, gain = i, drop
            if best is None:
                break
            v = design[best]
            sums = [s - 2 * x for s, x in zip(sums, v)]
            design[best] = tuple(-x for x in v)
        if works(design, n, k):
            return design
    return None


def solve(n, k):
    """A scheme for n coins in k weighings, exactly where that is affordable."""
    if n <= EXACT_UPTO:
        return solve_exact(n, k)
    return solve_random(n, k)


def minimum(n, cap=5):
    """Fewest weighings that really work, not merely the counting bound.

    Returns (k, design), or (None, None) when the answer is not settled.

    Two different kinds of certainty are in play, and par may only rest on the
    sound one. Below EXACT_UPTO the search is exhaustive, so a failure at k is a
    proof that k is impossible and par can be raised past it — which is how the
    two cases where the counting bound is *not* the answer, four coins and
    thirteen, are known. Above it the search only ever finds; a failure means
    nothing. So par is accepted up there only when a design turns up at the
    counting bound itself, since that bound is a proof rather than a guess.
    """
    lo = bound(n)
    if n <= EXACT_UPTO:
        for k in range(lo, cap + 1):
            got = solve_exact(n, k)
            if got:
                return k, got
        return None, None
    got = solve_random(n, lo)
    return (lo, got) if got else (None, None)
