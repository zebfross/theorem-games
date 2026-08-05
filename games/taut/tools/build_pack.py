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
import signal
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

# How much room a pin point needs on every side, as a share of the width of the
# view it is drawn in.
#
# It was an absolute 18 units against a fixed 532-unit view. That is the same
# 3.4%, but stated as a share it survives the change below: the view is now
# cropped to the drawing rather than fixed, so a drawing that used to sit in the
# middle of the box using two thirds of the width now fills it, and every region
# is correspondingly bigger on screen. Judging clearance against the fixed box
# would have thrown away drawings that are perfectly clickable once cropped.
CLEARANCE = 0.034
PER_SHAPE = 2           # levels allowed to share one pinning structure
MAX_REGIONS = 9         # subsets to search grow as 2^this

# How many levels each crossing count may contribute.
#
# Left to itself the build is overwhelmingly bottom-heavy, because small
# drawings are far commoner and far cheaper to answer. The first 120-level pack
# came out 24 levels at 2 crossings and one at 6 — and at 2 crossings with a
# single loop there is exactly *one* diagram, the figure eight, so those 24 were
# the same puzzle drawn 24 ways. Zeb spotted it straight away: "levels 1-2 to
# 12-2 are very similar, basically the same pattern over and over."
#
# The count of distinct diagrams grows fast with crossings, so the quota grows
# with it. Where a size cannot fill its quota the build simply ships fewer, and
# says so.
QUOTA = {2: 4, 3: 18, 4: 30, 5: 24, 6: 8}

# A hard stop per drawing. Most solve in milliseconds, but the cost of a single
# tautness query grows with the number of arcs as well as the number of subsets,
# and an unlucky drawing can sit there for minutes on its own — which looks
# exactly like a hung build. Skipping it costs nothing; drawings are free.
SOLVE_SECONDS = 4.0


def build_level(rng, strand_count, corners, want_crossings):
    """One level, or None if the drawing or the answer will not do.

    Wrapped in a wall-clock limit. Most drawings resolve in milliseconds, but an
    unlucky one can sit for minutes, which is indistinguishable from a hung
    build. An earlier version timed only the subset walk, guessing that was the
    slow step — the build still hung, so the guard now covers everything and
    needs no guess about where the time goes.
    """
    old = signal.signal(signal.SIGALRM, _give_up)
    signal.setitimer(signal.ITIMER_REAL, SOLVE_SECONDS)
    try:
        return _build_level(rng, strand_count, corners, want_crossings)
    except (_TooSlow, ValueError, ZeroDivisionError):
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


class _TooSlow(BaseException):
    """Raised by the alarm, and deliberately not an `Exception`.

    Both `draw.analyse` and the `Puzzle` constructor are wrapped in bare
    `except Exception`, to drop drawings the geometry cannot handle. A
    TimeoutError is an Exception, so those handlers swallowed the alarm — and
    since the timer had already fired, the attempt then ran on with no limit at
    all. The build stalled at exactly the point the guard was supposed to
    prevent. Inheriting from BaseException means nothing between here and there
    catches it by accident.
    """


def _crop(strands):
    """A square view fitted to the drawing, rather than to the whole field.

    Square so the rope keeps its proportions whatever the board's shape.
    """
    xs = [x for s in strands for x, _ in s]
    ys = [y for s in strands for _, y in s]
    side = max(max(xs) - min(xs), max(ys) - min(ys)) + 2 * PAD
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [cx - side / 2, cy - side / 2, side, side]


def _give_up(signum, frame):
    raise _TooSlow


def _build_level(rng, strand_count, corners, want_crossings):
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
    # Answering a drawing costs 2^regions tautness queries, since the minimal
    # pinning sets are found by walking every subset. Ten regions is a thousand
    # queries and seconds of work, and it was the whole cost of generation —
    # the filtering above is cheap and happens first. The cap is what keeps a
    # pack a minute's work rather than an afternoon's.
    if len(inner) > MAX_REGIONS:
        return None

    try:
        # Raises rather than returning None on a face too degenerate to place a
        # point in, which is a drawing to throw away rather than an error.
        sites = [arrangement.interior_point(f['polygon']) for f in inner]
    except ValueError:
        return None
    if any(p is None for p in sites):
        return None

    # Every region has to be comfortably clickable. Area is the wrong measure —
    # a long thin sliver can have plenty of it and still be impossible to hit —
    # so what is checked is how far the region's own pin point sits from the
    # nearest wall. The level that prompted this had a region of area 1150,
    # over the old threshold, whose pin point had 8 units of room.
    box = _crop(pts)
    for f, site in zip(inner, sites):
        poly = [tuple(q) for q in f['polygon']]
        n = len(poly)
        room = min(arrangement._dist_to_segment(site, poly[i], poly[(i + 1) % n])
                   for i in range(n))
        if room < CLEARANCE * box[2]:
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
        'viewBox': [round(v, 3) for v in box],
    }


def build(target, seed=20260804):
    rng = random.Random(seed)
    levels = []
    seen = {}
    tries = 0
    per_c = {}
    while len(levels) < target and tries < target * 400:
        tries += 1
        strand_count = rng.choice([1, 1, 1, 2])
        # A wider corner count than the 5-9 that produced the bottom-heavy pack.
        # Crossings rise with corners, and the quota below is what stops the
        # cheap small drawings from filling the pack before the big ones arrive.
        lv = build_level(rng, strand_count, rng.randint(6, 11), (2, max(QUOTA)))
        if tries % 500 == 0:
            print(f'  {tries} drawings, {len(levels)} levels '
                  + '(' + ' '.join(f'{c}x:{n}' for c, n in sorted(per_c.items()))
                  + ')', flush=True)
        if not lv:
            continue
        if per_c.get(lv['crossings'], 0) >= QUOTA.get(lv['crossings'], 0):
            continue
        # Two drawings with the same crossings, strands and pinning sets pose
        # much the same puzzle, so a few of each is variety and a hundred is
        # padding. Refusing duplicates outright was worse: the structures run
        # out at the small sizes and the build grinds without finding anything
        # it will accept.
        key = (lv['crossings'], lv['strands'],
               tuple(sorted(tuple(g) for g in lv['generators'])))
        if seen.get(key, 0) >= PER_SHAPE:
            continue
        seen[key] = seen.get(key, 0) + 1
        per_c[lv['crossings']] = per_c.get(lv['crossings'], 0) + 1
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
    for name in os.listdir(os.path.join(DATA, 'levels')):
        os.remove(os.path.join(DATA, 'levels', name))
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
    short = {c: q - by_c.get(c, 0) for c, q in sorted(QUOTA.items())
             if by_c.get(c, 0) < q}
    if short:
        print('short of quota:', short, '- those sizes ran out, not a failure')
    print('by crossings:', dict(sorted(by_c.items())))
    print('pins needed :', dict(sorted(
        (k, sum(1 for l in levels if l['effectiveMinimum'] == k))
        for k in {l['effectiveMinimum'] for l in levels})))
