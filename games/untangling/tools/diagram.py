"""Generic closed curves in the plane, as combinatorial diagrams.

A generic closed curve is a 4-valent plane graph the curve runs straight
through at every vertex. Two pieces of data pin one down:

    code    the crossings in the order the curve meets them, each appearing
            twice — the Gauss code
    rings   for each crossing, its four dart-ends in anticlockwise order

A dart is `(position in the code, 'in' or 'out')`, so `code` alone says which
darts are joined by an edge: the out of one visit meets the in of the next.
`rings` supplies the anticlockwise order the drawing had, which `code` cannot.
Rings are stored against a crossing's own two visits rather than absolute
positions, so deleting crossings never has to renumber them.

Faces are the orbits of `sigma . alpha`, and a face's degree is the number of
crossings around it, which is exactly what the moves key off:

    1 corner, a monogon    R1 collapses it, losing one crossing
    2 corners, a bigon     R2 collapses it, losing two
    3 corners, a triangle  R3 flips it, losing none

Collapsing is a deletion from the code and nothing else: pulling the strands
apart does not disturb the order in which the curve meets everything else.

Chang and Erickson show a curve with n crossings needs Theta(n^{3/2}) of these
moves to become simple, which is the game.
"""

import math
from itertools import combinations

EPS = 1e-9
IN, OUT = 0, 1


def _seg_intersect(p, q, r, s):
    (px, py), (qx, qy), (rx, ry), (sx, sy) = p, q, r, s
    dx1, dy1 = qx - px, qy - py
    dx2, dy2 = sx - rx, sy - ry
    den = dx1 * dy2 - dy1 * dx2
    if abs(den) < EPS:
        return None
    t = ((rx - px) * dy2 - (ry - py) * dx2) / den
    u = ((rx - px) * dy1 - (ry - py) * dx1) / den
    if t <= 1e-7 or t >= 1 - 1e-7 or u <= 1e-7 or u >= 1 - 1e-7:
        return None
    return t, u, (px + t * dx1, py + t * dy1)


