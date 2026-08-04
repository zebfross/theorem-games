"""Build the level pack.

A level is a small bipartite graph: applicants down one side, jobs down the
other, an edge where somebody is qualified. Par is the fewest people who can be
left unplaced, which Konig says is the worst deficiency of any group of
applicants.

Two kinds ship, and the second is the point of the game:

  * **Solvable.** Everyone can be placed. Par is 0.
  * **Blocked.** Somebody must go unplaced, and the player has to say *why* —
    naming the group of applicants that share too few jobs between them. That
    group is Hall's certificate: proof that no arrangement could have done
    better, which is a thing a player can find and check by eye.

Levels are filtered for two things, both measured rather than eyeballed. A
bottleneck must not be trivially visible, so an applicant qualified for nothing
disqualifies the level — that is a bottleneck of size one and gives the whole
answer away. And greedy matching must fail often enough to make the level worth
playing: if grabbing jobs in the order they come always finds the maximum, there
is nothing to think about.

Usage:  python3 tools/build_pack.py
"""

import json
import os
import random

import hall

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

TRIALS = 400          # random greedy attempts used to score a level's difficulty


def greedy(adj, jobs, rng):
    """Match by grabbing whatever is free, in a random order. No backtracking.

    This is the careless player, and it is also the honest baseline for whether
    a level needs any thought: a level greedy always solves is a level where
    augmenting paths never come up.
    """
    taken = {}
    order = list(range(len(adj)))
    rng.shuffle(order)
    for a in order:
        free = [j for j in adj[a] if j not in taken]
        if free:
            taken[rng.choice(free)] = a
    return len(taken)


def careless_rate(adj, jobs, best, rng):
    """How often thoughtless matching happens to hit the maximum."""
    hits = sum(1 for _ in range(TRIALS) if greedy(adj, jobs, rng) == best)
    return hits / TRIALS


def make(rng, n, m, degree):
    """A random instance: n applicants, m jobs, each qualified for a few."""
    adj = []
    for _ in range(n):
        d = rng.randint(1, degree)
        adj.append(sorted(rng.sample(range(m), min(d, m))))
    return adj


def build_level(rng, n, m, degree, want_blocked, lid):
    for _ in range(3000):
        adj = make(rng, n, m, degree)

        # An applicant qualified for nothing is a one-person bottleneck and
        # gives the answer away; a job nobody can do is just clutter.
        if any(not row for row in adj):
            continue
        if any(all(j not in row for row in adj) for j in range(m)):
            continue

        matched = len(hall.max_matching(adj, m))
        group, worst = hall.worst_group(adj, m)
        if matched != n - worst:
            raise SystemExit(f'{lid}: Konig disagrees with itself on {adj}')

        blocked = worst > 0
        if blocked != want_blocked:
            continue
        # A blocked level whose bottleneck is most of the board is not a
        # discovery, and one that costs more than a couple of places is
        # dispiriting rather than instructive.
        if blocked and (len(group) > n - 1 or worst > 2):
            continue

        rate = careless_rate(adj, m, matched, rng)
        # Solvable levels are held to a stricter standard, because matching
        # everyone is their whole content — there is no certificate to find
        # afterwards, so a level greedy stumbles through is a level with
        # nothing in it. Blocked levels can afford a looser bar: careless play
        # that happens to find the maximum still has to name the bottleneck,
        # which takes the end-to-end rate on those from 34% to 2%.
        # The smallest boards are tutorials and are allowed to be easy: with
        # four applicants there is no room for greedy to go wrong, and
        # pretending otherwise would just mean shipping no small levels at all.
        limit = 0.85 if n <= 4 else 0.3 if not blocked else 0.5
        if rate > limit:
            continue

        return {
            'id': lid,
            'n': n,
            'm': m,
            'adj': adj,
            'par': worst,                 # people left unplaced, at best
            'matched': matched,
            'blocked': blocked,
            # The certificate, for the verdict and the last hint. Never shown
            # otherwise: finding it is the second half of the game.
            'bottleneck': sorted(group),
            # One maximum matching, for the last hint. Held back otherwise:
            # building it is the first half of the game.
            'answer': {str(a): j for a, j in
                       hall.max_matching(adj, m).items()},
            'careless': round(rate, 4),
        }
    return None


RECIPES = [
    # (applicants, jobs, most jobs per applicant, blocked?, how many)
    (4, 4, 2, False, 3),
    (5, 5, 3, True, 3),
    (5, 5, 3, False, 3),
    (6, 6, 3, True, 4),
    (6, 5, 3, True, 3),
    (7, 7, 3, False, 4),
    (7, 7, 3, True, 4),
    (8, 8, 3, False, 3),
    (8, 8, 4, True, 4),
    (9, 8, 3, True, 3),
    (9, 9, 4, False, 3),
    (10, 10, 4, True, 3),
]


def build():
    rng = random.Random(20260803)
    levels = []
    seen = set()
    for n, m, degree, blocked, count in RECIPES:
        made = 0
        for attempt in range(count * 40):
            if made == count:
                break
            lid = f'{n}x{m}{"b" if blocked else "s"}_{made + 1}'
            lv = build_level(rng, n, m, degree, blocked, lid)
            if not lv:
                continue
            key = json.dumps(lv['adj'])
            if key in seen:
                continue
            seen.add(key)
            levels.append(lv)
            made += 1
        if made < count:
            print(f'  only {made} of {count} for {n}x{m} '
                  f'{"blocked" if blocked else "solvable"}')
    return levels


if __name__ == '__main__':
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    levels = build()
    for lv in levels:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(levels),
        'levels': [{k: lv[k] for k in ('id', 'n', 'm', 'par', 'blocked')}
                   for lv in levels],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    blocked = sum(1 for lv in levels if lv['blocked'])
    worst = max(lv['careless'] for lv in levels)
    print(f'wrote {len(levels)} levels: {len(levels) - blocked} solvable, '
          f'{blocked} blocked')
    print(f'careless matching finds the maximum at most '
          f'{100 * worst:.0f}% of the time')
