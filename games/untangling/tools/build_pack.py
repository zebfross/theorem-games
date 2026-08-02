"""Build the level pack.

A level is its whole state graph, not just a starting curve: every diagram the
player can reach, each with a drawing, and the moves joining them. That is
affordable because the graphs are tiny — the worst is under a hundred diagrams
— and it means a move at runtime is a lookup rather than live geometry, which
is the part most likely to have sunk the idea.

A level is only emitted if it can be played to the simple curve in par using
moves that can be drawn. Drawing a bigon collapse succeeds about 84% of the
time, so some moves are missing from some graphs; a level survives that as long
as another best-possible route is still there. Levels that do not survive it
are dropped rather than shipped short of par.

Usage:  python3 build_pack.py [--limit N] [--spacing S]
"""

import argparse
import glob
import json
import math
import os
import sys
import time
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import diagram
import surgery

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'data'))
SOURCE = os.path.normpath(os.path.join(HERE, '..', '..', 'unpinning', 'data', 'levels'))


def build_graph(points, spacing, cap=400):
    """Every reachable diagram, drawn. Returns (root key, drawings, moves).

    `moves` maps a diagram to the moves out of it that could be drawn, each as
    (click point, lens outline or None, resulting diagram).
    """
    root = diagram.from_polyline(points)
    rk = root.canonical()
    drawn = {rk: points}
    moves = {}
    frontier = [(root, points)]
    while frontier:
        cur, pts = frontier.pop()
        ck = cur.canonical()
        moves.setdefault(ck, [])
        for kind, cs, face in cur.moves():
            if kind == 'R3':
                continue
            key = cur.collapse(cs).canonical()
            if key not in drawn:
                pic = surgery.apply_collapse(pts, cur, cs, spacing=spacing)
                if pic is None:
                    continue
                drawn[key] = pic
                if len(drawn) > cap:
                    return rk, drawn, moves
                frontier.append((diagram.from_polyline(pic), pic))
            # Where the player clicks, worked out here rather than in the
            # browser. The outline is the nicer target but is not always
            # traceable: a bigon's two corners can resolve to a single edge,
            # leaving no two arcs to walk. The move is still perfectly good
            # when that happens, so it falls back to the point midway between
            # the two crossings. Dropping a level for want of a highlight
            # shape would be the wrong way round — one such move on a
            # critical path cost a whole level before this.
            at = [sum(cur.points[c][i] for c in cs) / len(cs) for i in (0, 1)]
            moves[ck].append((at, surgery.lens_outline(pts, cur, face), key))
    return rk, drawn, moves


def shortest(root, moves):
    """Fewest drawable moves to the simple curve, or None."""
    simple = ((), ())
    q = deque([(root, 0)])
    seen = {root}
    while q:
        k, d = q.popleft()
        if k == simple:
            return d
        for _at, _lens, nk in moves.get(k, ()):
            if nk not in seen:
                seen.add(nk)
                q.append((nk, d + 1))
    return None


def _round(points):
    return [[round(x, 2), round(y, 2)] for x, y in points]


def _flat(points):
    """Whole numbers, in one flat list, since this is most of the pack's size.

    The board is about 500 units across and the curve is drawn 11 units thick,
    so anything under a unit is invisible. Pairs cost two brackets and a comma
    each, which at a few hundred points a state is worth removing.
    """
    out = []
    for x, y in points:
        out.append(int(round(x)))
        out.append(int(round(y)))
    return out


# Surgery needs a fine polyline to work on; drawing one needs far less. The
# stored curve is coarsened as far as it will go, which is most of the pack's
# weight — but coarsening moves points, and moving points can add or lose a
# crossing, so each candidate is checked against the diagram it is supposed to
# be and the finest is always available as a fallback. Rounding to whole
# numbers moves them too, which is why the check comes after it, not before.
STORE_TOLERANCES = (6.0, 4.0, 2.5, 1.5, 0.8)


def _douglas_peucker(pts, tol):
    """Drop points that lie within `tol` of the line they sit on.

    Resampling evenly is the wrong way to shed points here: a curve is mostly
    long smooth sweeps with the interesting parts near the crossings, and even
    spacing spends just as much on the sweeps. This spends points where the
    curve actually bends.
    """
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        worst, at = -1.0, a
        for i in range(a + 1, b):
            px, py = pts[i]
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / norm if norm > 1e-12
                 else math.dist(pts[i], pts[a]))
            if d > worst:
                worst, at = d, i
        if worst > tol:
            keep[at] = True
            stack.append((a, at))
            stack.append((at, b))
    return [p for p, k in zip(pts, keep) if k]


STORE_SPACINGS = (26.0, 20.0, 15.0, 11.0)


