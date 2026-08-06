"""Every pinning diagram, enumerated once and drawn properly. Groundwork.

This game ships 1074 levels derived from the LooPindex catalogue, which is why
*this game* is GPL-3.0 while the engine and everything else here is MIT. To
replace that catalogue with generated levels you would need to produce diagrams
of the same quality, and this is how far that got.

It came out of Taut, a second copy of this game built on random drawings, which
was removed: its levels topped out at eight regions where the catalogue's are
mostly twelve, and small diagrams do not have enough distinct answers to stay
interesting. Zeb, on the pack it shipped: "a lot of our auto-generated puzzles
have similar solutions."

Sampling was the wrong instrument, and these two files are the right one.

## What this does

The first version scattered random points, kept whatever survived a battery of
filters, and needed a quota per crossing count plus a cap on how many levels
could share a pinning structure — all of it machinery for suppressing duplicates
after the fact. It did not work well enough. At two crossings with one loop
there is exactly one diagram, so twenty-four random drawings of it were the same
puzzle twenty-four times, and Zeb said so: "levels 1-2 to 12-2 are very similar,
basically the same pattern over and over." He also preferred the catalogue's
levels outright — "far more enjoyable since the puzzles were diverse and the
loops were very clear."

Both halves of that are addressed by not sampling.

**Diversity** comes from `diagrams.py`, which enumerates every closed curve with
n crossings exactly once. Duplicates are impossible rather than rare, and no
quota is needed because nothing is ever generated twice.

**Clarity** comes from `embed.py`, which draws each diagram by Tutte's theorem:
fix the outer face to a convex polygon, put every other crossing at the average
of its neighbours, and every face of the result is convex. A convex region is a
clickable one. The old generator got its region sizes by luck, which is why the
clearance filter threw away 94% of four-crossing drawings and everything past
six crossings.

## What is still thrown away

Only what the solver will not answer. A level is written when the solver settled
every question about that diagram without once declining — declining costs a
diagram, being wrong ships a puzzle whose stated solution is untrue.

The residual risk is stated rather than hidden. One catalogue level in 604
answered is still wrong, in the direction of claiming too few pins suffice. See
the README.

## Why it is not shipped yet

It works, and it is verified: the enumeration reproduces the LooPindex counts of
one-component diagrams exactly at four, five, six, seven and eight crossings
(1, 2, 3, 10, 27), and Tutte gives regions with far more room than sampling ever
did. What it cannot do is get past the solver, which certifies a rapidly falling
share of what is enumerated:

    crossings   diagrams   levels
        3          1         0
        4          1         0
        5          2         1
        6          3         1
        7         10         2
        8         27         1

Broken down at eight crossings, where there are enough diagrams to be worth
counting:

    declined by the solver   16
    every region too tight    7
    no layout reproduced it   3
    certified                 1

So the solver is the main loss, and declining is a property of the diagram
rather than of how it is drawn — all sixteen layouts of the trefoil shadow
decline identically, so redrawing cannot rescue one. The other ten are worth
something: a lower clearance bar and a better embedder could reach them. But
they would then face the same 59% decline, which is about four more levels out
of twenty-seven, and does not change what this is capable of.

The ceiling is the solver. Nothing further in enumeration or drawing moves it.

Usage:  python3 tools/build_enumerated.py [max crossings]
"""

import json
import os
import signal
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pinning', 'tools')))
sys.path.insert(0, os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'lib')))

import diagrams                                # noqa: E402
import embed                                   # noqa: E402
import solver                                  # noqa: E402
from geometry import arrangement               # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

PAD = 16.0
CLEARANCE = 0.030       # room a pin needs, as a share of the view's width
SOLVE_SECONDS = 400.0   # a diagram that will not answer in this long is dropped


class _TooSlow(BaseException):
    """Deliberately not an `Exception`, so broad handlers cannot swallow it."""


def _give_up(signum, frame):
    raise _TooSlow


def _crop(strands):
    """A square view fitted to the drawing rather than to the field it sits in.

    Worth doing on its own: it makes every region larger on screen for nothing,
    and since the clearance bar is a share of the view, that is the difference
    between a dense diagram being clickable and not.
    """
    xs = [x for s in strands for x, _ in s]
    ys = [y for s in strands for _, y in s]
    side = max(max(xs) - min(xs), max(ys) - min(ys)) + 2 * PAD
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [cx - side / 2, cy - side / 2, side, side]


def _verifier(n):
    """The drawing must reproduce the diagram it came from, or it is junk."""
    def check(pts):
        try:
            faces, crossings = arrangement.build([pts])
        except Exception:
            return False
        return crossings == n and len(faces) == n + 2
    return check


