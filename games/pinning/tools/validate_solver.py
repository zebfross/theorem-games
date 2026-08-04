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

ROOT = Path(__file__).resolve().parents[1]
LEVELS = ROOT / "data" / "levels"


def check(level):
    """Return (ok, detail). Compares solver output to the catalog's."""
    sockets = [s for s in level["sockets"] if not s["outer"]]
    sites = [(s["x"], s["y"]) for s in sockets]
    numbers = [s["n"] for s in sockets]

    puzzle = solver.Puzzle([[tuple(p) for p in st] for st in level["rope"]], sites)

    # sanity: the drawing's own crossing count must agree with the catalog.
    # `drawn` is the solver's own geometric count, self and mutual together;
    # it replaced an earlier selfs/pairs split and this had drifted behind it.
    total = puzzle.drawn
    if total != level["crossings"]:
        return False, f"drawn crossings {total} != catalog {level['crossings']}"

    sets, unknown = puzzle.minimal_pinning_sets()
    # A run that hit a bigon the solver cannot classify proves nothing either
    # way. Counting those as agreement would flatter the solver and counting
    # them as disagreement would blame it for a case it declined to guess at,
    # so they are their own outcome.
    if unknown:
        return None, "hit a bigon the solver will not classify"

    mine = [sorted(numbers[i] for i in s) for s in sets]
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
    declined = []
    failures = []
    t0 = time.time()
    for i, lv in enumerate(levels):
        good, detail = check(lv)
        if good is None:
            declined.append(f"{lv['id']}: {detail}")
        elif good:
            ok += 1
        else:
            failures.append(f"{lv['id']}: {detail}")
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(levels)} checked, {len(failures)} wrong, "
                  f"{len(declined)} declined", file=sys.stderr, flush=True)

    dt = time.time() - t0
    answered = ok + len(failures)
    print(f"\n{len(levels)} levels in {dt:.1f}s")
    print(f"  {ok} reproduced exactly")
    print(f"  {len(failures)} disagreed with the catalogue")
    print(f"  {len(declined)} declined \u2014 a bigon the solver will not classify")
    if answered:
        print(f"\nof the {answered} it answered, {100 * ok / answered:.1f}% agreed")
    # Declining is the safe outcome and is not a failure: the solver saying "I
    # cannot tell" costs a level, while the solver guessing wrong would ship a
    # puzzle whose answer is untrue. Only disagreements fail the run.
    if failures:
        print(f"\ndisagreements:")
        for f in failures[:20]:
            print("  " + f)
        if len(failures) > 20:
            print(f"  ... and {len(failures) - 20} more")
        sys.exit(1)


if __name__ == "__main__":
    main()