def _slim(points, want, spacing):
    """The smallest stored form of this curve that is still this diagram.

    Two ways of shedding points, and neither wins everywhere, so both are tried
    and the smallest survivor kept. Douglas-Peucker is much the better idea in
    principle — it spends points where the curve bends — but it cuts the corner
    between the points it keeps, and on a curve whose strands pass within a
    rope's width of each other that shortcut can cross a strand and change the
    diagram. Where it does, it is rejected outright and even resampling wins by
    default. Rounding to whole numbers moves points too, so the check comes
    after that, not before.
    """
    best = _flat(points)
    for cand in ([_douglas_peucker(list(points), t) for t in STORE_TOLERANCES]
                 + [surgery._resample(points, s) for s in STORE_SPACINGS
                    if s > spacing]):
        flat = _flat(cand)
        if len(flat) >= len(best) or len(flat) < 8:
            continue
        try:
            if diagram.from_polyline(list(zip(flat[0::2], flat[1::2]))).canonical() == want:
                best = flat
        except ValueError:
            pass
    return best


def pack_level(lid, rope, spacing):
    """A level, or None if it cannot be played to the end in par."""
    points = surgery._resample([tuple(p) for p in rope], spacing)
    par, _seen, _explored = diagram.reduce_bfs(diagram.from_polyline(points))
    if par is None:
        return None                       # needs an R3, which is not built
    root, drawn, moves = build_graph(points, spacing)
    if shortest(root, moves) != par:
        return None                       # the drawing blocks every best route

    # Number the diagrams so the level file holds no canonical keys, which are
    # nested tuples and would only have to be parsed back at runtime.
    order = {root: 0}
    for k in drawn:
        order.setdefault(k, len(order))
    states = [None] * len(order)
    for k, pts in drawn.items():
        states[order[k]] = _slim(pts, k, spacing)
    links = {}
    for k, outs in moves.items():
        if outs:
            # The lens is only a click target and a highlight, so nothing
            # depends on its fidelity; a couple of dozen points is plenty.
            links[order[k]] = [
                dict(at=[int(round(v)) for v in at], to=order[to],
                     **({'lens': _flat(surgery._along(lens, min(len(lens), 20)))}
                        if lens else {}))
                for at, lens, to in outs]

    # How tangled each state is. The game needs it to know when the curve has
    # gone simple and to say how far there is left to go, and it is far cheaper
    # to count here than to find the crossings again in the browser.
    counts = [None] * len(order)
    for k, pts in drawn.items():
        counts[order[k]] = len(k[0]) // 2

    # One view for the whole level, big enough for every state. Fitting each
    # state on its own would rescale the board on every move, which reads as
    # the puzzle being swapped rather than changed.
    xs = [v for s in states for v in s[0::2]]
    ys = [v for s in states for v in s[1::2]]
    pad = 0.06 * max(max(xs) - min(xs), max(ys) - min(ys), 1)
    view = [round(min(xs) - pad, 2), round(min(ys) - pad, 2),
            round(max(xs) - min(xs) + 2 * pad, 2),
            round(max(ys) - min(ys) + 2 * pad, 2)]

    return {
        'id': lid,
        'crossings': counts[0],
        'par': par,
        'start': 0,
        'view': view,
        'states': states,
        'counts': counts,
        'moves': links,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--spacing', type=float, default=9.0)
    args = ap.parse_args()

    sources = []
    for f in sorted(glob.glob(os.path.join(SOURCE, '*.json'))):
        lv = json.load(open(f))
        if len(lv['rope']) == 1:
            sources.append((lv['crossings'], lv['id'], lv['rope'][0]))
    sources.sort()
    if args.limit:
        sources = sources[:args.limit]

    os.makedirs(os.path.join(OUT, 'levels'), exist_ok=True)
    index = []
    dropped = 0
    t0 = time.time()
    for n, (cr, lid, rope) in enumerate(sources, 1):
        level = pack_level(lid, rope, args.spacing)
        if level is None:
            dropped += 1
        else:
            with open(os.path.join(OUT, 'levels', f'{lid}.json'), 'w') as fh:
                json.dump(level, fh, separators=(',', ':'))
            index.append({'id': lid, 'crossings': cr, 'par': level['par'],
                          'states': len(level['states'])})
        if n % 25 == 0:
            print(f'  {n}/{len(sources)}  kept {len(index)}  dropped {dropped}'
                  f'  {time.time() - t0:.0f}s', flush=True)

    index.sort(key=lambda e: (e['crossings'], e['id']))
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({'count': len(index), 'levels': index}, fh, separators=(',', ':'))
    print(f'\n{len(index)} levels, {dropped} dropped, {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
