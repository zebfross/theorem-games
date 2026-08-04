"""Find a row-4 army, now that row 4 is known to be reachable here.

Two changes from the searches that failed.

**A heuristic that measures the right thing.** Ordering by "how high has anybody
got" rewards a soldier who is high but stranded in the wrong column. What
matters is how far the nearest soldier is from the target *cell*, which on this
board is the Manhattan distance, so that is what the frontier is sorted by.

**Start generous, then prune.** Rather than guessing a twenty-cell army and
asking whether it works, give the search plenty to work with, find any solution
at all, and then throw away every soldier that never took part. That is safe:
a jump needs its source and the jumped piece occupied and its landing cell
empty, so removing an uninvolved soldier can only make landing cells emptier and
never invalidates a move. What is left is the army that did the work.

STILL NOT ENOUGH. Four million positions from a thirty-six cell block found
nothing, on top of the earlier attempts. Zeb reached row 4 by hand in the game,
which settles that the mechanics allow it and that every failure here is the
search rather than the rules. So the honest conclusion is that machine search
was the wrong tool for this and a person poking at it was the right one, and
the configuration is worth taking from the player rather than rediscovering.

The pruning above is still the useful part: hand it any working arrangement,
however wasteful, and it returns the soldiers that actually did the work.
"""
import heapq
import sys

import army

PHI = (1 + 5 ** 0.5) / 2
TARGET = (0, 4)


def near(a):
    return min(abs(x - TARGET[0]) + abs(y - TARGET[1]) for (x, y) in a)


def weight(a, row):
    return sum(PHI ** -(abs(x) + abs(row - y)) for (x, y) in a)


def solve(start, row=4, cap=4000000):
    s = frozenset(start)
    seen = {s}
    heap = [((near(s), -weight(s, row)), 0, s, [])]
    tick = 0
    while heap and tick < cap:
        _, _, cur, path = heapq.heappop(heap)
        if any(y >= row for (_, y) in cur):
            return path
        for m in army.moves(cur):
            nxt = army.apply(cur, m)
            if nxt in seen:
                continue
            seen.add(nxt)
            tick += 1
            heapq.heappush(heap, ((near(nxt), -weight(nxt, row)), tick, nxt,
                                  path + [m]))
    return None


def participants(start, seq):
    """The soldiers that actually take part, traced back to where they began.

    A piece is followed through the jumps it makes, so a soldier that moves
    three times is one soldier, counted once, at its starting cell.
    """
    where = {c: c for c in start}          # current cell -> starting cell
    used = set()
    for frm, over, to in seq:
        used.add(where[frm])
        used.add(where[over])
        where[to] = where.pop(frm)
        where.pop(over)
    return sorted(used)


if __name__ == '__main__':
    depth = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    pool = [(x, y) for y in range(0, -depth, -1)
            for x in range(-width, width + 1)]
    print(f'searching from {len(pool)} cells', flush=True)
    seq = solve(pool)
    if seq is None:
        print('no solution found', flush=True)
        raise SystemExit(1)
    used = participants(pool, seq)
    print(f'solution in {len(seq)} jumps, {len(used)} soldiers took part',
          flush=True)
    print('ARMY', used, flush=True)
    # The pruned army must reach row 4 on its own, or the pruning was wrong.
    again = solve(used)
    print('pruned army reaches row 4:', again is not None, flush=True)
    if again is not None:
        print('JUMPS', len(again), flush=True)
