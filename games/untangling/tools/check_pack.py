"""Check the built pack the way the game will read it.

The builder verifies each drawing against the maths as it goes. This checks the
result of all that: that the files say what the game assumes they say. It never
looks at the source curves, so it catches anything lost between the build and
the disk — a truncated write, a field renamed on one side only, a lens shed
into nonsense.

Usage:  python3 check_pack.py
"""

import glob
import json
import math
import os
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))


def moves_from(level, state):
    return level['moves'].get(str(state), [])


def shortest(level):
    """Fewest moves to a crossing-free state, walking the file's own graph."""
    q = deque([(level['start'], 0)])
    seen = {level['start']}
    while q:
        s, d = q.popleft()
        if level['counts'][s] == 0:
            return d
        for m in moves_from(level, s):
            if m['to'] not in seen:
                seen.add(m['to'])
                q.append((m['to'], d + 1))
    return None


def check(level):
    """Every complaint about this level."""
    bad = []
    n = len(level['states'])

    if len(level['counts']) != n:
        bad.append(f'{n} states but {len(level["counts"])} counts')
    if not 0 <= level['start'] < n:
        bad.append(f'start {level["start"]} is not a state')
    if level['counts'][level['start']] != level['crossings']:
        bad.append('crossings disagrees with the start state')
    if level['crossings'] < 1:
        bad.append('starts already untangled')

    for i, flat in enumerate(level['states']):
        if len(flat) % 2:
            bad.append(f'state {i} has a dangling coordinate')
        elif len(flat) < 8:
            bad.append(f'state {i} has only {len(flat) // 2} points')

    for key, outs in level['moves'].items():
        if not key.isdigit() or not 0 <= int(key) < n:
            bad.append(f'moves keyed on {key!r}, which is not a state')
            continue
        src = int(key)
        for m in outs:
            if not 0 <= m['to'] < n:
                bad.append(f'move from {src} goes to {m["to"]}, which is not a state')
                continue
            # A collapse takes out one crossing or two, never none and never more.
            drop = level['counts'][src] - level['counts'][m['to']]
            if drop not in (1, 2):
                bad.append(f'move {src}->{m["to"]} changes crossings by {drop}')
            if len(m['at']) != 2:
                bad.append(f'move {src}->{m["to"]} has no click point')
            lens = m.get('lens')
            if lens is not None:
                if len(lens) % 2 or len(lens) < 6:
                    bad.append(f'move {src}->{m["to"]} has a lens of {len(lens) // 2} points')
                else:
                    # The click point should be on or near the lens it marks.
                    pts = list(zip(lens[0::2], lens[1::2]))
                    if min(math.dist(m['at'], p) for p in pts) > 400:
                        bad.append(f'move {src}->{m["to"]} clicks nowhere near its lens')

    got = shortest(level)
    if got is None:
        bad.append('cannot be untangled at all')
    elif got != level['par']:
        bad.append(f'par says {level["par"]} but the graph gives {got}')
    return bad


def main():
    index = json.load(open(os.path.join(DATA, 'index.json')))
    listed = {e['id'] for e in index['levels']}
    files = {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(DATA, 'levels', '*.json'))}
    problems = 0

    if listed != files:
        for m in sorted(listed - files):
            print(f'  indexed but missing: {m}')
        for m in sorted(files - listed):
            print(f'  present but unindexed: {m}')
        problems += len(listed ^ files)

    chips = {}
    for e in index['levels']:
        chips.setdefault((e['crossings'], e['n']), []).append(e['id'])
    for (cr, n), ids in sorted(chips.items()):
        if len(ids) > 1:
            print(f'  {cr} crossings, button {n} used by {ids}')
            problems += 1

    for e in index['levels']:
        level = json.load(open(os.path.join(DATA, 'levels', f'{e["id"]}.json')))
        for field in ('crossings', 'par'):
            if level[field] != e[field]:
                print(f'  {e["id"]}: index says {field} {e[field]}, file says {level[field]}')
                problems += 1
        for complaint in check(level):
            print(f'  {e["id"]}: {complaint}')
            problems += 1

    print(f'{index["count"]} levels, {problems} problems')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
