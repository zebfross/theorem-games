"""Does Zeb's 32-soldier block actually reach row 4? Search hard, and say so.

He played it in the game, which is strong evidence, but a hint that hands over a
position which does not work would be worse than having no hint at all — so it
gets checked rather than taken on trust.
"""
import heapq, json, time
import army, find4

A = [tuple(c) for c in json.load(open('zeb.json'))]

def hunt(start, row=4, cap=30000000):
    s = frozenset(start); seen = {s}
    heap = [((find4.near(s), -find4.weight(s, row)), 0, s, [])]
    tick = 0; best = max(y for _, y in s); t0 = time.time()
    while heap and tick < cap:
        _, _, cur, path = heapq.heappop(heap)
        top = max(y for _, y in cur)
        if top > best:
            best = top
            print(f'  row {top} at {tick} positions, {time.time()-t0:.0f}s', flush=True)
        if top >= row:
            return path
        for m in army.moves(cur):
            n = army.apply(cur, m)
            if n in seen: continue
            seen.add(n); tick += 1
            heapq.heappush(heap, ((find4.near(n), -find4.weight(n, row)), tick, n, path + [m]))
    print(f'  gave up at {tick} positions, highest row {best}', flush=True)
    return None

seq = hunt(A)
if seq:
    used = find4.participants(A, seq)
    print(f'VERIFIED: {len(seq)} jumps, {len(used)} soldiers took part', flush=True)
    json.dump({'army': [list(c) for c in used],
               'moves': [[list(f), list(o), list(t)] for f, o, t in seq]},
              open('zeb_solution.json', 'w'))
