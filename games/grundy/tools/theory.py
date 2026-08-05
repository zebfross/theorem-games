"""Impartial games, their Grundy values, and the opponent that plays them well.

Sprague and Grundy, independently: **every impartial game under normal play is
equivalent to a single Nim heap.** The size of that heap is the position's
Grundy value — the least whole number that is not the value of any position you
can move to. A position is lost for whoever must move exactly when its value is
zero, and a game made of several independent parts has the value you get by
XOR-ing the parts.

That is the whole of the game this directory builds. Four games that look
nothing like each other and are played by different rules turn out to be Nim
underneath, and the hint is the theorem: it lifts the disguise one layer at a
time until the Nim heaps are showing.

## How a position is written down

Every level is a fixed set of *units* — coins, pins or twigs — numbered from
zero, and a position is the subset of them still on the board, held as a
bitmask. That one representation covers all four games; only the legal moves
differ. It also makes the state space small and enumerable, which is what lets
the build ship a complete opponent rather than a heuristic.

## Values are searched for, not derived

Grundy values here come from the definition — the mex of the options — computed
over the whole reachable state space. The neat closed forms exist (a Nim row is
worth its own length, a take-away row of n with a limit of k is worth n mod
k+1, a Kayles run has a value from a table that is eventually periodic, a
Hackenbush branch is worth one more than the XOR of what grows out of it) and
they are what the hints teach. But they are *checked* against the search in
build_pack.py rather than trusted, because a wrong value would ship a level
whose stated winning move loses.
"""

import functools
import random
import sys

NIM = 'nim'
TAKE = 'take'
KAYLES = 'kayles'
HACK = 'hack'


class Game:
    """One level's rules: which units exist and how they may be taken.

    `rows` is a list of lists of unit numbers for the three row games. `up`
    holds, for each unit of a Hackenbush level, the mask of everything that
    falls with it — an edge takes with it every edge whose way to the ground
    runs through it.
    """

    def __init__(self, kind, rows=None, up=None, limit=0):
        self.kind = kind
        self.rows = rows or []
        self.up = up or {}
        self.limit = limit
        self.units = (sum(len(r) for r in self.rows) if self.rows
                      else len(self.up))
        self.full = (1 << self.units) - 1
        self._values = {}

    # -- moves ------------------------------------------------------------

    def moves(self, mask):
        """Every position reachable in one move, in a fixed order.

        The order is fixed and shared with the browser so that a level's par,
        computed here, is the par a player can actually achieve there.
        """
        if self.kind == HACK:
            return [mask & ~self.up[u] for u in range(self.units)
                    if mask >> u & 1]
        out = []
        for row in self.rows:
            live = [u for u in row if mask >> u & 1]
            if self.kind in (NIM, TAKE):
                # Coins come off the end of a row. Nim lets you take the whole
                # row; take-away caps you at `limit`. Taking none is not a move.
                top = len(live)
                most = top if self.kind == NIM else min(self.limit, top)
                for take in range(1, most + 1):
                    out.append(mask & ~sum(1 << u for u in live[top - take:]))
            else:
                # Kayles: one pin, or two that stand side by side. Side by side
                # means adjacent in the row with nothing knocked out between,
                # which is what makes a row split into two independent ones.
                for i, u in enumerate(live):
                    out.append(mask & ~(1 << u))
                for i in range(len(live) - 1):
                    a, b = live[i], live[i + 1]
                    if row.index(b) == row.index(a) + 1:
                        out.append(mask & ~((1 << a) | (1 << b)))
        return out

    def over(self, mask):
        return not self.moves(mask)

    def size(self, mask):
        return bin(mask).count('1')

    # -- values -----------------------------------------------------------

    def grundy(self, mask):
        """The Grundy value, straight from the definition: mex of the options.

        Memoised on the instance rather than per call. It was per call, which
        rebuilt the whole table for every question asked of it and turned the
        opponent — who asks once per option — into something quadratic.
        """
        got = self._values.get(mask)
        if got is not None:
            return got
        seen = {self.grundy(n) for n in self.moves(mask)}
        v = 0
        while v in seen:
            v += 1
        self._values[mask] = v
        return v

    # -- the opponent ------------------------------------------------------

    def reply(self, mask):
        """What the opponent plays. Deterministic, and it plays to win.

        Winning when it can, by the shortest route it can see; and when it is
        already lost, dragging the game out as long as possible so that a level
        cannot be won quickly by an opponent that gives up. Ties go to the move
        listed first, which is why `moves` fixes its order.
        """
        options = self.moves(mask)
        if not options:
            return None
        winning = [m for m in options if self.grundy(m) == 0]
        if winning:
            return min(winning, key=lambda m: (self.size(m),
                                               options.index(m)))
        return max(options, key=lambda m: (self.size(m),
                                           -options.index(m)))

    def par(self, mask):
        """Fewest moves the player needs, against that opponent. None if lost.

        Winning is not the only thing being scored: a position can usually be
        won in several numbers of moves, and taking the shortest is playing it
        sharply rather than dribbling the position away.
        """
        @functools.lru_cache(maxsize=None)
        def best(m):
            out = None
            for nxt in self.moves(m):
                if self.over(nxt):
                    return 1                    # took the last one; they cannot move
                back = self.reply(nxt)
                if self.over(back):
                    continue                    # they take the last one, we lose
                deeper = best(back)
                if deeper is not None and (out is None or deeper + 1 < out):
                    out = deeper + 1
            return out
        return best(mask)

    # -- how easily it is lost ---------------------------------------------

    def careless(self, mask, trials=4000, seed=1):
        """How often a player who moves at random still wins.

        A game nobody can lose is not a game. Every level here starts winnable,
        so this measures how much of that is skill: the closer to zero, the more
        the win is the player's own.
        """
        rng = random.Random(seed)
        won = 0
        for _ in range(trials):
            m = mask
            while True:
                mine = self.moves(m)
                if not mine:
                    break                        # I cannot move: I lost
                m = rng.choice(mine)
                back = self.reply(m)
                if back is None:
                    won += 1                     # they cannot move: I won
                    break
                m = back
        return won / trials


