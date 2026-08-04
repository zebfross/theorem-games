"""Build the level pack.

A level is a polygon to avoid and a head start: some of an extremal
configuration already on the field, and the rest for the player to place. Par is
the Erdos-Szekeres number minus one, so a full board is the most points that can
possibly avoid that polygon — there is no better answer to find, which is the
whole shape of this game. You are not looking for the optimum; you are seeing
how close you can get to a ceiling the theorem has already fixed.

The head start is what makes a ladder out of three theorems. With most of the
configuration showing, the question is where the last point can possibly go;
with none of it, you are building from nothing. Completability never has to be
searched for, because every level is a prefix of a set that is known to work.

Usage:  python3 tools/build_pack.py
"""

import json
import os

import points as P

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

# Every level is drawn on the same field, so a configuration is scaled to fit
# it and nothing else. Scaling is an affine map and convex position is
# affine-invariant, so this cannot turn a valid configuration into an invalid
# one.
#
# What it cannot do is make a configuration less crowded. How close the closest
# pair looks, relative to the whole set, is fixed by the configuration itself —
# stretching moves the points and the field apart together. So the game's rule
# about clicking too near an existing point has to be chosen to fit the
# configurations, not the other way round; setting it first shipped eight levels
# nobody could complete.
FIELD = (900.0, 620.0)
MARGIN = 34.0


def fit(config):
    """Scale and shift a configuration to sit inside the field."""
    lo_x = min(p[0] for p in config)
    hi_x = max(p[0] for p in config)
    lo_y = min(p[1] for p in config)
    hi_y = max(p[1] for p in config)
    room_x = FIELD[0] - 2 * MARGIN
    room_y = FIELD[1] - 2 * MARGIN
    scale = min(room_x / max(1.0, hi_x - lo_x), room_y / max(1.0, hi_y - lo_y))
    # Kept as fractions rather than rounded to whole units: at these
    # coordinates a half-unit of rounding shifts a cross product by more than
    # the area that decides whether three points are in a line, so rounding can
    # quietly destroy general position.
    return [(round((p[0] - lo_x) * scale + MARGIN, 2),
             round((p[1] - lo_y) * scale + MARGIN, 2)) for p in config]


# How many points to hand over, per polygon. Fewer given away is harder.
SEEDS = {
    4: [2, 1, 0],
    5: [6, 5, 4, 3, 2, 1, 0],
    6: [14, 12, 10, 8, 6, 4, 2, 0],
}

SHAPE = {4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon'}


def build():
    best = json.load(open(os.path.join(DATA, 'extremal.json')))
    levels = []
    for k in sorted(SEEDS):
        config = fit([tuple(p) for p in best[str(k)]])
        par = P.cap(k)
        if len(config) != par:
            raise SystemExit(f'k={k}: configuration has {len(config)}, par is {par}')
        if P.has_convex(config, k):
            raise SystemExit(f'k={k}: the shipped configuration contains a convex {k}-gon')
        if not P.general_position(config, 200):
            raise SystemExit(f'k={k}: the shipped configuration is not in general position')
        gaps = [((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
                for i, a in enumerate(config) for b in config[i + 1:]]
        print(f'  k={k}: par {par}, closest pair {min(gaps):.1f}, '
              f'smallest triangle {min(abs(P.cross(x, y, z)) for x in config for y in config for z in config if x < y < z):.0f}')
        # The wall. A full board is already down — par points, the most that
        # can avoid the shape — and there is one more to place. Every legal
        # spot on the field fails, because the theorem says any par + 1 points
        # contain the polygon, so this is the one level whose whole content is
        # that it cannot be done. Reaching par is satisfying; finding out that
        # par + 1 is not merely hard but forbidden is the point of the theorem,
        # and the game had no way to show it.
        levels.append({
            'id': f'k{k}wall',
            'k': k,
            'shape': SHAPE[k],
            'par': 1,               # one point to place, and it will not save you
            'wall': par,            # how many are already down
            'seed': par,
            'field': list(FIELD),
            'given': [list(p) for p in config],
            'rest': [],
        })
        for seed in SEEDS[k]:
            levels.append({
                'id': f'k{k}s{seed}',
                'k': k,
                'shape': SHAPE[k],
                'par': par,
                'seed': seed,
                'field': list(FIELD),
                'given': [list(p) for p in config[:seed]],
                # The rest of the configuration, for the last hint. Held back
                # from the player otherwise.
                'rest': [list(p) for p in config[seed:]],
            })
    return levels


if __name__ == '__main__':
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    levels = build()
    for lv in levels:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(levels),
        'levels': [{**{key: lv[key] for key in ('id', 'k', 'par', 'seed')},
                    **({'wall': lv['wall']} if 'wall' in lv else {})}
                   for lv in levels],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'wrote {len(levels)} levels: '
          + ', '.join(f'{len(SEEDS[k])} avoiding a convex {SHAPE[k]}'
                      for k in sorted(SEEDS)))
