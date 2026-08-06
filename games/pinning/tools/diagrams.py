"""Every closed curve with n crossings, each one exactly once.

This replaces sampling with enumeration, and the difference is the whole point.
The old generator scattered random points and hoped distinct puzzles fell out of
it, which is why it needed a quota per size and a cap on how many levels could
share a pinning structure — machinery for suppressing duplicates after the fact.
At two crossings with one loop there is exactly one diagram, so twenty-four
random drawings of it were twenty-four copies of the same puzzle. Zeb: "levels
1-2 to 12-2 are very similar, basically the same pattern over and over."

Enumerating instead makes duplicates impossible rather than rare. That is how
the LooPindex catalogue Pinning ships was built, and why its levels feel varied.

## How a curve is written down

Walk the curve and write the name of each crossing as you meet it. Every
crossing is met twice, so a curve with n crossings gives a word of length 2n in
which each of n letters appears exactly twice — a Gauss code. Two curves that
are the same up to sliding around the sphere give the same word up to where you
started walking and which way round you went, so quotienting by those gives one
word per curve.

## Which words are actually curves

Most are not. `abcabc` is a word but no closed curve in the plane produces it.
Rather than test realizability with a criterion, this constructs the embedding
and checks it: at a crossing the two strands must cross transversally, so going
around the crossing the four arc-ends alternate between the strands, which
leaves exactly two possible local orderings. Choosing one at every crossing
gives a rotation system; tracing its faces and counting them says whether that
choice describes a sphere, by Euler. V - E + F = n - 2n + F, so the word is
realizable exactly when some choice yields n + 2 faces.

Searching 2^n orderings per word is more work than applying a criterion, and it
is worth it: what comes back is not a yes, it is the planar embedding itself,
with its faces — which is exactly what the drawing code needs next, and it has
been verified rather than asserted.
"""

import sys


def chord_diagrams(n):
    """Every way of pairing up 2n positions: one per Gauss word."""
    def rec(free, pairs):
        if not free:
            yield pairs
            return
        a = free[0]
        for i in range(1, len(free)):
            yield from rec(free[1:i] + free[i + 1:], pairs + [(a, free[i])])
    yield from rec(list(range(2 * n)), [])


def word_of(pairs, n):
    w = [0] * (2 * n)
    for label, (a, b) in enumerate(pairs):
        w[a] = w[b] = label
    return tuple(w)


def relabel(w):
    """Rename crossings in the order they are first met."""
    seen, out = {}, []
    for c in w:
        if c not in seen:
            seen[c] = len(seen)
        out.append(seen[c])
    return tuple(out)


def canonical(w):
    """The same curve started anywhere, walked either way, written one way.

    Walking from a different crossing or in the other direction is the same
    curve, so the least of all those spellings identifies it.
    """
    m = len(w)
    best = None
    for s in range(m):
        for turned in (w[s:] + w[:s], tuple(reversed(w[s:] + w[:s]))):
            cand = relabel(turned)
            if best is None or cand < best:
                best = cand
    return best


