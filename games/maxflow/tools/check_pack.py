"""Check the built pack the way the game reads it.

The generator computes the answers; this checks the files that came out of it,
knowing nothing about how they were made. The one that matters is the theorem
itself: par has to be both the most the network can carry and the cost of every
cut shipped with it. If those ever disagree, the game would be marking correct
answers wrong.

Usage:  python3 check_pack.py
"""

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from network import Network

DATA = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     '..', 'data'))


def check(level):
    bad = []
    n = len(level['nodes'])
    net = Network(n, [tuple(e) for e in level['edges']],
                  level['source'], level['sink'])

    if not 0 <= level['source'] < n or not 0 <= level['sink'] < n:
        bad.append('source or sink is not a junction')
        return bad
    for u, v, c in level['edges']:
        if not (0 <= u < n and 0 <= v < n):
            bad.append('a pipe runs to a junction that is not there')
        if c <= 0:
            bad.append(f'a pipe has capacity {c}')

    flow = net.max_flow()
    if flow != level['par']:
        bad.append(f'par is {level["par"]} but the network carries {flow}')

    if not level['cuts']:
        bad.append('no cheapest cut recorded')
    for cut in level['cuts']:
        if not net.separates(cut):
            bad.append(f'a cut listed as an answer does not stop the water: {cut}')
        elif net.cost(cut) != level['par']:
            bad.append(f'a listed cut costs {net.cost(cut)}, not {level["par"]}')

    # A pipe called forced must be in every cheapest cut, since the hint tells
    # the player that no best answer leaves it uncut.
    for i in level['forced']:
        if any(i not in cut for cut in level['cuts']):
            bad.append(f'pipe {i} is called forced but some cheapest cut omits it')

    # And the level has to be a puzzle: the two answers a player would try
    # without thinking must both cost more than the cheapest cut.
    for end, name in ((level['source'], 'source'), (level['sink'], 'sink')):
        trivial = [i for i, (u, v, _c) in enumerate(level['edges']) if end in (u, v)]
        if net.separates(trivial) and net.cost(trivial) <= level['par']:
            bad.append(f'cutting everything at the {name} is already optimal')
    return bad


def main():
    index = json.load(open(os.path.join(DATA, 'index.json')))
    listed = {e['id'] for e in index['levels']}
    files = {os.path.basename(f)[:-5]
             for f in glob.glob(os.path.join(DATA, 'levels', '*.json'))}
    problems = 0
    for missing in sorted(listed ^ files):
        print(f'  index and files disagree about {missing}')
        problems += 1

    seen_chips = {}
    for e in index['levels']:
        seen_chips.setdefault(e['n'], []).append(e['id'])
    for n, ids in sorted(seen_chips.items()):
        if len(ids) > 1:
            print(f'  button {n} used by {ids}')
            problems += 1

    for e in index['levels']:
        level = json.load(open(os.path.join(DATA, 'levels', f'{e["id"]}.json')))
        if level['par'] != e['par']:
            print(f'  {e["id"]}: index and file disagree on par')
            problems += 1
        for complaint in check(level):
            print(f'  {e["id"]}: {complaint}')
            problems += 1

    print(f'{index["count"]} levels, {problems} problems')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
