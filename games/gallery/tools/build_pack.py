"""Generate the level pack.

Rooms are rectilinear, grown as a blob of grid squares and then outlined, which
makes them read as floor plans rather than as abstract polygons and makes it
easy to guarantee they are simple: a blob with a pinch point produces more than
one boundary loop, and those are thrown away.

Everything shipped is exact. Guards stand on corners, so there are finitely many
answers and the minimum is found by trying every subset — NP-hard in general,
trivial at this size, and worth doing properly because par is a claim that
nothing smaller exists.

Usage:  python3 build_pack.py [--count N] [--seed S]
"""

import argparse
import itertools
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import room

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', 'data'))
SCALE = 62
MARGIN = 46


def outline(grid):
    """The boundary of a blob of grid squares, as a simple polygon.

    Each square contributes its outward edges, directed so the interior stays
    on one side; following them round returns the outline. A blob pinched at a
    corner produces two loops rather than one and is rejected — and the walk has
    to be bounded, because at such a pinch one corner starts two outward edges
    and only one survives in the map, so following it can circle forever.
    """
    edges = {}
    for (x, y) in grid:
        for a, b, nb in (((x, y), (x + 1, y), (x, y - 1)),
                         ((x + 1, y), (x + 1, y + 1), (x + 1, y)),
                         ((x + 1, y + 1), (x, y + 1), (x, y + 1)),
                         ((x, y + 1), (x, y), (x - 1, y))):
            if nb not in grid:
                edges[a] = b
    if len(edges) < 4:
        return None
    start = next(iter(edges))
    poly = [start]
    cur = edges[start]
    while cur != start:
        if cur not in edges or len(poly) > len(edges):
            return None
        poly.append(cur)
        cur = edges[cur]
    if len(poly) != len(edges):
        return None

    corners = []
    for i, p in enumerate(poly):
        a, b = poly[i - 1], poly[(i + 1) % len(poly)]
        if abs(room._cross(a, p, b)) > 1e-9:
            corners.append(p)
    return [(float(x), float(y)) for x, y in corners] if len(corners) >= 6 else None


