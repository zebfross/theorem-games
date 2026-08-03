"""Check the shipped pack against the rules, without trusting what built it.

Every claim a level makes is re-derived here from the level file alone: that its
worked answer really does tell all 2n cases apart, that par is the counting
bound or is one more with a proof that the bound is out of reach, and that the
ids are distinct — a collision silently overwrites a level file, which has
happened in this repo before and is invisible afterwards.

Usage:  python3 tools/check_pack.py
"""

import json
import os
import sys

import weighing as W

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')


def main():
    index = json.load(open(os.path.join(DATA, 'index.json')))
    bad = []
    seen = set()
    for meta in index['levels']:
        lid = meta['id']
        if lid in seen:
            bad.append(f'{lid}: duplicate id')
        seen.add(lid)
        lv = json.load(open(os.path.join(DATA, 'levels', lid + '.json')))

        for key in ('n', 'par', 'rows'):
            if lv[key] != meta[key]:
                bad.append(f'{lid}: index says {key}={meta[key]}, level says {lv[key]}')

        n, par = lv['n'], lv['par']
        design = [tuple(v) for v in lv['solution']]

        if len(design) != n:
            bad.append(f'{lid}: {len(design)} patterns for {n} coins')
            continue
        if any(len(v) != par for v in design):
            bad.append(f'{lid}: a pattern is not {par} weighings long')
            continue

        faults = W.faults(design, n, par)
        if faults:
            bad.append(f'{lid}: the shipped answer does not work: {faults[:2]}')

        if par < W.bound(n):
            bad.append(f'{lid}: par {par} is below the counting bound {W.bound(n)}')
        elif par > W.bound(n):
            # Claiming more than the counting bound needs the exhaustive search
            # to have ruled the bound out. Only affordable for small n, which is
            # the only place the pack makes the claim.
            if n > W.EXACT_UPTO:
                bad.append(f'{lid}: par {par} exceeds the bound {W.bound(n)} '
                           f'with no proof available at this size')
            elif W.solve_exact(n, W.bound(n)):
                bad.append(f'{lid}: par is {par}, but {W.bound(n)} weighings do work')
            else:
                # The first hint tells the player *why* the counting bound is
                # out of reach here: the pans cannot come out even. That is a
                # claim about the level, so check it rather than trust it.
                # It holds when there are only just enough patterns to go
                # round, so every one must be used and the coins on each
                # weighing are counted rather than chosen.
                lo = W.bound(n)
                reps = W.classes(lo)
                odd = [j for j in range(lo)
                       if sum(1 for v in reps if v[j]) % 2]
                if len(reps) != n or not odd:
                    bad.append(f'{lid}: the hint blames the pans for needing '
                               f'{par} weighings, but that is not the reason')

        if lv['rows'] <= par:
            bad.append(f'{lid}: {lv["rows"]} rows leaves no room for par {par}')

    print(f'checked {len(index["levels"])} levels')
    for b in bad:
        print('  ' + b)
    if bad:
        sys.exit(1)
    print('all sound')


if __name__ == '__main__':
    main()
