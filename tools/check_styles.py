"""Check that no game's stylesheet reaches outside its board.

A game's `style.css` is loaded into the whole page, not into the `<svg id=board>`
it is written for. So a class name the game likes for its own shapes will also
match anything on the page around it that happens to share the name — the level
picker, the buttons, the verdict box — and silently restyle it.

This is not a theoretical worry. Coin weighing called the disc in each cell a
`.chip` and gave it `pointer-events: none`; the engine's level buttons are also
`.chip`, so every level in the picker became unclickable. Max-flow called its
moving water `.current`, which the engine uses for the selected level button,
and did the same thing to it. Both were invisible by reading either file alone:
each one is perfectly reasonable on its own, and the collision only exists
because they share a page.

Two rules are checked, and they are not the same strength:

  * **No game may reuse a class name the engine styles.** This is the actual
    hazard and it fails the check. It catches the collision whichever side
    introduces it, including a class the engine grows later.
  * **Selectors should be scoped** (`#board ...`), which makes a collision
    impossible rather than merely absent today. Reported as advice, since the
    older games predate the rule and are not currently colliding.

Usage:  python3 tools/check_styles.py
"""

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCOPE = '#board'


def strip_comments(text):
    return re.sub(r'/\*.*?\*/', '', text, flags=re.S)


def strip_keyframes(text):
    """Drop @keyframes bodies whole.

    Their contents are stops — 0%, from, to — not selectors, and reading them
    as selectors reports every animation in the repo as an unscoped rule."""
    out = []
    i = 0
    while True:
        m = re.search(r'@(-\w+-)?keyframes\b', text[i:])
        if not m:
            out.append(text[i:])
            return ''.join(out)
        start = i + m.start()
        out.append(text[i:start])
        brace = text.find('{', start)
        if brace < 0:
            return ''.join(out)
        depth = 0
        for j in range(brace, len(text)):
            if text[j] == '{':
                depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0:
                    i = j + 1
                    break
        else:
            return ''.join(out)


def selectors(path):
    """Every selector in the file, minus at-rule preludes like @media."""
    text = strip_keyframes(strip_comments(open(path).read()))
    out = []
    for prelude in re.findall(r'([^{}]+)\{', text):
        prelude = prelude.strip()
        if not prelude or prelude.startswith('@'):
            continue
        for one in prelude.split(','):
            one = one.strip()
            if one:
                out.append(one)
    return out


def class_names(path):
    return {c for sel in selectors(path)
            for c in re.findall(r'\.([A-Za-z0-9_-]+)', sel)}


def main():
    engine = set()
    for p in ('engine/style.css', 'engine/home.css'):
        engine |= class_names(os.path.join(ROOT, p))

    bad = []
    loose = []
    sheets = sorted(glob.glob(os.path.join(ROOT, 'games', '*', 'style.css')))
    for path in sheets:
        rel = os.path.relpath(path, ROOT)
        unscoped = [s for s in selectors(path) if not s.startswith(SCOPE)]
        if unscoped:
            loose.append(f'{rel}: {len(unscoped)} of {len(selectors(path))} '
                         f'selectors are not scoped to {SCOPE}, so they apply '
                         f'to the whole page')
        for name in sorted(class_names(path) & engine):
            bad.append(f'{rel}: .{name} is also styled by the engine — '
                       f'scope it to {SCOPE} or rename it')

    print(f'checked {len(sheets)} game stylesheets against '
          f'{len(engine)} engine class names')
    for b in bad:
        print('  ' + b)
    for w in loose:
        print('  (advice) ' + w)
    if bad:
        sys.exit(1)
    print('no game reaches a name the engine styles')


if __name__ == '__main__':
    main()
