"""Build the level pack.

A level is just a number of coins: everything else follows from it. So there is
nothing to generate and nothing to search for variety in — the pack is a choice
of which sizes to ship, plus the tables the game reads at runtime.

The sizes worth having are the small ones in full, because two of them are
surprises — four coins and thirteen coins both need one weighing more than the
counting argument asks for — and then a spread upwards to thirty-nine, which is
as far as four weighings reach.

Usage:  python3 tools/build_pack.py
"""

import json
import os
import sys

import adaptive

sys.setrecursionlimit(20000)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')

SIZES = list(range(3, 14)) + [14, 15, 16, 17, 18, 20, 22, 24, 27, 30, 33, 36, 39]


def build():
    levels = []
    for n in SIZES:
        par = adaptive.minimum(n)
        if par >= adaptive.INF:
            print(f'  skipped n={n}: no strategy found')
            continue
        levels.append({
            'id': f'n{n}',
            'n': n,
            'par': par,
            # One spare weighing, so a player who cannot find the tight line can
            # still finish the level — they just do not match par.
            'rows': par + 1,
            'value': adaptive.tables(n),
        })
        print(f'  n={n}: par {par}')
    return levels


if __name__ == '__main__':
    os.makedirs(os.path.join(DATA, 'levels'), exist_ok=True)
    levels = build()
    for lv in levels:
        with open(os.path.join(DATA, 'levels', lv['id'] + '.json'), 'w') as f:
            json.dump(lv, f, separators=(',', ':'))
    index = {
        'count': len(levels),
        'levels': [{k: lv[k] for k in ('id', 'n', 'par', 'rows')} for lv in levels],
    }
    with open(os.path.join(DATA, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    by_par = {}
    for lv in levels:
        by_par[lv['par']] = by_par.get(lv['par'], 0) + 1
    print(f'wrote {len(levels)} levels: ' +
          ', '.join(f'{v} at par {k}' for k, v in sorted(by_par.items())))