def _candidate_pairs(segs):
    """Segment pairs whose bounding boxes share a grid cell.

    Every candidate drawing is checked by rebuilding the diagram from it, so
    this scan runs tens of thousands of times and is the whole cost of building
    a level. Comparing all pairs is quadratic; the polyline is resampled to an
    even spacing, so a grid a couple of segments wide leaves a handful per cell.

    Only a filter: pairs it yields are still tested exactly, and it is allowed
    to yield too many. It must never yield too few, which is why a segment is
    registered against every cell its bounding box touches rather than the cell
    its midpoint lands in.
    """
    n = len(segs)
    if n < 32:
        return combinations(range(n), 2)

    span = sum(max(abs(b[0] - a[0]), abs(b[1] - a[1])) for a, b in segs)
    cell = 2.0 * span / n
    if cell < EPS:
        return combinations(range(n), 2)

    buckets = {}
    for i, (a, b) in enumerate(segs):
        x0, x1 = sorted((a[0], b[0]))
        y0, y1 = sorted((a[1], b[1]))
        for cx in range(int(x0 // cell), int(x1 // cell) + 1):
            for cy in range(int(y0 // cell), int(y1 // cell) + 1):
                buckets.setdefault((cx, cy), []).append(i)

    pairs = set()
    for members in buckets.values():
        if len(members) > 1:
            pairs.update(combinations(members, 2))
    return pairs


class Diagram:
    def __init__(self, code, rings, points=None, param=None):
        self.code = list(code)           # crossing id per visit, each twice
        self.rings = {c: list(r) for c, r in rings.items()}   # c -> [(k, side)]
        self.points = points             # optional crossing coordinates
        # Where along the drawing each visit falls, as (segment, t in [0,1]).
        # Surgery needs it: to cut a loop out you have to know which stretch of
        # polyline the loop actually is.
        self.param = param or []

    # --- basics ----------------------------------------------------------

    @property
    def n(self):
        return len(self.rings)

    @property
    def length(self):
        return len(self.code)

    def visits(self, c):
        """The two code positions where the curve meets crossing c."""
        return [i for i, x in enumerate(self.code) if x == c]

    def dart(self, pos, side):
        return (pos, side)

    def alpha(self, d):
        pos, side = d
        return ((pos + 1) % self.length, IN) if side == OUT else ((pos - 1) % self.length, OUT)

    def sigma(self, d):
        """Next dart anticlockwise at the same crossing."""
        pos, side = d
        c = self.code[pos]
        k = 0 if self.visits(c)[0] == pos else 1
        ring = self.rings[c]
        i = ring.index((k, side))
        nk, nside = ring[(i + 1) % 4]
        return (self.visits(c)[nk], nside)

    def faces(self):
        seen = set()
        out = []
        for pos in range(self.length):
            for side in (IN, OUT):
                d = (pos, side)
                if d in seen:
                    continue
                face = []
                cur = d
                while cur not in seen:
                    seen.add(cur)
                    face.append(cur)
                    cur = self.sigma(self.alpha(cur))
                out.append(face)
        return out

    def face_degrees(self):
        return sorted(len(f) for f in self.faces())

    def valid(self):
        """Euler's formula, the one check that catches a botched move."""
        if self.n == 0:
            return self.length == 0
        return self.n - 2 * self.n + len(self.faces()) == 2

    # --- moves -----------------------------------------------------------

    def moves(self):
        """Playable faces, as (kind, crossings, face)."""
        out = []
        for f in self.faces():
            cs = sorted({self.code[pos] for pos, _s in f})
            if len(f) == 1:
                out.append(('R1', cs, f))
            elif len(f) == 2:
                out.append(('R2', cs, f))
            elif len(f) == 3:
                out.append(('R3', cs, f))
        return out

    def collapse(self, crossings):
        """Remove these crossings — an R1 on one, an R2 on two.

        Pulling the strands apart leaves the order in which the curve meets
        everything else exactly as it was, so the whole move is a deletion
        from the code. Rings are held against a crossing's own visits, so the
        survivors need no adjusting at all.
        """
        gone = set(crossings)
        code = [c for c in self.code if c not in gone]
        rings = {c: r for c, r in self.rings.items() if c not in gone}
        return Diagram(code, rings)

    # --- identity --------------------------------------------------------

    def canonical(self):
        """A key that is the same for any two drawings of the same diagram.

        Minimised over where the reading starts, with crossings relabelled by
        first appearance. Reflections are left as distinct, which only means
        a search explores a mirror pair separately rather than getting an
        answer wrong.
        """
        best = None
        L = self.length
        if L == 0:
            return ((), ())
        for r in range(L):
            rot = self.code[r:] + self.code[:r]
            label = {}
            seq = []
            for c in rot:
                if c not in label:
                    label[c] = len(label)
                seq.append(label[c])
            rings = tuple(
                tuple(self.rings[c]) for c in sorted(label, key=lambda x: label[x]))
            key = (tuple(seq), rings)
            if best is None or key < best:
                best = key
        return best


def from_polyline(points):
    """Build a diagram from a closed polyline."""
    n = len(points)
    segs = [(points[i], points[(i + 1) % n]) for i in range(n)]

    hits = {}
    for i, j in _candidate_pairs(segs):
        if abs(i - j) <= 1 or (i == 0 and j == len(segs) - 1):
            continue
        r = _seg_intersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])
        if r is None:
            continue
        t, u, pt = r
        hits.setdefault(i, []).append((t, pt))
        hits.setdefault(j, []).append((u, pt))

    order = []
    ids = {}
    coords = []
    for i in range(len(segs)):
        for t, pt in sorted(hits.get(i, [])):
            key = (round(pt[0], 6), round(pt[1], 6))
            if key not in ids:
                ids[key] = len(ids)
                coords.append(key)
            order.append((ids[key], i, t))

    if not order:
        return Diagram([], {}, [], [])

    code = [c for c, _i, _t in order]
    param = [(i, t) for _c, i, t in order]
    for c in range(len(coords)):
        if code.count(c) != 2:
            raise ValueError('not a generic curve: a crossing was not met twice')

    # The anticlockwise order at a crossing has to come from the tangent of the
    # segment the crossing sits on. The chord to the neighbouring crossing
    # points somewhere else entirely on a curve that wanders in between, and
    # everything here rests on this order being right.
    tangent = []
    for _c, i, _t in order:
        (ax, ay), (bx, by) = segs[i]
        tangent.append(math.atan2(by - ay, bx - ax))

    rings = {}
    for c in range(len(coords)):
        vs = [p for p, x in enumerate(code) if x == c]
        ends = []
        for k, p in enumerate(vs):
            ends.append(((tangent[p] + math.pi) % (2 * math.pi), (k, IN)))
            ends.append((tangent[p] % (2 * math.pi), (k, OUT)))
        ends.sort()
        rings[c] = [tag for _a, tag in ends]

    return Diagram(code, rings, coords, param)


def reduce_bfs(dia, limit=200000):
    """Fewest collapses that make the curve simple, or None if stuck.

    Only R1 and R2 are tried here; the R3 flip is not implemented yet, so a
    curve that needs one to expose a monogon or bigon comes back unsolved.
    How often that happens is the point of measuring.
    """
    from collections import deque
    start = dia.canonical()
    seen = {start: 0}
    q = deque([(dia, 0)])
    explored = 0
    while q:
        cur, d = q.popleft()
        explored += 1
        if cur.n == 0:
            return d, len(seen), explored
        if explored > limit:
            return None, len(seen), explored
        for kind, cs, _f in cur.moves():
            if kind == 'R3':
                continue
            nxt = cur.collapse(cs)
            key = nxt.canonical()
            if key in seen:
                continue
            seen[key] = d + 1
            q.append((nxt, d + 1))
    return None, len(seen), explored
