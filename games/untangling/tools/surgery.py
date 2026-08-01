"""Redrawing a curve after a move.

The combinatorics of a move are settled (see diagram.py); this is the picture.
Every reachable diagram needs one, and consecutive drawings have to look
related, or a move reads as the puzzle being swapped rather than changed. So
the drawing is edited in place rather than laid out afresh: cut the loop out,
pull the lens apart, leave everything else exactly where it was.

Nothing here has to be argued into correctness. Every edit is checked by
rebuilding the diagram from the new drawing and comparing it against what the
combinatorial move says the answer is. A surgery that disagrees is discarded,
which means the geometry is free to be approximate as long as it is checked.
"""

import math

import diagram


def _pt(points, loc):
    """The point at (segment, t) along a closed polyline."""
    i, t = loc
    n = len(points)
    (ax, ay), (bx, by) = points[i], points[(i + 1) % n]
    return (ax + (bx - ax) * t, ay + (by - ay) * t)


def _walk(points, start_seg, end_seg):
    """Vertices strictly after start_seg up to and including end_seg."""
    n = len(points)
    out = []
    i = (start_seg + 1) % n
    while True:
        out.append(points[i])
        if i == end_seg:
            break
        i = (i + 1) % n
        if len(out) > n:
            raise ValueError('walked off the end')
    return out


def cut_loop(points, dia, pos_a, pos_b):
    """Remove the stretch of curve between two visits, an R1.

    The two visits are consecutive in the code, so nothing else crosses the
    stretch between them: it is a bare loop and can simply be excised.
    """
    a, b = dia.param[pos_a], dia.param[pos_b]
    if a[0] == b[0]:
        return None                       # both on one segment; nothing to cut
    x = _pt(points, a)
    kept = _walk(points, b[0], a[0])
    if len(kept) < 3:
        return None
    return [x] + kept


def _unit(vx, vy):
    d = math.hypot(vx, vy)
    return (0.0, 0.0) if d < 1e-12 else (vx / d, vy / d)


def pull_lens_apart(points, dia, face, delta):
    """Slide one arc of a bigon across the lens, an R2.

    The strands still go where they went; they simply stop meeting. The arc
    being moved is replaced by a copy of the arc it has to clear, nudged just
    past it, so the new path hugs geometry the curve already occupies.

    Translating the arc along a fixed direction was tried first and does not
    work: a lens can have one short arc and one long curved one, and shoving
    the long one sideways drags it through whatever else is nearby, landing on
    a different diagram rather than the collapsed one.

    Nothing here is argued to be right. All four candidates — either arc
    moving, either side — are returned, and the caller keeps whichever rebuilds
    into the diagram the combinatorial move predicts.
    """
    n = len(points)
    arcs = sorted({pos if side == diagram.OUT else (pos - 1) % dia.length
                   for pos, side in face})
    if len(arcs) != 2:
        return []

    spans = []
    for start in arcs:
        a = dia.param[start][0]
        b = dia.param[(start + 1) % dia.length][0]
        span = []
        i = (a + 1) % n
        while True:
            span.append(i)
            if i == b:
                break
            i = (i + 1) % n
            if len(span) > n:
                return []
        spans.append(span)

    out = []
    for mover in (0, 1):
        keep, move = spans[1 - mover], spans[mover]
        guide = [points[i] for i in keep]
        if len(guide) < 2 or not move:
            continue
        # run the guide the same way round as the arc it is replacing
        if math.dist(guide[0], points[move[0]]) > math.dist(guide[-1], points[move[0]]):
            guide = guide[::-1]
        # Walk the ring from just past the moved arc round to just before it.
        # Filtering by index instead looks equivalent and is not: the polyline
        # is a cycle, so when the moved arc straddles index 0 the kept points
        # come back in the wrong rotation and the rebuilt curve is nonsense.
        outside = []
        i = (move[-1] + 1) % n
        while i != move[0]:
            outside.append(points[i])
            i = (i + 1) % n
        m = len(guide)
        ramp = max(1, m // 6)
        for sign in (1, -1):
            shifted = []
            for k, g in enumerate(guide):
                a = guide[max(0, k - 1)]
                b = guide[min(m - 1, k + 1)]
                tx, ty = _unit(b[0] - a[0], b[1] - a[1])
                # Ease the offset in and out. Held flat to the very ends, the
                # copy meets the rest of the curve at a step, and the segment
                # bridging that step cuts across whatever lies between.
                ease = min(1.0, (min(k, m - 1 - k) + 1) / (ramp + 1))
                d = delta * sign * ease
                shifted.append((g[0] - ty * d, g[1] + tx * d))
            out.append(outside + shifted)
    return out


def _along(pts, count):
    """Resample an open polyline to `count` points, keeping both ends."""
    if len(pts) < 2 or count < 2:
        return list(pts)
    run = [0.0]
    for a, b in zip(pts, pts[1:]):
        run.append(run[-1] + math.dist(a, b))
    total = run[-1]
    if total < 1e-12:
        return [pts[0]] * count
    out = []
    j = 0
    for k in range(count):
        target = total * k / (count - 1)
        while j < len(run) - 2 and run[j + 1] < target:
            j += 1
        span = run[j + 1] - run[j]
        t = 0.0 if span < 1e-12 else (target - run[j]) / span
        (ax, ay), (bx, by) = pts[j], pts[j + 1]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def contract_lens(points, dia, face, eps, fade):
    """Squeeze a bigon shut, an R2.

    What an R2 physically is: the two crossings slide together along the lens,
    meet, and cancel. So both bounding arcs are replaced by the line midway
    between them and then parted by a whisker, and the parting is faded into
    the curve either side so the strands arrive already separated rather than
    meeting at the old crossing and immediately splitting again.

    This is a different shape of edit from sliding one arc past the other, and
    the two fail on different lenses, so both are offered.
    """
    n = len(points)
    arcs = sorted({pos if side == diagram.OUT else (pos - 1) % dia.length
                   for pos, side in face})
    if len(arcs) != 2:
        return []

    spans = []
    for start in arcs:
        a = dia.param[start][0]
        b = dia.param[(start + 1) % dia.length][0]
        span = []
        i = (a + 1) % n
        while True:
            span.append(i)
            if i == b:
                break
            i = (i + 1) % n
            if len(span) > n // 2:
                return []
        spans.append(span)
    if set(spans[0]) & set(spans[1]):
        return []

    A = [points[i] for i in spans[0]]
    B = [points[i] for i in spans[1]]
    if len(A) < 2 or len(B) < 2:
        return []
    if math.dist(A[0], B[0]) > math.dist(A[0], B[-1]):
        B = B[::-1]
        spans[1] = spans[1][::-1]

    m = max(len(A), len(B), 4)
    Ar, Br = _along(A, m), _along(B, m)
    mid = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(Ar, Br)]

    normals = []
    for k in range(m):
        a = mid[max(0, k - 1)]
        b = mid[min(m - 1, k + 1)]
        tx, ty = _unit(b[0] - a[0], b[1] - a[1])
        normals.append((-ty, tx))

    out = []
    for sign in (1, -1):
        newA = [(p[0] + nn[0] * eps * sign, p[1] + nn[1] * eps * sign)
                for p, nn in zip(mid, normals)]
        newB = [(p[0] - nn[0] * eps * sign, p[1] - nn[1] * eps * sign)
                for p, nn in zip(mid, normals)]
        shifted = list(points)
        for span, fresh in ((spans[0], _along(newA, len(spans[0]))),
                            (spans[1], _along(newB, len(spans[1])))):
            for idx, p in zip(span, fresh):
                shifted[idx] = p
        # carry the parting a little way into the curve on both sides
        for span, side in ((spans[0], sign), (spans[1], -sign)):
            for w in range(1, fade + 1):
                k = 1 - w / (fade + 1)
                for idx, nn in ((( span[0] - w) % n, normals[0]),
                                ((span[-1] + w) % n, normals[-1])):
                    px, py = points[idx]
                    shifted[idx] = (px + nn[0] * eps * side * k,
                                    py + nn[1] * eps * side * k)
        out.append(shifted)
    return out


