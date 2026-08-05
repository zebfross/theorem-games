"""Draw an enumerated diagram, rather than hope a random one looks like it.

`diagrams.py` says which curves exist and hands over each one's planar
embedding — the cyclic order of arcs at every crossing, and the faces. That is
the combinatorics. It says nothing about where anything goes on the page, and
where things go is what makes a level readable.

The old generator answered that by scattering points and keeping whatever
survived. It gave regions of wildly uneven size, because nothing was aiming for
even. Measured on random drawings, only 6% of four-crossing ones had every
region big enough to click, 2% at five, and none at all past six — so the dense
diagrams were unreachable, and the pack stopped at six crossings for a reason
that was never about the mathematics.

**Tutte's theorem does the job properly.** Pin the outer face to a convex
polygon, put every other vertex at the average of its neighbours, and the
resulting straight-line drawing is planar with every face convex. Convex faces
are exactly what a clickable region is. There is no rejection sampling: each
diagram is drawn once, correctly.

Two details make it a curve rather than a graph drawing.

*Arcs need to bow.* Two crossings can be joined by two different arcs, and drawn
straight they would sit on top of each other. Each arc is pushed sideways
towards the larger of the two faces it divides. Pulling it towards the middle of
those faces instead does not work, and fails in the simplest possible case: the
two arcs of a bigon have the bigon's own vertices as their endpoints, so its
centroid is exactly the arc midpoint, the pull is zero, and the two arcs stay on
top of each other. The trefoil came out as a triangle with no crossings at all.

*The curve must pass smoothly through crossings.* A Catmull-Rom spline through
crossings and control points interpolates its points, so the crossings land
where the embedding put them, and the strands meet transversally because the
rotation system says they do.
"""

import math

SIZE = 500.0
MARGIN = 40.0
BOW = 0.30          # how far an arc leans, as a share of its own length
SAMPLES = 7         # points drawn per spline segment


def _tail(d, w):
    m = len(w)
    return w[d // 2] if d % 2 == 0 else w[(d // 2 + 1) % m]


def _neighbours(w):
    m = len(w)
    adj = {}
    for i in range(m):
        u, v = w[i], w[(i + 1) % m]
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)
    return adj


def _solve(a, b):
    """Gaussian elimination. The systems here have one row per crossing."""
    n = len(a)
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        b[col], b[pivot] = b[pivot], b[col]
        for r in range(n):
            if r == col:
                continue
            f = a[r][col] / a[col][col]
            if f:
                for c in range(col, n):
                    a[r][c] -= f * a[col][c]
                b[r] = [x - f * y for x, y in zip(b[r], b[col])]
    return [[b[r][k] / a[r][r] for k in range(len(b[0]))] for r in range(n)]


def tutte(w, faces):
    """Every layout of this diagram: each admissible face taken as the outer one.

    The outer face has to be a simple cycle for the boundary polygon to make
    sense, so faces that visit a crossing twice are passed over. Longest first,
    since that puts as much of the drawing as possible on the boundary and
    spreads it out.

    All of them are offered rather than just the first, because which face goes
    outside changes the drawing completely, and one choice can leave two arcs
    with nowhere to pass each other while another has room. The four-crossing
    diagram — the figure-eight shadow, the second-simplest level in the game —
    could not be drawn at all until this stopped returning the first layout it
    managed to compute.
    """
    n = len(w) // 2
    order = sorted(faces, key=len, reverse=True)
    adj = _neighbours(w)
    for face in order:
        ring = [_tail(d, w) for d in face]
        if len(set(ring)) != len(ring) or len(ring) < 3:
            continue
        fixed = {}
        r = (SIZE - 2 * MARGIN) / 2
        for i, v in enumerate(ring):
            a = 2 * math.pi * i / len(ring)
            fixed[v] = (SIZE / 2 + r * math.cos(a), SIZE / 2 + r * math.sin(a))
        free = [v for v in range(n) if v not in fixed]
        if not free:
            yield fixed, faces.index(face)
            continue
        idx = {v: i for i, v in enumerate(free)}
        a_m = [[0.0] * len(free) for _ in free]
        b_m = [[0.0, 0.0] for _ in free]
        for v in free:
            row = a_m[idx[v]]
            row[idx[v]] = float(len(adj[v]))
            for u in adj[v]:
                if u in fixed:
                    b_m[idx[v]][0] += fixed[u][0]
                    b_m[idx[v]][1] += fixed[u][1]
                else:
                    row[idx[u]] -= 1.0
        got = _solve(a_m, b_m)
        if got is None:
            continue
        pos = dict(fixed)
        for v in free:
            pos[v] = (got[idx[v]][0], got[idx[v]][1])
        if _degenerate(pos):
            continue
        yield pos, faces.index(face)


