"""Generate the level pack.

Unlike Unpinning, nothing here comes from a catalogue and nothing is
NP-complete: max flow is polynomial, so levels are made up on the spot and
their answers computed exactly. That means no licence to inherit and no ceiling
on size.

Networks are laid out on a grid because a player has to read the thing at a
glance, and a grid makes "which pipes separate the two sides" a question about
the picture rather than about untangling a hairball. Source on the left, sink
on the right, water flowing across.

Levels are kept only if they are actually a puzzle. The tests are in `wanted`,
and the one that matters is that the obvious answers are wrong: cutting
everything at the source, or everything at the sink, must both cost more than
the cheapest cut. Otherwise the player never has to look at the middle of the
network, which is the only place the theorem lives.

Usage:  python3 build_pack.py [--count N] [--seed S]
"""

import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from network import Network

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'data'))

GAP_X, GAP_Y = 130, 115
MARGIN = 70

# Grid shapes to draw from, smallest first, so the pack has a way in.
SHAPES = [(2, 2), (2, 3), (3, 2), (3, 3), (3, 4), (4, 3), (4, 4), (5, 3), (5, 4)]


def build(cols, rows, rng):
    """A network on a cols x rows grid, with a source and sink either side."""
    node = {}
    pos = []
    for c in range(cols):
        for r in range(rows):
            node[(c, r)] = len(pos)
            pos.append((MARGIN + GAP_X * (c + 1), MARGIN + GAP_Y * r))
    source = len(pos)
    pos.append((MARGIN, MARGIN + GAP_Y * (rows - 1) / 2))
    sink = len(pos)
    pos.append((MARGIN + GAP_X * (cols + 1), MARGIN + GAP_Y * (rows - 1) / 2))

    edges = []
    for c in range(cols):
        for r in range(rows):
            if c + 1 < cols:
                edges.append((node[(c, r)], node[(c + 1, r)]))
            if r + 1 < rows and rng.random() < 0.75:
                edges.append((node[(c, r)], node[(c, r + 1)]))
            # an occasional diagonal, so the grid does not read as a lattice
            if c + 1 < cols and r + 1 < rows and rng.random() < 0.3:
                edges.append((node[(c, r)], node[(c + 1, r + 1)]))
    for r in range(rows):
        edges.append((source, node[(0, r)]))
        edges.append((node[(cols - 1, r)], sink))

    # drop a few, so no two levels of a shape look the same
    edges = [e for e in edges if rng.random() > 0.12]
    capped = [(u, v, rng.randint(1, 9)) for u, v in edges]
    return Network(len(pos), capped, source, sink), pos


def wanted(net):
    """Is this a puzzle, or does it answer itself?"""
    flow = net.max_flow()
    if flow == 0:
        return False
    cuts = net.min_cuts()
    size = len(cuts[0])
    if not 2 <= size <= 5:
        return False                       # one pipe is no decision; six is a chore

    # The obvious answers have to be wrong, or the middle of the network never
    # gets looked at and there is nothing to work out.
    at_source = [i for i, (u, v, _c) in enumerate(net.edges)
                 if net.source in (u, v)]
    at_sink = [i for i, (u, v, _c) in enumerate(net.edges)
               if net.sink in (u, v)]
    if net.cost(at_source) <= flow or net.cost(at_sink) <= flow:
        return False

    # and the cut should not be reachable by grabbing the cheapest pipes going
    if sorted(c for _u, _v, c in net.edges)[:size] == sorted(
            net.edges[i][2] for i in cuts[0]):
        return False
    return True


def careless_rate(net, par, trials=2000, seed=5):
    """How often spending par at random on pipes happens to separate them.

    What a player gets for not thinking, and the measure a previous game in
    this repo was built without — it turned out to be unloseable, and was
    removed. Here it should be near zero: a random handful of pipes almost
    never disconnects anything, which is what makes a level worth playing.
    """
    rng = random.Random(seed)
    order = list(range(len(net.edges)))
    wins = 0
    for _ in range(trials):
        rng.shuffle(order)
        spent, cut = 0, []
        for i in order:
            if spent + net.edges[i][2] > par:
                continue
            spent += net.edges[i][2]
            cut.append(i)
        wins += net.separates(cut)
    return wins / trials


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=120)
    ap.add_argument('--seed', type=int, default=1)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    os.makedirs(os.path.join(OUT, 'levels'), exist_ok=True)
    for stale in os.listdir(os.path.join(OUT, 'levels')):
        os.remove(os.path.join(OUT, 'levels', stale))

    index = []
    per_shape = max(1, args.count // len(SHAPES))
    careless = []
    for cols, rows in SHAPES:
        # Generate a surplus and keep the ones that punish not thinking, rather
        # than the first that happen to pass. On a small grid a random spend of
        # par separates the network fairly often just by luck, and those levels
        # play themselves.
        pool = []
        for _ in range(30 * per_shape):
            net, pos = build(cols, rows, rng)
            if not wanted(net):
                continue
            par = net.max_flow()
            pool.append((careless_rate(net, par), net.n, net, pos, par))
            if len(pool) >= 8 * per_shape:
                break
        pool.sort(key=lambda p: p[0])
        made = 0
        for rate, _n, net, pos, par in pool[:per_shape]:
            cuts = net.all_min_cuts()
            forced = sorted(set(cuts[0]).intersection(*(set(c) for c in cuts)))
            made += 1
            lid = f'{cols}x{rows}_{made}'
            xs = [p[0] for p in pos]
            ys = [p[1] for p in pos]
            level = {
                'id': lid,
                'source': net.source,
                'sink': net.sink,
                'nodes': [[round(x), round(y)] for x, y in pos],
                'edges': [[u, v, c] for u, v, c in net.edges],
                'par': par,
                'cuts': cuts,
                'forced': forced,
                'view': [min(xs) - MARGIN, min(ys) - MARGIN,
                         max(xs) - min(xs) + 2 * MARGIN,
                         max(ys) - min(ys) + 2 * MARGIN],
            }
            with open(os.path.join(OUT, 'levels', f'{lid}.json'), 'w') as fh:
                json.dump(level, fh, separators=(',', ':'))
            careless.append(rate)
            index.append({'id': lid, 'pipes': len(net.edges),
                          'nodes': net.n, 'par': par, 'cuts': len(cuts),
                          'careless': round(rate, 4)})

    for n, e in enumerate(index, 1):
        e['n'] = n
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({
            'count': len(index),
            'note': 'Networks are generated here, not catalogued: max flow is '
                    'polynomial, so every level ships with an exact answer.',
            'levels': index,
        }, fh, separators=(',', ':'))
    worst = max(careless) if careless else 0
    print(f'{len(index)} levels; spending par at random separates them '
          f'{100 * sum(careless) / max(1, len(careless)):.2f}% of the time '
          f'(worst level {100 * worst:.1f}%)')


if __name__ == '__main__':
    main()
