"""Planar arrangement of a multiloop drawing.

The catalog gives each strand as a closed polyline. Crossings are mid-segment
intersections, so to get clickable regions we have to build the arrangement
ourselves: split every segment at its intersections, then walk the faces of the
resulting planar graph.

Face traversal uses the standard rotation-system rule. For a directed half-edge
(u -> v), the next half-edge around the same face is (v -> w) where w is the
neighbour of v that comes immediately *clockwise* from u in v's cyclic order of
neighbours. With screen coordinates (y down) that traversal yields interior
faces with positive signed area and the single outer face with negative area.
"""

import math
from collections import defaultdict

EPS = 1e-7


def _seg_intersect(p, q, r, s):
    """Proper crossing point of pq and rs, or None.

    Endpoint touches and collinear overlaps are rejected: in these drawings
    strands meet only at transverse interior crossings.
    """
    (px, py), (qx, qy), (rx, ry), (sx, sy) = p, q, r, s
    dx1, dy1 = qx - px, qy - py
    dx2, dy2 = sx - rx, sy - ry
    denom = dx1 * dy2 - dy1 * dx2
    if abs(denom) < EPS:
        return None
    t = ((rx - px) * dy2 - (ry - py) * dx2) / denom
    u = ((rx - px) * dy1 - (ry - py) * dx1) / denom
    if t <= EPS or t >= 1 - EPS or u <= EPS or u >= 1 - EPS:
        return None
    return (px + t * dx1, py + t * dy1)


def _key(pt, places=6):
    return (round(pt[0], places), round(pt[1], places))


def build(strands):
    """Return (faces, crossings).

    faces is a list of {"polygon": [[x, y], ...], "outer": bool, "area": float}
    with exactly one outer face. crossings is the number of transverse
    intersection points found.
    """
    # 1. every segment, tagged with its strand
    segments = []
    for si, pts in enumerate(strands):
        n = len(pts)
        for i in range(n):
            a = (pts[i][0], pts[i][1])
            b = (pts[(i + 1) % n][0], pts[(i + 1) % n][1])
            segments.append((a, b, si))

    # 2. split points along each segment
    splits = [[] for _ in segments]
    crossing_pts = set()
    for i in range(len(segments)):
        ai, bi, _ = segments[i]
        for j in range(i + 1, len(segments)):
            aj, bj, _ = segments[j]
            hit = _seg_intersect(ai, bi, aj, bj)
            if hit is None:
                continue
            splits[i].append(hit)
            splits[j].append(hit)
            crossing_pts.add(_key(hit))

    # 3. planar graph: nodes are corners + crossings, edges are the pieces
    adj = defaultdict(set)
    coords = {}

    def node(pt):
        k = _key(pt)
        coords.setdefault(k, pt)
        return k

    for idx, (a, b, _si) in enumerate(segments):
        pts = [a] + sorted(
            splits[idx],
            key=lambda p: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2,
        ) + [b]
        for u, v in zip(pts, pts[1:]):
            ku, kv = node(u), node(v)
            if ku != kv:
                adj[ku].add(kv)
                adj[kv].add(ku)

    # 4. cyclic (counter-clockwise in math orientation) order of neighbours
    order = {}
    for u, nbrs in adj.items():
        ux, uy = coords[u]
        order[u] = sorted(
            nbrs, key=lambda v: math.atan2(coords[v][1] - uy, coords[v][0] - ux)
        )
    index_in_order = {
        u: {v: i for i, v in enumerate(vs)} for u, vs in order.items()
    }

    # 5. walk faces
    faces = []
    visited = set()
    for u in adj:
        for v in adj[u]:
            if (u, v) in visited:
                continue
            face = []
            cu, cv = u, v
            while (cu, cv) not in visited:
                visited.add((cu, cv))
                face.append(coords[cu])
                ring = order[cv]
                i = index_in_order[cv][cu]
                nxt = ring[(i - 1) % len(ring)]
                cu, cv = cv, nxt
            if len(face) >= 3:
                area = 0.0
                for k in range(len(face)):
                    x1, y1 = face[k]
                    x2, y2 = face[(k + 1) % len(face)]
                    area += x1 * y2 - x2 * y1
                # A region's degree is how many crossings sit on its boundary,
                # counted with multiplicity so pinched regions come out right.
                degree = sum(1 for p in face if len(adj[_key(p)]) == 4)
                faces.append({
                    "polygon": [[round(x, 3), round(y, 3)] for x, y in face],
                    "area": area / 2.0,
                    "degree": degree,
                    "outer": False,
                })

    if not faces:
        raise ValueError("no faces found")

    # exactly one face has the opposite orientation: the outer one
    outer = [f for f in faces if f["area"] < 0]
    if len(outer) != 1:
        raise ValueError(f"expected 1 outer face, found {len(outer)}")
    outer[0]["outer"] = True

    return faces, len(crossing_pts)


def point_in_polygon(pt, polygon):
    """Even-odd ray cast."""
    x, y = pt
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xint = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xint:
                inside = not inside
    return inside


def interior_point(polygon):
    """A point comfortably inside the polygon.

    Starts from the centroid, which is inside for the convex-ish cells these
    drawings produce, and otherwise falls back to the best of a grid of
    candidates scored by distance to the boundary.
    """
    n = len(polygon)
    a2 = 0.0
    cx = cy = 0.0
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        a2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(a2) > EPS:
        centroid = (cx / (3 * a2), cy / (3 * a2))
        if point_in_polygon(centroid, polygon):
            return centroid

    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    x0, x1b, y0, y1b = min(xs), max(xs), min(ys), max(ys)
    best, best_d = None, -1.0
    steps = 24
    for i in range(1, steps):
        for j in range(1, steps):
            p = (x0 + (x1b - x0) * i / steps, y0 + (y1b - y0) * j / steps)
            if not point_in_polygon(p, polygon):
                continue
            d = min(
                _dist_to_segment(p, polygon[k], polygon[(k + 1) % n])
                for k in range(n)
            )
            if d > best_d:
                best, best_d = p, d
    if best is None:
        raise ValueError("could not find an interior point")
    return best


def _dist_to_segment(p, a, b):
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    if L < EPS:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
