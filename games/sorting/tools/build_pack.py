"""Build the level pack: networks to finish, and the fewest comparators that do.

Two kinds of level. **From scratch** is the classical question — the smallest
sorting network on n wires — and its pars are the known ones, 3, 5, 9 and 12 for
three to six wires, found here by search rather than quoted. **Finish it** hands
over a network somebody started and asks for the fewest comparators that
complete it, which is the same question from a different starting state and is
where most of the pack comes from: seven wires is out of reach for this search,
so variety has to come from where a level begins rather than how wide it is.

Every par is checked twice over. The search returns a completion as well as a
number, and the build runs that completion through `sorts`, which tests all 2^n
zero-one inputs — a different code path from the breadth-first search that
proposed it. A par nothing achieves is not a par, and a completion that does not
sort is not a completion.

It also measures how often comparators thrown down at random finish in par,
because a best answer that is easy to blunder into is not worth finding.

Usage:  python3 tools/build_pack.py
"""

import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import network                                  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')


def careless(n, prefix, par, trials=4000, seed=11):
    """How often comparators thrown down at random finish in par.

    Any network finishes eventually — keep adding comparators and everything
    sorts — so this is not "can it be lost" but "is the best answer worth
    looking for".
    """
    rng = random.Random(seed)
    combos = network.comparators(n)
    goal = network.sorted_values(n)
    start = network.state_after(n, prefix)
    hit = 0
    for _ in range(trials):
        state, added = start, 0
        while not state <= goal and added < par + 12:
            i, j = rng.choice(combos)
            nxt = network.push(state, i, j)
            added += 1
            state = nxt
        if state <= goal and added == par:
            hit += 1
    return hit / trials


LEVELS = [
    dict(id='w3', wires=3, prefix=[], name='Three wires'),
    dict(id='w4', wires=4, prefix=[], name='Four wires'),
    dict(id='w5', wires=5, prefix=[], name='Five wires'),
    dict(id='w6', wires=6, prefix=[], name='Six wires'),
    # Finish-it levels. The prefix is searched for rather than written down; the
    # spec says how wide, how much is already there, and how much should be
    # left to do.
    # The lengths were chosen after sampling what random prefixes actually
    # leave to do: a nine-comparator start on six wires almost never leaves
    # exactly three, and asking for it searched twenty thousand times and gave
    # up. Twelve given leaves four often enough to find.
    dict(id='f4a', wires=4, start=2, want=3, name='Two down, on four'),
    dict(id='f5a', wires=5, start=4, want=6, name='Four down, on five'),
    dict(id='f5b', wires=5, start=8, want=3, name='Nearly sorted, on five'),
    dict(id='f6a', wires=6, start=6, want=8, name='Six down, on six'),
    dict(id='f6b', wires=6, start=10, want=5, name='Most of the way'),
    dict(id='f6c', wires=6, start=12, want=4, name='Nearly there'),
]


def find_prefix(spec, rng):
    """A partial network leaving exactly `want` comparators still to place."""
    n = spec['wires']
    combos = network.comparators(n)
    goal = network.sorted_values(n)
    for _ in range(20000):
        prefix = [rng.choice(combos) for _ in range(spec['start'])]
        # A prefix that repeats a comparator back to back, or that has already
        # finished, makes a level that teaches nothing.
        if any(prefix[k] == prefix[k + 1] for k in range(len(prefix) - 1)):
            continue
        state = network.state_after(n, prefix)
        if state <= goal:
            continue
        par, _ = network.fewest(n, prefix)
        if par == spec['want']:
            return prefix
    return None


def build_one(spec, rng):
    n = spec['wires']
    prefix = spec.get('prefix')
    if prefix is None:
        prefix = find_prefix(spec, rng)
        if prefix is None:
            raise SystemExit(f'{spec["id"]}: no prefix left {spec["want"]} to do')
    par, completion = network.fewest(n, prefix)
    if par is None:
        raise SystemExit(f'{spec["id"]}: no completion found')

    whole = list(prefix) + list(completion)
    ok, bad, out = network.sorts(n, whole)
    if not ok:
        raise SystemExit(f'{spec["id"]}: the shipped answer fails on {bad:0{n}b}')
    if len(completion) != par:
        raise SystemExit(f'{spec["id"]}: par {par} but the answer adds '
                         f'{len(completion)}')
    # The prefix on its own must not sort, or there is nothing to do.
    if network.sorts(n, prefix)[0]:
        raise SystemExit(f'{spec["id"]}: the prefix already sorts')

    return {
        'id': spec['id'], 'name': spec['name'], 'wires': n,
        'prefix': [list(c) for c in prefix],
        'par': par,
        'answer': [list(c) for c in completion],
        'total': len(whole),
        'left': network.unsorted_count(n, prefix),
        'careless': round(careless(n, prefix, par), 4),
    }


if __name__ == '__main__':
    rng = random.Random(20260806)
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    built = []
    for spec in LEVELS:
        lv = build_one(spec, rng)
        built.append(lv)
        print(f'  {lv["id"]:4s} {lv["wires"]} wires  '
              f'{len(lv["prefix"]):2d} given  par {lv["par"]:2d}  '
              f'{lv["left"]:3d} inputs still wrong  '
              f'careless {100 * lv["careless"]:.2f}%', flush=True)

    for name in os.listdir(os.path.join(DATA, 'levels')):
        os.remove(os.path.join(DATA, 'levels', name))
    for lv in built:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(built),
        'levels': [{'id': lv['id'], 'name': lv['name'], 'wires': lv['wires'],
                    'par': lv['par'], 'given': len(lv['prefix'])}
                   for lv in built],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(f'wrote {len(built)} levels')
