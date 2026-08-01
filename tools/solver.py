"""Pinning solver for multiloops in the punctured plane.

The question: given a drawn multiloop and a set of pinned points, is the drawing
*taut* — does it already have the fewest double points of any curve homotopic to
it in the plane minus those points?

Method, following Arettines, "A combinatorial algorithm for visualizing
representatives with minimal self-intersection" (arXiv:1101.5658), which rests
on Hass-Scott: a representative is minimal exactly when it has no proper bigon.

Cut the plane along a vertical ray running upward from each pin and it becomes
simply connected. The cuts are the identified edge pairs of a fundamental
polygon whose surface word is aAbBcC... (genus zero with boundary). A drawing is
then encoded by two lists:

    P  the points where the curve meets the cuts, in cyclic order around
       the polygon
    C  the arcs of the curve between those points, as pairs of points

Two arcs cross exactly when their endpoints separate each other in P, so the
crossings of the drawing are visible in P and C alone. Bigons are found by
taking a crossing and tracing the two arcs onwards in each of four directions
until they either cross again (a bigon) or leave through different edges (no
bigon this way).

Because P and C here are built from the *actual drawing* rather than an
arbitrary representative, we never need Arettines' bigon-removal permutations —
only his test. It also gives a strong internal check: the crossings counted from
P and C must equal the crossings measured geometrically, which `self_check`
asserts.

A bigon whose two legs share no arc is removable (his Theorem 3.5). When the
legs do share arcs, removability needs a case analysis that is not implemented
here, so those come back as UNKNOWN and the caller is expected to discard the
whole question rather than guess. `Puzzle.minimal_pinning_sets` reports whether
any UNKNOWN arose.
"""

from itertools import combinations

UNKNOWN = None

# Polygon conventions: (direction along a cut that indexes its points, which
# side of a cut is the lowercase edge, generator order in the surface word,
# whether the paired edge runs the same way rather than reversed).
#
# Rather than argue these out on paper, they were fixed by requiring the model
# to reproduce the measured crossings of the drawing — see Puzzle.self_check.
# Exactly two of the sixteen candidates do, and they are mirror images of each
# other, which cannot change a crossing count, so either will serve.
CONVENTION = (-1, 1, 1, False)


# --- reading the drawing ---------------------------------------------------


def nudge(punctures):
    """Distinct tiny x offsets so no ray lands exactly on a polyline vertex."""
    return [(px + 1e-7 * (i + 1), py) for i, (px, py) in enumerate(punctures)]


def order_punctures(points):
    """Left to right; the polygon's edge order follows the rays' order."""
    return sorted(range(len(points)), key=lambda i: (points[i][0], points[i][1]))


def ray_events(polyline, punctures):
    """Where one closed polyline crosses the upward rays.

    Yields, in order along the curve, one record per crossing:
        (generator, sign, depth)
    with generator numbered from 1, sign +1 for a left-to-right crossing, and
    depth the distance from the puncture up the ray, which orders the points
    along that cut.
    """
    events = []
    n = len(polyline)
    for s in range(n):
        ax, ay = polyline[s]
        bx, by = polyline[(s + 1) % n]
        if ax == bx:
            continue
        hits = []
        for idx, (px, py) in enumerate(punctures, start=1):
            if not (min(ax, bx) < px < max(ax, bx)):
                continue
            t = (px - ax) / (bx - ax)
            y = ay + (by - ay) * t
            if y < py:                      # above the puncture: on the ray
                hits.append((t, idx, 1 if bx > ax else -1, py - y))
        # one segment can cross several rays; take them in the order they are
        # met travelling along the segment, not the order of the punctures
        hits.sort()
        events.extend((idx, sign, depth) for _t, idx, sign, depth in hits)
    return events


# --- drawn crossing counts -------------------------------------------------


def _proper_cross(a, b, c, d):
    (ax, ay), (bx, by), (cx, cy), (dx, dy) = a, b, c, d
    r_x, r_y = bx - ax, by - ay
    s_x, s_y = dx - cx, dy - cy
    den = r_x * s_y - r_y * s_x
    if den == 0:
        return False
    t = ((cx - ax) * s_y - (cy - ay) * s_x) / den
    u = ((cx - ax) * r_y - (cy - ay) * r_x) / den
    return 0 < t < 1 and 0 < u < 1


