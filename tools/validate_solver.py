#!/usr/bin/env python3
"""Check the from-scratch solver against the catalog's published answers.

For each level, the solver enumerates subsets of the bounded regions and
computes the minimal pinning sets itself. Those must match the level's
`generators` exactly — the catalog's own minimal pinning sets with the outer
region dropped. Any disagreement is a solver bug.

    python3 tools/validate_solver.py [--limit N] [--max-regions R]
"""

import argparse
import json
import sys
import time
from pathlib import Path

import solver

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ROOT / "web" / "data" / "levels"


def check(level):
    """Return (ok, detail). Compares solver output to the catalog's."""
    sockets = [s for s in level["sockets"] if not s["outer"]]
    sites = [(s["x"], s["y"]) for s in sockets]
    numbers = [s["n"] for s in sockets]

    puzzle = solver.Puzzle([[tuple(p) for p in st] for st in level["rope"]], sites)

    # sanity: the drawing's own crossing count must agree with the catalog
    total = sum(puzzle.selfs) + sum(puzzle.pairs.values())
    if total != level["crossings"]:
        return False, f"drawn crossings {total} != catalog {level['crossings']}"

    mine = [sorted(numbers[i] for i in s) for s in puzzle.minimal_pinning_sets()]
    mine.sort(key=lambda s: (len(s), s))
    theirs = sorted((sorted(g) for g in level["generators"]), key=lambda s: (len(s), s))
    if mine != theirs:
        return False, f"minimal sets {mine} != catalog {theirs}"
    return True, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after N levels")
    ap.add_argument("--max-regions", type=int, default=99)
    ap.add_argument("--stride", type=int, default=1, help="sample every Nth level")
    args = ap.parse_args()

    files = sorted(LEVELS.glob("*.json"))
    if not files:
        sys.exit(f"no levels in {LEVELS} — run extract_levels.py first")

    levels = []
    for f in files:
        lv = json.loads(f.read_text())
        if lv["regions"] <= args.max_regions:
            levels.append(lv)
    levels.sort(key=lambda l: (l["regions"], l["strands"], l["index"]))
    levels = levels[:: args.stride]
    if args.limit:
        levels = levels[: args.limit]

    ok = 0
    failures = []
    t0 = time.time()
    for i, lv in enumerate(levels):
        good, detail = check(lv)
        if good:
            ok += 1
        else:
            failures.append(f"{lv['id']}: {detail}")
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(levels)} checked, {len(failures)} failed",
                  file=sys.stderr, flush=True)

    dt = time.time() - t0
    print(f"\n{ok}/{len(levels)} levels reproduced exactly  ({dt:.1f}s)")
    if failures:
        print(f"\n{len(failures)} disagreements:")
        for f in failures[:20]:
            print("  " + f)
        if len(failures) > 20:
            print(f"  ... and {len(failures) - 20} more")
        sys.exit(1)


if __name__ == "__main__":
    main()
