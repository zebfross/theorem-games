"""Depth-first, ordered by promise. Best-first would not commit.

Reaching row n+1 needs two soldiers stacked directly beneath the target, which
means building support — and support makes the board look *worse* to a
heuristic that rewards having somebody near the top. Best-first therefore keeps
polishing a stranded leader and never pays the cost of the ladder underneath it.

Depth-first commits. It follows one line a long way, ordering the choices at
each step by where they leave the nearest soldier, and backtracks only when
stuck. The ordering is the same idea; the willingness to go deep is the change.
"""
import json, sys, time
import army

TARGET = (0, 4)


def near(a):
    return min(abs(x - TARGET[0]) + abs(y - TARGET[1]) for (x, y) in a)


def dive(start, row=4, cap=6000000):
    seen = set()
    best = [max(y for _, y in start), time.time()]
    budget = [cap]

    def walk(cur, path):
        if budget[0] <= 0:
            return None
        budget[0] -= 1
        top = max(y for _, y in cur)
        if top >= row:
            return path
        if top > best[0]:
            best[0] = top
            print(f'  row {top} after {len(path)} jumps '
                  f'({cap - budget[0]} positions, {time.time()-best[1]:.0f}s)', flush=True)
        if cur in seen:
            return None
        seen.add(cur)
        nxt = [(army.apply(cur, m), m) for m in army.moves(cur)]
        nxt.sort(key=lambda p: (near(p[0]), -max(y for _, y in p[0])))
        for state, m in nxt:
            got = walk(state, path + [m])
            if got is not None:
                return got
        return None

    return walk(frozenset(start), [])


if __name__ == '__main__':
    sys.setrecursionlimit(100000)
    A = [tuple(c) for c in json.load(open('zeb.json'))]
    t = time.time()
    seq = dive(A)
    print(f'result: {"FOUND" if seq else "not found"}  ({time.time()-t:.0f}s)', flush=True)
    if seq:
        import find4
        used = find4.participants(A, seq)
        print(f'{len(seq)} jumps, {len(used)} soldiers took part', flush=True)
        print('ARMY', json.dumps([list(c) for c in used]), flush=True)
        json.dump({'army': [list(c) for c in used],
                   'moves': [[list(f), list(o), list(t2)] for f, o, t2 in seq]},
                  open('zeb_solution.json', 'w'))