def drawn_crossings(strands):
    """Total transverse crossings in the drawing, self and mutual."""
    segs = []
    for pts in strands:
        n = len(pts)
        segs.append([(pts[i], pts[(i + 1) % n]) for i in range(n)])
    total = 0
    for si, s in enumerate(segs):
        for i in range(len(s)):
            for j in range(i + 1, len(s)):
                if abs(i - j) <= 1 or (i == 0 and j == len(s) - 1):
                    continue
                if _proper_cross(s[i][0], s[i][1], s[j][0], s[j][1]):
                    total += 1
    for a, b in combinations(range(len(segs)), 2):
        for u in segs[a]:
            for v in segs[b]:
                if _proper_cross(u[0], u[1], v[0], v[1]):
                    total += 1
    return total


# --- the combinatorial model ----------------------------------------------


def interleaved(a, b, c, d, size):
    """Do the unordered pairs {a, b} and {c, d} separate each other?"""
    if a == c or a == d or b == c or b == d:
        return False
    span = (b - a) % size
    inside = 0
    if 0 < (c - a) % size < span:
        inside += 1
    if 0 < (d - a) % size < span:
        inside += 1
    return inside == 1


class Diagram:
    """The point list P and segment list C for one drawing and pin set.

    A label is (generator, index, side): side +1 lies on the lowercase edge of
    the polygon, side -1 on the uppercase edge, and the two labels sharing a
    generator and index are the same point of the surface.
    """

    def __init__(self, per_strand_events, generators):
        depth_dir, side_map, gen_order, mirrored = CONVENTION

        # index the crossings along each cut
        pools = {g: [] for g in generators}
        for si, events in enumerate(per_strand_events):
            for ei, (g, sign, depth) in enumerate(events):
                pools[g].append((depth * depth_dir, si, ei, sign))
        index_of = {}
        counts = {}
        for g in generators:
            pools[g].sort()
            counts[g] = len(pools[g])
            for pos, (_d, si, ei, _s) in enumerate(pools[g], start=1):
                index_of[(si, ei)] = pos
        self.side_map = side_map

        # P: clockwise around the polygon, surface word a A b B ...
        self.position = {}
        slot = 0
        gens = generators if gen_order > 0 else list(reversed(generators))
        for g in gens:
            m = counts[g]
            first = range(1, m + 1)
            second = first if mirrored else range(m, 0, -1)
            for i in first:
                self.position[(g, i, 1)] = slot
                slot += 1
            for i in second:
                self.position[(g, i, -1)] = slot
                slot += 1
        self.size = slot

        # C: one cyclic list of arcs per strand
        self.arcs = []
        self.owner = []
        for si, events in enumerate(per_strand_events):
            L = len(events)
            arcs = []
            for ei in range(L):
                g, sign, _d = events[ei]
                out = (g, index_of[(si, ei)], sign * self.side_map)
                pg, psign, _pd = events[(ei - 1) % L]
                prev_out = (pg, index_of[(si, (ei - 1) % L)], psign * self.side_map)
                inn = (prev_out[0], prev_out[1], -prev_out[2])
                arcs.append((inn, out))
            self.arcs.append(arcs)
            self.owner.append(si)

    def crosses(self, a, b):
        """Do arcs a = (strand, i) and b = (strand, j) cross?"""
        (s1, i), (s2, j) = a, b
        if s1 == s2 and i == j:
            return False
        p, q = self.arcs[s1][i], self.arcs[s2][j]
        return interleaved(
            self.position[p[0]], self.position[p[1]],
            self.position[q[0]], self.position[q[1]], self.size)

    def all_arcs(self):
        for s, arcs in enumerate(self.arcs):
            for i in range(len(arcs)):
                yield (s, i)

    def crossing_count(self):
        arcs = list(self.all_arcs())
        return sum(1 for x in range(len(arcs))
                   for y in range(x + 1, len(arcs))
                   if self.crosses(arcs[x], arcs[y]))

    def step(self, ref, d):
        s, i = ref
        return (s, (i + d) % len(self.arcs[s]))

    def leaving_edge(self, ref, d):
        """The polygon edge this arc leaves by, travelling in direction d."""
        arc = self.arcs[ref[0]][ref[1]]
        label = arc[1] if d > 0 else arc[0]
        return (label[0], label[2])

    def find_removable_bigon(self):
        """Look for a bigon that can be homotoped away.

        Returns True if one exists, False if none does, or UNKNOWN if a bigon
        turned up whose legs share an arc — the case this implementation does
        not decide.
        """
        arcs = list(self.all_arcs())
        ambiguous = False
        for x in range(len(arcs)):
            for y in range(x + 1, len(arcs)):
                a, b = arcs[x], arcs[y]
                if not self.crosses(a, b):
                    continue
                for d1 in (1, -1):
                    for d2 in (1, -1):
                        legs = self._trace(a, b, d1, d2)
                        if legs is None:
                            continue
                        left, right = legs
                        if set(left).isdisjoint(right):
                            return True
                        ambiguous = True
        return UNKNOWN if ambiguous else False

    def _trace(self, a, b, d1, d2):
        """Follow two arcs from a shared crossing, hunting the bigon's far end.

        Returns the pair of legs if they cross again, else None once they leave
        through different edges.
        """
        left, right = [a], [b]
        cur_a, cur_b = a, b
        limit = sum(len(s) for s in self.arcs) + 2
        for _ in range(limit):
            if self.leaving_edge(cur_a, d1) != self.leaving_edge(cur_b, d2):
                return None                      # the legs part company
            cur_a = self.step(cur_a, d1)
            cur_b = self.step(cur_b, d2)
            if cur_a == cur_b:
                return None
            left.append(cur_a)
            right.append(cur_b)
            if self.crosses(cur_a, cur_b):
                return left, right
        return None


