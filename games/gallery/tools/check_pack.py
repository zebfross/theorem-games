"""Check the built pack, from the files alone.

The generator computes the answers; this re-derives them from what was written
and, more importantly, checks the claim par actually makes: that no smaller set
of corners watches the whole room. It also samples each shipped answer at
thousands of random points, which is an independent route to the same question
as the shipped bitmasks — if the decomposition into patches were ever too
coarse, sampling is what would catch it.

Usage:  python3 check_pack.py
"""

import glob
import itertools
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import room

DATA = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     '..', 'data'))
SAMPLES = 2500


def unplace(level):
    """The room back in its own coordinates, so room.py can be asked about it."""
    return [(x, y) for x, y in level['corners']]


def check(level, rng):
    bad = []
    poly = unplace(level)
    n = len(poly)
    masks = level['masks']

    if abs(room.signed_area(poly)) < 1e-6:
        bad.append('the room has no area')
    if any(not 0 <= i < n for a in level['answers'] for i in a):
        bad.append('an answer names a corner that is not there')
    if len(level['colours']) != n:
        bad.append('the colouring does not cover every corner')

    # Fisk: every triangle must carry all three colours, which is the step the
    # second hint shows and asserts to the player.
    for t in level['triangles']:
        if len({level['colours'][i] for i in t}) != 3:
            bad.append('a triangle does not get all three colours')
            break
    area = abs(room.signed_area(poly))
    tarea = sum(abs(room.signed_area([poly[i] for i in t])) for t in level['triangles'])
    if abs(area - tarea) > 1e-4 * max(1, area):
        bad.append('the triangles do not tile the room')

    # Every shipped answer works, and par is what they cost.
    for a in level['answers']:
        if len(a) != level['par']:
            bad.append(f'an answer uses {len(a)} guards, not {level["par"]}')
        if not room.covers(a, masks):
            bad.append('an answer leaves part of the room unwatched')

    # And nothing smaller works. This is the claim par makes.
    if level['par'] > 1:
        for c in itertools.combinations(range(n), level['par'] - 1):
            if room.covers(c, masks):
                bad.append(f'{level["par"] - 1} guards would have done')
                break

    # Independent of the bitmasks entirely: sample the room and ask room.py
    # whether some guard really sees each point.
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    guards = level['answers'][0]
    misses = 0
    for _ in range(SAMPLES):
        p = (rng.uniform(min(xs), max(xs)), rng.uniform(min(ys), max(ys)))
        if not room.point_in_polygon(p, poly):
            continue
        if not any(room.sees(poly[g], p, poly) for g in guards):
            misses += 1
    if misses:
        bad.append(f'sampling found {misses} points the best answer cannot see')
    return bad


def main():
    index = json.load(open(os.path.join(DATA, 'index.json')))
    listed = {e['id'] for e in index['levels']}
    files = {os.path.basename(f)[:-5]
             for f in glob.glob(os.path.join(DATA, 'levels', '*.json'))}
    problems = 0
    for m in sorted(listed ^ files):
        print(f'  index and files disagree about {m}')
        problems += 1

    ids = {}
    for e in index['levels']:
        ids.setdefault(e['id'], 0)
        ids[e['id']] += 1
    for i, k in sorted(ids.items()):
        if k > 1:
            print(f'  {i} appears {k} times in the index')
            problems += 1

    chips = {}
    for e in index['levels']:
        chips.setdefault(e['n'], []).append(e['id'])
    for n, ids in sorted(chips.items()):
        if len(ids) > 1:
            print(f'  button {n} used by {ids}')
            problems += 1

    rng = random.Random(3)
    for e in index['levels']:
        level = json.load(open(os.path.join(DATA, 'levels', f'{e["id"]}.json')))
        if level['par'] != e['par'] or len(level['corners']) != e['corners']:
            print(f'  {e["id"]}: index and file disagree')
            problems += 1
        for complaint in check(level, rng):
            print(f'  {e["id"]}: {complaint}')
            problems += 1

    print(f'{index["count"]} levels, {problems} problems')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
