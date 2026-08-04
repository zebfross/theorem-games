import json, time, heapq
import army, find4
A = [tuple(c) for c in json.loads(open('zeb.json').read())]

def best_height(start, cap=8000000):
    """How high can this army get, and by what line."""
    s = frozenset(start); seen = {s}
    best = (max(y for _, y in s), [])
    heap = [((find4.near(s), -find4.weight(s, 4)), 0, s, [])]
    tick = 0
    while heap and tick < cap:
        _, _, cur, path = heapq.heappop(heap)
        top = max(y for _, y in cur)
        if top > best[0]:
            best = (top, path)
            print(f'  reached row {top} after {len(path)} jumps ({tick} positions)', flush=True)
            if top >= 4:
                return best
        for m in army.moves(cur):
            n = army.apply(cur, m)
            if n in seen: continue
            seen.add(n); tick += 1
            heapq.heappush(heap, ((find4.near(n), -find4.weight(n, 4)), tick, n, path + [m]))
    return best

t = time.time()
top, path = best_height(A)
print(f'highest reached: row {top}  ({time.time()-t:.0f}s)', flush=True)
if top >= 4:
    used = find4.participants(A, path)
    print(f'{len(path)} jumps, {len(used)} soldiers took part', flush=True)
    print('PRUNED', json.dumps([list(c) for c in used]), flush=True)
    json.dump({'army': [list(c) for c in used],
               'moves': [[list(f), list(o), list(t2)] for f, o, t2 in path]},
              open('zeb_solution.json', 'w'))
