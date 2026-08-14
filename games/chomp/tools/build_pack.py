"""Write the Chomp level pack.

Each level ships the whole game solved: the opponent's reply to every position
it can face, and for every position the player can face, how many moves are
still needed and one move that achieves it.

That is deliberately three tables rather than one clever runtime search. The
game module then contains no theory at all — it looks things up — so there is
no second implementation of Chomp free to drift away from the one that was
checked here. It is also why a hint can promise a number: the count it quotes
is measured against the very opponent the player is facing.

    python3 games/chomp/tools/build_pack.py
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from theory import (                                          # noqa: E402
    after, every_position, key, move_key, moves, rectangle, reply, solve, winning,
)

HERE = pathlib.Path(__file__).resolve().parent.parent
DATA = HERE / 'data'

# Rectangles only, smallest first, with the five by seven bar as the one the
# game is named for. Every one of these is a first-player win — that is what
# strategy stealing guarantees — so every level is winnable from the opening.
BARS = [
    (2, 3), (2, 5), (2, 7),
    (3, 4), (3, 7),
    (4, 5), (4, 7),
    (5, 5), (5, 7),
    (6, 7),
]

WORDS = {2: 'Two rows', 3: 'Three rows', 4: 'Four rows',
         5: 'Five rows', 6: 'Six rows', 7: 'Seven rows'}


def build_level(rows, cols, ident):
    start = rectangle(rows, cols)
    par, need, best = solve(start)
    spots = every_position(start)

    replies, needs, bests = {}, {}, {}
    for pos in spots:
        back = reply(pos)
        if back is not None:
            replies[key(pos)] = move_key(back)
        if need[pos] is not None:
            needs[key(pos)] = need[pos]
            bests[key(pos)] = move_key(best[pos])

    openings = [m for m in moves(start) if not winning(after(start, *m))]
    return {
        # The level file carries its own id. The engine hands this object to
        # the game untouched rather than merging the index entry into it, so
        # without this a level has no way to say which one it is.
        'id': ident,
        'rows': rows,
        'cols': cols,
        'par': par,
        # How many of the opening's moves actually win. Shown by the first
        # hint, because it is the honest measure of what the player is up
        # against and it is not a clue to which move it is.
        'openings': len(openings),
        'reply': replies,
        'need': needs,
        'best': bests,
    }, par, len(spots), len(openings)


def main():
    (DATA / 'levels').mkdir(parents=True, exist_ok=True)
    index = []
    for rows, cols in BARS:
        ident = f'{rows}x{cols}'
        level, par, spots, opens = build_level(rows, cols, ident)
        (DATA / 'levels' / f'{ident}.json').write_text(
            json.dumps(level, separators=(',', ':')))
        index.append({
            'id': ident,
            'rows': rows,
            'cols': cols,
            'par': par,
            'tag': WORDS[rows],
            'chip': f'{rows}×{cols}',
        })
        size = (DATA / 'levels' / f'{ident}.json').stat().st_size
        print(f'  {ident:>5}  {spots:>5} positions  par {par:>2}'
              f'  {opens} winning opening  {size // 1024:>3} KB')

    (DATA / 'index.json').write_text(json.dumps({
        'count': len(index),
        'note': 'Every bar here is a rectangle, so every one of them is a win '
                'for whoever moves first. Strategy stealing proves that and '
                'says nothing about which move does it.',
        'levels': index,
    }, indent=1))
    print(f'  wrote {len(index)} levels')


if __name__ == '__main__':
    main()
