"""Rooms, sight lines, and the fewest corners that can watch the whole gallery.

Chvatal: a simple polygon with n corners can always be watched by ⌊n/3⌋ guards.
Fisk's proof is the reason this is worth making a game of, because it is short
enough to hand to the player a piece at a time: triangulate the room, colour the
corners with three colours so that every triangle gets all three, and station
guards on whichever colour was used least. Every triangle then has a guard at
one of its corners, and a triangle is convex, so every triangle is watched.

Guards stand on corners rather than anywhere in the room. That is Chvatal's own
setting, it makes clicking unambiguous, and — the part that matters — it leaves
finitely many possible answers, so the true minimum can be found exactly rather
than approximated. The minimum itself is NP-hard in general, but these rooms are
small enough to settle by trying every subset.

Nothing here is approximate. Whether a guard can see a spot is decided by
subdividing the sight line wherever it meets the boundary and asking which side
each piece lies on, and coverage is decided over a decomposition of the room
into pieces within which the set of watching corners cannot change.
"""

import itertools
import math

EPS = 1e-9


def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def signed_area(poly):
    s = 0.0
    for i, (x, y) in enumerate(poly):
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x * y2 - x2 * y
    return s / 2


def point_in_polygon(pt, poly):
    """Is the point strictly inside? Points on the boundary count as inside."""
    x, y = pt
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if abs(_cross(a, b, pt)) < 1e-9 and \
           min(a[0], b[0]) - EPS <= x <= max(a[0], b[0]) + EPS and \
           min(a[1], b[1]) - EPS <= y <= max(a[1], b[1]) + EPS:
            return True                      # on an edge
    inside = False
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            if x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def _seg_params(a, b, poly):
    """Where along a->b the segment meets the boundary, as parameters in [0,1].

    Every crossing and every graze of a corner, so that the pieces between
    consecutive parameters each lie wholly inside the room or wholly outside.
    """
    ts = {0.0, 1.0}
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    n = len(poly)
    for i in range(n):
        c, d = poly[i], poly[(i + 1) % n]
        ex, ey = d[0] - c[0], d[1] - c[1]
        den = dx * ey - dy * ex
        if abs(den) > EPS:
            t = ((c[0] - ax) * ey - (c[1] - ay) * ex) / den
            u = ((c[0] - ax) * dy - (c[1] - ay) * dx) / den
            if -EPS <= t <= 1 + EPS and -EPS <= u <= 1 + EPS:
                ts.add(min(1.0, max(0.0, t)))
        else:
            # Parallel: a corner lying on the sight line still splits it.
            for p in (c, d):
                if abs(_cross(a, b, p)) < 1e-7:
                    denom = dx * dx + dy * dy
                    if denom > EPS:
                        t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / denom
                        if -EPS <= t <= 1 + EPS:
                            ts.add(min(1.0, max(0.0, t)))
    return sorted(ts)


def sees(a, b, poly):
    """Can a guard at `a` see the point `b` without looking through a wall?

    The sight line is cut wherever it meets the boundary and each piece is
    tested on its own. Sampling the midpoint alone is not enough — a line can
    leave the room and come back — and testing only for crossings is not enough
    either, since a line can pass exactly through a reflex corner and out of
    the room without properly crossing any edge.
    """
    if math.dist(a, b) < EPS:
        return True
    ts = _seg_params(a, b, poly)
    for t0, t1 in zip(ts, ts[1:]):
        if t1 - t0 < 1e-9:
            continue
        t = (t0 + t1) / 2
        mid = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        if not point_in_polygon(mid, poly):
            return False
    return True


# --- Fisk's proof, in three steps ---------------------------------------


def triangulate(poly):
    """Ear clipping. Returns triangles as triples of corner indices."""
    n = len(poly)
    idx = list(range(n))
    if signed_area(poly) < 0:
        idx.reverse()
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if _cross(a, b, c) <= EPS:
                continue                      # reflex or straight: not an ear
            if any(_inside_tri(poly[j], a, b, c)
                   for j in idx if j not in (i0, i1, i2)):
                continue                      # another corner is in the way
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def _inside_tri(p, a, b, c):
    d1 = _cross(a, b, p)
    d2 = _cross(b, c, p)
    d3 = _cross(c, a, p)
    return (d1 >= -EPS and d2 >= -EPS and d3 >= -EPS) or \
           (d1 <= EPS and d2 <= EPS and d3 <= EPS)


