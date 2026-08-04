"""Hunt for a twenty-soldier army that reaches row 4.

Subsets are out of the question — twenty cells from a staging area of forty is
about 10^11 — so this climbs instead: start from a random army, ask how high it
can get, and keep swaps that do not make it worse. `best_row` is capped, because
a twenty-piece position has a large tree and the honest answer to "how high"
matters less than not hanging.
"""
import random
import sys

import army


def best_row(a, cap=400000):
    """The highest row this army can reach, searched until `cap` positions."""
    seen = set()
    best = [max(y for (_, y) in a)]
    budget = [cap]

    def walk(s):
        if budget[0] <= 0:
            return
        budget[0] -= 1
        top = max(y for (_, y) in s)
        if top > best[0]:
            best[0] = top
        if s in seen:
            return
        seen.add(s)
        # Try jumps that gain height first: they are what the search is for.
        for m in sorted(army.moves(s), key=lambda m: -m[2][1]):
            walk(army.apply(s, m))

    walk(frozenset(a))
    return best[0]


def climb(target, size, rng, rounds=4000):
    pool = [(x, y) for y in (0, -1, -2, -3, -4) for x in range(-4, 5)]
    cur = set(rng.sample(pool, size))
    score = best_row(cur)
    for i in range(rounds):
        if score >= target:
            return sorted(cur), score
        out = rng.choice(sorted(cur))
        spare = [c for c in pool if c not in cur]
        if not spare:
            break
        trial = set(cur)
        trial.remove(out)
        trial.add(rng.choice(spare))
        got = best_row(trial)
        if got >= score:
            cur, score = trial, got
    return sorted(cur), score


if __name__ == '__main__':
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    for seed in range(30):
        rng = random.Random(seed)
        a, got = climb(target, size, rng)
        print(f'seed {seed}: reached row {got}', flush=True)
        if got >= target:
            print('ARMY', a, flush=True)
            break
