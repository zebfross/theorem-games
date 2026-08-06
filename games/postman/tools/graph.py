"""Streets, rounds, and the cheapest way to walk every one of them.

A postman has to walk every street on the round and finish back at the depot.
Streets can be walked twice, and on most maps some must be — the question is
which, and how little that can cost.

**Euler** settles when nothing has to be repeated: a closed walk covering every
street exists exactly when every corner has an even number of streets meeting
it. Walking into a corner and out again uses two streets each visit, so an odd
corner cannot balance.

**Guan** asked what to do otherwise, and **Edmonds and Johnson** answered it.
The corners with an odd number of streets always come in an even number — the
degrees sum to twice the number of streets, so the odd ones must pair off — and
walking a street twice flips the parity at both its ends. So the repeats form a
set of paths pairing up the odd corners, and the cheapest round costs

    every street once, plus the cheapest way to pair up the odd corners

where the cost of pairing two corners is the shortest path between them. That
is a minimum weight perfect matching, and on the small maps here it is found by
trying every pairing: with 2k odd corners there are (2k-1)!! of them, which is
105 at eight and 945 at ten.

Nothing here is heuristic. `par` returns a number and `route` returns a walk
that achieves it, and build_pack.py refuses to ship a level where the two
disagree — the number is only worth printing if a round actually realises it.

Lengths are integers throughout. The maps are built on a grid with uneven
spacing so the lengths vary, and staying in whole numbers means the matching,
the par and the walked route can be compared exactly rather than nearly.

The maps are simple: at most one street between any two corners. `index_of`
enforces it rather than assuming it, because a second street between the same
pair would be walked once and credited twice, and every count downstream — what
is covered, what a route costs, whether par was met — would be quietly wrong.
"""

import itertools


def index_of(edges):
    """Street lookup by its two ends. Refuses a map with a doubled street."""
    out = {}
    for i, (a, b) in enumerate(edges):
        key = (min(a, b), max(a, b))
        if key in out:
            raise ValueError(f'two streets join corners {a} and {b}')
        out[key] = i
    return out


def degrees(n, edges):
    deg = [0] * n
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    return deg


def odd_corners(n, edges):
    """The corners an odd number of streets meet at. Always an even number.

    Each street adds one to the degree at each end, so the degrees sum to twice
    the number of streets — an even total, which cannot be made of an odd count
    of odd numbers.
    """
    return [i for i, d in enumerate(degrees(n, edges)) if d % 2]


def shortest(n, edges, length):
    """Every corner to every corner, by Floyd-Warshall. Small maps, plain code."""
    INF = float('inf')
    dist = [[INF] * n for _ in range(n)]
    step = [[None] * n for _ in range(n)]
    for i in range(n):
        dist[i][i] = 0
    for i, (a, b) in enumerate(edges):
        if length[i] < dist[a][b]:
            dist[a][b] = dist[b][a] = length[i]
            step[a][b] = b
            step[b][a] = a
    for k in range(n):
        for i in range(n):
            if dist[i][k] == INF:
                continue
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
                    step[i][j] = step[i][k]
    return dist, step


def path_between(step, a, b):
    """The corners along the shortest path, a to b inclusive."""
    if step[a][b] is None:
        return None
    out = [a]
    while a != b:
        a = step[a][b]
        out.append(a)
    return out


def cheapest_pairing(odds, dist):
    """The cheapest way to pair up the odd corners, and what it costs.

    Every pairing is tried. The recursion always pairs the first corner still
    unpaired, which is what stops the same pairing being counted in every order
    its pairs could be listed.
    """
    best = {'cost': None, 'pairs': None}

    def walk(left, pairs, cost):
        if best['cost'] is not None and cost >= best['cost']:
            return                       # no pairing from here can be cheaper
        if not left:
            best['cost'] = cost
            best['pairs'] = list(pairs)
            return
        a = left[0]
        for i in range(1, len(left)):
            b = left[i]
            walk(left[1:i] + left[i + 1:], pairs + [(a, b)], cost + dist[a][b])

    walk(list(odds), [], 0)
    return best['cost'], best['pairs']


def par(n, edges, length):
    """The cheapest round: every street once, plus the cheapest repeats."""
    total = sum(length)
    odds = odd_corners(n, edges)
    if not odds:
        return total, []                 # Euler: nothing need be walked twice
    dist, step = shortest(n, edges, length)
    extra, pairs = cheapest_pairing(odds, dist)
    return total + extra, pairs


def route(n, edges, length, start=0):
    """A closed walk achieving par, as a list of corners. None if there is none.

    The repeats from the matching are added as extra copies of streets, which
    makes every degree even, and then Hierholzer's algorithm walks the lot.
    """
    odds = odd_corners(n, edges)
    multi = [(a, b, length[i]) for i, (a, b) in enumerate(edges)]
    if odds:
        dist, step = shortest(n, edges, length)
        _, pairs = cheapest_pairing(odds, dist)
        where = index_of(edges)
        for a, b in pairs:
            way = path_between(step, a, b)
            for u, v in zip(way, way[1:]):
                multi.append((u, v, length[where[(min(u, v), max(u, v))]]))

    if any(d % 2 for d in degrees(n, [(a, b) for a, b, _ in multi])):
        return None                      # the repeats did not balance it

    # Hierholzer: walk until stuck, then splice in detours from corners that
    # still have streets left.
    at = {i: [] for i in range(n)}
    for idx, (a, b, _) in enumerate(multi):
        at[a].append((b, idx))
        at[b].append((a, idx))
    used = [False] * len(multi)
    stack = [start]
    circuit = []
    while stack:
        v = stack[-1]
        nxt = None
        while at[v]:
            to, idx = at[v][-1]
            if used[idx]:
                at[v].pop()
                continue
            nxt = (to, idx)
            break
        if nxt is None:
            circuit.append(stack.pop())
        else:
            used[nxt[1]] = True
            stack.append(nxt[0])
    circuit.reverse()
    if len(circuit) != len(multi) + 1:
        return None                      # not connected: some street unreachable
    return circuit


def walk_cost(walk, edges, length):
    """What a route costs, and which streets it covered. None if a step is not a
    street — the check that a shipped route is a route at all."""
    where = index_of(edges)
    cost = 0
    seen = set()
    for u, v in zip(walk, walk[1:]):
        key = (min(u, v), max(u, v))
        if key not in where:
            return None, None            # that step is not a street
        cost += length[where[key]]
        seen.add(where[key])
    return cost, seen