# A dart is one direction along one arc. Arc i runs from the crossing at
# position i of the word to the crossing at position i+1, so dart 2i goes that
# way and dart 2i+1 comes back.
def _head(d, w):
    m = len(w)
    return w[(d // 2 + 1) % m] if d % 2 == 0 else w[d // 2]


def _rotations(w):
    """The two possible orderings of arc-ends at each crossing.

    A crossing is transversal: the two strands through it alternate as you go
    round, which allows exactly two orders and no others. Everything below is a
    search over one binary choice per crossing.
    """
    m = len(w)
    where = {}
    for i, c in enumerate(w):
        where.setdefault(c, []).append(i)
    out = {}
    for c, (p, q) in where.items():
        # Outgoing arc-ends: leaving along arc p or q, or back down the arc that
        # arrived. The first two belong to one strand, the last two the other.
        out_p, back_p = 2 * p, 2 * ((p - 1) % m) + 1
        out_q, back_q = 2 * q, 2 * ((q - 1) % m) + 1
        out[c] = ([back_p, back_q, out_p, out_q],
                  [back_p, out_q, out_p, back_q])
    return out


def _faces(w, rot):
    """Trace the faces of a rotation system; None if any arc-end is orphaned."""
    m = len(w)
    after = {}
    for c, order in rot.items():
        for i, d in enumerate(order):
            after[d] = order[(i + 1) % 4]
    if len(after) != 2 * m:
        return None
    faces, seen = [], set()
    for start in range(2 * m):
        if start in seen:
            continue
        face, d = [], start
        while d not in seen:
            seen.add(d)
            face.append(d)
            d = after[d ^ 1]          # step over the arc, turn at the crossing
        faces.append(face)
    return faces


def embed(w):
    """A planar embedding of this word, or None if it is not a curve.

    Returns the rotation system and its faces. The face count is the test:
    Euler's formula forces n + 2 on the sphere, and a choice of orderings that
    produces anything else has not described a plane curve.
    """
    n = len(w) // 2
    choices = _rotations(w)
    order = sorted(choices)
    for mask in range(1 << n):
        rot = {c: choices[c][(mask >> i) & 1] for i, c in enumerate(order)}
        faces = _faces(w, rot)
        if faces is not None and len(faces) == n + 2:
            return rot, faces
    return None


def is_prime(w):
    """False if the curve is two smaller curves tied end to end.

    A composite diagram can be cut by a circle meeting it twice, with crossings
    on both sides — so it is two puzzles drawn next to each other, and it plays
    like it. Reduced-but-composite is exactly the extra diagram this enumeration
    finds at six crossings that the LooPindex catalogue does not, which is how
    the filter was found: the catalogue's counts of one-component diagrams are
    1, 2, 3 at four, five and six crossings, and this file gave 1, 2, 4.

    The cut is a pair of arcs whose removal disconnects the crossings.
    """
    m = len(w)
    n = m // 2
    if n < 2:
        return True
    ends = [(w[i], w[(i + 1) % m]) for i in range(m)]
    for a in range(m):
        for b in range(a + 1, m):
            adj = {}
            for i, (u, v) in enumerate(ends):
                if i in (a, b):
                    continue
                adj.setdefault(u, []).append(v)
                adj.setdefault(v, []).append(u)
            seen, stack = {w[0]}, [w[0]]
            while stack:
                for nxt in adj.get(stack.pop(), ()):
                    if nxt not in seen:
                        seen.add(nxt)
                        stack.append(nxt)
            if len(seen) < n:
                return False
    return True


def parity_ok(w):
    """Gauss's own condition: every crossing interleaves with an even number.

    Necessary but not sufficient, so it is a filter and not a decision — the
    embedding search still has the last word. It earns its place by being cheap:
    the great majority of words fail it, and at eight crossings there are two
    million words to get through, which is not affordable at 2^n embeddings
    each.
    """
    m = len(w)
    where = {}
    for i, c in enumerate(w):
        where.setdefault(c, []).append(i)
    for c, (p, q) in where.items():
        between = 0
        for d, (r, t) in where.items():
            if d == c:
                continue
            # d interleaves c when exactly one of its two positions lies
            # between c's two positions.
            if (p < r < q) != (p < t < q):
                between += 1
        if between % 2:
            return False
    return True


def curves(n, drop_kinks=True, prime_only=True):
    """Every closed curve with n crossings, once each.

    A kink — a lobe bounded by a single arc, what Reidemeister's first move
    undoes — is dropped by default. It is a crossing that cannot matter: the
    lobe can always be pulled flat, so no pin is ever forced by it, and it makes
    a puzzle that looks like it has n crossings and behaves as if it had fewer.
    """
    out = {}
    for pairs in chord_diagrams(n):
        w = word_of(pairs, n)
        if not parity_ok(w):
            continue
        key = canonical(w)
        if key in out:
            continue
        got = embed(w)
        if got is None:
            continue
        rot, faces = got
        if drop_kinks and any(len(f) == 1 for f in faces):
            continue
        if prime_only and not is_prime(w):
            continue
        out[key] = (w, rot, faces)
    return list(out.values())


if __name__ == '__main__':
    top = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    print('crossings    words   curves   reduced   reduced+prime')
    for n in range(1, top + 1):
        words = sum(1 for _ in chord_diagrams(n))
        allc = len(curves(n, drop_kinks=False, prime_only=False))
        red = len(curves(n, prime_only=False))
        good = len(curves(n))
        print(f'{n:9d}{words:9d}{allc:9d}{red:10d}{good:16d}', flush=True)
