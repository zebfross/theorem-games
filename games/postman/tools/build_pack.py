"""Build the level pack: street maps, and the cheapest round on each.

Maps are laid on a grid with uneven spacing, so the streets have different
lengths and the cheapest pairing of the odd corners is a real choice rather
than a count. Streets are then dropped at random, which is what creates the
odd corners: a full grid is nearly all even and would need almost no repeats.

Nothing is shipped on the strength of a formula. For every level the build

  - checks the map is simple, connected, and has no corner with no streets;
  - computes par from Edmonds and Johnson: every street once, plus the
    cheapest way to pair up the odd corners;
  - *constructs a round* and walks it, asserting it covers every street,
    returns to the depot, and costs exactly par;
  - and measures how often a postman wandering at random matches par, because
    a puzzle whose best answer is easy to stumble into is not a puzzle.

The last is the check this repository learned to run: a game that cannot be
lost was shipped once and had to be taken away again.

Usage:  python3 tools/build_pack.py
"""

import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import graph                                    # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

PAD = 46


def make_map(rng, cols, rows, drop):
    """A street grid with `drop` streets missing, or None if that spoils it."""
    xs, ys = [0], [0]
    for _ in range(cols - 1):
        xs.append(xs[-1] + rng.choice([90, 110, 130, 150]))
    for _ in range(rows - 1):
        ys.append(ys[-1] + rng.choice([90, 110, 130, 150]))

    nodes = [[xs[c], ys[r]] for r in range(rows) for c in range(cols)]
    at = lambda r, c: r * cols + c                                # noqa: E731

    edges = []
    for r in range(rows):
        for c in range(cols):
            if c + 1 < cols:
                edges.append((at(r, c), at(r, c + 1)))
            if r + 1 < rows:
                edges.append((at(r, c), at(r + 1, c)))

    rng.shuffle(edges)
    edges = edges[:len(edges) - drop] if drop else edges
    edges.sort()
    if len(edges) < 6:
        return None

    # A corner left with no streets is not a corner, so it leaves the map
    # rather than disqualifying it. This matters more than it sounds: the only
    # all-even subgraph of a three-by-three grid is its outer ring, which is
    # exactly the case that strands the middle — so rejecting these would make
    # a map needing no repeats at all unbuildable, and that map is the first
    # lesson in the game.
    deg = graph.degrees(len(nodes), edges)
    keep = [i for i, d in enumerate(deg) if d > 0]
    if len(keep) < 4:
        return None
    renumber = {old: new for new, old in enumerate(keep)}
    nodes = [nodes[i] for i in keep]
    edges = [(renumber[a], renumber[b]) for a, b in edges]
    length = [abs(nodes[a][0] - nodes[b][0]) + abs(nodes[a][1] - nodes[b][1])
              for a, b in edges]

    # And the whole map has to be one piece: a postman cannot walk to a street
    # that is not joined on.
    seen, stack = {edges[0][0]}, [edges[0][0]]
    joins = {}
    for a, b in edges:
        joins.setdefault(a, []).append(b)
        joins.setdefault(b, []).append(a)
    while stack:
        for nxt in joins[stack.pop()]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    if len(seen) != len(nodes):
        return None
    return nodes, edges, length


def careless(n, edges, length, depot, target, trials=3000, seed=5):
    """How often a postman choosing streets at random walks the cheapest round.

    Wandering always finishes eventually — every street gets covered in the end
    and the depot is always reachable — so this is not "can it be lost" but "is
    the best answer worth finding". It should be close to never.
    """
    rng = random.Random(seed)
    where = graph.index_of(edges)
    joins = {}
    for i, (a, b) in enumerate(edges):
        joins.setdefault(a, []).append(b)
        joins.setdefault(b, []).append(a)
    hit = 0
    for _ in range(trials):
        at, cost, seen = depot, 0, set()
        for _ in range(400):
            nxt = rng.choice(joins[at])
            cost += length[where[(min(at, nxt), max(at, nxt))]]
            seen.add(where[(min(at, nxt), max(at, nxt))])
            at = nxt
            if len(seen) == len(edges) and at == depot:
                break
        if at == depot and len(seen) == len(edges) and cost == target:
            hit += 1
    return hit / trials


