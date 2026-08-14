"""Chomp, solved exhaustively.

A bar of chocolate with the corner square poisoned. Taking a square takes
everything above and to the right of it with it, so the shape left behind is
always a staircase: if a square is still there, so is every square below and to
the left of it. That means a position is nothing more than the width of each
row, and those widths never increase as you go up.

So a position is a partition inside the box, and there are only C(rows+cols,
rows) of them — 792 for a five by seven bar. The whole game fits in memory
several times over, which is why everything here is exhaustive search rather
than cleverness.

WHAT THE THEOREM SAYS, AND WHAT IT REFUSES TO SAY. On any rectangle bigger than
a single square the player who moves first wins, by strategy stealing: suppose
the second player had a winning reply to every opening. Then the first player
could open by taking the far corner alone, look at the winning reply that is
supposed to exist, and — since that reply is itself a position reachable in one
move from the full bar — could have played it as their opening instead. The
assumption defeats itself, so no such second-player strategy exists.

The proof is famously non-constructive. It shows a winning move is there and
tells you nothing whatever about which one it is. That is the whole character
of this game, and it is why the hints here are a search result rather than a
rule: there is no rule to give.

Conventions used throughout:

    pos      widths of each row, from the poisoned row upward, non-increasing
    (r, c)   row r counting up from the poison, column c counting right
    (0, 0)   the poisoned square

Run this file directly to print what it knows about a range of bars.
"""

from functools import lru_cache

# Positions and moves are keyed as strings of digits, which is what ships in
# the level files, so a column count past nine would need a real encoding.
MAX_SIDE = 9


def moves(pos):
    """Every legal move as (r, c).

    Eating the poison is not among them. It is a thing the player can do — and
    losing that way is the point of the game — but it is never a move anybody
    would choose, so the search treats a position holding only the poison as
    one with no moves left, and the player to move there has lost.
    """
    out = []
    for r, w in enumerate(pos):
        for c in range(w):
            if (r, c) != (0, 0):
                out.append((r, c))
    return out


def after(pos, r, c):
    """The position left when (r, c) is taken, with everything up and right."""
    return tuple(min(w, c) if i >= r else w for i, w in enumerate(pos))


@lru_cache(maxsize=None)
def winning(pos):
    """Can the player to move force a win?

    Positions are keyed by their own widths, so the same shape reached from
    different bars shares the answer, and a taller bar costs only the states it
    actually adds.
    """
    return any(not winning(after(pos, r, c)) for r, c in moves(pos))


@lru_cache(maxsize=None)
def longest(pos):
    """Plies left if both sides drag it out as far as they can."""
    legal = moves(pos)
    return 1 + max((longest(after(pos, *m)) for m in legal), default=-1) if legal else 0


@lru_cache(maxsize=None)
def reply(pos):
    """The opponent's move from `pos`, or None if only the poison is left.

    Perfect and deterministic, because it ships with the level and a level's
    par has to be reproducible. Among winning moves it takes the first in
    reading order; when the position is already lost it plays the move that
    drags the game out longest, which is the least helpful thing it can do and
    therefore the honest thing to measure a par against.
    """
    legal = moves(pos)
    if not legal:
        return None
    fatal = [m for m in legal if not winning(after(pos, *m))]
    if fatal:
        return min(fatal)
    return max(legal, key=lambda m: (longest(after(pos, *m)), m))


def solve(start):
    """Everything a level needs: par, and per position the reply, need and best.

    `need[pos]` is how many more moves the player must make to win from `pos`
    against the shipped opponent, and `best[pos]` is a move that achieves it.
    Both are computed against `reply` rather than against perfect play in the
    abstract, so the number the hint quotes is the number the player will
    actually take if they follow it.
    """
    need, best = {}, {}
    walking = set()

    def solve_from(pos):
        if pos in need:
            return need[pos]
        if pos in walking:                    # impossible: every move shrinks
            raise AssertionError('cycle in a game that strictly decreases')
        walking.add(pos)

        cheapest, choice = None, None
        for m in moves(pos):
            mid = after(pos, *m)
            if not moves(mid):
                cost = 1                      # they face the poison alone
            else:
                back = after(mid, *reply(mid))
                if not moves(back):
                    continue                  # their reply leaves us the poison
                deeper = solve_from(back)
                if deeper is None:
                    continue
                cost = 1 + deeper
            if cheapest is None or cost < cheapest:
                cheapest, choice = cost, m

        walking.discard(pos)
        need[pos] = cheapest
        if choice is not None:
            best[pos] = choice
        return cheapest

    for pos in every_position(start):
        solve_from(pos)

    par = need[start]
    # The search and the theory have to agree, on every position, or one of
    # them is wrong. A position is winnable against this opponent exactly when
    # the player to move wins it against any opponent, because this one is
    # perfect — if these ever parted company the opponent would not be.
    for pos in every_position(start):
        assert (need[pos] is not None) == winning(pos), f'disagreement at {pos}'
    return par, need, best


def every_position(start):
    """Every position reachable from `start`, itself included."""
    seen, stack = set(), [start]
    while stack:
        pos = stack.pop()
        if pos in seen:
            continue
        seen.add(pos)
        for m in moves(pos):
            stack.append(after(pos, *m))
    return seen


def rectangle(rows, cols):
    if rows > MAX_SIDE or cols > MAX_SIDE:
        raise ValueError(f'level keys are digits, so sides must be {MAX_SIDE} or fewer')
    return tuple([cols] * rows)


def key(pos):
    """A position as digits, bottom row first: (7,7,5) -> '775'."""
    return ''.join(str(w) for w in pos)


def move_key(m):
    return f'{m[0]}{m[1]}'


if __name__ == '__main__':
    print(f"{'bar':>6} {'positions':>10} {'par':>4} {'openings':>9} {'only right move':>16}")
    for rows in range(2, 7):
        for cols in range(2, 9):
            start = rectangle(rows, cols)
            par, need, best = solve(start)
            spots = every_position(start)
            winnable = [p for p in spots if winning(p)]
            forced = sum(1 for p in winnable
                         if sum(1 for m in moves(p) if not winning(after(p, *m))) == 1)
            opens = sum(1 for m in moves(start) if not winning(after(start, *m)))
            print(f'{rows}x{cols:<4} {len(spots):>10} {par:>4} {opens:>9}'
                  f' {forced}/{len(winnable):>10}')