def _degenerate(pos):
    pts = list(pos.values())
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if math.dist(pts[i], pts[j]) < 1.0:
                return True
    return False


def _catmull(points, samples=SAMPLES):
    """A closed spline through `points`, sampled off the control points.

    Sampling at half-steps rather than at the knots is deliberate. The two
    strands through a crossing share that point exactly, and a polyline with a
    vertex sitting on another polyline's vertex is precisely the degeneracy the
    arrangement code refuses to handle. Sampling between the knots leaves the
    crossing in the interior of a segment on both strands, where it belongs.
    """
    n = len(points)
    out = []
    for i in range(n):
        p0, p1 = points[(i - 1) % n], points[i]
        p2, p3 = points[(i + 1) % n], points[(i + 2) % n]
        for j in range(samples):
            t = (j + 0.5) / samples
            t2, t3 = t * t, t * t * t
            out.append((round(0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 3),
                        round(0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3), 3)))
    return out


def curve(w, faces, pos, outer, sign, bow=BOW, only_bigons=True):
    """The drawn strand: crossings in walking order, with a bow on each arc.

    Each arc is pushed perpendicular, towards whichever of its two faces has
    more room — the outer one counting as unbounded. Two parallel arcs bound a
    bigon between them, and each has that bigon on the opposite side, so this
    sends them opposite ways and parts them.

    `sign` fixes which perpendicular the rotation system calls "left". Rather
    than derive that convention, the caller tries both and keeps whichever
    reproduces the diagram — the drawing is verified against the arrangement
    either way, so the check is free.
    """
    m = len(w)
    side = {}
    for f, face in enumerate(faces):
        for d in face:
            side[d] = f
    room = {f: (10 ** 6 if f == outer else len(face))
            for f, face in enumerate(faces)}

    knots = []
    for i in range(m):
        a, b = pos[w[i]], pos[w[(i + 1) % m]]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1.0
        left, right = room[side[2 * i]], room[side[2 * i + 1]]
        # Only arcs against a bigon need moving: a bigon is where two arcs run
        # between the same pair of crossings, and it is the only place the
        # straight-line embedding puts two pieces of rope on top of each other.
        # Bowing every arc instead put the curve nowhere near the edges it was
        # supposed to follow — the four-crossing diagram came back with
        # fourteen crossings.
        k = 0.0
        if not only_bigons or min(left, right) <= 2:
            k = sign * bow * length * (1 if left >= right else -1)
        knots.append(a)
        # Points along the arc rather than one in the middle. The spline is
        # interpolating, so knots close together keep it near the straight edge
        # and stop it overshooting into other parts of the drawing.
        for t in (0.25, 0.5, 0.75):
            push = k * math.sin(math.pi * t)
            knots.append((a[0] + t * dx - push * dy / length,
                          a[1] + t * dy + push * dx / length))
    return _catmull(knots)


def candidates(w, faces, verify=None):
    """Every drawing of this diagram that reproduces it, not just the first.

    Which face goes on the outside, which way the arcs bow and how hard all
    change the shape completely, and they change how much room the regions get.
    Returning the first one that works leaves that to chance — and it showed:
    four of the ten seven-crossing diagrams were lost with their tightest region
    at 2.3% of the view against a 3% bar, while other layouts of the same
    diagram were fine. The caller picks; this only guarantees that what it
    hands over really is the diagram it was asked for.
    """
    for pos, outer in tutte(w, faces):
        for only_bigons in (True, False):
            for sign in (1, -1):
                for bow in (0.22, 0.30, 0.15, 0.38, 0.10, 0.45):
                    pts = curve(w, faces, pos, outer, sign, bow, only_bigons)
                    if verify is None or verify(pts):
                        yield pts


def draw(w, faces, verify=None):
    """The first drawing that reproduces this diagram, or None."""
    for pts in candidates(w, faces, verify):
        return pts
    return None


if __name__ == '__main__':
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.abspath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'lib')))
    import diagrams
    from geometry import arrangement

    def checker(n):
        def verify(pts):
            try:
                got, cross = arrangement.build([pts])
            except Exception:
                return False
            return cross == n and len(got) == n + 2
        return verify

    for n in range(3, (int(sys.argv[1]) if len(sys.argv) > 1 else 7) + 1):
        found = diagrams.curves(n)
        ok = sum(1 for w, rot, faces in found
                 if draw(w, faces, checker(n)) is not None)
        print(f'{n} crossings: {ok} of {len(found)} drawn and verified',
              flush=True)