def grow(rng, w, h, squares):
    """A random blob of grid squares."""
    grid = {(w // 2, h // 2)}
    tries = 0
    while len(grid) < squares and tries < 400:
        tries += 1
        x, y = rng.choice(list(grid))
        n = rng.choice([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
        if 0 <= n[0] < w and 0 <= n[1] < h:
            grid.add(n)
    return outline(grid)


def comb(prongs, depth, base=1):
    """A corridor with prongs off it.

    The shape that makes the theorem bite. A blob grown at random is too nearly
    convex — two well-placed corners tend to see all of it — so the packs built
    that way came out almost entirely par 2. Each prong here is a dead end that
    nothing outside it can see all the way into, so the guards cannot be shared.
    """
    grid = set()
    width = prongs * 2 - 1
    for x in range(width):
        for y in range(base):
            grid.add((x, y))
    for i in range(prongs):
        for y in range(base, base + depth):
            grid.add((2 * i, y))
    return outline(grid)


def ragged_comb(rng, prongs, depth, base=1, both=False):
    """A comb knocked about a bit.

    A plain comb forces one guard per prong, but it forces it so obviously that
    there is nothing to work out — at five prongs there are nearly a thousand
    equally good answers and every one of them is "one per prong". Varying the
    prong depths, letting some hang off the other side of the corridor, and
    stirring a few squares into the walls keeps the guards from being shared
    while making it much less clear which corner covers what.
    """
    grid = set()
    width = prongs * 2 - 1 + rng.randint(0, 2)
    for x in range(width):
        for y in range(base):
            grid.add((x, y))
    for i in range(prongs):
        x = min(width - 1, 2 * i + rng.randint(0, 1))
        d = depth + rng.randint(0, 1)
        up = (not both) or rng.random() < 0.6
        for k in range(1, d + 1):
            grid.add((x, base - 1 + k) if up else (x, -k))
    for _ in range(rng.randint(0, 3)):
        x, y = rng.choice(sorted(grid))
        grid.add(rng.choice([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]))
    return outline(grid)


def careless_rate(poly, par, masks, trials=3000, seed=7):
    """How often putting par guards on random corners happens to work.

    The measure every game here is now checked against before it is built. A
    room where guessing works is not a puzzle.
    """
    rng = random.Random(seed)
    n = len(poly)
    hits = 0
    for _ in range(trials):
        hits += room.covers(rng.sample(range(n), par), masks)
    return hits / trials


def build_level(poly):
    """Everything the game needs about one room, or None if it is not a puzzle."""
    masks = room.visibility_masks(poly)
    if masks is None:
        return None                       # too awkward to settle exactly
    par, best = room.min_guards(poly, masks)
    if par is None or par < 2:
        return None                       # one guard is not a decision
    if par > 6:
        return None                       # more guards than a room this size reads

    guards, tris, colour = room.fisk_guards(poly)
    if colour is None:
        return None

    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    def place(p):
        return [round(MARGIN + (p[0] - min(xs)) * SCALE, 1),
                round(MARGIN + (p[1] - min(ys)) * SCALE, 1)]

    return {
        'corners': [place(p) for p in poly],
        'par': par,
        'answers': best[:24],
        'masks': masks,
        # What each corner can watch, for painting the light. Precomputed
        # because it never changes, and the union of the chosen ones is just
        # them drawn on top of each other.
        'sight': [[place(q) for q in room.visibility_polygon(i, poly)]
                  for i in range(len(poly))],
        # Fisk's proof, for the hint: the triangulation and its three-colouring.
        'triangles': [list(t) for t in tris],
        'colours': colour,
        'view': [0, 0,
                 round((max(xs) - min(xs)) * SCALE + 2 * MARGIN, 1),
                 round((max(ys) - min(ys)) * SCALE + 2 * MARGIN, 1)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=90)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--max-careless', type=float, default=0.35)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    os.makedirs(os.path.join(OUT, 'levels'), exist_ok=True)
    for stale in os.listdir(os.path.join(OUT, 'levels')):
        os.remove(os.path.join(OUT, 'levels', stale))

    index = []
    # Every room ever looked at, accepted or not. A small grid holds only so
    # many blobs, so without this the same rejects come round again and again
    # and each one is analysed afresh — which is where all the time went.
    tried = set()
    dropped = 0

    # Plain rooms are the way in, and they are almost all par 2: a blob grown at
    # random is close enough to convex that two well-placed corners see it all.
    # The combs are what make the theorem bite, one guard per wing that cannot
    # be shared with any other.
    recipes = [
        ('room', lambda: grow(rng, 4, 4, rng.randint(6, 9)), 8),
        ('room', lambda: grow(rng, 5, 5, rng.randint(9, 14)), 10),
        ('room', lambda: grow(rng, 6, 6, rng.randint(13, 19)), 10),
        ('wings', lambda: ragged_comb(rng, 2, rng.randint(1, 3),
                                      rng.randint(1, 2), rng.random() < 0.4), 10),
        ('wings', lambda: ragged_comb(rng, 3, rng.randint(1, 3),
                                      rng.randint(1, 2), rng.random() < 0.5), 20),
        ('wings', lambda: ragged_comb(rng, 4, rng.randint(1, 3),
                                      rng.randint(1, 2), rng.random() < 0.5), 22),
        ('wings', lambda: ragged_comb(rng, 5, rng.randint(1, 3),
                                      rng.randint(1, 2), rng.random() < 0.5), 20),
        ('wings', lambda: ragged_comb(rng, 6, rng.randint(1, 3),
                                      rng.randint(1, 2), rng.random() < 0.5), 14),
    ]

    for _name, make, want in recipes:
        made = 0
        for _ in range(4000):
            if made >= want:
                break
            poly = make()
            if poly is None or not 6 <= len(poly) <= 26:
                continue
            # Same room, different starting corner, is the same room.
            key = min(tuple(poly[k:] + poly[:k]) for k in range(len(poly)))
            if key in tried:
                continue
            tried.add(key)
            level = build_level(poly)
            if level is None:
                continue
            rate = careless_rate(poly, level['par'], level['masks'])
            if rate >= args.max_careless:
                dropped += 1
                continue
            made += 1
            # Numbered across the whole pack, not within a group: two groups can
            # each produce a room with the same corner count, and numbering per
            # group made them collide, one file overwriting the other while both
            # stayed in the index.
            lid = f'{len(poly)}c_{len(index) + 1}'
            level['id'] = lid
            with open(os.path.join(OUT, 'levels', f'{lid}.json'), 'w') as fh:
                json.dump(level, fh, separators=(',', ':'))
            index.append({'id': lid, 'corners': len(poly), 'par': level['par'],
                          'answers': len(level['answers']),
                          'careless': round(rate, 4)})

    index.sort(key=lambda e: (e['corners'], e['par'], e['id']))
    for n, e in enumerate(index, 1):
        e['n'] = n
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({
            'count': len(index),
            'note': 'Rooms are generated here and the fewest guards found by '
                    'exhaustive search, so every level ships with an exact answer.',
            'levels': index,
        }, fh, separators=(',', ':'))
    import collections
    spread = dict(sorted(collections.Counter(e['par'] for e in index).items()))
    print(f'par spread: {spread}')
    worst = max((e['careless'] for e in index), default=0)
    print(f'{len(index)} levels, {dropped} dropped as too guessable; '
          f'guessing works {100 * sum(e["careless"] for e in index) / max(1, len(index)):.1f}% '
          f'of the time (worst room {100 * worst:.0f}%)')


if __name__ == '__main__':
    main()