# The ladder. Small and even first, so the first thing learned is Euler's half —
# that a map with no odd corners needs no street walked twice at all — and then
# maps where the repeats have to be chosen.
#
# How many streets to drop is searched rather than fixed. A full grid is not
# even — the corners along each edge of it have three streets — so "no odd
# corners" is not something a drop count can be set to, it is something the
# search has to find. The outer ring of a three-by-three, for instance, is the
# whole grid minus the four streets at the middle.
SHAPES = [
    dict(id='round_1', name='Once round', cols=3, rows=3, drops=range(3, 7),
         want_odd=0),
    dict(id='round_2', name='Two blocks', cols=3, rows=2, drops=range(0, 3),
         want_odd=2),
    dict(id='round_3', name='Three blocks', cols=4, rows=2, drops=range(0, 4),
         want_odd=2),
    dict(id='round_4', name='A gap in the grid', cols=3, rows=3,
         drops=range(1, 5), want_odd=2),
    dict(id='round_5', name='Four corners', cols=3, rows=3, drops=range(1, 5),
         want_odd=4),
    dict(id='round_6', name='The long way round', cols=4, rows=3,
         drops=range(2, 6), want_odd=4),
    dict(id='round_7', name='Six odd corners', cols=4, rows=3, drops=range(2, 7),
         want_odd=6),
    dict(id='round_8', name='A wider round', cols=5, rows=3, drops=range(3, 8),
         want_odd=6),
    dict(id='round_9', name='The whole town', cols=5, rows=4, drops=range(4, 10),
         want_odd=8),
]


def build_one(spec, rng):
    for _ in range(6000):
        got = make_map(rng, spec['cols'], spec['rows'], rng.choice(spec['drops']))
        if not got:
            continue
        nodes, edges, length = got
        try:
            graph.index_of(edges)
        except ValueError:
            continue
        odds = graph.odd_corners(len(nodes), edges)
        if len(odds) != spec['want_odd']:
            continue

        n = len(nodes)
        target, pairs = graph.par(n, edges, length)
        walk = graph.route(n, edges, length, start=0)
        if walk is None:
            continue
        cost, seen = graph.walk_cost(walk, edges, length)
        if cost is None:
            raise SystemExit(f'{spec["id"]}: the shipped round is not a route')
        if cost != target:
            raise SystemExit(f'{spec["id"]}: par {target} but the round costs {cost}')
        if len(seen) != len(edges):
            raise SystemExit(f'{spec["id"]}: the round misses a street')
        if walk[0] != walk[-1]:
            raise SystemExit(f'{spec["id"]}: the round does not come home')

        total = sum(length)
        # A level whose answer is "walk everything once" is only worth having as
        # the lesson that such maps exist, which is what want_odd 0 is for.
        if spec['want_odd'] and target == total:
            continue
        # And a map with no loop in it is a tree, where every street has to be
        # walked exactly twice and there is nothing to choose — par comes out at
        # double the total and the pairing, which is the whole idea, never
        # matters. One street more than corners guarantees a loop.
        if spec['want_odd'] and len(edges) < len(nodes):
            continue

        # Which streets the cheapest round walks twice. This is what the last
        # hint gives away — not the route, but the repeats, which are the whole
        # content of the theorem. Counted off the verified round rather than off
        # the matching, so it describes a walk that has actually been walked.
        where = graph.index_of(edges)
        times = [0] * len(edges)
        for u, v in zip(walk, walk[1:]):
            times[where[(min(u, v), max(u, v))]] += 1
        repeats = [i for i, t in enumerate(times) if t > 1]
        if sum(times) != len(walk) - 1 or any(t == 0 for t in times):
            raise SystemExit(f'{spec["id"]}: the round does not add up')

        xs = [p[0] for p in nodes]
        ys = [p[1] for p in nodes]
        return {
            'id': spec['id'], 'name': spec['name'],
            'nodes': nodes, 'edges': [list(e) for e in edges], 'length': length,
            'depot': 0,
            'par': target, 'total': total, 'extra': target - total,
            'odds': odds, 'pairs': [list(p) for p in pairs],
            'repeats': repeats,
            'answer': walk,
            'careless': round(careless(n, edges, length, 0, target), 4),
            'viewBox': [min(xs) - PAD, min(ys) - PAD,
                        max(xs) - min(xs) + 2 * PAD,
                        max(ys) - min(ys) + 2 * PAD],
        }
    return None


if __name__ == '__main__':
    rng = random.Random(20260806)
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    built = []
    for spec in SHAPES:
        lv = build_one(spec, rng)
        if not lv:
            raise SystemExit(f'{spec["id"]}: no map matched the search')
        built.append(lv)
        print(f'  {lv["id"]:9s} {len(lv["edges"]):2d} streets  '
              f'{len(lv["odds"])} odd  total {lv["total"]:5d}  '
              f'par {lv["par"]:5d}  (+{lv["extra"]:4d})  '
              f'careless {100 * lv["careless"]:.2f}%', flush=True)

    for name in os.listdir(os.path.join(DATA, 'levels')):
        os.remove(os.path.join(DATA, 'levels', name))
    for lv in built:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(built),
        'levels': [{'id': lv['id'], 'name': lv['name'], 'par': lv['par'],
                    'streets': len(lv['edges']), 'odd': len(lv['odds'])}
                   for lv in built],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'wrote {len(built)} levels')
