"""Check that every game the registry promises can actually be played.

The level packs are generated, and a generator that half-finishes leaves a
registry pointing at a game with no data, or an index listing levels whose files
were never written. Both fail silently: the homepage still draws the card, and
the failure only shows when somebody clicks it.

This is the cheap check that catches that before it ships — it reads what the
site itself reads, in the order the site reads it, and complains if anything the
index promises is missing or unreadable.

Usage:  python3 tools/check_data.py
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fail(problems, msg):
    problems.append(msg)


def main():
    problems = []
    registry = json.load(open(os.path.join(ROOT, 'games', 'registry.json')))
    games = registry['games']

    seen = set()
    for entry in games:
        gid = entry['id']
        if gid in seen:
            fail(problems, f'{gid}: listed twice in the registry')
        seen.add(gid)

        for field in ('id', 'title', 'blurb', 'theorem', 'levels', 'added'):
            if field not in entry:
                fail(problems, f'{gid}: registry entry has no {field}')

        home = os.path.join(ROOT, 'games', gid)
        if not os.path.isdir(home):
            fail(problems, f'{gid}: registry lists it but games/{gid}/ is missing')
            continue
        for need in ('game.js', 'data/index.json'):
            if not os.path.exists(os.path.join(home, need)):
                fail(problems, f'{gid}: no {need}')

        index_path = os.path.join(home, 'data', 'index.json')
        if not os.path.exists(index_path):
            continue
        try:
            index = json.load(open(index_path))
        except ValueError as e:
            fail(problems, f'{gid}: data/index.json will not parse - {e}')
            continue

        levels = index.get('levels', [])
        if index.get('count') != len(levels):
            fail(problems, f'{gid}: index says {index.get("count")} levels, '
                           f'lists {len(levels)}')
        # The registry number is the denominator of "x of y puzzles solved", so
        # it counts the levels that can *be* solved. A wall — a level that is
        # there to be lost, like Conway's row 5 — never records a best, and
        # including it would leave the progress bar unable to reach the end.
        winnable = sum(1 for m in levels if not m.get('wall'))
        if entry.get('levels') != winnable:
            fail(problems, f'{gid}: registry says {entry.get("levels")} levels, '
                           f'the pack has {winnable} winnable '
                           f'({len(levels)} including walls)')

        ids = set()
        for meta in levels:
            lid = meta.get('id')
            if lid is None:
                fail(problems, f'{gid}: a level in the index has no id')
                continue
            if lid in ids:
                fail(problems, f'{gid}: level {lid} listed twice')
            ids.add(lid)
            path = os.path.join(home, 'data', 'levels', lid + '.json')
            if not os.path.exists(path):
                fail(problems, f'{gid}: index lists {lid}, no such level file')
                continue
            try:
                json.load(open(path))
            except ValueError as e:
                fail(problems, f'{gid}: {lid}.json will not parse - {e}')

        # Files nobody lists are dead weight rather than a fault, but they are
        # usually the tail of a build that changed its mind.
        folder = os.path.join(home, 'data', 'levels')
        if os.path.isdir(folder):
            on_disk = {n[:-5] for n in os.listdir(folder) if n.endswith('.json')}
            stray = on_disk - ids
            if stray:
                fail(problems, f'{gid}: {len(stray)} level file(s) not in the '
                               f'index, e.g. {sorted(stray)[0]}')

    # A game directory nobody registered will never be reachable from the
    # homepage; Taut was removed from the registry and its directory with it,
    # and this is what would have caught a half-done removal.
    for name in sorted(os.listdir(os.path.join(ROOT, 'games'))):
        full = os.path.join(ROOT, 'games', name)
        if os.path.isdir(full) and name not in seen:
            fail(problems, f'{name}: a game directory the registry never lists')

    print(f'checked {len(games)} games')
    for entry in games:
        idx = os.path.join(ROOT, 'games', entry['id'], 'data', 'index.json')
        rows = json.load(open(idx))['levels'] if os.path.exists(idx) else []
        walls = sum(1 for m in rows if m.get('wall'))
        print(f'  {entry["id"]:<10} {len(rows):>5} levels'
              + (f'  ({walls} wall)' if walls else ''))

    if problems:
        print(f'\n{len(problems)} problem(s):', file=sys.stderr)
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        return 1
    print('\nevery level the index promises is present and parses')
    return 0


if __name__ == '__main__':
    sys.exit(main())
