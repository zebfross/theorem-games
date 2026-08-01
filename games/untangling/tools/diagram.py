"""Generic closed curves in the plane, as combinatorial diagrams.

A generic closed curve is a 4-valent plane graph in which the curve goes
straight through every vertex. The structure is carried by *darts*: each
crossing owns four, numbered anticlockwise, and

    alpha   pairs the two darts of an edge
    i -> i+2  at a vertex pairs the darts the curve runs straight between

Faces are the orbits of `sigma . alpha`, so a face's degree is how many
crossings sit on its boundary. That is what the moves key off:

    degree 1   a monogon, removable by an R1, losing one crossing
    degree 2   a bigon, removable by an R2, losing two
    degree 3   a triangle, flippable by an R3, losing none

Chang and Erickson show a curve with n crossings needs Theta(n^{3/2}) such
moves to become simple, which is the game: untangle it in as few as you can.

The structure is read off an actual drawing rather than built abstractly,
because a drawing is what the game has to show anyway, and the anticlockwise
order at a crossing is right there in the geometry.
"""

import math
from itertools import combinations

EPS = 1e-9


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


class Diagram:
    """A closed curve's crossings, darts and faces.

    Built from a closed polyline. `visits` is the curve read as a cyclic
    sequence of (crossing, strand) pairs — the Gauss code with the strand
    saying which of the two passes through that crossing this is.
    """

    def __init__(self, crossings, darts, alpha, visits):
        self.crossings = crossings      # index -> (x, y)
        self.darts = darts              # index -> (crossing, slot 0..3)
        self.alpha = alpha              # dart -> dart, along an edge
        self.visits = visits            # cyclic [(crossing, 0 or 1), ...]

    # --- structure -------------------------------------------------------

    @property
    def n(self):
        return len(self.crossings)

    def sigma(self, d):
        """Next dart anticlockwise at the same crossing."""
        c, slot = self.darts[d]
        return self.dart_at(c, (slot + 1) % 4)

    def straight(self, d):
        """The dart the curve runs straight on to, through the crossing."""
        c, slot = self.darts[d]
        return self.dart_at(c, (slot + 2) % 4)

    def dart_at(self, c, slot):
        return self._index[(c, slot)]

    def faces(self):
        """Orbits of sigma . alpha, as lists of darts."""
        seen = set()
        out = []
        for d in range(len(self.darts)):
            if d in seen:
                continue
            face = []
            cur = d
            while cur not in seen:
                seen.add(cur)
                face.append(cur)
                cur = self.sigma(self.alpha[cur])
            out.append(face)
        return out

    def face_degrees(self):
        return sorted(len(f) for f in self.faces())

    # --- what the player can do -----------------------------------------

    def moves(self):
        """Faces that can be played, as (kind, face).

        A face of degree 1 or 2 can be collapsed; one of degree 3 can be
        flipped. The outer face is not special here: on the sphere it is a
        face like any other, and a curve drawn with a monogon on the outside
        is still reducible.
        """
        out = []
        for f in self.faces():
            if len(f) == 1:
                out.append(('R1', f))
            elif len(f) == 2:
                out.append(('R2', f))
            elif len(f) == 3:
                out.append(('R3', f))
        return out

    # --- identity --------------------------------------------------------

    def gauss(self):
        """Canonical Gauss code, for recognising a diagram already seen.

        Relabelled by order of first appearance, then minimised over every
        rotation and both directions, so the same curve read from anywhere
        gives the same string.
        """
        seq = [c for c, _s in self.visits]
        n = len(seq)
        best = None
        for src in (seq, seq[::-1]):
            for r in range(n):
                rot = src[r:] + src[:r]
                relabel = {}
                out = []
                for c in rot:
                    if c not in relabel:
                        relabel[c] = len(relabel)
                    out.append(relabel[c])
                key = tuple(out)
                if best is None or key < best:
                    best = key
        return best


def from_polyline(points):
    """Build a diagram from a closed polyline, or raise if it is not generic."""
    n = len(points)
    segs = [(points[i], points[(i + 1) % n]) for i in range(n)]

    # every crossing, with where along each segment it falls
    hits = {}
    for i, j in combinations(range(len(segs)), 2):
        if abs(i - j) <= 1 or (i == 0 and j == len(segs) - 1):
            continue
        r = _seg_intersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])
        if r is None:
            continue
        t, u, pt = r
        hits.setdefault(i, []).append((t, pt, j))
        hits.setdefault(j, []).append((u, pt, i))

    # walk the curve, meeting crossings in order
    order = []
    coords = {}
    for i in range(len(segs)):
        for t, pt, _other in sorted(hits.get(i, [])):
            key = (round(pt[0], 6), round(pt[1], 6))
            if key not in coords:
                coords[key] = len(coords)
            order.append((coords[key], key, i, t))
    # The direction the curve is actually travelling as it passes each
    # crossing. It has to be the tangent of the segment the crossing sits on:
    # the chord to the next crossing can point somewhere else entirely on a
    # curve that wanders in between, and the anticlockwise order round a
    # crossing is exactly what the whole structure rests on.
    tangent = []
    for _c, _key, i, _t in order:
        (ax, ay), (bx, by) = segs[i]
        tangent.append(math.atan2(by - ay, bx - ax))

    crossings = [None] * len(coords)
    for key, idx in coords.items():
        crossings[idx] = key
    if not crossings:
        return Diagram([], [], {}, [])

    seen = {}
    visits = []
    for c, _key, _i, _t in order:
        strand = 1 if c in seen else 0
        seen[c] = True
        visits.append((c, strand))
    if any(sum(1 for c, _ in visits if c == k) != 2 for k in range(len(crossings))):
        raise ValueError('not a generic curve: a crossing was not met twice')

    # four darts per crossing, sorted anticlockwise by the direction each
    # points away from it: the tangent forwards, and the tangent reversed
    incident = {c: [] for c in range(len(crossings))}
    for pos, (c, _s) in enumerate(visits):
        incident[c].append((tangent[pos] + math.pi, ('in', pos)))
        incident[c].append((tangent[pos], ('out', pos)))

    darts = []
    index = {}
    role = {}
    for c in range(len(crossings)):
        ring = sorted(incident[c], key=lambda z: z[0] % (2 * math.pi))
        if len(ring) != 4:
            raise ValueError('not a generic curve: a crossing had %d ends' % len(ring))
        for slot, (_ang, tag) in enumerate(ring):
            d = len(darts)
            darts.append((c, slot))
            index[(c, slot)] = d
            role[d] = tag

    # an edge joins the dart leaving one visit to the dart entering the next
    out_dart = {}
    in_dart = {}
    for d, tag in role.items():
        (kind, pos) = tag
        (out_dart if kind == 'out' else in_dart)[pos] = d
    alpha = {}
    for pos in range(len(visits)):
        a = out_dart[pos]
        b = in_dart[(pos + 1) % len(visits)]
        alpha[a] = b
        alpha[b] = a

    dia = Diagram(crossings, darts, alpha, visits)
    dia._index = index
    dia._role = role
    return dia
