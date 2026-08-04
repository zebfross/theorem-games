"""Random multiloop drawings, made here rather than taken from a catalogue.

Pinning ships 1074 levels derived from the LooPindex catalogue, which is why
that game — and through it the whole repository — carries GPL-3.0. Everything
else here is generated and MIT. This is the attempt to generate these too.

A drawing is one or more closed polylines that cross each other and themselves
transversally. Random points joined in a random order give exactly that, and
generically avoid the degeneracies the arrangement code refuses to handle: three
strands through a point, tangencies, and crossings at a vertex.

The arrangement itself — splitting segments at crossings and walking the faces —
is `lib/geometry/arrangement.py`, written for the original game and reused here
unchanged. The faces are the regions a pin can go in.

Nothing here decides whether a drawing is any good as a puzzle. It makes
drawings; `build_pack.py` decides.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))), 'lib'))

from geometry import arrangement           # noqa: E402

SIZE = 500.0
MARGIN = 40.0


def loop(rng, corners, radius, centre, wobble=0.30):
    """A closed polyline through `corners` points, in a scrambled order.

    Points sit on a circle with a jittered radius and a jittered angle, then are
    visited in a shuffled order. Visiting them in angular order would give a
    convex polygon with no crossings at all; shuffling is what makes the strand
    cross itself.
    """
    cx, cy = centre
    pts = []
    for i in range(corners):
        a = 2 * math.pi * (i + rng.uniform(-0.3, 0.3)) / corners
        r = radius * (1 + rng.uniform(-wobble, wobble))
        pts.append((round(cx + r * math.cos(a), 3),
                    round(cy + r * math.sin(a), 3)))
    order = list(range(corners))
    rng.shuffle(order)
    return [pts[i] for i in order]


def smooth(points, rounds=3):
    """Round off the corners, by Chaikin's corner cutting.

    Each pass replaces every corner with two points a quarter and three
    quarters along its edges, so the polyline converges on a curve. Three
    passes turns a spiky heptagon into something with the rounded feel of the
    catalogue's drawings, whose ropes are axis-aligned rectangles and so round
    off pleasantly under a thick stroke where random angles do not.

    Done here rather than at drawing time on purpose: the arrangement and the
    solver must see exactly the curve the player sees, or the regions and the
    crossings will not be the ones on the screen. Smoothing can move a crossing
    or remove one, and analysing afterwards means whatever comes out is
    consistent with itself.
    """
    for _ in range(rounds):
        out = []
        n = len(points)
        for i in range(n):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % n]
            out.append((round(0.75 * x0 + 0.25 * x1, 3),
                        round(0.75 * y0 + 0.25 * y1, 3)))
            out.append((round(0.25 * x0 + 0.75 * x1, 3),
                        round(0.25 * y0 + 0.75 * y1, 3)))
        points = out
    return points


def drawing(rng, strands, corners):
    """A whole drawing: `strands` closed polylines over a shared field."""
    out = []
    for s in range(strands):
        # Overlapping circles, so separate strands actually meet each other
        # rather than sitting side by side in their own corners.
        ang = 2 * math.pi * s / max(1, strands) + rng.uniform(-0.4, 0.4)
        off = 0 if strands == 1 else (SIZE - 2 * MARGIN) * 0.14
        centre = (SIZE / 2 + off * math.cos(ang), SIZE / 2 + off * math.sin(ang))
        radius = (SIZE / 2 - MARGIN) * rng.uniform(0.72, 0.95)
        out.append(smooth(loop(rng, corners, radius, centre)))
    return out


def analyse(strands):
    """The arrangement of a drawing, or None if it is degenerate.

    `arrangement.build` raises or returns nonsense on drawings the theory does
    not cover — three strands through one point, a crossing exactly at a vertex
    — and rather than trying to repair those, they are thrown away. Random
    drawings are cheap.
    """
    try:
        faces, crossings = arrangement.build(strands)
    except Exception:
        return None
    return {'faces': faces, 'crossings': crossings}


if __name__ == '__main__':
    rng = random.Random(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
    for trial in range(6):
        d = drawing(rng, rng.choice([1, 1, 2]), rng.randint(5, 9))
        arr = analyse(d)
        print(f'trial {trial}: {len(d)} strand(s), '
              + ('degenerate' if arr is None
                 else f'{arr["crossings"]} crossings, '
                      f'{len(arr["faces"])} regions'))