def resolve(puzzle, count):
    """Which pin sets hold, deciding every one of them or giving up.

    The solver declines positions it cannot settle, and a diagram is only
    shippable when *every* subset is decided — one undecided set could be a
    smaller answer than the one on offer, and shipping a par that might be
    beatable is shipping a lie.

    Declining outright wastes most of the enumeration, though. At seven
    crossings the solver typically refused fewer than one subset in ten, and
    that was enough to lose the whole diagram.

    Pinning is monotone: pins only ever make the rope harder to untangle, so a
    superset of a pinning set is pinning and a subset of a non-pinning set is
    not. That turns the decided sets into evidence about the undecided ones, and
    most of the gaps close. Returns None only if some set survives the closure
    still undecided.
    """
    full = 1 << count
    known = {}
    for mask in range(full):
        try:
            got = puzzle.taut({i for i in range(count) if mask >> i & 1})
        except Exception:
            got = solver.UNKNOWN
        if got is not solver.UNKNOWN:
            known[mask] = bool(got)

    changed = True
    while changed:
        changed = False
        for mask in range(full):
            if mask in known:
                continue
            # A pinning subset makes this one pinning too.
            if any(known.get(mask & ~(1 << i)) for i in range(count)
                   if mask >> i & 1):
                known[mask] = True
                changed = True
                continue
            # A non-pinning superset makes this one non-pinning too.
            if any(known.get(mask | 1 << i) is False for i in range(count)
                   if not mask >> i & 1):
                known[mask] = False
                changed = True
    if len(known) < full:
        return None

    minimal = []
    for mask in range(full):
        if not known[mask]:
            continue
        if all(not known[mask & ~(1 << i)] for i in range(count)
               if mask >> i & 1):
            minimal.append(sorted(i for i in range(count) if mask >> i & 1))
    return minimal


def _clearance(strands, inner, sites, box):
    """The tightest region's room, as a share of the view's width."""
    worst = 1e9
    for f, site in zip(inner, sites):
        poly = [tuple(q) for q in f['polygon']]
        k = len(poly)
        worst = min(worst, min(
            arrangement._dist_to_segment(site, poly[i], poly[(i + 1) % k])
            for i in range(k)) / box[2])
    return worst


def best_drawing(w, faces, n):
    """The layout of this diagram whose tightest region has the most room.

    Every layout draws the same puzzle, so there is nothing to lose by taking
    the roomiest and a lot to lose by taking the first one that happened to
    verify.
    """
    best = None
    for pts in embed.candidates(w, faces, _verifier(n)):
        strands = [[tuple(p) for p in pts]]
        arr_faces, _ = arrangement.build(strands)
        inner = [f for f in arr_faces if not f['outer']]
        try:
            sites = [arrangement.interior_point(f['polygon']) for f in inner]
        except ValueError:
            continue
        if any(p is None for p in sites):
            continue
        box = _crop(strands)
        room = _clearance(strands, inner, sites, box)
        if best is None or room > best[0]:
            best = (room, strands, arr_faces, inner, sites, box)
    return best


def build_level(w, faces, n):
    """One level from one enumerated diagram, or None."""
    best = best_drawing(w, faces, n)
    if best is None:
        return None
    room, strands, arr_faces, inner, sites, box = best
    crossings = n
    if room < CLEARANCE:
        return None

    old = signal.signal(signal.SIGALRM, _give_up)
    signal.setitimer(signal.ITIMER_REAL, SOLVE_SECONDS)
    try:
        puzzle = solver.Puzzle(strands, sites)
        if puzzle.self_check() != puzzle.drawn:
            return None
        sets = resolve(puzzle, len(inner))
    except _TooSlow:
        return None
    except Exception:
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)
    if not sets:
        return None

    sockets = []
    for i, f in enumerate(inner):
        x, y = sites[i]
        sockets.append({'n': i + 1, 'outer': False, 'polygon': f['polygon'],
                        'x': round(x, 3), 'y': round(y, 3)})
    outer = [f for f in arr_faces if f['outer']][0]
    sockets.append({'n': len(inner) + 1, 'outer': True,
                    'polygon': outer['polygon'], 'x': 0.0, 'y': 0.0})

    generators = [[i + 1 for i in s] for s in sets]
    return {
        'rope': [[[round(x, 3), round(y, 3)] for x, y in s] for s in strands],
        'sockets': sockets,
        'generators': generators,
        'effectiveMinimum': min(len(g) for g in generators),
        'crossings': crossings,
        'regions': len(arr_faces),
        'strands': len(strands),
        # The diagram this level *is*, in the notation it was enumerated in.
        # Two levels can never share one, which is the point of the rewrite.
        'gauss': ''.join(chr(ord('a') + c) for c in w),
        'viewBox': [round(v, 3) for v in box],
    }


def build(top):
    levels = []
    for n in range(3, top + 1):
        found = diagrams.curves(n)
        made = 0
        for w, rot, faces in found:
            lv = build_level(w, faces, n)
            if lv:
                levels.append(lv)
                made += 1
        print(f'  {n} crossings: {made} of {len(found)} diagrams became levels',
              flush=True)
    levels.sort(key=lambda l: (l['crossings'], l['effectiveMinimum']))
    for i, lv in enumerate(levels, start=1):
        lv['index'] = i
        lv['id'] = f"c{lv['crossings']}s{lv['strands']}_{i}"
    return levels


if __name__ == '__main__':
    # Reports by default and writes nothing. An earlier version of this file
    # wrote its pack straight into the game's data directory, which was
    # harmless when that game's data was generated and would now overwrite the
    # catalogue this game actually ships. Writing takes an explicit path.
    #
    #   python3 tools/enumerate_diagrams.py [max crossings] [--out DIR]
    top = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 7
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    levels = build(top)
    by_c = {}
    for lv in levels:
        by_c[lv['crossings']] = by_c.get(lv['crossings'], 0) + 1
    print(f'{len(levels)} levels the solver would certify')
    print('by crossings:', dict(sorted(by_c.items())))
    if not out:
        print('nothing written; pass --out DIR to write a pack')
        sys.exit(0)
    DATA = out
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
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
    print(f'wrote {len(levels)} levels')
    print('by crossings:', dict(sorted(by_c.items())))
    print('pins needed :', dict(sorted(
        (k, sum(1 for l in levels if l['effectiveMinimum'] == k))
        for k in {l['effectiveMinimum'] for l in levels})))
