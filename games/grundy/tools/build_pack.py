"""Build the level pack: four games, one theorem, and an opponent that never errs.

Every level ships three things beyond its shape.

**par** — the fewest moves the player needs to win against the shipped
opponent. Not just "can you win", because most winnable positions can be won in
several numbers of moves, and taking the shortest is the difference between
playing the position and dribbling it away.

**policy** — the opponent's reply to every position it can ever face, worked
out here and looked up there. The browser therefore does not have to reimplement
the theory to play well, and cannot disagree with it. A heuristic opponent would
have been a second implementation of the maths, free to drift from this one.

**values** — the Nim heap each visible part of the position is worth, which is
what the hints reveal. These come from the closed forms, and every one of them
is checked against the Grundy search before it is written.

Nothing is taken on trust. For each level the build asserts that the position is
winnable at all (its value is not zero), that par is achievable by playing the
line, that the policy covers every position it can be asked about, and that the
closed forms agree with the search at every reachable position. It also measures
how often a player moving at random still wins, because a game that cannot be
lost is not a game — a lesson this repository learned by shipping one.

Usage:  python3 tools/build_pack.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import theory                                   # noqa: E402
from theory import Game, NIM, TAKE, KAYLES, HACK  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

RUNG = 84.0          # gap between coins along a row
TIER = 96.0          # gap between rows
TWIG = 74.0          # length of a Hackenbush edge


def rows_of(lengths):
    """Unit numbers, laid out row by row."""
    out, n = [], 0
    for length in lengths:
        out.append(list(range(n, n + length)))
        n += length
    return out


def plant(trees):
    """Turn nested branch lists into nodes, edges and what falls with each.

    A branch is a list of the branches growing out of its far end, so `[]` is a
    single twig and `[[], []]` is a twig that forks into two. Edges are numbered
    in the order they are met, and `up[i]` is the mask of every edge that loses
    its way to the ground when edge i is cut — itself included.
    """
    nodes, edges, up = [], [], []
    spread = [0.0]

    def width(branch):
        return max(1, sum(width(c) for c in branch))

    def grow(branch, base, depth, left):
        """Plant one branch with its foot at node `base`, returning its mask."""
        span = width(branch) * RUNG
        x = left + span / 2
        top = len(nodes)
        nodes.append([round(x, 1), round(-TWIG * (depth + 1), 1)])
        idx = len(edges)
        edges.append([base, top])
        up.append(0)
        mask = 1 << idx
        at = x - span / 2
        for child in branch:
            child_span = width(child) * RUNG
            mask |= grow(child, top, depth + 1, at)
            at += child_span
        up[idx] = mask
        return mask

    grounds = []
    for tree in trees:
        base = len(nodes)
        grounds.append(base)
        nodes.append([0.0, 0.0])          # a foot on the ground
        span = width(tree) * RUNG
        nodes[base][0] = round(spread[0] + span / 2, 1)
        grow(tree, base, 0, spread[0])
        spread[0] += span + RUNG

    return nodes, edges, up, grounds


# The ladder. Each rung looks nothing like the one before and is played by
# different rules; all of them are Nim underneath, which is the whole point.
#
# Every position here has a non-zero value, so every one is winnable — except
# the last, which is the wall.
LEVELS = [
    dict(id='nim_1', kind=NIM, lengths=[3, 4],
         name='Two rows', tag='Nim'),
    dict(id='nim_2', kind=NIM, lengths=[2, 3, 4],
         name='Three rows', tag='Nim'),
    dict(id='nim_3', kind=NIM, lengths=[3, 5, 7],
         name='Three, five, seven', tag='Nim'),

    dict(id='take_1', kind=TAKE, lengths=[10], limit=3,
         name='One row, at most three', tag='Take-away'),
    dict(id='take_2', kind=TAKE, lengths=[5, 6], limit=3,
         name='Two rows, at most three', tag='Take-away'),
    dict(id='take_3', kind=TAKE, lengths=[4, 5, 6], limit=2,
         name='Three rows, at most two', tag='Take-away'),

    dict(id='kayles_1', kind=KAYLES, lengths=[7],
         name='One rack', tag='Skittles'),
    dict(id='kayles_2', kind=KAYLES, lengths=[5, 4],
         name='Two racks', tag='Skittles'),
    dict(id='kayles_3', kind=KAYLES, lengths=[11],
         name='A long rack', tag='Skittles'),

    dict(id='hack_1', kind=HACK, trees=[[[[]]], [[], []]],
         name='A stalk and a fork', tag='Hackenbush'),
    dict(id='hack_2', kind=HACK, trees=[[[], [[], []]], [[]]],
         name='A branching tree', tag='Hackenbush'),
    dict(id='hack_3', kind=HACK, trees=[[[[], []], [[]]], [[], []], [[]]],
         name='A little wood', tag='Hackenbush'),

    dict(id='wall', kind=NIM, lengths=[1, 2, 3], wall=True,
         name='One, two, three', tag='The wall'),
]


def make(spec):
    kind = spec['kind']
    if kind == HACK:
        nodes, edges, up, grounds = plant(spec['trees'])
        game = Game(kind, up={i: m for i, m in enumerate(up)})
        game.edges, game.grounds = edges, grounds
        shape = {'nodes': nodes, 'edges': edges, 'up': up, 'grounds': grounds}
    else:
        rows = rows_of(spec['lengths'])
        game = Game(kind, rows=rows, limit=spec.get('limit', 0))
        shape = {'rows': rows, 'lengths': spec['lengths']}
        if kind == KAYLES:
            # The values of an unbroken run, shipped rather than recomputed in
            # the browser. Nim and take-away have formulas a line long; Kayles
            # has a table, and a second copy of it could drift from the one the
            # build checked against the search.
            shape['runs'] = theory.KAYLES_VALUES[:max(spec['lengths']) + 1]

    start = game.full
    value = game.grundy(start)
    wall = bool(spec.get('wall'))
    if wall != (value == 0):
        raise SystemExit(f'{spec["id"]}: value {value} does not match wall={wall}')

    # Every position the opponent can ever be asked about. Walking it also
    # bounds the level: if this grows large the level is too big to ship, and
    # the build says so rather than writing a megabyte of table.
    policy = {}
    seen = {start}
    stack = [start]
    while stack:
        mine = stack.pop()
        for nxt in game.moves(mine):
            if game.over(nxt):
                continue
            back = game.reply(nxt)
            policy[str(nxt)] = back
            if back not in seen:
                seen.add(back)
                stack.append(back)
    if len(policy) > 20000:
        raise SystemExit(f'{spec["id"]}: {len(policy)} policy entries, too big')

    par = game.par(start)
    if wall:
        if par is not None:
            raise SystemExit(f'{spec["id"]}: wall level is winnable in {par}')
    else:
        if par is None:
            raise SystemExit(f'{spec["id"]}: not winnable')
        played = walk(game, start, par)
        if played != par:
            raise SystemExit(f'{spec["id"]}: par {par} but the line took {played}')

    check_forms(game, seen, policy)

    chip = ('\u00b7'.join(str(n) for n in spec['lengths'])
            if kind != HACK else f'{len(shape["edges"])} twigs')
    out = {
        'id': spec['id'], 'kind': kind, 'name': spec['name'], 'tag': spec['tag'],
        'chip': chip,
        'limit': spec.get('limit', 0),
        'units': game.units, 'start': start,
        'par': 0 if wall else par, 'wall': wall,
        'value': value,
        'policy': {k: v for k, v in policy.items()},
        'careless': round(game.careless(start), 4),
    }
    out.update(shape)
    return out


def walk(game, start, par):
    """Play the shortest winning line, to prove par is a thing that happens."""
    mask, moves = start, 0
    while True:
        best, best_left = None, None
        for nxt in game.moves(mask):
            if game.over(nxt):
                return moves + 1
            back = game.reply(nxt)
            if game.over(back):
                continue
            left = game.par(back)
            if left is not None and (best_left is None or left < best_left):
                best, best_left = back, left
        if best is None:
            raise SystemExit('the winning line ran out')
        mask, moves = best, moves + 1
        if moves > par + 2:
            raise SystemExit('the winning line overran par')


def check_forms(game, states, policy):
    """The closed forms the hints teach, against the values actually searched.

    A hint that names the wrong heap is worse than no hint: it teaches a rule
    that does not hold and sends the player to a losing move with the game's own
    authority behind it.
    """
    to_check = set(states) | {int(k) for k in policy}
    for mask in to_check:
        found = game.grundy(mask)
        if game.kind == HACK:
            told = 0
            for tree in _standing(game, mask):
                told ^= tree
        else:
            told = 0
            for v in theory.row_values(game, mask):
                told ^= v
        if told != found:
            raise SystemExit(f'{game.kind}: closed form says {told}, '
                             f'search says {found}, at {mask}')


def _standing(game, mask):
    """Values of the Hackenbush branches still rooted, by the colon principle."""
    kids = {}
    for i, (a, b) in enumerate(game.edges):
        kids.setdefault(a, []).append((i, b))

    def value(node):
        total = 0
        for i, child in kids.get(node, ()):
            if mask >> i & 1:
                total ^= value(child) + 1
        return total

    return [value(g) for g in game.grounds]


if __name__ == '__main__':
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    built = []
    for spec in LEVELS:
        lv = make(spec)
        built.append(lv)
        print(f'  {lv["id"]:10s} {lv["tag"]:12s} value {lv["value"]:2d}  '
              f'par {lv["par"]:2d}  {len(lv["policy"]):5d} replies  '
              f'careless win {100 * lv["careless"]:.2f}%', flush=True)

    for name in os.listdir(os.path.join(DATA, 'levels')):
        os.remove(os.path.join(DATA, 'levels', name))
    for lv in built:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(built),
        'levels': [{k: lv[k] for k in
                    ('id', 'kind', 'name', 'tag', 'chip', 'par')}
                   | ({'wall': True} if lv['wall'] else {})
                   for lv in built],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'wrote {len(built)} levels')
