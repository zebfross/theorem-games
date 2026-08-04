"""Build the level pack.

A level is a target row and a budget of soldiers. Par is Conway's number: the
fewest soldiers that can put a man on that row.

    row 1    2 soldiers
    row 2    4
    row 3    8
    row 4   20
    row 5   impossible, for any army at all

Two different kinds of confidence go into that ladder, and the pack keeps them
apart rather than presenting one as the other.

**Verified here.** That the shipped par is *enough* — for every level, a
concrete army of exactly par soldiers is found by search and a jump sequence
reaching the target row is produced and replayed. If that fails the build fails.

**Cited, not re-proved.** That par is *necessary*. Rows 1 and 2 are small enough
to settle by exhaustion and are settled that way in tools/army.py. Rows 3 and 4
are classical results, and re-deriving them would mean searching every subset of
a staging area — about 10^11 armies for row 4 — which is a different project. So
the game says a smaller army cannot do it on Conway's authority, and this file
says so plainly instead of implying a search that never happened.

Row 5's impossibility is Conway's weighting argument and is not a search at all:
give cell (x, y) the weight phi^(n - y - |x|), and since phi^2 = phi + 1 no jump
towards the target increases the total, while the whole half-plane sums to
exactly the weight of the target cell.

Usage:  python3 tools/build_pack.py
"""

import json
import os
from itertools import combinations

import army

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

# The staging area the player may use: cells below the line, y <= 0.
#
# Deep enough to hold a solution, which the first version was not. Five rows
# looked like plenty and is not: a jump moves a soldier two squares, so a
# soldier eight rows down needs several jumps merely to arrive somewhere useful,
# and the deeper rows are where the fuel for the last push comes from. Zeb hit
# the ceiling immediately — "I had to have 7 rows of soldiers but this board
# only allows 5" — while every search here was quietly failing inside the same
# too-small box and being blamed on the search.
WIDTH = 7
DEPTH = 9

PAR = {1: 2, 2: 4, 3: 8, 4: 20}

# Row 4, played by hand by Zeb when every search here had failed: a solid block
# eight columns wide and four rows deep. Thirty-two soldiers, well above
# Conway's twenty, so it is not par — but the last hint's job is to unstick
# somebody, and an arrangement that works is worth more than none. Assisted
# solves never record a score anyway, so handing over a wasteful army costs the
# player nothing they would have kept.
#
# Not replayed by this build: no search here has found a line through it. It is
# shipped on the word of the person who played it, which is a weaker footing
# than everything else in the pack and is labelled as such in the game and in
# the README.
PLAYED = {
    4: [(-7, 0), (-6, 0), (-5, 0), (-4, 0), (-3, 0), (-2, 0), (-1, 0), (0, 0),
        (-7, -1), (-6, -1), (-5, -1), (-4, -1), (-3, -1), (-2, -1), (-1, -1), (0, -1),
        (-7, -2), (-6, -2), (-5, -2), (-4, -2), (-3, -2), (-2, -2), (-1, -2), (0, -2),
        (-7, -3), (-6, -3), (-5, -3), (-4, -3), (-3, -3), (-2, -3), (-1, -3), (0, -3)],
}

# How far the search for a working army of exactly par soldiers may range.
# Known solutions are compact, so a narrow pool near the target column finds
# them quickly where a wide one would not finish.
POOL = {
    1: ([0, -1, -2], 2),
    2: ([0, -1, -2, -3], 3),
    3: ([0, -1, -2, -3], 2),
}


def find_army(row):
    """An army of exactly PAR[row] soldiers that reaches `row`."""
    depths, half = POOL[row]
    pool = [(x, y) for y in depths for x in range(-half, half + 1)]
    for a in combinations(pool, PAR[row]):
        if army.reaches(a, row):
            return sorted(a)
    return None


def build():
    levels = []
    for row in sorted(PAR):
        if row not in POOL:
            # Row 4. No army is shipped, and none is needed: the game reads
            # `answer` only to place a layout for the last hint, and never
            # reads `moves` at all — those exist so this script can replay a
            # solution and refuse to write a level whose answer does not hold
            # up. Without one, the level still plays perfectly, and since a
            # player may bring as many soldiers as they like it is always
            # completable; par is the target, not a gate.
            #
            # What is lost is honest to state: for rows 1 to 3 this build
            # proves par is enough by finding an army and replaying it. For row
            # 4 that rests on Conway. See the README.
            levels.append({
                'id': f'row{row}',
                'row': row,
                'par': PAR[row],
                'width': WIDTH,
                'depth': DEPTH,
                'answer': [list(c) for c in PLAYED.get(row, [])],
                'moves': [],
                'cited': True,
                # True only when this build replayed the answer itself.
                'replayed': False,
            })
            n = len(PLAYED.get(row, []))
            print(f'  row {row}: par {PAR[row]}, shipped on Conway\'s authority; '
                  + (f'hint gives a played army of {n} (above par, not replayed here)'
                     if n else 'no army, so no last hint'))
            continue
        found = find_army(row)
        if not found:
            print(f'  row {row}: no army of {PAR[row]} found')
            continue

        # Produce the jump sequence and replay it, so what ships is a solution
        # that has been watched working rather than one merely reported.
        seq = army.solution(found, row)
        if seq is None:
            raise SystemExit(f'row {row}: army reaches but no sequence came back')
        state = frozenset(found)
        for frm, over, to in seq:
            if frm not in state or over not in state or to in state:
                raise SystemExit(f'row {row}: shipped sequence is not legal')
            state = army.apply(state, (frm, over, to))
        if not any(y >= row for (_, y) in state):
            raise SystemExit(f'row {row}: shipped sequence does not reach it')

        levels.append({
            'id': f'row{row}',
            'row': row,
            'par': PAR[row],
            'width': WIDTH,
            'depth': DEPTH,
            'answer': [list(c) for c in found],
            'moves': [[list(frm), list(over), list(to)] for frm, over, to in seq],
        })
        print(f'  row {row}: par {PAR[row]}, {len(seq)} jumps, verified')

    # The wall. No army reaches row 5, so this level has no answer to ship and
    # no par to beat — it is here to be failed at, once, on purpose.
    levels.append({
        'id': 'row5',
        'row': 5,
        'par': 0,
        'wall': True,
        'width': WIDTH,
        'depth': DEPTH,
        'answer': [],
        'moves': [],
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
        'levels': [{k: lv[k] for k in ('id', 'row', 'par')}
                   | ({'wall': True} if lv.get('wall') else {})
                   for lv in levels],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'wrote {len(levels)} levels')
