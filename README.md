# Theorem games

Small, playable games built on mathematical theorems. Each one takes a result
that is normally read and makes it something you do with your hands, so the
idea arrives before the vocabulary does.

```
python3 -m http.server 8000     # then open http://localhost:8000/
```

No build step, no dependencies, no server-side anything. Static files.

## What is here

| Game | Theorem |
| --- | --- |
| [Unpinning](games/unpinning/) | The pinning number of a multiloop — Simon & Stucky, [arXiv:2405.16216](https://arxiv.org/abs/2405.16216) |

## Layout

```
index.html          the shell
engine/             everything not about any particular theorem
games/
  registry.json     which games exist
  unpinning/        one game: module, styles, level data, its own tooling
lib/geometry/       shared maths used by more than one game
docs/               the game API and the level format
```

The engine owns the page, the level pack, saved progress, the level picker, the
placing → running → result flow, the replay scrubber and the staged hint button.
A game supplies a board, a rule for whether an attempt worked, and the words to
explain it. That split is the whole architecture.

## Adding a game

See [docs/GAME-API.md](docs/GAME-API.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). A game is one directory and one exported
object; nothing in the engine needs to change to accept it.

The shape that fits: **the player arranges something, presses run, watches what
happens, and is told whether it worked.** A surprising number of theorems are
secretly that.

## Two things worth knowing before you build one

Both were learned expensively while building the first game, and they are worth
inheriting rather than rediscovering.

**Decide the verdict from your answer data, never from the simulation.** The
physics is there to show the player *why*, and it will sometimes jam, drift or
land in a local minimum. Unpinning reads its verdict off precomputed pinning
sets and treats the animation purely as illustration; when the two disagree, the
game says so plainly rather than letting the picture argue with the truth.

**Converge on the thing you draw.** A scalar summary — total length, energy,
score — can stop changing while the shape is still visibly wrong. Compare the
outline against itself a few hundred steps back instead. The engine's frame
recorder is built on exactly this and gives you a scrub bar that is even in how
much changes rather than even in effort spent.

## Licence

The engine and `lib/` are MIT. Individual games carry their own licence, since
they often embed data from published work; Unpinning is GPL-3.0 because the
catalog it derives from is.
