"""Matching applicants to jobs, and the reason when it cannot be done.

Hall's theorem: every applicant can be given a job they are qualified for
exactly when every group of applicants has, between them, at least as many jobs
open to them as there are people in the group. So a failure is never just bad
luck — there is always a group of k applicants sharing fewer than k jobs, and
that group is a *proof* that no arrangement could have worked.

Konig's theorem puts a number on it: the largest matching is

    |applicants| - max over groups S of (|S| - |jobs open to S|)

so the fewest people you can leave unplaced is exactly the worst deficiency of
any group. That deficiency is par, and the group achieving it is the thing the
game asks the player to find.

Both are computed here by augmenting paths, which is also the reasoning a player
does by hand: take an unmatched applicant, look for a chain of swaps that frees
a job up. Nothing about knowing the theorem tells you where that chain is.
"""

import itertools


def augment(adj, match_job, a, seen):
    """Try to place applicant a, bumping others along the way.

    `match_job[j]` is the applicant currently holding job j, or None. Returns
    True if a chain of swaps was found that places a without unplacing anybody.
    """
    for j in adj[a]:
        if j in seen:
            continue
        seen.add(j)
        if match_job[j] is None or augment(adj, match_job, match_job[j], seen):
            match_job[j] = a
            return True
    return False


def max_matching(adj, jobs):
    """The largest matching, as {applicant: job}."""
    match_job = {j: None for j in range(jobs)}
    for a in range(len(adj)):
        augment(adj, match_job, a, set())
    return {a: j for j, a in match_job.items() if a is not None}


def neighbours(adj, group):
    """Every job open to anybody in this group of applicants."""
    out = set()
    for a in group:
        out.update(adj[a])
    return out


def deficiency(adj, group):
    return len(group) - len(neighbours(adj, group))


def worst_group(adj, jobs):
    """A smallest group with the largest deficiency, and that deficiency.

    Hall's condition fails exactly when some group has positive deficiency, and
    Konig says the largest such deficiency is how many people must go unplaced.
    Among the groups achieving it the smallest is the clearest to look at, so
    that is the one used for par and for the hint.

    Brute force over subsets. Levels here are small on purpose — a bottleneck
    you cannot see is not a puzzle — and being obviously right matters more than
    being quick, since the whole verdict rests on it.
    """
    n = len(adj)
    best = (0, frozenset())
    # Every subset, smallest first, and no stopping early. An earlier version
    # broke out as soon as some group of size k had deficiency k, on the theory
    # that nothing could beat it. That is wrong, and Konig's identity caught it
    # within seconds: one unqualified applicant is a group of size 1 with
    # deficiency 1, while four unqualified applicants are a group of size 4 with
    # deficiency 4. Deficiency grows with the group; it is not bounded by the
    # first size at which it appears.
    for size in range(1, n + 1):
        for group in itertools.combinations(range(n), size):
            d = deficiency(adj, group)
            if d > best[0]:
                best = (d, frozenset(group))
    return best[1], best[0]


def check(adj, jobs):
    """Konig's identity, verified rather than assumed.

    The two sides are computed by completely different means — augmenting paths
    on one, a sweep over every subset on the other — so agreement is real
    evidence and not a tautology.
    """
    matched = len(max_matching(adj, jobs))
    _, worst = worst_group(adj, jobs)
    return matched, len(adj) - worst, matched == len(adj) - worst