# -- the closed forms the hints teach, checked against the search above ----

KAYLES_VALUES = None


def kayles_table(top):
    """Grundy values of a single unbroken row of pins.

    Not a formula but a table, which is part of what makes Kayles a good
    disguise: the values go 0, 1, 2, 3, 1, 4, 3, 2, 1, 4, 2, 6 ... and settle
    into a period of twelve after a while. Nothing about the row's length tells
    you its value at a glance, and the theorem does not care.
    """
    vals = [0]
    for n in range(1, top + 1):
        seen = set()
        for take in (1, 2):
            for left in range(0, n - take + 1):
                right = n - take - left
                seen.add(vals[left] ^ vals[right])
        v = 0
        while v in seen:
            v += 1
        vals.append(v)
    return vals


def branch_value(branch):
    """A Hackenbush branch: one more than the XOR of what grows out of it.

    The colon principle. Whatever hangs above an edge can be replaced by a
    single stalk of the same value without changing the game, and an edge under
    a stalk of k just makes a stalk of k+1.
    """
    inner = 0
    for child in branch:
        inner ^= branch_value(child)
    return inner + 1


def row_values(game, mask):
    """The Nim heaps this position is really made of, for the hints to show."""
    out = []
    for row in game.rows:
        live = [u for u in row if mask >> u & 1]
        if game.kind in (NIM, TAKE):
            n = len(live)
            if n:
                out.append(n if game.kind == NIM else n % (game.limit + 1))
        else:
            run = 0
            for i, u in enumerate(row):
                if mask >> u & 1:
                    run += 1
                else:
                    if run:
                        out.append(KAYLES_VALUES[run])
                    run = 0
            if run:
                out.append(KAYLES_VALUES[run])
    return out


KAYLES_VALUES = kayles_table(40)


if __name__ == '__main__':
    print('Kayles values:', KAYLES_VALUES[:16])
    g = Game(NIM, rows=[[0, 1, 2], [3, 4, 5, 6, 7]])
    print('nim(3,5) grundy', g.grundy(g.full), 'par', g.par(g.full),
          'careless', g.careless(g.full))
    sys.exit(0)
