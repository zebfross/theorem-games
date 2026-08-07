"""Comparator networks, and the trick that makes them checkable.

A comparator network is a fixed list of comparators, each joining two wires.
Values run left to right; a comparator puts the smaller of its two on the upper
wire and the larger on the lower. Nothing branches, nothing loops — the same
comparisons happen whatever the numbers are, which is what makes a network
worth having and also what makes it hard to be sure of.

**The 0-1 principle.** A network sorts every input exactly when it sorts every
input made only of zeros and ones.

One direction is obvious. The other is the useful one: suppose some input
x comes out unsorted, with a bigger value ending above a smaller one. Take the
threshold f(v) = 0 if v < t else 1 for a t between them. Comparators commute
with any non-decreasing f — min and max do — so running f(x) through the
network gives f of what x gave, which is still out of order. So a 0/1 input
fails too.

That turns "sorts every one of infinitely many inputs" into 2^n checks, and it
does something better than making the question decidable: it makes failure
*exhibitable*. A network that does not sort has a specific input of zeros and
ones that it gets wrong, and you can hand that to somebody and run it.

**Optimal size** is found here rather than looked up. Take the state to be the
set of 0/1 vectors not yet sorted and search breadth-first over comparators;
the depth at which the set becomes entirely sorted is the fewest comparators
that will do. The classical values come back out — 3, 5, 9, 12 for three to six
wires — which is the check that this file is right.
"""

import itertools
from collections import deque


def sorted_values(n):
    """The 0/1 vectors already in order: zeros above, ones below.

    Bit k is the value on wire k, and a comparator puts the larger value on the
    lower wire, so sorted means the ones occupy the bottom wires.
    """
    return frozenset((((1 << k) - 1) << (n - k)) for k in range(n + 1))


def comparators(n):
    return list(itertools.combinations(range(n), 2))


def push(values, i, j):
    """One comparator applied to a whole set of 0/1 vectors at once."""
    out = set()
    for v in values:
        if (v >> i) & 1 and not (v >> j) & 1:
            v = (v & ~(1 << i)) | (1 << j)
        out.add(v)
    return frozenset(out)


def state_after(n, network):
    """Where every 0/1 input has got to after this network."""
    values = frozenset(range(1 << n))
    for i, j in network:
        values = push(values, i, j)
    return values


def sorts(n, network):
    """Does it sort? If not, the input it gets wrong and what it makes of it.

    The witness is what the 0-1 principle buys: not "your network is wrong"
    but "here is an input, watch it come out backwards".
    """
    goal = sorted_values(n)
    for v in range(1 << n):
        out = v
        for i, j in network:
            if (out >> i) & 1 and not (out >> j) & 1:
                out = (out & ~(1 << i)) | (1 << j)
        if out not in goal:
            return False, v, out
    return True, None, None


def fewest(n, prefix=(), cap=None):
    """Fewest comparators that finish the job, and one way to do it.

    Breadth-first over the set of vectors still unsorted. Two networks that
    leave every input in the same place are the same problem from here on, so
    collapsing to that set is what keeps the search small enough to run: six
    wires from scratch is twelve comparators deep and visits about twenty
    thousand states rather than 15^12 networks.
    """
    goal = sorted_values(n)
    start = state_after(n, prefix)
    if start <= goal:
        return 0, []
    combos = comparators(n)
    seen = {start: None}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        for i, j in combos:
            nxt = push(state, i, j)
            if nxt in seen:
                continue
            seen[nxt] = (state, (i, j))
            if nxt <= goal:
                path = [(i, j)]
                back = state
                while seen[back] is not None:
                    back, move = seen[back]
                    path.append(move)
                path.reverse()
                if cap is not None and len(path) > cap:
                    return None, None
                return len(path), path
            queue.append(nxt)
    return None, None


def unsorted_count(n, network):
    """How many 0/1 inputs this network still gets wrong."""
    return len(state_after(n, network) - sorted_values(n))


if __name__ == '__main__':
    for n in range(3, 7):
        size, path = fewest(n)
        ok, _, _ = sorts(n, path)
        print(f'  {n} wires: fewest {size:2d} comparators, and it sorts: {ok}')
