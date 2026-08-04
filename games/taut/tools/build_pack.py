"""Build the level pack: drawings made here, answers computed here.

Pinning's 1074 levels come from the LooPindex catalogue, which is why that game
carries GPL-3.0 and, through it, so does this repository. These are generated,
so this game is MIT like everything else.

The interesting part is not the drawing but the *answer*. Deciding whether a
drawing is taut with a given set of pins is the hard question, and the solver
(../pinning/tools/solver.py) gets it right 99.8% of the time on the questions it
is willing to answer — while declining 470 of 1074 catalogue positions outright.

That shape is what makes this possible at all. A level is only written when the
solver answered every question about it without once declining. Declining costs
a drawing, and drawings are free; being wrong ships a puzzle whose stated
solution is untrue, and that is not.

The residual risk is stated rather than hidden. One catalogue level in 604
answered is still wrong, in the direction of claiming too few pins suffice. That
rate is measured on catalogue drawings, which are canonical minimal diagrams;
these are random polygons, so the rate here could be better or worse and is not
known. See the README.

Usage:  python3 tools/build_pack.py [count]
"""

import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pinning', 'tools')))
sys.path.insert(0, os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'lib')))

import draw                                    # noqa: E402
import solver                                  # noqa: E402
from geometry import arrangement               # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

PAD = 16.0


def build_level(rng, strand_count, corners, want_crossings):
    """One level, or None if the drawing or the answer will not do."""
    pts = draw.drawing(rng, strand_count, corners)
    arr = draw.analyse(pts)
    if arr is None:
        return None
    crossings = arr['crossings']
    if not (want_crossings[0] <= crossings <= want_crossings[1]):
        return None

    # No spikes. Smoothing rounds most corners, but a point the loop nearly
    # doubles back on stays sharp however much it is cut, and one spike is
    # enough to make a drawing look wrong next to the catalogue's right angles.
    for strand in pts:
        n = len(strand)
        for i in range(n):
            ax, ay = strand[i - 1]
            bx, by = strand[i]
            cx, cy = strand[(i + 1) % n]
            v1 = (bx - ax, by - ay)
            v2 = (cx - bx, cy - by)
            turn = abs(math.atan2(v1[0] * v2[1] - v1[1] * v2[0],
                                  v1[0] * v2[0] + v1[1] * v2[1]))
            if turn > math.radians(95):
                return None

    faces = arr['faces']
    inner = [f for f in faces if not f['outer']]
    if len(inner) < 3:
        return None
    # Every region has to be clickable, so a sliver that no honest click could
    # land in disqualifies the drawing rather than shipping as a trap.
    if any(abs(f['area']) < 900 for f in inner):
        return None

    sites = [arrangement.interior_point(f['polygon']) for f in inner]
    if any(p is None for p in sites):
        return None

    strands = [[tuple(p) for p in s] for s in pts]
    try:
        puzzle = solver.Puzzle(strands, sites)
    except Exception:
        return None
    # The drawing's own crossings, counted from the polygon encoding, must match
    # the ones measured geometrically. This catches a broken encoding before any
    # pinning answer rests on it.
    if puzzle.self_check() != puzzle.drawn:
        return None

    sets, unknown = puzzle.minimal_pinning_sets()
    if unknown or not sets:
        return None            # the solver declined somewhere; drop the drawing

    # Number the regions the way the game expects: inner regions first, outer
    # last, since the outer one is pinned for free and is drawn differently.
    sockets = []
    for i, f in enumerate(inner):
        x, y = sites[i]
        sockets.append({'n': i + 1, 'outer': False, 'polygon': f['polygon'],
                        'x': round(x, 3), 'y': round(y, 3)})
    outer = [f for f in faces if f['outer']][0]
    sockets.append({'n': len(inner) + 1, 'outer': True,
                    'polygon': outer['polygon'], 'x': 0.0, 'y': 0.0})

    generators = [[i + 1 for i in s] for s in sets]
    return {
        'rope': [[[round(x, 3), round(y, 3)] for x, y in s] for s in pts],
        'sockets': sockets,
        'generators': generators,
        'effectiveMinimum': min(len(g) for g in generators),
        'crossings': crossings,
        'regions': len(faces),
        'strands': len(pts),
        'viewBox': [-PAD, -PAD, draw.SIZE + 2 * PAD, draw.SIZE + 2 * PAD],
    }


def build(target, seed=20260804):
    rng = random.Random(seed)
    levels = []
    seen = set()
    tries = 0
    while len(levels) < target and tries < target * 400:
        tries += 1
        strand_count = rng.choice([1, 1, 1, 2])
        lv = build_level(rng, strand_count, rng.randint(5, 9), (2, 8))
        if not lv:
            continue
        key = (lv['crossings'], lv['strands'],
               tuple(sorted(tuple(g) for g in lv['generators'])))
        if key in seen:
            continue
        seen.add(key)
        levels.append(lv)
    # Easiest first: fewest crossings, then fewest pins needed.
    levels.sort(key=lambda l: (l['crossings'], l['effectiveMinimum'], l['strands']))
    for i, lv in enumerate(levels, start=1):
        lv['index'] = i
        lv['id'] = f"c{lv['crossings']}s{lv['strands']}_{i}"
    return levels, tries


if __name__ == '__main__':
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    levels, tries = build(want)
    for lv in levels:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(levels),
        'levels': [{k: lv[k] for k in
                    ('id', 'regions', 'strands', 'index', 'effectiveMinimum')}
                   for lv in levels],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    by_c = {}
    for lv in levels:
        by_c[lv['crossings']] = by_c.get(lv['crossings'], 0) + 1
    print(f'wrote {len(levels)} levels from {tries} drawings')
    print('by crossings:', dict(sorted(by_c.items())))
    print('pins needed :', dict(sorted(
        (k, sum(1 for l in levels if l['effectiveMinimum'] == k))
        for k in {l['effectiveMinimum'] for l in levels})))