def three_colour(tris, n):
    """Colour corners so every triangle gets all three colours.

    Always possible, and that is the whole of Fisk's argument: the triangles of
    a simple polygon form a tree when joined along shared edges, so colouring
    them one at a time never forces a contradiction — each new triangle shares
    an edge, and so two colours, with one already done, leaving exactly one
    choice for its third corner.
    """
    if not tris:
        return None
    share = {}
    for t, tri in enumerate(tris):
        for e in itertools.combinations(sorted(tri), 2):
            share.setdefault(e, []).append(t)
    colour = [None] * n
    a, b, c = tris[0]
    colour[a], colour[b], colour[c] = 0, 1, 2
    seen = {0}
    stack = [0]
    while stack:
        t = stack.pop()
        for e in itertools.combinations(sorted(tris[t]), 2):
            for u in share.get(e, []):
                if u in seen:
                    continue
                seen.add(u)
                known = [v for v in tris[u] if colour[v] is not None]
                unknown = [v for v in tris[u] if colour[v] is None]
                if len(unknown) == 1:
                    used = {colour[v] for v in known}
                    colour[unknown[0]] = ({0, 1, 2} - used).pop()
                stack.append(u)
    return colour if all(c is not None for c in colour) else None


def fisk_guards(poly):
    """The guard set Fisk's proof hands you: the least-used colour class."""
    tris = triangulate(poly)
    colour = three_colour(tris, len(poly))
    if colour is None:
        return None, tris, None
    classes = [[i for i, c in enumerate(colour) if c == k] for k in range(3)]
    return min(classes, key=len), tris, colour


# --- the room, decomposed so coverage can be decided exactly -------------


def _reflex(poly):
    n = len(poly)
    flip = 1 if signed_area(poly) > 0 else -1
    return [i for i in range(n)
            if flip * _cross(poly[i - 1], poly[i], poly[(i + 1) % n]) < -EPS]


def _split(piece, line):
    """Cut a convex piece by an infinite line, returning the parts."""
    (px, py), (qx, qy) = line
    dx, dy = qx - px, qy - py
    side = [dx * (y - py) - dy * (x - px) for x, y in piece]
    if all(s > -1e-7 for s in side) or all(s < 1e-7 for s in side):
        return [piece]
    out = ([], [])
    n = len(piece)
    for i in range(n):
        a, b = piece[i], piece[(i + 1) % n]
        sa, sb = side[i], side[(i + 1) % n]
        # A corner sitting exactly on the cut belongs to both parts. Giving it
        # to one of them leaves the other a corner short, so it comes back as a
        # different shape and the area between goes missing — which on a grid
        # happens constantly, since the cutting lines run through corners.
        if abs(sa) <= 1e-7:
            out[0].append(a)
            out[1].append(a)
        else:
            out[0 if sa > 0 else 1].append(a)
        if (sa > 1e-7 and sb < -1e-7) or (sa < -1e-7 and sb > 1e-7):
            t = sa / (sa - sb)
            cut = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            out[0].append(cut)
            out[1].append(cut)
    return [p for p in out if len(p) >= 3 and abs(signed_area(p)) > 1e-7]


def _line_key(a, b):
    """A name for the infinite line through a and b, the same either way round.

    Rooms are drawn on a grid, so a great many corner pairs lie on the very same
    line — every corner along one wall, for a start. Cutting by each of them
    separately does the same work over and over and multiplies the pieces for
    nothing, which is what made the biggest rooms take minutes.
    """
    A = b[1] - a[1]
    B = a[0] - b[0]
    C = -(A * a[0] + B * a[1])
    n = math.hypot(A, B)
    if n < EPS:
        return None
    A, B, C = A / n, B / n, C / n
    if A < -EPS or (abs(A) <= EPS and B < 0):
        A, B, C = -A, -B, -C
    return (round(A, 9), round(B, 9), round(C, 9))


