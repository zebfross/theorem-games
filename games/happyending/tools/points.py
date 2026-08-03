"""Point sets that dodge a convex polygon for as long as anything can.

Erdos and Szekeres: any 5 points in general position contain a convex
quadrilateral, any 9 contain a convex pentagon, and any 17 contain a convex
hexagon. So a set avoiding a convex k-gon can hold at most

    k = 4 :  4 points
    k = 5 :  8 points
    k = 6 : 16 points

and those numbers are exactly par. The first two are old; the third was settled
by Szekeres and Peters in 2006 with a computer search, and nothing beyond it is
known — the conjecture that the pattern continues as 2^(k-2) is open, which is
a pleasant thing to be able to say on the last level of a game.

The game is to place points *avoiding* the polygon, so it is a game you are
guaranteed to lose the moment you are asked for one point more than par. That
is the point of it.

A set of k points is "in convex position" when every one of them is a corner of
their convex hull — none is inside or on the edge of the hull of the others.
That is the thing being avoided.
"""

import itertools
import math
import random


def cross(o, a, b):
    """Twice the signed area of the triangle o, a, b."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def general_position(pts, slack=1.0):
    """No three points in a line, which the theorem assumes throughout.

    `slack` is twice the smallest triangle area allowed, so nearly-collinear
    counts as collinear: a set that is only just in general position is one
    where whether a polygon is convex comes down to rounding.
    """
    for a, b, c in itertools.combinations(pts, 3):
        if abs(cross(a, b, c)) <= slack:
            return False
    return True


def convex_position(pts):
    """Are all of these points corners of their own convex hull?

    Walked as an angular sort about the centroid: the points are in convex
    position exactly when going round them that way always turns the same way.
    Cheaper than building the hull and comparing, and this is called a great
    many times.
    """
    n = len(pts)
    if n < 3:
        return True
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    order = sorted(pts, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    sign = 0
    for i in range(n):
        turn = cross(order[i], order[(i + 1) % n], order[(i + 2) % n])
        if turn == 0:
            return False
        s = 1 if turn > 0 else -1
        if sign == 0:
            sign = s
        elif s != sign:
            return False
    return True


def has_convex(pts, k):
    """Is there a convex k-gon in here? Returns the points of one, or None."""
    if len(pts) < k:
        return None
    for sub in itertools.combinations(pts, k):
        if convex_position(list(sub)):
            return list(sub)
    return None


def cap(k):
    """The most points that can avoid a convex k-gon: the Erdos-Szekeres number
    minus one. Known only up to k = 6."""
    return {3: 2, 4: 4, 5: 8, 6: 16}.get(k)


def search(k, want, box, rng, tries=200000, slack=200.0):
    """Hunt for `want` points inside `box` with no convex k-gon.

    Grown one point at a time and restarted when stuck, which finds the k=4 and
    k=5 configurations quickly. The k=6 one is a 16-point needle and wants the
    construction below instead.
    """
    w, h = box
    best = []
    pts = []
    for _ in range(tries):
        if len(pts) == want:
            return pts
        p = (rng.randrange(20, w - 20), rng.randrange(20, h - 20))
        trial = pts + [p]
        if not general_position(trial, slack):
            continue
        if has_convex(trial, k):
            continue
        pts = trial
        if len(pts) > len(best):
            best = list(pts)
        if len(pts) == want:
            return pts
        # Stuck for a while: drop a point at random and carry on.
        if rng.random() < 0.02 and pts:
            pts.pop(rng.randrange(len(pts)))
    return best
