# Contributing

## Adding a game

1. Copy `games/pinning/` as a starting point, or start from the API alone —
   [docs/GAME-API.md](docs/GAME-API.md) is the whole contract.
2. Put your levels in `data/` following
   [docs/LEVEL-FORMAT.md](docs/LEVEL-FORMAT.md).
3. Add an entry to `games/registry.json`.
4. Open `http://localhost:8000/?game=your-id`.

Nothing in `engine/` should need to change to accept a new game. If it does,
that is worth raising — it means the contract is missing something, and a hook
added for a real second game is worth ten guessed at in advance.

Looking for something to build? [docs/GAME-IDEAS.md](docs/GAME-IDEAS.md) has
candidates with sketches of how each would work.

## What makes a good one

The engine fits games where **the player arranges something, presses run,
watches what happens, and is told whether it worked**. The run does not have to
be a physical simulation; it just has to be something that unfolds and can be
replayed.

Good signs:

- The theorem has a *minimum* in it — fewest moves, fewest pieces, smallest
  number of something. That gives you a score and a reason to replay.
- A wrong answer fails *visibly*, not just with a red cross.
- Small instances are still interesting. The first level should be solvable by
  someone who has never heard of the theorem.

## Where the answers come from

Deciding the answer is often expensive — Pinning's underlying problem is
NP-complete — so precompute. Ship each level with its answer and make the
runtime check a lookup. This keeps play instant and, more importantly, keeps
the verdict correct even when the animation misbehaves.

If you cannot precompute, make sure your runtime check is *sound in the safe
direction*: better to refuse to answer than to answer wrongly.

## Verifying

There is no test runner. What there is instead, and what has actually caught
things:

- **Check your data against itself.** Pinning's extractor computes each
  region's degree from its own geometry and requires it to match the degree the
  source published — an independent check that the two halves of the data line
  up. It found real mismatches.
- **Check your model against your drawing.** If you build a combinatorial model
  of a picture, make the model reproduce a measurable property of the picture
  before trusting it for anything else.
- **Sweep the level pack in the browser console.** Import your module directly,
  run every level headlessly, and assert the outcomes. Most bugs here were found
  by running a few hundred levels and printing what disagreed.

## Style

- Plain JavaScript modules and SVG. No build step, no framework, no bundler.
- Comment the *why*, especially where a value was tuned. Several constants here
  have measurements behind them, and the measurement is the useful part.
- Keep game-specific code in your game directory. Only move something into
  `lib/` when a second game actually needs it.

## Licensing

The engine and `lib/` are MIT. Your game keeps its own licence — put it in your
game's README and in the `credit` string that renders in the footer. If you
embed data from a paper or a catalog, check its terms; that is why Pinning is
GPL-3.0 while the engine is not.