def cells(poly, cap=20000):
    """Chop the room into convex pieces no sight line can cross.

    Inside such a piece the set of corners that can see it cannot change, so
    testing one point of it settles the whole piece. The cutting lines are those
    through a reflex corner and any other corner: nothing else can be the edge
    of what a guard can see.

    Returns None if it would take more pieces than `cap`. That is a room too
    awkward to settle exactly at a sensible cost, and the generator drops it
    rather than shipping a level whose par it had to guess at.
    """
    seen = set()
    lines = []
    for i in _reflex(poly):
        for j in range(len(poly)):
            if i == j or math.dist(poly[i], poly[j]) <= EPS:
                continue
            k = _line_key(poly[i], poly[j])
            if k is not None and k not in seen:
                seen.add(k)
                lines.append((poly[i], poly[j]))

    pieces = [[poly[i] for i in t] for t in triangulate(poly)]
    for line in lines:
        nxt = []
        for piece in pieces:
            nxt.extend(_split(piece, line))
        pieces = nxt
        if len(pieces) > cap:
            return None
    return pieces


def centroid(piece):
    n = len(piece)
    return (sum(p[0] for p in piece) / n, sum(p[1] for p in piece) / n)


def visibility_masks(poly):
    """For each piece of the room, which corners can watch it.

    Returned as the distinct bitmasks only. The game needs nothing else to
    decide whether a room is covered — every piece must be watched by somebody,
    so a guard set works exactly when it meets every one of these masks — and
    the count collapses from thousands of pieces to a couple of dozen masks.
    """
    pieces = cells(poly)
    if pieces is None:
        return None
    seen = set()
    for piece in pieces:
        p = centroid(piece)
        mask = 0
        for i, v in enumerate(poly):
            if sees(v, p, poly):
                mask |= 1 << i
        seen.add(mask)
    return sorted(seen)


def covers(guards, masks):
    bits = 0
    for g in guards:
        bits |= 1 << g
    return all(m & bits for m in masks)


def min_guards(poly, masks=None, limit=None):
    """Fewest corners that watch the whole room, and every way of doing it.

    NP-hard in general and settled here by trying every subset, smallest first,
    which is affordable because the rooms are small and stops the moment a size
    works. Exact, which matters: par is a claim that nothing smaller exists.
    """
    masks = masks if masks is not None else visibility_masks(poly)
    if masks is None:
        return None, []
    n = len(poly)
    for size in range(1, n + 1):
        found = [list(c) for c in itertools.combinations(range(n), size)
                 if covers(c, masks)]
        if found:
            return size, found[:limit] if limit else found
    return None, []


def visibility_polygon(v, poly):
    """What a guard on corner `v` can see, as a polygon.

    Rays are cast at every corner and a whisker either side of it, because the
    boundary of what can be seen turns exactly at corners; the whiskers are what
    catch the far wall glimpsed past a reflex corner.
    """
    src = poly[v]
    # Angles are measured from the wall leaving this corner and taken round the
    # inside, so the fan is one contiguous run. Sorting raw atan2 values instead
    # breaks wherever the visible directions straddle due west, and the polygon
    # then closes with a chord straight across the room.
    nxt = poly[(v + 1) % len(poly)]
    base = math.atan2(nxt[1] - src[1], nxt[0] - src[0])
    two_pi = 2 * math.pi

    def rel(a):
        return (a - base) % two_pi

    angles = []
    for p in poly:
        if math.dist(p, src) < EPS:
            continue
        a = math.atan2(p[1] - src[1], p[0] - src[0])
        angles += [rel(a) - 1e-6, rel(a), rel(a) + 1e-6]
    angles = sorted(x for x in angles if -1e-9 <= x <= two_pi + 1e-9)

    far = max(math.dist(src, p) for p in poly) * 2 + 1
    # The corner the guard stands on is itself a corner of what can be seen —
    # the two walls meeting there bound the view — so the fan starts from it.
    out = [src]
    for a in angles:
        ang = base + a
        target = (src[0] + far * math.cos(ang), src[1] + far * math.sin(ang))
        best = None
        ts = _seg_params(src, target, poly)
        for t0, t1 in zip(ts, ts[1:]):
            mid = (t0 + t1) / 2
            m = (src[0] + (target[0] - src[0]) * mid,
                 src[1] + (target[1] - src[1]) * mid)
            if point_in_polygon(m, poly):
                best = t1
            else:
                break
        if best is None:
            continue
        hit = (src[0] + (target[0] - src[0]) * best,
               src[1] + (target[1] - src[1]) * best)
        if not out or math.dist(out[-1], hit) > 1e-6:
            out.append(hit)
    return out
