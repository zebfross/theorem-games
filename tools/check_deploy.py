#!/usr/bin/env python3
"""Everything the site needs is in the list the deploy actually copies.

The deploy rsyncs a named list of paths rather than the whole tree, and that is
deliberate: this repository holds tools, tests and a Python library that have no
business on a web server. The cost is that publishing a file is two steps, and
forgetting the second one fails in the quietest way there is. It works locally,
because the dev server hands out the whole tree. It works in the browser test,
for the same reason. It is simply absent in production, where a missing asset
usually reports nothing at all — a blank favicon, an unstyled page, a licence
link that 404s.

So the rule is stated once, here, and checked before anything is copied: every
top-level thing in the repository is either served or explicitly not served,
and the deploy list is exactly the first group. Adding a file to the root now
forces a decision instead of allowing an omission.

Run it directly, or `npm run check` to do what CI does.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"

# Things that exist for building and testing the site, not for visiting it.
# Anything here is a deliberate omission; anything not here and not in the
# deploy list is an accident, which is the whole point of the distinction.
NOT_SERVED = {
    ".github",              # CI
    ".gitignore",
    "CONTRIBUTING.md",      # for people reading the repository, not the site
    "README.md",
    "lib",                  # the Python that generates levels
    "package.json",
    "package-lock.json",
    "playwright.config.js",
    "tests",
    "tools",
}


def deploy_sources() -> list[str]:
    """The source paths from the rsync line in the deploy workflow.

    The sources are the bare words: every flag starts with a dash, and every
    other argument — the excludes, the ssh command, the destination — is
    quoted. That holds because the workflow is written that way, and this
    reads it rather than repeating it, so the two cannot disagree.
    """
    lines = WORKFLOW.read_text().splitlines()
    try:
        i = next(n for n, line in enumerate(lines) if line.strip().startswith("rsync "))
    except StopIteration:
        sys.exit(f"no rsync command found in {WORKFLOW.relative_to(ROOT)}")

    block = []
    while True:
        block.append(lines[i].strip().rstrip("\\").strip())
        if not lines[i].rstrip().endswith("\\"):
            break
        i += 1

    tokens = re.findall(r"\"[^\"]*\"|'[^']*'|\S+", " ".join(block))
    return [t for t in tokens[1:] if not t.startswith(("-", '"', "'"))]


def repo_top_level() -> set[str]:
    """Everything the repository holds — committed, or new and not ignored.

    `--others` is the important half. A file that has just been created is
    precisely the one most likely to be missing from the deploy list, and a
    check that only saw committed files would stay quiet until the commit had
    already been made. `--exclude-standard` keeps .gitignore in charge of what
    counts as scratch, so a stray working file is the author's to ignore
    rather than something this has to guess at.
    """
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return {line.split("/", 1)[0] for line in out.splitlines() if line}


def main() -> int:
    served = deploy_sources()
    tracked = repo_top_level()
    problems = []

    duplicates = {p for p in served if served.count(p) > 1}
    if duplicates:
        problems.append(f"listed twice in the deploy: {', '.join(sorted(duplicates))}")

    served_set = set(served)

    for path in sorted(served_set - tracked):
        problems.append(
            f"the deploy copies {path!r}, which is not in the repository — "
            f"rsync will fail the whole deploy on a missing source"
        )

    for path in sorted(tracked - served_set - NOT_SERVED):
        problems.append(
            f"{path!r} is in the repository but not in the deploy list, so it "
            f"will 404 on the live site while working perfectly here. Add it to "
            f"the rsync sources in deploy.yml, or to NOT_SERVED in this file if "
            f"it is not meant to be published"
        )

    for path in sorted(served_set & NOT_SERVED):
        problems.append(
            f"{path!r} is both deployed and listed as not served — one of the two is wrong"
        )

    if problems:
        print("the deploy list and the repository disagree:\n", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"the deploy copies all {len(served_set)} published paths, and nothing else")
    return 0


if __name__ == "__main__":
    sys.exit(main())
