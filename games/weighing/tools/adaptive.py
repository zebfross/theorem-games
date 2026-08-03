"""How many weighings the fake coin costs when you may look between them.

The game asks the player to weigh, see which way it tips, and only then choose
what to weigh next. So par has to be the worst case of the best strategy — a
minimax over weighings against a balance that answers as unhelpfully as it can
— and not the non-adaptive count the first version of this game used.

What the player knows about a coin is one of four things, and nothing else
matters — not which coin it is, only how many are in each condition:

    B  might be the fake, and might be heavy or light   (2 cases)
    H  might be the fake, and could only be heavy       (1 case)
    L  might be the fake, and could only be light       (1 case)
    G  known genuine                                    (0 cases)

G is not dead weight: a coin known to be honest is ballast, and can be dropped
on a pan to even up the count. That is the whole reason thirteen coins becomes
possible the moment you are handed one.

Only two shapes of state ever arise. B coins can only stop being B when the
scales tip, and a tip resolves *every* coin at once — those on the heavy side
are only-heavy, those on the light side only-light, and everything off the
scales is genuine. So a state either has B coins and nothing else uncertain, or
no B coins at all. That collapse is what makes this cheap enough to solve
exactly rather than approximately.

A weighing must put the same number of coins on each pan, or it tips for
reasons that have nothing to do with the fake.
"""

import functools
import itertools

INF = 99


def _pans(*groups):
    """Every way to put some of each group on the left pan and some on the right.

    `groups` are the sizes available. Yields (left counts, right counts) with
    the two pans holding the same number of coins, since an uneven weighing
    tells you nothing.
    """
    ranges = [range(g + 1) for g in groups]
    for left in itertools.product(*ranges):
        rest = [g - x for g, x in zip(groups, left)]
        for right in itertools.product(*[range(r + 1) for r in rest]):
            if sum(left) == sum(right) and sum(left) > 0:
                yield left, right


@functools.lru_cache(maxsize=None)
def split(h, l, g):
    """Weighings still needed when h coins could only be heavy, l only light.

    Every coin is accounted for: h + l + g is the whole pile.
    """
    live = h + l
    if live <= 1:
        return 0
    if live > 3 ** 6:
        return INF
    here = (h, l, g)
    best = INF
    for (hl, ll, gl), (hr, lr, gr) in _pans(h, l, g):
        # Tips left: the fake is a possibly-heavy coin on the left pan, or a
        # possibly-light one on the right. Everything else is cleared.
        down_l = (hl, lr, h + l + g - hl - lr)
        down_r = (hr, ll, h + l + g - hr - ll)
        # Level: the fake is none of the coins weighed.
        rest_h, rest_l = h - hl - hr, l - ll - lr
        level = (rest_h, rest_l, h + l + g - rest_h - rest_l)

        live = [st for st in (down_l, down_r, level) if st[0] + st[1]]
        # A weighing one of whose outcomes leaves you exactly where you started
        # has learnt nothing in that case, so it cannot belong to a best
        # strategy — weighing only genuine coins, or putting every
        # possibly-heavy coin on one pan and every possibly-light on the other,
        # which can only tip one way. Dropping these is also what makes the
        # recursion terminate: every remaining branch has strictly fewer cases
        # alive than the state it came from.
        if any(st == here for st in live):
            continue

        worst = 0
        for st in live:
            worst = max(worst, split(*st))
            if worst >= best:
                break
        else:
            best = min(best, 1 + worst)
    return best


@functools.lru_cache(maxsize=None)
def both(b, g):
    """Weighings still needed when b coins could each be heavy or light.

    g of the pile is known genuine and may be used as ballast.
    """
    live = 2 * b
    if live <= 1:
        return 0
    total = b + g
    best = INF
    for (bl, gl), (br, gr) in _pans(b, g):
        if bl + br == 0:
            continue          # only ballast on the scales; nothing to learn
        # A tip resolves everything: left-pan B coins can only be heavy now,
        # right-pan ones only light, and every coin off the scales is genuine.
        worst = max(split(bl, br, total - bl - br),
                    split(br, bl, total - bl - br))
        # Level: the fake is one of the B coins that stayed off the scales.
        rest = b - bl - br
        if rest:
            worst = max(worst, both(rest, total - rest))
        best = min(best, 1 + worst)
    return best


def minimum(n):
    """Weighings needed for n coins, one fake, heavy or light unknown."""
    return both(n, 0)


def tables(n):
    """Every position that can arise for n coins, valued in weighings.

    The game needs this at runtime twice over: to answer each weighing as
    unhelpfully as it honestly can, and to offer a best weighing when asked.
    Both are lookups rather than searches, so they are computed here and
    shipped with the level.

    `both[b]` is a position where b coins are still wholly unknown and the
    other n - b are known genuine. `split[h][l]` is one where h coins could
    only be heavy, l only light, and the rest are cleared. Those are the only
    two shapes a position can take: a coin stops being wholly unknown only when
    the scales tip, and a tip settles every coin at once.
    """
    return {
        'both': [both(b, n - b) for b in range(n + 1)],
        'split': [[split(h, l, n - h - l) if h + l <= n else INF
                   for l in range(n + 1)] for h in range(n + 1)],
    }


if __name__ == '__main__':
    import sys
    top = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    for n in range(2, top + 1):
        k = minimum(n)
        print(f'n={n:3d}  adaptive par = {k if k < INF else "impossible"}')