def _resample(points, spacing):
    """Even out a polyline, so later edits meet a predictable point density."""
    n = len(points)
    total = sum(math.dist(points[i], points[(i + 1) % n]) for i in range(n))
    count = max(12, int(total / spacing))
    step = total / count
    out = []
    i = 0
    carried = 0.0
    seg = math.dist(points[0], points[1 % n])
    for k in range(count):
        target = k * step
        while target > carried + seg and i < n - 1:
            carried += seg
            i += 1
            seg = math.dist(points[i], points[(i + 1) % n])
        t = 0.0 if seg < 1e-12 else (target - carried) / seg
        (ax, ay), (bx, by) = points[i], points[(i + 1) % n]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def apply_collapse(points, dia, crossings, spacing=6.0):
    """Redraw after collapsing these crossings, or None if it could not be done.

    The result is accepted only when rebuilding a diagram from it gives back
    exactly what the combinatorial collapse predicts.
    """
    want = dia.collapse(crossings).canonical()

    if len(crossings) == 2:
        # find the bigon face on exactly these two crossings
        for kind, cs, face in dia.moves():
            if kind != 'R2' or cs != sorted(crossings):
                continue
            # how far past the arc it has to clear; small first, so the
            # drawing changes as little as it can get away with
            for delta in (spacing * 0.15, spacing * 0.3, spacing * 0.5,
                          spacing * 0.8, spacing * 1.2, spacing * 1.8,
                          spacing * 2.5, spacing * 3.5):
                cands = list(pull_lens_apart(points, dia, face, delta))
                for fade in (2, 5, 10):
                    cands += contract_lens(points, dia, face, delta, fade)
                for cand in cands:
                    try:
                        got = diagram.from_polyline(cand)
                    except ValueError:
                        continue
                    if got.canonical() == want:
                        return _resample(cand, spacing)
        return None

    if len(crossings) == 1:
        c = crossings[0]
        vs = dia.visits(c)
        # a monogon's two visits are adjacent in the code; cut the loop between
        for pa, pb in ((vs[0], vs[1]), (vs[1], vs[0])):
            if (pa + 1) % dia.length != pb:
                continue
            cut = cut_loop(points, dia, pa, pb)
            if cut is None:
                continue
            cut = _resample(cut, spacing)
            try:
                got = diagram.from_polyline(cut)
            except ValueError:
                continue
            if got.canonical() == want:
                return cut
        return None

    return None
