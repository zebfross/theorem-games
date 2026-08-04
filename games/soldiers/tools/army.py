"""Conway's soldiers: how far above the line can checker-jumping reach?

Soldiers stand on a grid below a line. A soldier may jump over a neighbour into
the empty cell beyond, orthogonally, and the soldier jumped over is removed —
peg solitaire, on an unbounded board, with all the pieces starting on one side.

How few soldiers does it take to get one of them to row n above the line?

    row 1    2 soldiers
    row 2    4
    row 3    8
    row 4   20
    row 5   impossible, for any number of soldiers whatsoever

That last line is Conway's, and it is the reason to build this. Not hard, not
unknown — impossible, proved by giving cell (x, y) the weight phi^(n - y - |x|)
where phi is the golden ratio, chosen precisely because phi^2 = phi + 1 makes a
jump towards the target never increase the total. The whole half-plane below the
line sums to exactly 1, which is the weight of the single target cell, and the
sum is strictly decreasing in practice, so the target can never be occupied.

An infinite army, arranged however you like, cannot put one man on row 5.

The ladder 2, 4, 8, 20 is what makes it a game rather than a curiosity: four
levels with exact, classical pars, each a construction the player builds, and
then a wall that no amount of cleverness gets through.
"""

import heapq
from functools import lru_cache

# Below the line is y <= 0; the target rows are y = 1, 2, 3, ...
JUMPS = ((0, 1), (0, -1), (1, 0), (-1, 0))


def moves(army):
    """Every jump available, as (from, over, to).

    THIS RULE EXISTS TWICE — here, and as `jumpsFrom` in game.js — because the
    search runs offline and the game runs in a browser. Two implementations of
    one rule is exactly the thing that drifts silently, and if they drifted, a
    line a player found would be unreproducible here and I would go on blaming
    the search. So they were compared: identical jumps offered on random boards,
    checked cell by cell through the game's own click path. They agree.

    Worth repeating if either side is touched. The first attempt at that
    comparison reported a disagreement that was not real — the harness picked
    soldiers up one after another on a shared board, and picking up a soldier
    with no jumps *removes* it, so the board was being eaten as it was measured.
    """
    out = []
    for (x, y) in army:
        for dx, dy in JUMPS:
            over = (x + dx, y + dy)
            to = (x + 2 * dx, y + 2 * dy)
            if over in army and to not in army:
                out.append(((x, y), over, to))
    return out


def apply(army, move):
    frm, over, to = move
    return frozenset(army - {frm, over} | {to})


def reaches(army, row):
    """Can this army put somebody on `row`? Depth-first with memoing.

    Every jump removes exactly one soldier, so the search is bounded by the
    size of the army and cannot loop.
    """
    seen = set()

    def walk(a):
        if any(y >= row for (_, y) in a):
            return True
        if a in seen:
            return False
        seen.add(a)
        return any(walk(apply(a, m)) for m in moves(a))

    return walk(frozenset(army))


def solution(army, row):
    """A jump sequence that reaches `row`, or None. Same search, kept."""
    seen = set()

    def walk(a, path):
        if any(y >= row for (_, y) in a):
            return path
        if a in seen:
            return None
        seen.add(a)
        for m in moves(a):
            got = walk(apply(a, m), path + [m])
            if got is not None:
                return got
        return None

    return walk(frozenset(army), [])


def cells_below(width, depth):
    """The staging area: a block of cells below the line to choose from."""
    return [(x, y) for y in range(0, -depth, -1)
            for x in range(-width, width + 1)]


def fewest(row, width=4, depth=4, cap=12):
    """The fewest soldiers that can reach `row`, searched by growing armies.

    Armies are tried smallest first, so the first that works is minimal. This
    is only affordable for the small rows — row 4 needs twenty soldiers and the
    number of twenty-cell subsets is astronomical — which is why the pack ships
    known configurations and checks them rather than searching for them.
    """
    from itertools import combinations
    pool = cells_below(width, depth)
    for size in range(1, cap + 1):
        for army in combinations(pool, size):
            if reaches(army, row):
                return size, army
    return None, None


def climb_to(start, row, cap=600000):
    """Best-first hunt for a jump sequence reaching `row`, or None.

    `reaches` explores in whatever order moves come out, which is fine for a
    handful of pieces and hopeless for twenty: the tree is enormous and an
    arbitrary order wanders sideways forever. This orders the frontier by how
    high the army has got and how concentrated it still is, which is what the
    weighting argument says matters — and it finds a line quickly when one is
    there.

    Best-first, so a `None` here means "not found within `cap` positions", not
    "impossible". Only the exhaustive `reaches` may be read as a proof.

    It settles rows 1 to 3 instantly and has not found row 4. Two orderings
    were tried — by height, and by Conway weight alone — and neither got there
    inside 400,000 positions.

    AND A SECOND ONE, since the first correction was itself half right. Extra
    soldiers do block landings, but adjacency is the binding constraint: a jump
    needs two *neighbouring* soldiers, so an army thin enough to avoid blocking
    cannot move at all. Counted on a seven-row footprint, a packed block of 63
    soldiers has 32 legal jumps and a checkerboard of 32 has zero. Density is
    what play needs.

    A WRONG INFERENCE, RECORDED because it nearly went in the README as fact.
    Feeding the search a deliberately oversized army (55 soldiers) also failed,
    and I read that as proof the search was at fault rather than the armies,
    on the reasoning that a bigger army can only help. It cannot. A jump needs
    an *empty* cell to land in, so extra soldiers block as easily as they
    assist, and a packed board is worse than a sparse one. Supersets are not
    monotone here, and the 55-soldier failure says nothing whatever about the
    search.
    """
    import heapq
    PHI = (1 + 5 ** 0.5) / 2

    def score(a):
        top = max(y for (_, y) in a)
        # Conway's weight, with the target on `row` above the centre column.
        w = sum(PHI ** -(abs(x) + abs(row - y)) for (x, y) in a)
        return (-top, -w)

    start = frozenset(start)
    seen = {start}
    heap = [(score(start), 0, start, [])]
    tick = 0
    while heap and tick < cap:
        _, _, cur, path = heapq.heappop(heap)
        if any(y >= row for (_, y) in cur):
            return path
        for m in moves(cur):
            nxt = apply(cur, m)
            if nxt in seen:
                continue
            seen.add(nxt)
            tick += 1
            heapq.heappush(heap, (score(nxt), tick, nxt, path + [m]))
    return None
