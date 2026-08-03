"""Check the shipped pack against the rules, without trusting what built it.

The levels carry a value for every position that can arise — how many weighings
it still costs against a balance answering as unhelpfully as honesty allows —
and the game reads those numbers to answer weighings and to offer hints. If they
are wrong, the game lies to the player about whether they are still on the
fastest line, and par is a fiction. So they are checked here rather than assumed.

The check is not "run the solver again and compare", which would only prove the
solver agrees with itself. It is that the shipped numbers satisfy the equation
that defines them:

    value(position) = 1 + min over weighings of max over outcomes of value(next)

with value 0 exactly when one case remains. A table satisfying that everywhere,
with the recursion bottoming out, is correct whatever produced it. Verifying is
cheap where solving was not.

Usage:  python3 tools/check_pack.py
"""

import json
import os
import sys

import adaptive

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')


def check_level(lv):
    """Every complaint about one level, in words."""
    bad = []
    n, par = lv['n'], lv['par']
    both = lv['value']['both']
    split = lv['value']['split']

    if len(both) != n + 1:
        bad.append(f'both table is {len(both)} long, expected {n + 1}')
        return bad
    if len(split) != n + 1 or any(len(r) != n + 1 for r in split):
        bad.append('split table is not square over 0..n')
        return bad

    # Ballast beyond the least that evens the pans is a no-op, so the only
    # weighings worth considering are those where it is forced. That is what
    # makes this check affordable.
    def check_split(h, l):
        g = n - h - l
        live = h + l
        if live <= 1:
            return 0
        best = adaptive.INF
        for hl in range(h + 1):
            for hr in range(h - hl + 1):
                for ll in range(l + 1):
                    for lr in range(l - ll + 1):
                        nl, nr = hl + ll, hr + lr
                        if nl + nr == 0 or abs(nl - nr) > g:
                            continue
                        kids = [(hl, lr), (hr, ll), (h - hl - hr, l - ll - lr)]
                        kids = [k for k in kids if k[0] + k[1]]
                        if any(k == (h, l) for k in kids):
                            continue           # learns nothing in that case
                        worst = max(split[a][c] for a, c in kids)
                        best = min(best, 1 + worst)
        return best

    def check_both(b):
        g = n - b
        if 2 * b <= 1:
            return 0
        best = adaptive.INF
        for bl in range(b + 1):
            for br in range(b - bl + 1):
                if bl + br == 0 or abs(bl - br) > g:
                    continue
                worst = max(split[bl][br], split[br][bl])
                rest = b - bl - br
                if rest:
                    worst = max(worst, both[rest])
                best = min(best, 1 + worst)
        return best

    for h in range(n + 1):
        for l in range(n + 1 - h):
            want = check_split(h, l)
            if split[h][l] != want:
                bad.append(f'split[{h}][{l}] is {split[h][l]}, '
                           f'but its own successors make it {want}')
                return bad          # one is enough; they cascade

    for b in range(n + 1):
        want = check_both(b)
        if both[b] != want:
            bad.append(f'both[{b}] is {both[b]}, '
                       f'but its own successors make it {want}')
            return bad

    if both[n] != par:
        bad.append(f'par is {par}, but the table says the opening '
                   f'position costs {both[n]}')
    if lv['rows'] <= par:
        bad.append(f'{lv["rows"]} weighings allowed leaves no room for par {par}')
    return bad


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
                bad.append(f'{lid}: index says {key}={meta[key]}, '
                           f'level says {lv[key]}')
        for complaint in check_level(lv):
            bad.append(f'{lid}: {complaint}')

    print(f'checked {len(index["levels"])} levels, '
          'every position re-derived from its own successors')
    for b in bad:
        print('  ' + b)
    if bad:
        sys.exit(1)
    print('all sound')


if __name__ == '__main__':
    main()
