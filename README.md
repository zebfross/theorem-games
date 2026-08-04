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
| [Pinning](games/pinning/) | The pinning number of a multiloop — Simon & Stucky, [arXiv:2405.16216](https://arxiv.org/abs/2405.16216) |
| [Max-flow min-cut](games/maxflow/) | The greatest flow equals the cheapest cut — Menger; Ford & Fulkerson |
| [Art gallery](games/gallery/) | ⌊n/3⌋ guards always suffice — Chvátal, with Fisk's proof |
| [Coin weighing](games/weighing/) | k weighings separate at most 3ᵏ cases — the counting bound |
| [Hall's marriage theorem](games/marriage/) | A matching exists unless some group shares too few jobs — Hall; König |

And one thing that is not a game, because it has nothing to arrange and no way
to lose:

| Exploration | About |
| --- | --- |
| [Mandelbrot](explorations/mandelbrot/) | The escape-radius theorem that makes it drawable, and the period of every bulb |

## Layout

```
index.html          the front door: a card per game
play.html           the playing shell, opened as play.html?game=<id>
engine/             everything not about any particular theorem
games/
  registry.json     which games exist
  pinning/        one game: module, styles, poster, level data, own tooling
lib/geometry/       shared maths used by more than one game
docs/               the game API and the level format
```

The engine owns the page, the level pack, saved progress, level select, the
placing → running → result flow, the replay scrubber and the staged hint button.
A game supplies a board, a rule for whether an attempt worked, and the words to
explain it. That split is the whole architecture.

## Adding a game

See [docs/GAME-API.md](docs/GAME-API.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). A game is one directory and one exported
object; nothing in the engine needs to change to accept it.
[docs/GAME-IDEAS.md](docs/GAME-IDEAS.md) keeps a running list of theorems that
would suit it, with notes on why.

The shape that fits: **the player arranges something, presses run, watches what
happens, and is told whether it worked.** A surprising number of theorems are
secretly that.

## Two things worth knowing before you build one

Both were learned expensively while building the first game, and they are worth
inheriting rather than rediscovering.

**Decide the verdict from your answer data, never from the simulation.** The
physics is there to show the player *why*, and it will sometimes jam, drift or
land in a local minimum. Pinning reads its verdict off precomputed pinning
sets and treats the animation purely as illustration; when the two disagree, the
game says so plainly rather than letting the picture argue with the truth.

**Converge on the thing you draw.** A scalar summary — total length, energy,
score — can stop changing while the shape is still visibly wrong. Compare the
outline against itself a few hundred steps back instead. The engine's frame
recorder is built on exactly this and gives you a scrub bar that is even in how
much changes rather than even in effort spent.

## Play counts

The homepage can rank games by how often they are played. This is the one part
of the site that wants a server, so it is built to degrade rather than to
depend: `engine/plays.js` ships with no endpoint configured, keeps counts in
`localStorage`, sends nothing anywhere, and leaves the gallery in registry
order. A clone works offline and makes no network requests.

To collect shared counts, deploy `tools/counter-worker.js` (a Cloudflare Worker
plus a KV namespace, about seventy lines) and set `ENDPOINT` in
`engine/plays.js`. It stores one integer per game id — no visitor identifier, no
address, no timestamp — and rate-limits per address to turn away casual
inflation. It cannot stop a determined effort, which would need something that
tells people apart, and that is exactly what this is built not to have. Read the
numbers as a weathervane.

A play is **one level played through to an answer**. Somebody who works through
thirty pinning puzzles counts thirty times, because they plainly enjoyed it more
than somebody who tried one and left — which is the whole thing the number is
for. A verdict rather than a level being opened, so reading down the level
picker is not a play.

Ranking by popularity feeds back on itself: whatever is on top is played because
it is on top. Ties break by **date added**, newest first, so a new game arrives
at the top of the games nobody has played rather than the bottom of everything.
That is all a tie-break can do — it cannot lift a new game above a played one,
and nothing short of ranking by plays *per day* could, which is far too noisy at
these numbers. So the homepage also carries a **recently added** shelf: the
games sharing the latest date, in a place popularity does not reach into.

## Licence

The engine and `lib/` are MIT. Individual games carry their own licence, since
they often embed data from published work. Pinning is GPL-3.0 because the
catalogue it derives from is. Max-flow min-cut, Art gallery and Coin weighing
are MIT, having no inherited data at all — their networks, rooms and weighing
schemes are generated here and their answers computed.
