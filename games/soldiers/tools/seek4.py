"""Find a twenty-soldier army that reaches row 4, guided by Conway's weighting.

Blind hill-climbing got nowhere, which in hindsight was predictable: it treats
every cell as equally worth occupying, and they are emphatically not. The same
weighting that proves row 5 impossible also says which cells are worth having —
the cell d steps from the target is worth phi^-d, so an army should hug the
target column just below the line.

So rather than sampling armies at random, take the cells in decreasing order of
weight. That gives a canonical candidate for each size, and a few variations
around the tail where the ordering has ties.
"""
import sys
from itertools import combinations

import army

PHI = (1 + 5 ** 0.5) / 2
TARGET = (0, 4)


def dist(c):
    return abs(c[0] - TARGET[0]) + abs(c[1] - TARGET[1])


def by_weight(depth=6, width=6):
    cells = [(x, y) for y in range(0, -depth, -1)
             for x in range(-width, width + 1)]
    # Ties broken towards the centre and towards the line, which is where the
    # room to manoeuvre is.
    return sorted(cells, key=lambda c: (dist(c), abs(c[0]), -c[1]))


def main():
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    ranked = by_weight()
    # The straightforward candidate: the `size` heaviest cells.
    head = ranked[:size]
    print(f'trying the {size} heaviest cells', flush=True)
    got = army.climb_to(head, 4)
    if got is not None:
        print('FOUND', sorted(head), flush=True)
        print('JUMPS', got, flush=True)
        return
    # The ordering is only a guide, and the tail is where it is least sure.
    # Keep the clearly-best cells and vary the rest.
    keep = ranked[:size - 4]
    pool = ranked[size - 4:size + 8]
    print(f'varying the last 4 of {size} over {len(pool)} candidates', flush=True)
    for extra in combinations(pool, 4):
        a = keep + list(extra)
        got = army.climb_to(a, 4, cap=200000)
        if got is not None:
            print('FOUND', sorted(a), flush=True)
            print('JUMPS', got, flush=True)
            return
    print('none found', flush=True)


if __name__ == '__main__':
    main()