# --- monogons and embedded bigons ------------------------------------------


def low_degree_sites(strands, sites):
    """Sites whose region is bounded by at most two crossings.

    Such a region is a monogon or an embedded bigon, and leaving one unpinned
    means the curve can be pulled straight across it, losing a crossing. So
    every one of them lies in every pinning set.

    This is worth doing separately because the bigon trace cannot see a
    monogon: a monogon has a single vertex, whereas the trace looks for a
    second crossing where the two legs meet again.
    """
    import arrangement

    faces, _crossings = arrangement.build(
        [[[p[0], p[1]] for p in s] for s in strands])
    must = set()
    for i, (x, y) in enumerate(sites):
        for f in faces:
            if f["outer"]:
                continue
            if arrangement.point_in_polygon((x, y), f["polygon"]):
                if f["degree"] <= 2:
                    must.add(i)
                break
    return must


# --- the pinning question --------------------------------------------------


class Puzzle:
    """A drawn multiloop plus the sites that may be pinned."""

    def __init__(self, strands, sites):
        """strands: closed polylines. sites: candidate pin points, one per
        region that may be pinned — the unbounded region is left out, since in
        the plane it is pinned for free."""
        self.strands = strands
        self.sites = sites
        self.drawn = drawn_crossings(strands)
        self.must_pin = low_degree_sites(strands, sites)
        self.order = order_punctures(sites)
        pts = nudge([sites[i] for i in self.order])
        # read every strand against every ray once; a candidate pin set is then
        # a subsequence, so the search over subsets stays cheap
        self.full = [ray_events(s, pts) for s in strands]

    def _diagram(self, chosen):
        keep = {}
        for ray, site in enumerate(self.order, start=1):
            if site in chosen:
                keep[ray] = len(keep) + 1
        if not keep:
            return None
        per_strand = [
            [(keep[g], sign, depth) for (g, sign, depth) in ev if g in keep]
            for ev in self.full
        ]
        if any(not ev for ev in per_strand):
            return None          # a strand meets no cut: it contracts freely
        return Diagram(per_strand, sorted(keep.values()))

    def self_check(self):
        """With every site pinned, P and C must reproduce the drawn crossings.

        This is the test that catches an error in the polygon conventions —
        edge order, clockwise direction, or which end of a cut is index 1 —
        before any bigon reasoning depends on them.
        """
        d = self._diagram(set(range(len(self.sites))))
        if d is None:
            return None
        return d.crossing_count()

    def taut(self, chosen):
        """True, False, or UNKNOWN for the drawing with these sites pinned."""
        if not self.must_pin <= chosen:
            return False
        d = self._diagram(chosen)
        if d is None:
            # nothing to catch on, so the only taut drawing has no crossings
            return self.drawn == 0
        # Interleaved endpoints force a crossing in every representative with
        # this P and C, so the model can only ever count crossings the drawing
        # must have: model <= drawn always. Coming in under means some homotopic
        # representative does strictly better, which settles it outright.
        if d.crossing_count() < self.drawn:
            return False
        found = d.find_removable_bigon()
        if found is UNKNOWN:
            return UNKNOWN
        return not found

    def minimal_pinning_sets(self):
        """(minimal sets as sorted site-index lists, saw_unknown).

        Pinning sets are upward closed, so walking subsets by increasing size
        and skipping supersets of known minimal ones finds all the minimal
        ones. If any query came back UNKNOWN the result is not trustworthy and
        the caller should discard this puzzle.
        """
        n = len(self.sites)
        found = []
        unknown = False
        for size in range(0, n + 1):
            for combo in combinations(range(n), size):
                cs = set(combo)
                if any(set(m) <= cs for m in found):
                    continue
                verdict = self.taut(cs)
                if verdict is UNKNOWN:
                    unknown = True
                elif verdict:
                    found.append(sorted(cs))
        return sorted(found, key=lambda s: (len(s), s)), unknown
